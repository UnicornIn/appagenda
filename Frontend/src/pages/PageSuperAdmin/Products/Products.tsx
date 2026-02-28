"use client"

import { useState, useEffect, useMemo } from "react"
import { Search, Package, AlertTriangle, Loader2, Filter, ChevronRight, Box, Edit2, Save, X, Plus } from "lucide-react"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../../components/ui/card"
import { Badge } from "../../../components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select"
import { Separator } from "../../../components/ui/separator"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../components/ui/dialog"
import { inventarioService } from "../../PageSede/Products/inventario"
import type { InventarioProducto } from "../../PageSede/Products/inventario"
import { Sidebar } from "../../../components/Layout/Sidebar"
import { useAuth } from "../../../components/Auth/AuthContext" // Ajusta la ruta según tu estructura
import { formatDateDMY } from "../../../lib/dateFormat"
import { API_BASE_URL } from "../../../types/config"
import { sedeService } from "../Sedes/sedeService"
import type { Sede } from "../../../types/sede"

type CatalogoProducto = {
  id: string
  nombre: string
  codigo: string
}

export function ProductsList() {
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCategoria, setSelectedCategoria] = useState("all")
  const [showLowStock, setShowLowStock] = useState(false)
  const [productos, setProductos] = useState<InventarioProducto[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Estados para edición de stock
  const [productoEditando, setProductoEditando] = useState<string | null>(null)
  const [stockTemporal, setStockTemporal] = useState<number>(0)
  const [guardandoStock, setGuardandoStock] = useState<string | null>(null)
  const [mensajeExito, setMensajeExito] = useState<string | null>(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isCreatingInventario, setIsCreatingInventario] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createSuccess, setCreateSuccess] = useState<string | null>(null)
  const [modalDataError, setModalDataError] = useState<string | null>(null)
  const [isLoadingCreateData, setIsLoadingCreateData] = useState(false)
  const [sedesDisponibles, setSedesDisponibles] = useState<Sede[]>([])
  const [productosCatalogo, setProductosCatalogo] = useState<CatalogoProducto[]>([])
  const [nuevoProductoId, setNuevoProductoId] = useState("")
  const [nuevoSedeId, setNuevoSedeId] = useState("")
  const [nuevoStockInicial, setNuevoStockInicial] = useState("0")
  const [nuevoStockMinimo, setNuevoStockMinimo] = useState("5")

  // Usar el AuthContext en lugar de sessionStorage
  const { user, isAuthenticated, isLoading: authLoading } = useAuth()

  // Obtener datos de la sede desde el AuthContext
  // También mantenemos compatibilidad con sessionStorage como fallback
  const sedeId = user?.sede_id || sessionStorage.getItem("beaux-sede_id")
  const nombreLocal = user?.nombre_local || sessionStorage.getItem("beaux-nombre_local")

  // Cargar inventario
  useEffect(() => {
    if (!authLoading && sedeId) {
      cargarInventario()
    }
  }, [showLowStock, authLoading, sedeId])

  // Mostrar mensaje si no está autenticado
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setError("Debes iniciar sesión para acceder al inventario")
      setIsLoading(false)
    }
  }, [authLoading, isAuthenticated])

  const categorias = useMemo(
    () =>
      Array.from(
        new Set(
          productos
            .map((producto) => producto.categoria)
            .filter((categoria): categoria is string => Boolean(categoria))
        )
      ),
    [productos]
  )

  useEffect(() => {
    if (sedeId && !nuevoSedeId) {
      setNuevoSedeId(sedeId)
    }
  }, [sedeId, nuevoSedeId])

  const cargarInventario = async () => {
    try {
      setIsLoading(true)
      setError(null)

      // Verificar que tenemos los datos necesarios
      if (!sedeId) {
        throw new Error("No se encontró información de la sede")
      }

      if (!user?.token && !sessionStorage.getItem("access_token")) {
        throw new Error("No hay token de autenticación disponible")
      }

      // Pasar el token y sede_id al servicio
      const inventario = await inventarioService.getInventarioUsuario(
        showLowStock,
        user?.token || sessionStorage.getItem("access_token"),
        sedeId
      )

      setProductos(inventario)

    } catch (err) {
      console.error("Error cargando inventario:", err)
      const errorMessage = err instanceof Error ? err.message : "Error al cargar el inventario. Por favor, intenta nuevamente."
      setError(errorMessage)
      setProductos([])
    } finally {
      setIsLoading(false)
    }
  }

  const searchTermLower = searchTerm.trim().toLowerCase()

  const productosFiltrados = useMemo(() => {
    return productos.filter((producto) => {
      if (searchTermLower) {
        const cumpleBusqueda =
          producto.nombre.toLowerCase().includes(searchTermLower) ||
          producto.producto_id.toLowerCase().includes(searchTermLower) ||
          producto.producto_codigo.toLowerCase().includes(searchTermLower)

        if (!cumpleBusqueda) {
          return false
        }
      }

      if (selectedCategoria !== "all" && producto.categoria !== selectedCategoria) {
        return false
      }

      return true
    })
  }, [productos, searchTermLower, selectedCategoria])

  const stats = useMemo(() => {
    const totalProductos = productos.length
    const productosBajoStock = productos.filter(p => p.stock_actual <= p.stock_minimo).length
    const productosSinStock = productos.filter(p => p.stock_actual === 0).length
    const totalStock = productos.reduce((sum, p) => sum + p.stock_actual, 0)
    const stockPromedio = productos.length > 0 ? Math.round(totalStock / productos.length) : 0

    return {
      totalProductos,
      productosBajoStock,
      productosSinStock,
      totalStock,
      stockPromedio
    }
  }, [productos])

  // Función para iniciar edición de stock
  const iniciarEdicionStock = (producto: InventarioProducto) => {
    setProductoEditando(producto._id)
    setStockTemporal(producto.stock_actual)
    setMensajeExito(null)
  }

  // Función para cancelar edición
  const cancelarEdicionStock = () => {
    setProductoEditando(null)
    setStockTemporal(0)
    setMensajeExito(null)
  }

  // Función para guardar stock
  const guardarStock = async (producto: InventarioProducto) => {
    if (stockTemporal < 0) {
      setError("El stock no puede ser negativo")
      return
    }

    setGuardandoStock(producto._id)
    setError(null)
    setMensajeExito(null)

    try {
      // Backend espera cantidad_ajuste (delta), no valor absoluto
      const delta = stockTemporal - producto.stock_actual
      const resultado = await inventarioService.ajustarInventario(
        producto._id,
        delta,
        user?.token || sessionStorage.getItem("access_token")
      )

      if (resultado.success) {
        // Actualizar el producto en el estado local
        setProductos(prevProductos =>
          prevProductos.map(p =>
            p._id === producto._id
              ? { ...p, stock_actual: stockTemporal, fecha_ultima_actualizacion: new Date().toISOString() }
              : p
          )
        )
        setMensajeExito(resultado.message || "Stock actualizado correctamente")
        setProductoEditando(null)

        // Ocultar mensaje de éxito después de 3 segundos
        setTimeout(() => setMensajeExito(null), 3000)
      } else {
        setError(resultado.error || "Error al actualizar el stock")
      }
    } catch (err) {
      console.error("Error guardando stock:", err)
      setError("Error inesperado al guardar el stock")
    } finally {
      setGuardandoStock(null)
    }
  }

  const abrirModalCreacion = () => {
    setCreateError(null)
    setModalDataError(null)
    setNuevoProductoId("")
    setNuevoSedeId(sedeId || "")
    setNuevoStockInicial("0")
    setNuevoStockMinimo("5")
    setIsCreateModalOpen(true)
    void cargarDatosModalCreacion()
  }

  const cerrarModalCreacion = () => {
    setIsCreateModalOpen(false)
    setCreateError(null)
    setModalDataError(null)
  }

  const parseApiError = async (response: Response, fallback: string) => {
    try {
      const body = await response.json() as { detail?: string | Array<{ msg?: string }> }
      if (typeof body?.detail === "string" && body.detail.trim().length > 0) {
        return body.detail
      }
      if (Array.isArray(body?.detail) && body.detail.length > 0) {
        const firstMessage = body.detail[0]?.msg
        if (typeof firstMessage === "string" && firstMessage.trim().length > 0) {
          return firstMessage
        }
      }
      return fallback
    } catch {
      return fallback
    }
  }

  const cargarCatalogoProductos = async (token: string): Promise<CatalogoProducto[]> => {
    const moneda = (user?.moneda || sessionStorage.getItem("beaux-moneda") || "USD").toUpperCase()
    const params = new URLSearchParams()
    params.set("moneda", moneda)
    const url = `${API_BASE_URL}inventary/product/productos/?${params.toString()}`

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      throw new Error(await parseApiError(response, `Error ${response.status}: ${response.statusText}`))
    }

    const data = await response.json()
    const rawProductos: Array<Record<string, unknown>> = Array.isArray(data)
      ? data
      : Array.isArray((data as { productos?: Array<Record<string, unknown>> })?.productos)
        ? (data as { productos: Array<Record<string, unknown>> }).productos
        : Array.isArray((data as { items?: Array<Record<string, unknown>> })?.items)
          ? (data as { items: Array<Record<string, unknown>> }).items
          : []

    const productosNormalizados = rawProductos
      .map((producto) => {
        const id = String(producto.id ?? producto._id ?? producto.producto_id ?? "").trim()
        const nombre = String(producto.nombre ?? producto.producto_nombre ?? "").trim()
        const codigo = String(producto.codigo ?? producto.producto_codigo ?? "").trim()
        if (!id || !nombre) {
          return null
        }
        return { id, nombre, codigo }
      })
      .filter((producto): producto is CatalogoProducto => Boolean(producto))

    const mapPorId = new Map<string, CatalogoProducto>()
    productosNormalizados.forEach((producto) => {
      if (!mapPorId.has(producto.id)) {
        mapPorId.set(producto.id, producto)
      }
    })

    return Array.from(mapPorId.values()).sort((a, b) => a.nombre.localeCompare(b.nombre))
  }

  const cargarDatosModalCreacion = async () => {
    const token = user?.token || sessionStorage.getItem("access_token")
    if (!token) {
      setModalDataError("No hay token de autenticación disponible para cargar los catálogos")
      return
    }

    setIsLoadingCreateData(true)
    setModalDataError(null)

    const [sedesResult, productosResult] = await Promise.allSettled([
      sedeService.getSedes(token),
      cargarCatalogoProductos(token),
    ])

    const errores: string[] = []

    if (sedesResult.status === "fulfilled") {
      const sedes = sedesResult.value
      setSedesDisponibles(sedes)
      if (!nuevoSedeId && sedes.length > 0) {
        const sedeActual = sedes.find((sede) => sede.sede_id === sedeId || sede._id === sedeId)
        setNuevoSedeId(sedeActual?.sede_id || sedes[0].sede_id)
      }
    } else {
      setSedesDisponibles([])
      errores.push("No se pudieron cargar las sedes")
    }

    if (productosResult.status === "fulfilled") {
      const catalogo = productosResult.value
      setProductosCatalogo(catalogo)
      if (!nuevoProductoId && catalogo.length === 1) {
        setNuevoProductoId(catalogo[0].id)
      }
    } else {
      setProductosCatalogo([])
      errores.push("No se pudieron cargar los productos")
    }

    if (errores.length > 0) {
      setModalDataError(`${errores.join(". ")}.`)
    }

    setIsLoadingCreateData(false)
  }

  const crearInventario = async () => {
    const productoId = nuevoProductoId.trim()
    const sedeInventarioId = nuevoSedeId.trim()
    const stockInicial = Number(nuevoStockInicial)
    const stockMinimo = Number(nuevoStockMinimo)

    if (!productoId) {
      setCreateError("El campo producto_id es obligatorio")
      return
    }

    if (!sedeInventarioId) {
      setCreateError("El campo sede_id es obligatorio")
      return
    }

    if (!Number.isFinite(stockInicial) || stockInicial < 0) {
      setCreateError("El stock inicial debe ser un número mayor o igual a 0")
      return
    }

    if (!Number.isFinite(stockMinimo) || stockMinimo < 0) {
      setCreateError("El stock mínimo debe ser un número mayor o igual a 0")
      return
    }

    setIsCreatingInventario(true)
    setCreateError(null)

    try {
      const resultado = await inventarioService.crearInventario(
        {
          producto_id: productoId,
          sede_id: sedeInventarioId,
          stock_actual: stockInicial,
          stock_minimo: stockMinimo
        },
        user?.token || sessionStorage.getItem("access_token")
      )

      if (!resultado.success) {
        setCreateError(resultado.error || "No se pudo crear el inventario")
        return
      }

      cerrarModalCreacion()
      setCreateSuccess(resultado.message || "Producto registrado en inventario correctamente")
      await cargarInventario()
      setTimeout(() => setCreateSuccess(null), 3000)
    } catch (err) {
      console.error("Error creando inventario:", err)
      setCreateError("Error inesperado al crear el inventario")
    } finally {
      setIsCreatingInventario(false)
    }
  }

  // Función para determinar el color del stock
  const getStockColor = (stockActual: number, stockMinimo: number) => {
    if (stockActual === 0) return "bg-red-50 text-red-700 border-red-100"
    if (stockActual <= stockMinimo) return "bg-amber-50 text-amber-700 border-amber-100"
    if (stockActual <= stockMinimo * 2) return "bg-blue-50 text-blue-700 border-blue-100"
    return "bg-emerald-50 text-emerald-700 border-emerald-100"
  }

  // Mostrar loading mientras se verifica la autenticación
  if (authLoading) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400 mb-4" />
          <p className="text-gray-600 ml-2">Verificando autenticación...</p>
        </div>
      </div>
    )
  }

  // Mostrar mensaje de error si no está autenticado
  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar />
        <div className="flex-1 flex flex-col items-center justify-center">
          <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Acceso no autorizado</h2>
          <p className="text-gray-600 mb-4">Debes iniciar sesión para acceder a esta página</p>
          <Button
            onClick={() => window.location.href = "/login"} // Ajusta la ruta según tu aplicación
            className="bg-blue-600 hover:bg-blue-700"
          >
            Ir al inicio de sesión
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}

          <div className="mb-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                  <span>Dashboard</span>
                  <ChevronRight className="h-3 w-3" />
                  <span>Inventario</span>
                  <ChevronRight className="h-3 w-3" />
                  <span className="text-gray-700 font-medium">Productos</span>
                </div>
                <h1 className="text-3xl font-bold text-gray-900">Inventario</h1>
                <p className="text-gray-600 mt-2">
                  Gestión de productos y control de stock
                </p>
              </div>
              <Button onClick={abrirModalCreacion} className="gap-2">
                <Plus className="h-4 w-4" />
                Crear Producto
              </Button>
            </div>
          </div>

          {/* Información de sede */}
          {sedeId && nombreLocal && (
            <div className="mb-6 p-4 bg-white rounded-lg border border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gray-100 rounded-lg">
                    <Box className="h-5 w-5 text-gray-700" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{nombreLocal}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="text-xs">
                    {productos.length} productos
                  </Badge>
                  <Badge
                    variant="outline"
                    className={`text-xs ${isAuthenticated
                      ? "border-green-200 bg-green-50 text-green-700"
                      : "border-gray-200"
                      }`}
                  >
                    {isAuthenticated ? "Conectado" : "Desconectado"}
                  </Badge>
                </div>
              </div>
            </div>
          )}

          {createSuccess && (
            <div className="mb-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              {createSuccess}
            </div>
          )}

          {/* Filtros */}
          <Card className="mb-6 border-gray-200">
            <CardContent className="pt-6">
              <div className="flex flex-col lg:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    placeholder="Buscar productos por nombre, ID o código..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 border-gray-300 focus:border-gray-400 focus:ring-gray-400"
                    disabled={isLoading}
                  />
                </div>

                <div className="flex gap-3">
                  <Select value={selectedCategoria} onValueChange={setSelectedCategoria} disabled={isLoading}>
                    <SelectTrigger className="w-full lg:w-48 border-gray-300 bg-white text-gray-900">
                      <SelectValue placeholder="Categoría" />
                    </SelectTrigger>
                    <SelectContent className="z-[60] bg-white border-gray-200 text-gray-900">
                      <SelectItem className="text-gray-900 focus:bg-gray-100 focus:text-gray-900" value="all">Todas las categorías</SelectItem>
                      {categorias.map((categoria, index) => (
                        <SelectItem className="text-gray-900 focus:bg-gray-100 focus:text-gray-900" key={index} value={categoria}>{categoria}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    variant={showLowStock ? "default" : "outline"}
                    onClick={() => setShowLowStock(!showLowStock)}
                    className={`border-gray-300 ${showLowStock ? "bg-amber-600 hover:bg-amber-700" : ""}`}
                    disabled={isLoading}
                  >
                    <Filter className="h-4 w-4 mr-2" />
                    {showLowStock ? "Mostrar Todo" : "Stock Bajo"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Estado de carga/error */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400 mb-4" />
              <p className="text-gray-600">Cargando inventario...</p>
              <p className="text-sm text-gray-500 mt-1">Obteniendo datos de productos</p>
            </div>
          )}

          {error && !isLoading && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
              <div className="flex items-start">
                <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 mr-3" />
                <div className="flex-1">
                  <p className="text-red-700">
                    {typeof error === "string" ? error : "Error al procesar la solicitud"}
                  </p>                  <p className="text-sm text-red-600 mt-1">
                    {error.includes("conexión") || error.includes("Error al cargar")
                      ? "Verifica tu conexión e intenta nuevamente"
                      : "Por favor, verifica los datos e intenta nuevamente"}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setError(null)
                    if (error.includes("conexión") || error.includes("Error al cargar")) {
                      cargarInventario()
                    }
                  }}
                  className="border-red-300 text-red-700 hover:bg-red-50"
                >
                  {error.includes("conexión") || error.includes("Error al cargar") ? "Reintentar" : "Cerrar"}
                </Button>
              </div>
            </div>
          )}

          {/* Tabla de Productos */}
          {!isLoading && !error && (
            <Card className="border-gray-200">
              <CardHeader className="border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg font-semibold text-gray-900">
                      Productos en Inventario
                    </CardTitle>
                    <CardDescription className="text-gray-600">
                      Lista completa de productos con sus niveles de stock
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="text-xs font-medium">
                    {productosFiltrados.length} de {productos.length} productos
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="pt-6">
                {productosFiltrados.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                      <Package className="h-8 w-8 text-gray-400" />
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      {productos.length === 0
                        ? "No hay productos en el inventario"
                        : "No se encontraron productos"}
                    </h3>
                    <p className="text-gray-600 max-w-sm mx-auto">
                      {productos.length === 0
                        ? "Aún no hay productos registrados en el inventario de esta sede."
                        : "Intenta ajustar los filtros o cambiar los términos de búsqueda."}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {productosFiltrados.map((producto) => (
                      <div key={producto._id} className="group">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-white border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-colors">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start gap-3">
                              <div className="p-2 bg-gray-100 rounded-lg mt-1">
                                <Package className="h-4 w-4 text-gray-600" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <h4 className="text-sm font-semibold text-gray-900 truncate">
                                    {producto.nombre}
                                  </h4>
                                  <Badge variant="outline" className="text-xs">
                                    {producto.producto_id}
                                  </Badge>
                                </div>
                                <div className="flex items-center flex-wrap gap-3 text-xs text-gray-500">
                                  <span>Código: {producto.producto_codigo}</span>
                                  <span>•</span>
                                  <span>Categoría: {producto.categoria || "Sin categoría"}</span>
                                  <span>•</span>
                                  <span>Mínimo: {producto.stock_minimo}</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-col sm:items-end gap-3 mt-4 sm:mt-0">
                            <div className="flex items-center gap-4">
                              {productoEditando === producto._id ? (
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="number"
                                    min="0"
                                    value={stockTemporal}
                                    onChange={(e) => setStockTemporal(parseInt(e.target.value) || 0)}
                                    className="w-24 text-center text-lg font-bold"
                                    disabled={guardandoStock === producto._id}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        guardarStock(producto)
                                      } else if (e.key === "Escape") {
                                        cancelarEdicionStock()
                                      }
                                    }}
                                  />
                                  <Button
                                    size="sm"
                                    onClick={() => guardarStock(producto)}
                                    disabled={guardandoStock === producto._id}
                                    className="bg-gray-400 hover:bg-gray-500
                                    disabled:bg-gray-300
                                    disabled:cursor-not-allowed"
                                  >
                                    {guardandoStock === producto._id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Save className="h-4 w-4" />
                                    )}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={cancelarEdicionStock}
                                    disabled={guardandoStock === producto._id}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              ) : (
                                <div className="text-right">
                                  <div className="flex items-center gap-2">
                                    <p className="text-lg font-bold text-gray-900">{producto.stock_actual}</p>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => iniciarEdicionStock(producto)}
                                      className="h-6 w-6 p-0"
                                      title="Editar stock"
                                    >
                                      <Edit2 className="h-3 w-3 text-gray-500 hover:text-gray-700" />
                                    </Button>
                                  </div>
                                  <p className="text-xs text-gray-500">Stock actual</p>
                                </div>
                              )}
                            </div>

                            <div className="flex flex-col items-end gap-2">
                              <div className="flex items-center gap-2">
                                <Badge className={`${getStockColor(producto.stock_actual, producto.stock_minimo)} text-xs font-medium px-2 py-1`}>
                                  {producto.stock_actual === 0
                                    ? "Sin Stock"
                                    : producto.stock_actual <= producto.stock_minimo
                                      ? "Bajo Stock"
                                      : "Disponible"}
                                </Badge>
                              </div>
                              <span className="text-xs text-gray-500">
                                Actualizado:{" "}
                                {producto.fecha_ultima_actualizacion
                                  ? formatDateDMY(producto.fecha_ultima_actualizacion)
                                  : "—"}

                              </span>
                              {mensajeExito && productoEditando === null && (
                                <span className="text-xs text-green-600 font-medium">
                                  {mensajeExito}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <Separator className="mt-4 last:hidden" />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Resumen */}
          {!isLoading && !error && productosFiltrados.length > 0 && (
            <div className="mt-6 p-4 bg-white border border-gray-200 rounded-lg">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-sm text-gray-600">
                  <p>
                    <strong className="font-medium text-gray-900">Resumen del inventario:</strong>{" "}
                    {stats.productosBajoStock > 0 && (
                      <span className="text-amber-600">{stats.productosBajoStock} productos con stock bajo</span>
                    )}
                    {stats.productosBajoStock > 0 && stats.productosSinStock > 0 && ", "}
                    {stats.productosSinStock > 0 && (
                      <span className="text-red-600">{stats.productosSinStock} productos sin stock</span>
                    )}
                    {(stats.productosBajoStock === 0 && stats.productosSinStock === 0) &&
                      <span className="text-emerald-600">Todo el inventario en niveles óptimos</span>
                    }
                  </p>
                </div>

                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <span>Total de productos:</span>
                  <span className="font-medium text-gray-900">{stats.totalProductos}</span>
                  <span className="mx-2">•</span>
                  <span>Stock total:</span>
                  <span className="font-medium text-gray-900">{stats.totalStock}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={isCreateModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            cerrarModalCreacion()
            return
          }
          setIsCreateModalOpen(true)
        }}
      >
        <DialogContent className="sm:max-w-md bg-white border-gray-200 text-gray-900">
          <DialogHeader>
            <DialogTitle>Crear producto en inventario</DialogTitle>
            <DialogDescription>
              Registra el inventario inicial de un producto en una sede.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {isLoadingCreateData && (
              <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando productos y sedes...
              </div>
            )}

            {modalDataError && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                {modalDataError}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700" htmlFor="producto-id">
                Producto
              </label>
              {productosCatalogo.length > 0 ? (
                <Select
                  value={nuevoProductoId}
                  onValueChange={setNuevoProductoId}
                  disabled={isCreatingInventario || isLoadingCreateData}
                >
                  <SelectTrigger id="producto-id" className="bg-white border-gray-300 text-gray-900">
                    <SelectValue placeholder="Selecciona un producto" />
                  </SelectTrigger>
                  <SelectContent className="z-[60] bg-white border-gray-200 text-gray-900">
                    {productosCatalogo.map((producto) => (
                      <SelectItem className="text-gray-900 focus:bg-gray-100 focus:text-gray-900" key={producto.id} value={producto.id}>
                        {producto.nombre}{producto.codigo ? ` (${producto.codigo})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="producto-id"
                  placeholder="Ej: P001"
                  value={nuevoProductoId}
                  onChange={(e) => setNuevoProductoId(e.target.value)}
                  disabled={isCreatingInventario || isLoadingCreateData}
                  className="bg-white"
                />
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700" htmlFor="sede-id">
                Sede
              </label>
              <Select
                value={nuevoSedeId}
                onValueChange={setNuevoSedeId}
                disabled={isCreatingInventario || isLoadingCreateData || sedesDisponibles.length === 0}
              >
                <SelectTrigger id="sede-id" className="bg-white border-gray-300 text-gray-900">
                  <SelectValue placeholder="Selecciona una sede" />
                </SelectTrigger>
                <SelectContent className="z-[60] bg-white border-gray-200 text-gray-900">
                  {sedesDisponibles.map((sede) => (
                    <SelectItem className="text-gray-900 focus:bg-gray-100 focus:text-gray-900" key={sede._id} value={sede.sede_id}>
                      {sede.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700" htmlFor="stock-inicial">
                  Stock inicial
                </label>
                <Input
                  id="stock-inicial"
                  type="number"
                  min="0"
                  value={nuevoStockInicial}
                  onChange={(e) => setNuevoStockInicial(e.target.value)}
                  disabled={isCreatingInventario}
                  className="bg-white"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700" htmlFor="stock-minimo">
                  Stock mínimo
                </label>
                <Input
                  id="stock-minimo"
                  type="number"
                  min="0"
                  value={nuevoStockMinimo}
                  onChange={(e) => setNuevoStockMinimo(e.target.value)}
                  disabled={isCreatingInventario}
                  className="bg-white"
                />
              </div>
            </div>

            {createError && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {createError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={cerrarModalCreacion}
              disabled={isCreatingInventario}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={crearInventario}
              disabled={isCreatingInventario || isLoadingCreateData || !nuevoProductoId || !nuevoSedeId}
              className="gap-2"
            >
              {isCreatingInventario && <Loader2 className="h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
