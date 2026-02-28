"use client"

import { useState, useEffect } from "react"
import { Search, Package, AlertTriangle, BarChart3, Loader2, Filter, ChevronRight, TrendingUp, TrendingDown, Box, Edit2, Save, X } from "lucide-react"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../../components/ui/card"
import { Badge } from "../../../components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select"
import { Separator } from "../../../components/ui/separator"
import { inventarioService } from "../../PageSede/Products/inventario"
import type { InventarioProducto } from "../../PageSede/Products/inventario"
import { Sidebar } from "../../../components/Layout/Sidebar"
import { useAuth } from "../../../components/Auth/AuthContext" // Ajusta la ruta según tu estructura
import { formatDateDMY } from "../../../lib/dateFormat"

export function ProductsList() {
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCategoria, setSelectedCategoria] = useState("all")
  const [showLowStock, setShowLowStock] = useState(false)
  const [productos, setProductos] = useState<InventarioProducto[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [categorias, setCategorias] = useState<string[]>([])

  // Estados para edición de stock
  const [productoEditando, setProductoEditando] = useState<string | null>(null)
  const [stockTemporal, setStockTemporal] = useState<number>(0)
  const [guardandoStock, setGuardandoStock] = useState<string | null>(null)
  const [mensajeExito, setMensajeExito] = useState<string | null>(null)

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

  // Extraer categorías únicas
  useEffect(() => {
    if (productos.length > 0) {
      const categoriasUnicas = Array.from(new Set(productos.map(p => p.categoria).filter(Boolean)))
      setCategorias(categoriasUnicas)
    }
  }, [productos])

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

  // Filtrar productos
  const productosFiltrados = productos.filter(producto => {
    // Filtro por término de búsqueda
    if (searchTerm) {
      const termino = searchTerm.toLowerCase()
      const cumpleBusqueda =
        producto.nombre.toLowerCase().includes(termino) ||
        producto.producto_id.toLowerCase().includes(termino) ||
        producto.producto_codigo.toLowerCase().includes(termino)

      if (!cumpleBusqueda) return false
    }

    // Filtro por categoría
    if (selectedCategoria !== "all" && producto.categoria !== selectedCategoria) {
      return false
    }

    return true
  })

  // Calcular estadísticas
  const calcularEstadisticas = () => {
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
  }

  const stats = calcularEstadisticas()

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
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                  <span>Dashboard</span>
                  <ChevronRight className="h-3 w-3" />
                  <span>Inventario</span>
                  <ChevronRight className="h-3 w-3" />
                  <span className="text-gray-700 font-medium">Productos</span>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-3xl font-bold text-gray-900">Inventario</h1>
                    <p className="text-gray-600 mt-2">
                      Gestión de productos y control de stock
                    </p>
                  </div>

                </div>
              </div>
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
                    <SelectTrigger className="w-full lg:w-48 border-gray-300">
                      <SelectValue placeholder="Categoría" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas las categorías</SelectItem>
                      {categorias.map((categoria, index) => (
                        <SelectItem key={index} value={categoria}>{categoria}</SelectItem>
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

          {/* Estadísticas */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Card className="border-gray-200 hover:border-gray-300 transition-colors">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 mb-2">Total Productos</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.totalProductos}</p>
                  </div>
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <Package className="h-5 w-5 text-blue-600" />
                  </div>
                </div>
                <div className="mt-4 flex items-center text-xs text-gray-500">
                  <TrendingUp className="h-3 w-3 text-green-500 mr-1" />
                  <span>En inventario</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-gray-200 hover:border-gray-300 transition-colors">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 mb-2">Stock Total</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.totalStock}</p>
                  </div>
                  <div className="p-3 bg-emerald-50 rounded-lg">
                    <BarChart3 className="h-5 w-5 text-emerald-600" />
                  </div>
                </div>
                <div className="mt-4 flex items-center text-xs text-gray-500">
                  <span>Promedio: {stats.stockPromedio} por producto</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-gray-200 hover:border-gray-300 transition-colors">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 mb-2">Bajo Stock</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.productosBajoStock}</p>
                  </div>
                  <div className="p-3 bg-amber-50 rounded-lg">
                    <AlertTriangle className="h-5 w-5 text-amber-600" />
                  </div>
                </div>
                <div className="mt-4">
                  <div className="flex items-center text-xs text-gray-500">
                    <TrendingDown className="h-3 w-3 text-amber-500 mr-1" />
                    <span>{stats.totalProductos > 0 ? Math.round((stats.productosBajoStock / stats.totalProductos) * 100) : 0}% del inventario</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-gray-200 hover:border-gray-300 transition-colors">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 mb-2">Sin Stock</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.productosSinStock}</p>
                  </div>
                  <div className="p-3 bg-red-50 rounded-lg">
                    <AlertTriangle className="h-5 w-5 text-red-600" />
                  </div>
                </div>
                <div className="mt-4">
                  <div className="flex items-center text-xs text-gray-500">
                    <TrendingDown className="h-3 w-3 text-red-500 mr-1" />
                    <span>Requieren atención inmediata</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

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
    </div>
  )
}
