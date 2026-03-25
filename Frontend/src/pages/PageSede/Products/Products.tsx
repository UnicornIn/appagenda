"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, Box, Edit2, Filter, Loader2, Package, Plus, Save, Search, X } from "lucide-react"
import { Sidebar } from "../../../components/Layout/Sidebar"
import { PageHeader } from "../../../components/Layout/PageHeader"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card"
import { Badge } from "../../../components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../components/ui/dialog"
import { useAuth } from "../../../components/Auth/AuthContext"
import { inventarioService } from "./inventario"
import type { InventarioProducto } from "./inventario"
import { API_BASE_URL } from "../../../types/config"
import { formatDateDMY } from "../../../lib/dateFormat"

type CatalogoProducto = { id: string; nombre: string; codigo: string }

const normalizeRole = (value: string | null | undefined): string =>
  String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_")

const normalizeText = (value: unknown): string => (typeof value === "string" ? value.toLowerCase() : "")

const stockBadgeClassName = (stockActual: number, stockMinimo: number): string => {
  if (stockActual === 0) return "border-red-200 bg-red-50 text-red-700"
  if (stockActual <= stockMinimo) return "border-amber-200 bg-amber-50 text-amber-700"
  return "border-emerald-200 bg-emerald-50 text-emerald-700"
}

const stockLabel = (stockActual: number, stockMinimo: number): string => {
  if (stockActual === 0) return "Sin stock"
  if (stockActual <= stockMinimo) return "Bajo stock"
  return "Disponible"
}

export function ProductsList() {
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCategoria, setSelectedCategoria] = useState("all")
  const [showLowStock, setShowLowStock] = useState(false)
  const [productos, setProductos] = useState<InventarioProducto[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [productoEditando, setProductoEditando] = useState<string | null>(null)
  const [stockTemporal, setStockTemporal] = useState<number>(0)
  const [guardandoStock, setGuardandoStock] = useState<string | null>(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isLoadingCatalogo, setIsLoadingCatalogo] = useState(false)
  const [isCreatingInventario, setIsCreatingInventario] = useState(false)
  const [catalogoProductos, setCatalogoProductos] = useState<CatalogoProducto[]>([])
  const [catalogoError, setCatalogoError] = useState<string | null>(null)
  const [nuevoProductoId, setNuevoProductoId] = useState("")
  const [nuevoStockInicial, setNuevoStockInicial] = useState("0")
  const [nuevoStockMinimo, setNuevoStockMinimo] = useState("5")

  const { user, isAuthenticated, isLoading: authLoading, activeSedeId } = useAuth()

  const role = normalizeRole(user?.role)
  const canCreateInventory = role === "admin_sede" || role === "super_admin" || role === "superadmin"
  const canAdjustStock = canCreateInventory || role === "recepcionista" || role === "call_center"

  const sedeId =
    activeSedeId ||
    user?.sede_id ||
    sessionStorage.getItem("beaux-sede_id") ||
    localStorage.getItem("beaux-sede_id")

  const nombreLocal =
    user?.nombre_local ||
    sessionStorage.getItem("beaux-nombre_local") ||
    localStorage.getItem("beaux-nombre_local") ||
    "Sede actual"

  const resolveToken = () =>
    user?.access_token ||
    user?.token ||
    sessionStorage.getItem("access_token") ||
    localStorage.getItem("access_token")

  useEffect(() => {
    if (!authLoading && sedeId) void cargarInventario()
  }, [authLoading, sedeId, showLowStock])

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setError("Debes iniciar sesión para acceder al inventario")
      setIsLoading(false)
    }
  }, [authLoading, isAuthenticated])

  useEffect(() => {
    if (!successMessage) return
    const timeoutId = window.setTimeout(() => setSuccessMessage(null), 3000)
    return () => window.clearTimeout(timeoutId)
  }, [successMessage])

  const categorias = useMemo(
    () =>
      Array.from(
        new Set(
          productos
            .map((producto) => producto.categoria)
            .filter((categoria): categoria is string => Boolean(categoria))
        )
      ).sort((a, b) => a.localeCompare(b)),
    [productos]
  )

  const productosFiltrados = useMemo(() => {
    const termino = searchTerm.trim().toLowerCase()
    return productos
      .filter((producto) => {
        if (termino) {
          const cumpleBusqueda =
            normalizeText(producto.nombre).includes(termino) ||
            normalizeText(producto.producto_nombre).includes(termino) ||
            normalizeText(producto.producto_id).includes(termino) ||
            normalizeText(producto.producto_codigo).includes(termino) ||
            normalizeText(producto.categoria).includes(termino)
          if (!cumpleBusqueda) return false
        }
        if (selectedCategoria !== "all" && producto.categoria !== selectedCategoria) return false
        return true
      })
      .sort((a, b) => {
        const aCritico = a.stock_actual <= a.stock_minimo ? 1 : 0
        const bCritico = b.stock_actual <= b.stock_minimo ? 1 : 0
        if (aCritico !== bCritico) return bCritico - aCritico
        return (a.nombre || a.producto_nombre || "").localeCompare(b.nombre || b.producto_nombre || "")
      })
  }, [productos, searchTerm, selectedCategoria])

  const stats = useMemo(() => {
    const totalProductos = productos.length
    const productosBajoStock = productos.filter((producto) => producto.stock_actual <= producto.stock_minimo).length
    const productosSinStock = productos.filter((producto) => producto.stock_actual === 0).length
    const totalStock = productos.reduce((acc, producto) => acc + producto.stock_actual, 0)
    return { totalProductos, productosBajoStock, productosSinStock, totalStock }
  }, [productos])

  const cargarInventario = async () => {
    const token = resolveToken()
    try {
      setIsLoading(true)
      setError(null)
      if (!sedeId) throw new Error("No se encontró información de la sede activa")
      if (!token) throw new Error("No hay token de autenticación disponible")
      const inventario = await inventarioService.getInventarioUsuario(showLowStock, token, sedeId)
      setProductos(Array.isArray(inventario) ? inventario : [])
    } catch (err) {
      console.error("Error cargando inventario:", err)
      setError(err instanceof Error ? err.message : "No se pudo cargar el inventario")
      setProductos([])
    } finally {
      setIsLoading(false)
    }
  }

  const iniciarEdicionStock = (producto: InventarioProducto) => {
    setProductoEditando(producto._id)
    setStockTemporal(producto.stock_actual)
    setError(null)
    setSuccessMessage(null)
  }

  const cancelarEdicionStock = () => {
    setProductoEditando(null)
    setStockTemporal(0)
  }

  const guardarStock = async (producto: InventarioProducto) => {
    const token = resolveToken()
    if (stockTemporal < 0) return setError("El stock no puede ser negativo")
    if (!token) return setError("No hay token de autenticación disponible")
    setGuardandoStock(producto._id)
    setError(null)
    setSuccessMessage(null)
    try {
      const delta = stockTemporal - producto.stock_actual
      const resultado = await inventarioService.ajustarInventario(producto._id, delta, token)
      if (!resultado.success) return setError(resultado.error || "No se pudo actualizar el inventario")
      setProductos((current) =>
        current.map((item) =>
          item._id === producto._id
            ? { ...item, stock_actual: stockTemporal, fecha_ultima_actualizacion: new Date().toISOString() }
            : item
        )
      )
      setProductoEditando(null)
      setSuccessMessage(resultado.message || "Inventario actualizado correctamente")
    } catch (err) {
      console.error("Error ajustando inventario:", err)
      setError("Ocurrió un error inesperado al actualizar el inventario")
    } finally {
      setGuardandoStock(null)
    }
  }

  const parseApiError = async (response: Response, fallback: string) => {
    try {
      const body = (await response.json()) as { detail?: string | Array<{ msg?: string }> }
      if (typeof body?.detail === "string" && body.detail.trim().length > 0) return body.detail
      if (Array.isArray(body?.detail) && body.detail.length > 0) {
        const firstMessage = body.detail[0]?.msg
        if (typeof firstMessage === "string" && firstMessage.trim().length > 0) return firstMessage
      }
      return fallback
    } catch {
      return fallback
    }
  }

  const cargarCatalogoProductos = async () => {
    const token = resolveToken()
    if (!token) {
      setCatalogoError("No hay token de autenticación disponible")
      return
    }

    setIsLoadingCatalogo(true)
    setCatalogoError(null)

    try {
      const moneda = String(
        user?.moneda ||
          sessionStorage.getItem("beaux-moneda") ||
          localStorage.getItem("beaux-moneda") ||
          "COP"
      ).toUpperCase()

      const params = new URLSearchParams()
      params.set("moneda", moneda)
      if (sedeId) params.set("sede_id", sedeId)

      const response = await fetch(`${API_BASE_URL}inventary/product/productos/?${params.toString()}`, {
        method: "GET",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      })

      if (!response.ok) {
        throw new Error(await parseApiError(response, "No se pudieron cargar los productos"))
      }

      const data = await response.json()
      const rawProductos: Array<Record<string, unknown>> = Array.isArray(data)
        ? data
        : Array.isArray((data as { productos?: Array<Record<string, unknown>> })?.productos)
          ? (data as { productos: Array<Record<string, unknown>> }).productos
          : Array.isArray((data as { items?: Array<Record<string, unknown>> })?.items)
            ? (data as { items: Array<Record<string, unknown>> }).items
            : []

      const idsEnInventario = new Set(
        productos.map((producto) => String(producto.producto_id || producto._id || "").trim()).filter(Boolean)
      )

      const catalogo = rawProductos
        .map((producto) => {
          const id = String(producto.id ?? producto._id ?? producto.producto_id ?? "").trim()
          const nombre = String(producto.nombre ?? producto.producto_nombre ?? "").trim()
          const codigo = String(producto.codigo ?? producto.producto_codigo ?? "").trim()
          if (!id || !nombre || idsEnInventario.has(id)) return null
          return { id, nombre, codigo }
        })
        .filter((producto): producto is CatalogoProducto => Boolean(producto))
        .sort((a, b) => a.nombre.localeCompare(b.nombre))

      setCatalogoProductos(catalogo)
      if (catalogo.length === 1) setNuevoProductoId(catalogo[0].id)
    } catch (err) {
      console.error("Error cargando catálogo de productos:", err)
      setCatalogoProductos([])
      setCatalogoError(err instanceof Error ? err.message : "No se pudo cargar el catálogo de productos")
    } finally {
      setIsLoadingCatalogo(false)
    }
  }

  const abrirModalCreacion = () => {
    setNuevoProductoId("")
    setNuevoStockInicial("0")
    setNuevoStockMinimo("5")
    setCatalogoProductos([])
    setCatalogoError(null)
    setIsCreateModalOpen(true)
    void cargarCatalogoProductos()
  }

  const cerrarModalCreacion = () => {
    setIsCreateModalOpen(false)
    setCatalogoError(null)
    setNuevoProductoId("")
  }

  const crearInventario = async () => {
    const token = resolveToken()
    const productoId = nuevoProductoId.trim()
    const stockInicial = Number(nuevoStockInicial)
    const stockMinimo = Number(nuevoStockMinimo)

    if (!sedeId) return setCatalogoError("No se encontró la sede activa")
    if (!token) return setCatalogoError("No hay token de autenticación disponible")
    if (!productoId) return setCatalogoError("Selecciona un producto para agregar al inventario")
    if (!Number.isFinite(stockInicial) || stockInicial < 0) {
      return setCatalogoError("El stock inicial debe ser mayor o igual a 0")
    }
    if (!Number.isFinite(stockMinimo) || stockMinimo < 0) {
      return setCatalogoError("El stock mínimo debe ser mayor o igual a 0")
    }

    setIsCreatingInventario(true)
    setCatalogoError(null)

    try {
      const resultado = await inventarioService.crearInventario(
        {
          producto_id: productoId,
          sede_id: sedeId,
          stock_actual: stockInicial,
          stock_minimo: stockMinimo,
        },
        token
      )

      if (!resultado.success) {
        return setCatalogoError(resultado.error || "No se pudo crear el producto en inventario")
      }

      cerrarModalCreacion()
      setSuccessMessage(resultado.message || "Producto agregado al inventario")
      await cargarInventario()
    } catch (err) {
      console.error("Error creando inventario:", err)
      setCatalogoError("Ocurrió un error inesperado al crear el inventario")
    } finally {
      setIsCreatingInventario(false)
    }
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen bg-white">
        <Sidebar />
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          <p className="ml-2 text-gray-600">Verificando autenticación...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar />
        <div className="flex flex-1 flex-col items-center justify-center px-6">
          <AlertTriangle className="mb-4 h-12 w-12 text-red-500" />
          <h2 className="mb-2 text-xl font-semibold text-gray-900">Acceso no autorizado</h2>
          <p className="mb-4 text-gray-600">Debes iniciar sesión para acceder a esta página.</p>
          <Button onClick={() => { window.location.href = "/" }} className="bg-black text-white hover:bg-neutral-900">
            Ir al inicio de sesión
          </Button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="flex min-h-screen bg-white">
        <Sidebar />
        <div className="flex-1">
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            <PageHeader
              title="Inventario detallado"
              subtitle="Consulta, filtra y ajusta el stock de productos de la sede activa."
              actions={
                canCreateInventory ? (
                  <Button onClick={abrirModalCreacion} className="gap-2 bg-gray-900 text-white hover:bg-gray-800">
                    <Plus className="h-4 w-4" />
                    Crear producto
                  </Button>
                ) : null
              }
            />
            <div className="mb-6 rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-gray-100 p-2.5">
                    <Box className="h-5 w-5 text-gray-700" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{nombreLocal}</p>
                    <p className="text-sm text-gray-500">Sede activa para la gestión de inventario.</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="border-gray-200 bg-white text-gray-700">
                    {stats.totalProductos} productos
                  </Badge>
                  <Badge variant="outline" className="border-gray-200 bg-white text-gray-700">
                    {stats.totalStock} unidades
                  </Badge>
                  <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                    {stats.productosBajoStock} críticos
                  </Badge>
                  <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
                    {stats.productosSinStock} sin stock
                  </Badge>
                </div>
              </div>
            </div>

            {(error || successMessage) && (
              <div className="mb-6 space-y-3">
                {error && (
                  <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    <AlertTriangle className="mt-0.5 h-4 w-4" />
                    <div>
                      <p className="font-semibold text-red-800">No se pudo completar la acción</p>
                      <p>{error}</p>
                    </div>
                  </div>
                )}

                {successMessage && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    {successMessage}
                  </div>
                )}
              </div>
            )}

            <Card className="mb-6 border border-gray-200">
              <CardContent className="pt-6">
                <div className="flex flex-col gap-3 lg:flex-row">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input
                      placeholder="Buscar productos por nombre, ID, código o categoría..."
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      className="pl-10"
                      disabled={isLoading}
                    />
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Select value={selectedCategoria} onValueChange={setSelectedCategoria} disabled={isLoading}>
                      <SelectTrigger className="w-full min-w-[220px] bg-white text-gray-900">
                        <SelectValue placeholder="Selecciona una categoría" />
                      </SelectTrigger>
                      <SelectContent className="bg-white text-gray-900">
                        <SelectItem value="all">Todas las categorías</SelectItem>
                        {categorias.map((categoria) => (
                          <SelectItem key={categoria} value={categoria}>
                            {categoria}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Button
                      variant={showLowStock ? "default" : "outline"}
                      onClick={() => setShowLowStock((current) => !current)}
                      className={showLowStock ? "bg-amber-600 text-white hover:bg-amber-700" : ""}
                      disabled={isLoading}
                    >
                      <Filter className="mr-2 h-4 w-4" />
                      {showLowStock ? "Mostrar todo" : "Stock bajo"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-gray-200">
              <CardHeader className="border-b border-gray-200">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-lg font-semibold text-gray-900">Productos en inventario</CardTitle>
                    <CardDescription className="text-gray-600">
                      Lista detallada de productos disponibles en la sede.
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="w-fit border-gray-200 bg-white text-gray-700">
                    {productosFiltrados.length} de {productos.length} productos
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="pt-6">
                {isLoading ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Loader2 className="mb-4 h-8 w-8 animate-spin text-gray-400" />
                    <p className="text-gray-700">Cargando inventario...</p>
                    <p className="mt-1 text-sm text-gray-500">Obteniendo productos de la sede activa.</p>
                  </div>
                ) : productosFiltrados.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="mb-4 rounded-full bg-gray-100 p-4">
                      <Package className="h-8 w-8 text-gray-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {productos.length === 0 ? "No hay productos en inventario" : "No se encontraron productos"}
                    </h3>
                    <p className="mt-2 max-w-md text-sm text-gray-500">
                      {productos.length === 0
                        ? "Aún no hay productos registrados para esta sede."
                        : "Prueba con otro término de búsqueda o cambia los filtros seleccionados."}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {productosFiltrados.map((producto) => {
                      const isEditing = productoEditando === producto._id
                      const isSaving = guardandoStock === producto._id
                      const nombreProducto = producto.nombre || producto.producto_nombre || "Producto"

                      return (
                        <div
                          key={producto._id}
                          className="rounded-2xl border border-gray-200 bg-white px-4 py-4 transition-colors hover:border-gray-300"
                        >
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start gap-3">
                                <div className="rounded-xl bg-gray-100 p-2.5">
                                  <Package className="h-4 w-4 text-gray-600" />
                                </div>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h3 className="truncate text-sm font-semibold text-gray-900">{nombreProducto}</h3>
                                </div>

                                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                                  <span>Categoría: {producto.categoria || "Sin categoría"}</span>
                                  <span>Stock mínimo: {producto.stock_minimo}</span>
                                    <span>Actualizado: {formatDateDMY(producto.fecha_ultima_actualizacion, "—")}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-col gap-3 lg:min-w-[320px] lg:items-end">
                              {isEditing ? (
                                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                                  <Input
                                    type="number"
                                    min="0"
                                    value={stockTemporal}
                                    onChange={(event) => setStockTemporal(Number(event.target.value) || 0)}
                                    className="w-28 text-center"
                                    disabled={isSaving}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter") void guardarStock(producto)
                                      if (event.key === "Escape") cancelarEdicionStock()
                                    }}
                                  />
                                  <Button
                                    onClick={() => { void guardarStock(producto) }}
                                    disabled={isSaving}
                                    className="gap-2 bg-gray-900 text-white hover:bg-gray-800"
                                  >
                                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                    Guardar
                                  </Button>
                                  <Button variant="outline" onClick={cancelarEdicionStock} disabled={isSaving}>
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center lg:justify-end">
                                  <div className="text-left sm:text-right">
                                    <p className="text-lg font-semibold text-gray-900">{producto.stock_actual}</p>
                                    <p className="text-xs text-gray-500">Stock actual</p>
                                  </div>

                                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                                    <Badge
                                      variant="outline"
                                      className={stockBadgeClassName(producto.stock_actual, producto.stock_minimo)}
                                    >
                                      {stockLabel(producto.stock_actual, producto.stock_minimo)}
                                    </Badge>

                                    {canAdjustStock && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => iniciarEdicionStock(producto)}
                                        className="gap-2"
                                      >
                                        <Edit2 className="h-4 w-4" />
                                        Actualizar inventario
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Dialog
        open={isCreateModalOpen}
        onOpenChange={(open) => {
          if (!open) return cerrarModalCreacion()
          setIsCreateModalOpen(true)
        }}
      >
        <DialogContent className="sm:max-w-md bg-white text-gray-900">
          <DialogHeader>
            <DialogTitle>Crear producto en inventario</DialogTitle>
            <DialogDescription>
              Agrega un producto del catálogo global al inventario de la sede activa.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {isLoadingCatalogo && (
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando catálogo de productos...
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700" htmlFor="nuevo-producto-id">
                Producto
              </label>
              {catalogoProductos.length > 0 ? (
                <Select
                  value={nuevoProductoId}
                  onValueChange={setNuevoProductoId}
                  disabled={isLoadingCatalogo || isCreatingInventario}
                >
                  <SelectTrigger id="nuevo-producto-id" className="bg-white text-gray-900">
                    <SelectValue placeholder="Selecciona un producto" />
                  </SelectTrigger>
                  <SelectContent className="bg-white text-gray-900">
                    {catalogoProductos.map((producto) => (
                      <SelectItem key={producto.id} value={producto.id}>
                        {producto.nombre}{producto.codigo ? ` (${producto.codigo})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="nuevo-producto-id"
                  placeholder="Ingresa el ID del producto"
                  value={nuevoProductoId}
                  onChange={(event) => setNuevoProductoId(event.target.value)}
                  disabled={isCreatingInventario}
                />
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700" htmlFor="nuevo-stock-inicial">
                  Stock inicial
                </label>
                <Input
                  id="nuevo-stock-inicial"
                  type="number"
                  min="0"
                  value={nuevoStockInicial}
                  onChange={(event) => setNuevoStockInicial(event.target.value)}
                  disabled={isCreatingInventario}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700" htmlFor="nuevo-stock-minimo">
                  Stock mínimo
                </label>
                <Input
                  id="nuevo-stock-minimo"
                  type="number"
                  min="0"
                  value={nuevoStockMinimo}
                  onChange={(event) => setNuevoStockMinimo(event.target.value)}
                  disabled={isCreatingInventario}
                />
              </div>
            </div>

            {catalogoError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {catalogoError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={cerrarModalCreacion} disabled={isCreatingInventario}>
              Cancelar
            </Button>
            <Button
              onClick={() => { void crearInventario() }}
              disabled={isCreatingInventario || isLoadingCatalogo}
              className="gap-2 bg-gray-900 text-white hover:bg-gray-800"
            >
              {isCreatingInventario && <Loader2 className="h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
