"use client"

import { useState, useEffect } from "react"
import { Search, Loader2, Calendar, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { FacturaDetailModal } from "./factura-detail-modal"
import type { Factura } from "../../../types/factura"
import { facturaService } from "./facturas"
import { formatDateDMY } from "../../../lib/dateFormat"

export function VentasFacturadasList() {
  const [searchTerm, setSearchTerm] = useState("")
  const [fechaDesde, setFechaDesde] = useState("")
  const [fechaHasta, setFechaHasta] = useState("")
  const [selectedFactura, setSelectedFactura] = useState<Factura | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [facturas, setFacturas] = useState<Factura[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pagination, setPagination] = useState<any>(null)
  const [filtersApplied, setFiltersApplied] = useState<any>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [limit, ] = useState(50)

  // Obtener datos de la sede desde sessionStorage
  const sedeId = sessionStorage.getItem("beaux-sede_id")

  // Cargar facturas al montar el componente
  useEffect(() => {
    cargarFacturas(false)
  }, [])

  // Formatear fecha actual para usar como valor por defecto
  const getCurrentDate = () => {
    const today = new Date()
    return today.toISOString().split('T')[0]
  }

  // Formatear fecha de hace 30 días
  const getDate30DaysAgo = () => {
    const date = new Date()
    date.setDate(date.getDate() - 30)
    return date.toISOString().split('T')[0]
  }

  const cargarFacturas = async (useFilters: boolean = false, page: number = 1) => {
    try {
      setIsLoading(true)
      setError(null)
      
      let fechaDesdeParam = fechaDesde
      let fechaHastaParam = fechaHasta
      let searchParam = searchTerm
      
      // Si no estamos usando filtros específicos, limpiar los parámetros
      if (!useFilters) {
        fechaDesdeParam = ""
        fechaHastaParam = ""
        searchParam = ""
      }
      
      // Obtener ventas con filtros
      const result = await facturaService.buscarFacturas({
        searchTerm: searchParam,
        fecha_desde: fechaDesdeParam,
        fecha_hasta: fechaHastaParam,
        page: page,
        limit: limit
      })
      
      // Actualizar el estado con las facturas
      setFacturas(result.facturas as Factura[])
      setPagination(result.pagination)
      setFiltersApplied(result.filters_applied)
      setCurrentPage(page)
      
    } catch (err) {
      console.error("Error cargando facturas:", err)
      setError("Error al cargar las facturas. Por favor, intenta nuevamente.")
      setFacturas([])
      setPagination(null)
    } finally {
      setIsLoading(false)
    }
  }

  // Función para aplicar filtros
  const aplicarFiltros = async () => {
    await cargarFacturas(true, 1) // Siempre volver a la primera página
  }

  // Función para limpiar filtros
  const limpiarFiltros = () => {
    setSearchTerm("")
    setFechaDesde("")
    setFechaHasta("")
    cargarFacturas(false, 1)
  }

  // Función para aplicar filtro del último mes
  const filtrarUltimoMes = () => {
    setFechaDesde(getDate30DaysAgo())
    setFechaHasta(getCurrentDate())
  }

  // Función para aplicar filtro de hoy
  const filtrarHoy = () => {
    const today = getCurrentDate()
    setFechaDesde(today)
    setFechaHasta(today)
  }



  // Navegación de páginas
  const irAPagina = (pagina: number) => {
    if (pagina >= 1 && pagina <= (pagination?.total_pages || 1)) {
      cargarFacturas(true, pagina)
    }
  }

  // Ir a la primera página
  const irPrimeraPagina = () => {
    irAPagina(1)
  }

  // Ir a la última página
  const irUltimaPagina = () => {
    irAPagina(pagination?.total_pages || 1)
  }

  // Ir a página anterior
  const irPaginaAnterior = () => {
    irAPagina(currentPage - 1)
  }

  // Ir a página siguiente
  const irPaginaSiguiente = () => {
    irAPagina(currentPage + 1)
  }

  const handleRowClick = (factura: Factura) => {
    setSelectedFactura(factura)
    setIsModalOpen(true)
  }

  const formatDate = (dateString: string) => formatDateDMY(dateString, dateString)

  const getCurrencyLocale = (currency: string) => {
    if (currency === "USD") return "en-US"
    if (currency === "MXN") return "es-MX"
    return "es-CO"
  }

  const formatCurrency = (amount: number, currency: string) => {
    const safeCurrency = (currency || "COP").toUpperCase()
    const safeAmount = Number.isFinite(amount) ? amount : 0
    return `${safeCurrency} ${Math.round(safeAmount).toLocaleString(getCurrencyLocale(safeCurrency))}`
  }

  // Generar array de números de página para mostrar
  const getPaginasParaMostrar = () => {
    if (!pagination) return []
    
    const paginas = []
    const totalPages = pagination.total_pages
    const current = currentPage
    
    // Mostrar máximo 5 páginas
    let inicio = Math.max(1, current - 2)
    let fin = Math.min(totalPages, current + 2)
    
    // Ajustar si estamos cerca del inicio
    if (current <= 3) {
      fin = Math.min(5, totalPages)
    }
    
    // Ajustar si estamos cerca del final
    if (current >= totalPages - 2) {
      inicio = Math.max(1, totalPages - 4)
    }
    
    for (let i = inicio; i <= fin; i++) {
      paginas.push(i)
    }
    
    return paginas
  }

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Ventas facturadas</h1>
            {sedeId && (
              <p className="text-sm text-gray-600 mt-1">
              </p>
            )}
          </div>  
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            {/* Campo de búsqueda */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Buscar cliente/comprobante
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Nombre, cédula, email o número de comprobante..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Fecha desde */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fecha desde
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  type="date"
                  value={fechaDesde}
                  onChange={(e) => setFechaDesde(e.target.value)}
                  className="pl-10"
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Fecha hasta */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fecha hasta
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  type="date"
                  value={fechaHasta}
                  onChange={(e) => setFechaHasta(e.target.value)}
                  className="pl-10"
                  disabled={isLoading}
                />
              </div>
            </div>
          </div>

          {/* Botones de filtros rápidos y acciones */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={filtrarHoy}
                disabled={isLoading}
              >
                Hoy
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={filtrarUltimoMes}
                disabled={isLoading}
              >
                Últimos 30 días
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={limpiarFiltros}
                disabled={isLoading}
              >
                Limpiar filtros
              </Button>
            </div>
            
            <div className="flex gap-2">
              <Button
                variant="default"
                onClick={aplicarFiltros}
                disabled={isLoading}
                className="bg-gray-900 hover:bg-gray-800 text-white"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Aplicando...
                  </>
                ) : (
                  "Aplicar filtros"
                )}
              </Button>
            </div>
          </div>

          {/* Mostrar filtros aplicados */}
          {filtersApplied && (filtersApplied.fecha_desde || filtersApplied.fecha_hasta || filtersApplied.search) && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800 font-medium mb-1">Filtros aplicados:</p>
              <div className="flex flex-wrap gap-2">
                {filtersApplied.fecha_desde && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    Desde: {formatDate(filtersApplied.fecha_desde)}
                  </span>
                )}
                {filtersApplied.fecha_hasta && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    Hasta: {formatDate(filtersApplied.fecha_hasta)}
                  </span>
                )}
                {filtersApplied.search && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    Búsqueda: "{filtersApplied.search}"
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Estado de carga/error */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            <span className="ml-2 text-gray-600">Cargando facturas...</span>
          </div>
        )}

        {error && !isLoading && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-700">{error}</p>
            <Button 
              variant="outline" 
              size="sm" 
              className="mt-2"
              onClick={() => cargarFacturas(false, 1)}
            >
              Reintentar
            </Button>
          </div>
        )}

        {/* Tabla */}
        {!isLoading && !error && (
          <div className="rounded-lg border bg-white">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b bg-gray-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Fecha pago</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Cliente</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Local</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Profesional</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">N° Comprobante</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Método pago</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Total</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {facturas.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                        No se encontraron facturas con los filtros aplicados.
                      </td>
                    </tr>
                  ) : (
                    facturas.map((factura) => (
                      <tr
                        key={`${factura.identificador}-${factura.fecha_pago}`}
                        onClick={() => handleRowClick(factura)}
                        className="cursor-pointer transition-colors hover:bg-gray-50"
                      >
                        <td className="px-6 py-4 text-sm text-gray-700">{formatDate(factura.fecha_pago)}</td>
                        <td className="px-6 py-4 text-sm text-gray-700">{factura.nombre_cliente}</td>
                        <td className="px-6 py-4 text-sm text-gray-700">{factura.local}</td>
                        <td className="px-6 py-4 text-sm text-gray-700">{factura.profesional_nombre}</td>
                        <td className="px-6 py-4 text-sm text-gray-700">{factura.numero_comprobante}</td>
                        <td className="px-6 py-4 text-sm text-gray-700 capitalize">{factura.metodo_pago}</td>
                        <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                          {formatCurrency(factura.total, factura.moneda)}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                              factura.estado === "pagado" 
                                ? "bg-green-100 text-green-800" 
                                : "bg-yellow-100 text-yellow-800"
                            }`}
                          >
                            {factura.estado}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Controles de paginación */}
        {!isLoading && !error && pagination && pagination.total_pages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-4">
            {/* Información de página */}
            <div className="text-sm text-gray-600">
              Mostrando <span className="font-semibold">{pagination.from}</span> a{" "}
              <span className="font-semibold">{pagination.to}</span> de{" "}
              <span className="font-semibold">{pagination.total}</span> facturas
            </div>
            
            {/* Controles de navegación */}
            <div className="flex items-center gap-2">
              {/* Botones de navegación */}
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={irPrimeraPagina}
                  disabled={currentPage === 1 || isLoading}
                  className="h-8 w-8"
                >
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={irPaginaAnterior}
                  disabled={!pagination.has_prev || isLoading}
                  className="h-8 w-8"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                
                {/* Números de página */}
                {getPaginasParaMostrar().map((pagina) => (
                  <Button
                    key={pagina}
                    variant={pagina === currentPage ? "default" : "outline"}
                    size="icon"
                    onClick={() => irAPagina(pagina)}
                    disabled={isLoading}
                    className={`h-8 w-8 ${pagina === currentPage ? "bg-gray-900 text-white hover:bg-gray-800" : ""}`}
                  >
                    {pagina}
                  </Button>
                ))}
                
                <Button
                  variant="outline"
                  size="icon"
                  onClick={irPaginaSiguiente}
                  disabled={!pagination.has_next || isLoading}
                  className="h-8 w-8"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={irUltimaPagina}
                  disabled={currentPage === pagination.total_pages || isLoading}
                  className="h-8 w-8"
                >
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
              
            </div>
          </div>
        )}

        {/* Resumen sin paginación */}
        {!isLoading && !error && (!pagination || pagination.total_pages <= 1) && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-600">
            <div>
              {pagination ? (
                <>
                  Mostrando {pagination.showing} de {pagination.total} facturas
                </>
              ) : (
                `Mostrando ${facturas.length} facturas`
              )}
            </div>
            
            {/* Información de fechas del rango */}
            {(fechaDesde || fechaHasta) && (
              <div className="text-sm text-gray-500">
                {fechaDesde && `Desde: ${formatDate(fechaDesde)} `}
                {fechaHasta && `Hasta: ${formatDate(fechaHasta)}`}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedFactura && (
        <FacturaDetailModal 
          factura={selectedFactura} 
          open={isModalOpen} 
          onOpenChange={setIsModalOpen} 
        />
      )}
    </>
  )
}
