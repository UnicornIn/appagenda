"use client"

import { useState, useEffect, useMemo } from "react"
import {
  Search,
  Download,
  Loader2,
  Building,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react"
import { FacturaDetailModal } from "./factura-detail-modal"
import type { Factura } from "../../../types/factura"
import { facturaService } from "./facturas"
import { sedeService } from "../Sedes/sedeService"
import type { Sede } from "../../../types/sede"
import { formatSedeNombre } from "../../../lib/sede"
import { formatDateDMY } from "../../../lib/dateFormat"
import { PaymentMethodsSummary } from "../../../components/SalesInvoiced/payment-methods-summary"
import {
  calculatePaymentMethodTotals,
  type PaymentMethodTotals,
} from "../../../lib/payment-methods-summary"

export function VentasFacturadasList() {
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedSede, setSelectedSede] = useState("")
  const [selectedEstado, setSelectedEstado] = useState("all")
  const [selectedFactura, setSelectedFactura] = useState<Factura | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [facturas, setFacturas] = useState<Factura[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingSedes, setIsLoadingSedes] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sedes, setSedes] = useState<Sede[]>([])
  const [sedeIdMap, setSedeIdMap] = useState<Record<string, string>>({}) // Mapa de _id a sede_id
  const [pagination, setPagination] = useState<any>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [limit] = useState(50)
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("")
  const [paymentSummary, setPaymentSummary] = useState<PaymentMethodTotals | null>(null)

  // Cargar sedes disponibles
  useEffect(() => {
    cargarSedes()
  }, [])

  // Aplicar debounce al término de búsqueda para no disparar requests por tecla
  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm.trim())
    }, 300)
    return () => clearTimeout(timeout)
  }, [searchTerm])

  // Cargar facturas cuando se selecciona una sede o cambia la búsqueda
  useEffect(() => {
    if (selectedSede && sedeIdMap[selectedSede]) {
      cargarFacturas(1)
    } else {
      setFacturas([])
      setPagination(null)
      setPaymentSummary(null)
    }
  }, [selectedSede, sedeIdMap, debouncedSearchTerm])

  const cargarSedes = async () => {
    try {
      setIsLoadingSedes(true)
      const token = sessionStorage.getItem("access_token")
      if (!token) {
        throw new Error("No hay token de autenticación")
      }
      
      const sedesData = await sedeService.getSedes(token)
      setSedes(sedesData)
      
      // Crear mapa de _id a sede_id
      const idMap: Record<string, string> = {}
      sedesData.forEach(sede => {
        if (sede._id && sede.sede_id) {
          idMap[sede._id] = sede.sede_id
        }
      })
      setSedeIdMap(idMap)

      // Mantener el selector sin sede por defecto al entrar.
      setSelectedSede((actual) => (actual && idMap[actual] ? actual : ""))
    } catch (err) {
      console.error("Error cargando sedes:", err)
      setError("Error al cargar las sedes disponibles")
    } finally {
      setIsLoadingSedes(false)
    }
  }

  const cargarFacturas = async (page: number = 1) => {
    try {
      setIsLoading(true)
      setError(null)

      // Usar el sede_id correcto (SD-XXXXX)
      const sedeId = sedeIdMap[selectedSede]
      if (!sedeId) {
        throw new Error("ID de sede no válido")
      }
      
      console.log("Cargando facturas para sede:", sedeId)
      
      // Usar el servicio existente con paginación backend
      const result = await facturaService.getVentasBySedePaginadas(sedeId, {
        page,
        limit,
        search: debouncedSearchTerm || undefined,
      })
      
      console.log("Facturas cargadas:", result.facturas.length)
      
      // Actualizar el estado con las facturas
      setFacturas(result.facturas as Factura[])
      setPagination(result.pagination || null)
      setPaymentSummary(result.paymentSummary || null)
      setCurrentPage(page)
      
    } catch (err: any) {
      console.error("Error cargando facturas:", err)
      setError(err.message || "Error al cargar las facturas. Por favor, intenta nuevamente.")
      setFacturas([])
      setPagination(null)
      setPaymentSummary(null)
    } finally {
      setIsLoading(false)
    }
  }

  // Filtrar facturas basado en los criterios
  const facturasFiltradas = facturas.filter(factura => {
    // Filtro por estado
    if (selectedEstado !== "all" && factura.estado !== selectedEstado) {
      return false
    }
    
    return true
  })

  const irAPagina = (pagina: number) => {
    if (pagina >= 1 && pagina <= (pagination?.total_pages || 1)) {
      cargarFacturas(pagina)
    }
  }

  const irPrimeraPagina = () => {
    irAPagina(1)
  }

  const irUltimaPagina = () => {
    irAPagina(pagination?.total_pages || 1)
  }

  const irPaginaAnterior = () => {
    irAPagina(currentPage - 1)
  }

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

  const summaryCurrency = (facturasFiltradas[0]?.moneda || facturas[0]?.moneda || "COP").toUpperCase()

  const formatSummaryCurrency = (amount: number) => {
    const safeAmount = Number.isFinite(amount) ? amount : 0
    return `$ ${Math.round(safeAmount).toLocaleString(getCurrencyLocale(summaryCurrency))}`
  }

  const selectedSedeNombre = formatSedeNombre(
    sedes.find(s => s._id === selectedSede)?.nombre,
    "Sede seleccionada"
  )

  const shouldUseBackendPaymentSummary =
    selectedEstado === "all" && Boolean(paymentSummary)

  const paymentTotals = useMemo(() => {
    if (shouldUseBackendPaymentSummary && paymentSummary) {
      return paymentSummary
    }

    // TODO: Sin agregados del backend para este filtro, estos totales reflejan las filas cargadas en la página actual.
    return calculatePaymentMethodTotals(facturasFiltradas)
  }, [shouldUseBackendPaymentSummary, paymentSummary, facturasFiltradas])

  const handleExportCSV = () => {
    try {
      // Crear encabezados CSV
      const headers = [
        "Fecha Pago",
        "Cliente",
        "Local",
        "Profesional",
        "N° Comprobante",
        "Método Pago",
        "Total",
        "Estado"
      ]
      
      // Crear filas de datos
      const rows = facturasFiltradas.map(factura => [
        formatDate(factura.fecha_pago),
        factura.nombre_cliente,
        factura.local,
        factura.profesional_nombre,
        factura.numero_comprobante,
        factura.metodo_pago,
        formatCurrency(factura.total, factura.moneda),
        factura.estado
      ])
      
      // Crear contenido CSV
      const csvContent = [
        headers.join(","),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
      ].join("\n")
      
      // Obtener nombre de la sede seleccionada
      const sedeNombre = formatSedeNombre(
        sedes.find(s => s._id === selectedSede)?.nombre,
        "sede"
      )
      
      // Crear y descargar archivo
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.setAttribute("download", `ventas-${sedeNombre}-${new Date().toISOString().split('T')[0]}.csv`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      
    } catch (error) {
      console.error("Error exportando CSV:", error)
      alert("Error al exportar el archivo CSV")
    }
  }

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-medium">Ventas facturadas</h1>
            <p className="text-sm text-gray-600 mt-1">
              {selectedSede 
                ? `Sede: ${selectedSedeNombre}`
                : "Selecciona una sede para ver las facturas"}
            </p>
          </div>
          
          {selectedSede && facturasFiltradas.length > 0 && (
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1 px-3 py-1.5 text-sm border border-black hover:bg-gray-50"
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              Exportar CSV
            </button>
          )}
        </div>

        {/* Selector de Sede */}
        <div className="mb-6">
          <label className="mb-1.5 block text-xs font-medium">Seleccionar sede</label>
          {isLoadingSedes ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span className="text-sm text-gray-600">Cargando sedes...</span>
            </div>
          ) : sedes.length === 0 ? (
            <div className="text-sm text-gray-600">No hay sedes disponibles</div>
          ) : (
            <select
              value={selectedSede}
              onChange={(e) => setSelectedSede(e.target.value)}
              className="h-9 w-full border px-3 text-sm focus:border-gray-400 focus:outline-none"
              disabled={isLoadingSedes}
            >
              <option value="">-- Seleccionar sede --</option>
              {sedes.map((sede) => (
                <option key={sede._id} value={sede._id}>
                  {formatSedeNombre(sede.nombre)}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Filtros (solo mostrar si hay sede seleccionada) */}
        {selectedSede && (
          <>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar facturas..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-9 w-full border pl-8 pr-3 text-sm focus:border-gray-400 focus:outline-none"
                  disabled={isLoading}
                />
              </div>
              
              <select
                value={selectedEstado}
                onChange={(e) => setSelectedEstado(e.target.value)}
                className="h-9 min-w-[180px] border px-3 text-sm focus:border-gray-400 focus:outline-none"
                disabled={isLoading}
              >
                <option value="all">Todos los estados</option>
                <option value="pagado">Pagado</option>
                <option value="pendiente">Pendiente</option>
              </select>
            </div>

            <PaymentMethodsSummary
              totals={paymentTotals}
              loading={isLoading}
              formatAmount={formatSummaryCurrency}
            />

            {/* Estado de carga/error */}
            {isLoading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="ml-2 text-sm text-gray-600">Cargando facturas...</span>
              </div>
            )}

            {error && !isLoading && (
              <div className="p-3 border border-red-300 bg-red-50">
                <p className="text-sm text-red-800">{error}</p>
                <button 
                  onClick={() => cargarFacturas(currentPage)}
                  className="mt-2 text-sm underline"
                >
                  Reintentar
                </button>
              </div>
            )}

            {/* Tabla */}
            {!isLoading && !error && (
              <div className="border">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-4 py-2 text-left">Fecha pago</th>
                        <th className="px-4 py-2 text-left">Cliente</th>
                        <th className="px-4 py-2 text-left">Profesional</th>
                        <th className="px-4 py-2 text-left">Comprobante</th>
                        <th className="px-4 py-2 text-left">Método</th>
                        <th className="px-4 py-2 text-left">Total</th>
                        <th className="px-4 py-2 text-left">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {facturasFiltradas.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                            {debouncedSearchTerm || selectedEstado !== "all"
                              ? "No se encontraron facturas con los filtros aplicados"
                              : "No hay facturas registradas en esta sede"}
                          </td>
                        </tr>
                      ) : (
                        facturasFiltradas.map((factura) => (
                          <tr
                            key={factura.identificador}
                            onClick={() => handleRowClick(factura)}
                            className="cursor-pointer hover:bg-gray-50 border-b"
                          >
                            <td className="px-4 py-2 text-gray-700">{formatDate(factura.fecha_pago)}</td>
                            <td className="px-4 py-2 text-gray-700">{factura.nombre_cliente}</td>
                            <td className="px-4 py-2 text-gray-700">{factura.profesional_nombre}</td>
                            <td className="px-4 py-2 text-gray-700">{factura.numero_comprobante}</td>
                            <td className="px-4 py-2 text-gray-700 capitalize">{factura.metodo_pago}</td>
                            <td className="px-4 py-2 font-medium">
                              {formatCurrency(factura.total, factura.moneda)}
                            </td>
                            <td className="px-4 py-2">
                              <span className={`text-xs px-2 py-0.5 ${
                                factura.estado === "pagado" 
                                  ? "bg-gray-100" 
                                  : "bg-gray-200"
                              }`}>
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

            {/* Resumen */}
            {!isLoading && !error && facturasFiltradas.length > 0 && (
              <div className="text-sm text-gray-600">
                {pagination
                  ? `Mostrando ${pagination.from} a ${pagination.to} de ${pagination.total} facturas`
                  : `Mostrando ${facturasFiltradas.length} de ${facturas.length} facturas`}
              </div>
            )}

            {/* Controles de paginación */}
            {!isLoading && !error && pagination && pagination.total_pages > 1 && (
              <div className="flex flex-wrap items-center justify-end gap-1 pt-2">
                <button
                  onClick={irPrimeraPagina}
                  disabled={currentPage === 1 || isLoading}
                  className="inline-flex h-8 w-8 items-center justify-center border disabled:opacity-50"
                  aria-label="Primera página"
                >
                  <ChevronsLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={irPaginaAnterior}
                  disabled={!pagination.has_prev || isLoading}
                  className="inline-flex h-8 w-8 items-center justify-center border disabled:opacity-50"
                  aria-label="Página anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-2 text-sm text-gray-600">
                  Página {currentPage} de {pagination.total_pages}
                </span>
                <button
                  onClick={irPaginaSiguiente}
                  disabled={!pagination.has_next || isLoading}
                  className="inline-flex h-8 w-8 items-center justify-center border disabled:opacity-50"
                  aria-label="Página siguiente"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button
                  onClick={irUltimaPagina}
                  disabled={currentPage === pagination.total_pages || isLoading}
                  className="inline-flex h-8 w-8 items-center justify-center border disabled:opacity-50"
                  aria-label="Última página"
                >
                  <ChevronsRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </>
        )}

        {/* Mensaje cuando no hay sede seleccionada */}
        {!selectedSede && sedes.length > 0 && !isLoadingSedes && (
          <div className="text-center py-12 border border-dashed">
            <Building className="h-8 w-8 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600 text-sm">Selecciona una sede para ver las facturas</p>
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
