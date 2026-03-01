"use client"

import { useState, useEffect, useMemo } from "react"
import { Search, Loader2, Calendar, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { PageHeader } from "../../../components/Layout/PageHeader"
import { FacturaDetailModal } from "./factura-detail-modal"
import type { Factura } from "../../../types/factura"
import { facturaService } from "./facturas"
import { formatDateDMY } from "../../../lib/dateFormat"
import { PaymentMethodsSummary } from "../../../components/SalesInvoiced/payment-methods-summary"
import {
  calculatePaymentMethodTotals,
  type PaymentMethodTotals,
} from "../../../lib/payment-methods-summary"

type FacturaFilters = {
  searchTerm: string
  fecha_desde: string
  fecha_hasta: string
}

const EMPTY_FACTURA_FILTERS: FacturaFilters = {
  searchTerm: "",
  fecha_desde: "",
  fecha_hasta: "",
}

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
  const [appliedFilters, setAppliedFilters] = useState<FacturaFilters>(EMPTY_FACTURA_FILTERS)
  const [limit, ] = useState(50)
  const [paymentSummary, setPaymentSummary] = useState<PaymentMethodTotals | null>(null)

  // Cargar facturas al montar el componente
  useEffect(() => {
    cargarFacturas(1, EMPTY_FACTURA_FILTERS)
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

  const cargarFacturas = async (page: number = 1, filtros: FacturaFilters = appliedFilters) => {
    try {
      setIsLoading(true)
      setError(null)

      // Obtener ventas con filtros
      const result = await facturaService.buscarFacturas({
        searchTerm: filtros.searchTerm,
        fecha_desde: filtros.fecha_desde,
        fecha_hasta: filtros.fecha_hasta,
        page: page,
        limit: limit
      })
      
      // Actualizar el estado con las facturas
      setFacturas(result.facturas as Factura[])
      setPagination(result.pagination)
      setPaymentSummary(result.paymentSummary || null)
      setFiltersApplied({
        ...(result.filters_applied || {}),
        fecha_desde: filtros.fecha_desde || null,
        fecha_hasta: filtros.fecha_hasta || null,
        search: filtros.searchTerm || null,
      })
      setCurrentPage(page)
      
    } catch (err) {
      console.error("Error cargando facturas:", err)
      setError("Error al cargar las facturas. Por favor, intenta nuevamente.")
      setFacturas([])
      setPagination(null)
      setPaymentSummary(null)
    } finally {
      setIsLoading(false)
    }
  }

  // Función para aplicar filtros
  const aplicarFiltros = async () => {
    const filtros = {
      searchTerm: searchTerm.trim(),
      fecha_desde: fechaDesde,
      fecha_hasta: fechaHasta,
    }
    setAppliedFilters(filtros)
    await cargarFacturas(1, filtros)
  }

  // Función para limpiar filtros
  const limpiarFiltros = () => {
    setSearchTerm("")
    setFechaDesde("")
    setFechaHasta("")
    setAppliedFilters(EMPTY_FACTURA_FILTERS)
    cargarFacturas(1, EMPTY_FACTURA_FILTERS)
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
      cargarFacturas(pagina, appliedFilters)
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

  const summaryCurrency = (facturas[0]?.moneda || "COP").toUpperCase()

  const formatSummaryCurrency = (amount: number) => {
    const safeAmount = Number.isFinite(amount) ? amount : 0
    return `$ ${Math.round(safeAmount).toLocaleString(getCurrencyLocale(summaryCurrency))}`
  }

  const paymentTotals = useMemo(() => {
    if (paymentSummary) {
      return paymentSummary
    }

    // TODO: Sin agregados del backend, estos totales reflejan las filas cargadas en la página actual.
    return calculatePaymentMethodTotals(facturas)
  }, [paymentSummary, facturas])

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
        <PageHeader title="Ventas Facturadas" />

        {/* Filtros */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-4">
            {/* Campo de búsqueda */}
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Buscar cliente/comprobante
              </label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Nombre, cédula, email o número de comprobante..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-9 pl-8 text-sm"
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Fecha desde */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Fecha desde
              </label>
              <div className="relative">
                <Calendar className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <Input
                  type="date"
                  value={fechaDesde}
                  onChange={(e) => setFechaDesde(e.target.value)}
                  className="h-9 pl-8 text-sm"
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Fecha hasta */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Fecha hasta
              </label>
              <div className="relative">
                <Calendar className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <Input
                  type="date"
                  value={fechaHasta}
                  onChange={(e) => setFechaHasta(e.target.value)}
                  className="h-9 pl-8 text-sm"
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
                className="h-9 px-3 text-xs"
              >
                Hoy
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={filtrarUltimoMes}
                disabled={isLoading}
                className="h-9 px-3 text-xs"
              >
                Últimos 30 días
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={limpiarFiltros}
                disabled={isLoading}
                className="h-9 px-3 text-xs"
              >
                Limpiar filtros
              </Button>
            </div>
            
            <div className="flex gap-2">
              <Button
                variant="default"
                onClick={aplicarFiltros}
                disabled={isLoading}
                className="h-9 bg-gray-900 px-3 text-xs text-white hover:bg-gray-800"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
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

        <PaymentMethodsSummary
          totals={paymentTotals}
          loading={isLoading}
          formatAmount={formatSummaryCurrency}
        />

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
              onClick={() => cargarFacturas(currentPage, appliedFilters)}
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
            {(appliedFilters.fecha_desde || appliedFilters.fecha_hasta) && (
              <div className="text-sm text-gray-500">
                {appliedFilters.fecha_desde && `Desde: ${formatDate(appliedFilters.fecha_desde)} `}
                {appliedFilters.fecha_hasta && `Hasta: ${formatDate(appliedFilters.fecha_hasta)}`}
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
