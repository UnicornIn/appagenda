"use client"

import { useEffect, useMemo, useState, type MouseEvent } from "react"
import {
  Search,
  Loader2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Send,
  Check,
  AlertCircle,
} from "lucide-react"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { PageHeader } from "../../../components/Layout/PageHeader"
import { FacturaDetailModal } from "./factura-detail-modal"
import type { Factura } from "../../../types/factura"
import { facturaService } from "./facturas"
import { formatDateDMY, parseDateToDate } from "../../../lib/dateFormat"
import { DEFAULT_PERIOD } from "../../../lib/period"
import { PaymentMethodsSummary } from "../../../components/SalesInvoiced/payment-methods-summary"
import {
  calculatePaymentMethodTotals,
  type PaymentMethodTotals,
} from "../../../lib/payment-methods-summary"
import { useAuth } from "../../../components/Auth/AuthContext"
import { emitElectronicInvoice } from "../../../lib/electronic-invoice"
import { resolveAllegraGate } from "../../../lib/allegra-fe"

type BillingPeriod = "today" | "last_7_days" | "last_30_days" | "month" | "custom"

type DateRange = {
  start_date: string
  end_date: string
}

type FacturaFilters = {
  searchTerm: string
  fecha_desde: string
  fecha_hasta: string
  period: BillingPeriod
}

type AppliedFacturaFilters = {
  fecha_desde: string | null
  fecha_hasta: string | null
  search: string | null
  period: BillingPeriod | null
}

const PERIOD_OPTIONS: Array<{ id: BillingPeriod; label: string }> = [
  { id: "today", label: "Hoy" },
  { id: "last_7_days", label: "7 días" },
  { id: "last_30_days", label: "30 días" },
  { id: "month", label: "Mes actual" },
  { id: "custom", label: "Rango personalizado" },
]

const DEFAULT_BILLING_PERIOD = DEFAULT_PERIOD as BillingPeriod
const SINGLE_DAY_FALLBACK_WINDOW_DAYS = 90
const SINGLE_DAY_FALLBACK_PAGE_SIZE = 200
const SINGLE_DAY_FALLBACK_MAX_PAGES = 8

const EMPTY_FACTURA_FILTERS: FacturaFilters = {
  searchTerm: "",
  fecha_desde: "",
  fecha_hasta: "",
  period: DEFAULT_BILLING_PERIOD,
}

const toIsoLocalDate = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const getDateRangeByPeriod = (period: BillingPeriod, customRange?: DateRange): DateRange => {
  const today = new Date()
  const todayYmd = toIsoLocalDate(today)

  if (period === "custom" && customRange?.start_date && customRange?.end_date) {
    return {
      start_date: customRange.start_date,
      end_date: customRange.end_date,
    }
  }

  if (period === "last_7_days") {
    const start = new Date(today)
    start.setDate(start.getDate() - 6)
    return { start_date: toIsoLocalDate(start), end_date: todayYmd }
  }

  if (period === "last_30_days") {
    const start = new Date(today)
    start.setDate(start.getDate() - 29)
    return { start_date: toIsoLocalDate(start), end_date: todayYmd }
  }

  if (period === "month") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1)
    return { start_date: toIsoLocalDate(start), end_date: todayYmd }
  }

  return { start_date: todayYmd, end_date: todayYmd }
}

const getDefaultCustomDateRange = (): DateRange => getDateRangeByPeriod("last_7_days")

const getFacturaEffectiveDateSource = (factura: Factura) =>
  String(factura.fecha_comprobante || factura.fecha_pago || "").trim()

const getFacturaEffectiveDateYmd = (factura: Factura) => {
  const parsedDate = parseDateToDate(getFacturaEffectiveDateSource(factura))
  return parsedDate ? toIsoLocalDate(parsedDate) : ""
}

const getFacturaEffectiveTimestamp = (factura: Factura) => {
  const source = getFacturaEffectiveDateSource(factura)
  const directDate = source ? new Date(source) : null

  if (directDate && !Number.isNaN(directDate.getTime())) {
    return directDate.getTime()
  }

  const parsedDate = parseDateToDate(source)
  return parsedDate ? parsedDate.getTime() : 0
}

const buildClientPagination = (page: number, pageSize: number, total: number) => {
  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0
  const current = totalPages > 0 ? Math.min(Math.max(page, 1), totalPages) : 1
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1
  const to = total === 0 ? 0 : Math.min(current * pageSize, total)

  return {
    page: current,
    limit: pageSize,
    total,
    total_pages: totalPages,
    has_next: totalPages > 0 && current < totalPages,
    has_prev: current > 1,
    showing: total === 0 ? 0 : to - from + 1,
    from,
    to,
  }
}

export function VentasFacturadasList() {
  const { user, activeSedeId } = useAuth()
  const defaultDateRange = useMemo(() => getDefaultCustomDateRange(), [])
  const [searchTerm, setSearchTerm] = useState("")
  const [period, setPeriod] = useState<BillingPeriod>(DEFAULT_BILLING_PERIOD)
  const [dateRange, setDateRange] = useState<DateRange>(defaultDateRange)
  const [tempDateRange, setTempDateRange] = useState<DateRange>(defaultDateRange)
  const [showDateModal, setShowDateModal] = useState(false)
  const [selectedFactura, setSelectedFactura] = useState<Factura | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [facturas, setFacturas] = useState<Factura[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pagination, setPagination] = useState<any>(null)
  const [filtersApplied, setFiltersApplied] = useState<AppliedFacturaFilters | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [appliedFilters, setAppliedFilters] = useState<FacturaFilters>(EMPTY_FACTURA_FILTERS)
  const [limit] = useState(50)
  const [paymentSummary, setPaymentSummary] = useState<PaymentMethodTotals | null>(null)
  const [feStatusById, setFeStatusById] = useState<
    Record<string, { status: "idle" | "loading" | "success" | "error"; message?: string }>
  >({})

  const activeSedeNombre =
    (typeof window !== "undefined"
      ? sessionStorage.getItem("beaux-nombre_local") || localStorage.getItem("beaux-nombre_local")
      : null) || user?.nombre_local || ""

  const allegraGate = useMemo(
    () => resolveAllegraGate({ sedeId: activeSedeId, sedeNombre: activeSedeNombre }),
    [activeSedeId, activeSedeNombre]
  )
  const allegraEnabled = allegraGate.allowed
  const authToken = user?.access_token

  const buildFilters = (
    nextSearchTerm: string,
    nextPeriod: BillingPeriod,
    nextDateRange: DateRange
  ): FacturaFilters => {
    const effectiveRange = getDateRangeByPeriod(nextPeriod, nextDateRange)

    return {
      searchTerm: nextSearchTerm.trim(),
      fecha_desde: effectiveRange.start_date,
      fecha_hasta: effectiveRange.end_date,
      period: nextPeriod,
    }
  }

  const cargarFacturasFechaEfectiva = async (page: number, filtros: FacturaFilters) => {
    if (!filtros.fecha_desde || filtros.fecha_desde !== filtros.fecha_hasta) {
      return null
    }

    const targetDate = filtros.fecha_desde
    const fallbackStart = new Date(`${targetDate}T00:00:00`)

    if (Number.isNaN(fallbackStart.getTime())) {
      return null
    }

    fallbackStart.setDate(fallbackStart.getDate() - SINGLE_DAY_FALLBACK_WINDOW_DAYS)

    const collectedFacturas: Factura[] = []

    for (
      let currentPage = 1;
      currentPage <= SINGLE_DAY_FALLBACK_MAX_PAGES;
      currentPage += 1
    ) {
      const result = await facturaService.buscarFacturas({
        searchTerm: filtros.searchTerm,
        fecha_desde: toIsoLocalDate(fallbackStart),
        fecha_hasta: filtros.fecha_hasta,
        page: currentPage,
        limit: SINGLE_DAY_FALLBACK_PAGE_SIZE,
      })

      collectedFacturas.push(...((result.facturas as Factura[]) || []))

      if (!result.pagination?.has_next) {
        break
      }
    }

    const filteredFacturas = collectedFacturas
      .filter((factura) => getFacturaEffectiveDateYmd(factura) === targetDate)
      .sort((a, b) => getFacturaEffectiveTimestamp(b) - getFacturaEffectiveTimestamp(a))

    const startIndex = (page - 1) * limit
    const pagedFacturas = filteredFacturas.slice(startIndex, startIndex + limit)

    return {
      facturas: pagedFacturas,
      pagination: buildClientPagination(page, limit, filteredFacturas.length),
      paymentSummary: calculatePaymentMethodTotals(filteredFacturas),
    }
  }

  const cargarFacturas = async (page: number = 1, filtros: FacturaFilters = appliedFilters) => {
    try {
      setIsLoading(true)
      setError(null)

      const singleDayResult =
        filtros.fecha_desde && filtros.fecha_desde === filtros.fecha_hasta
          ? await cargarFacturasFechaEfectiva(page, filtros)
          : null

      const result =
        singleDayResult ||
        (await facturaService.buscarFacturas({
          searchTerm: filtros.searchTerm,
          fecha_desde: filtros.fecha_desde,
          fecha_hasta: filtros.fecha_hasta,
          page,
          limit,
        }))

      setFacturas(result.facturas as Factura[])
      setPagination(result.pagination)
      setPaymentSummary(result.paymentSummary || null)
      setFiltersApplied({
        fecha_desde: filtros.fecha_desde || null,
        fecha_hasta: filtros.fecha_hasta || null,
        search: filtros.searchTerm || null,
        period: filtros.period || null,
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

  useEffect(() => {
    const initialFilters = buildFilters("", DEFAULT_BILLING_PERIOD, defaultDateRange)

    setPeriod(DEFAULT_BILLING_PERIOD)
    setDateRange(defaultDateRange)
    setTempDateRange(defaultDateRange)
    setAppliedFilters(initialFilters)
    void cargarFacturas(1, initialFilters)
  }, [defaultDateRange]) // eslint-disable-line react-hooks/exhaustive-deps

  const aplicarFiltros = async () => {
    const filtros = buildFilters(searchTerm, period, dateRange)
    setAppliedFilters(filtros)
    await cargarFacturas(1, filtros)
  }

  const limpiarFiltros = () => {
    setSearchTerm("")
    setPeriod(DEFAULT_BILLING_PERIOD)
    setDateRange(defaultDateRange)
    setTempDateRange(defaultDateRange)

    const filtros = buildFilters("", DEFAULT_BILLING_PERIOD, defaultDateRange)
    setAppliedFilters(filtros)
    void cargarFacturas(1, filtros)
  }

  const handlePeriodChange = async (newPeriod: BillingPeriod) => {
    if (newPeriod === "custom") {
      setTempDateRange(
        dateRange.start_date && dateRange.end_date ? dateRange : defaultDateRange
      )
      setShowDateModal(true)
      return
    }

    setPeriod(newPeriod)
    const filtros = buildFilters(searchTerm, newPeriod, dateRange)
    setAppliedFilters(filtros)
    await cargarFacturas(1, filtros)
  }

  const handleApplyDateRange = async () => {
    if (!tempDateRange.start_date || !tempDateRange.end_date) {
      console.log("⚠️ Por favor selecciona ambas fechas")
      return
    }

    if (new Date(tempDateRange.start_date) > new Date(tempDateRange.end_date)) {
      console.log("⚠️ La fecha de inicio no puede ser mayor a la fecha de fin")
      return
    }

    setDateRange(tempDateRange)
    setPeriod("custom")
    setShowDateModal(false)

    const filtros = buildFilters(searchTerm, "custom", tempDateRange)
    setAppliedFilters(filtros)
    await cargarFacturas(1, filtros)
  }

  const setQuickDateRange = (days: number) => {
    const today = new Date()
    const startDate = new Date(today)
    startDate.setDate(startDate.getDate() - (days - 1))

    setTempDateRange({
      start_date: toIsoLocalDate(startDate),
      end_date: toIsoLocalDate(today),
    })
  }

  const irAPagina = (pagina: number) => {
    if (pagina >= 1 && pagina <= (pagination?.total_pages || 1)) {
      void cargarFacturas(pagina, appliedFilters)
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
  const formatDateDisplay = (dateString: string) => formatDateDMY(dateString, "")
  const getPeriodLabel = (selectedPeriod?: BillingPeriod | null) =>
    PERIOD_OPTIONS.find((option) => option.id === selectedPeriod)?.label || "Rango aplicado"
  const appliedPeriodSummary = (() => {
    if (!filtersApplied) return null

    const periodLabel = getPeriodLabel(filtersApplied.period)

    if (filtersApplied.fecha_desde && filtersApplied.fecha_hasta) {
      return `${periodLabel}: ${formatDate(filtersApplied.fecha_desde)} - ${formatDate(filtersApplied.fecha_hasta)}`
    }

    if (filtersApplied.fecha_desde) {
      return `${periodLabel}: ${formatDate(filtersApplied.fecha_desde)}`
    }

    if (filtersApplied.fecha_hasta) {
      return `${periodLabel}: ${formatDate(filtersApplied.fecha_hasta)}`
    }

    return filtersApplied.period ? periodLabel : null
  })()

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

  const updateFeStatus = (
    key: string,
    next: { status: "idle" | "loading" | "success" | "error"; message?: string }
  ) => {
    setFeStatusById((prev) => ({ ...prev, [key]: next }))
  }

  const handleSendFe = async (event: MouseEvent, factura: Factura) => {
    event.stopPropagation()

    const saleId = (factura as any).venta_id || (factura as any)._id || null
    const invoiceId = (factura as any).factura_id || null
    const statusKey = saleId || invoiceId || factura.identificador

    if (!statusKey) return

    if (!allegraEnabled) {
      updateFeStatus(statusKey, {
        status: "error",
        message: allegraGate.reason || "FE disponible solo en sede El Poblado",
      })
      return
    }

    if (!saleId && !invoiceId) {
      updateFeStatus(statusKey, {
        status: "error",
        message: "Falta sale_id o factura_id para enviar FE",
      })
      return
    }

    if (!authToken) {
      updateFeStatus(statusKey, {
        status: "error",
        message: "No hay token de autenticación",
      })
      return
    }

    try {
      updateFeStatus(statusKey, { status: "loading" })
      const result = await emitElectronicInvoice({
        saleId,
        invoiceId,
        token: authToken,
        sedeId: activeSedeId,
      })
      updateFeStatus(statusKey, {
        status: "success",
        message: result.message,
      })
    } catch (error) {
      updateFeStatus(statusKey, {
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "No fue posible enviar la factura electrónica",
      })
    }
  }

  const getStatusBadgeClass = (estado: string) => {
    const normalized = String(estado || "").trim().toLowerCase()

    if (normalized === "pagado") {
      return "bg-green-100 text-green-800"
    }

    if (normalized === "abonado") {
      return "bg-amber-100 text-amber-800"
    }

    return "bg-yellow-100 text-yellow-800"
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

  const getPaginasParaMostrar = () => {
    if (!pagination) return []

    const paginas = []
    const totalPages = pagination.total_pages
    const current = currentPage

    let inicio = Math.max(1, current - 2)
    let fin = Math.min(totalPages, current + 2)

    if (current <= 3) {
      fin = Math.min(5, totalPages)
    }

    if (current >= totalPages - 2) {
      inicio = Math.max(1, totalPages - 4)
    }

    for (let i = inicio; i <= fin; i++) {
      paginas.push(i)
    }

    return paginas
  }

  const DateRangeModal = () => {
    if (!showDateModal) return null

    const today = toIsoLocalDate(new Date())

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6">
          <div className="mb-6">
            <h3 className="text-xl font-bold text-gray-900">Seleccionar rango de fechas</h3>
            <p className="mt-1 text-gray-700">Elige las fechas para filtrar las facturas</p>
          </div>

          <div className="mb-6">
            <p className="mb-3 text-sm text-gray-700">Rangos rápidos:</p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="border-gray-300 text-gray-800 hover:bg-gray-100"
                onClick={() => setQuickDateRange(7)}
              >
                7 días
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-gray-300 text-gray-800 hover:bg-gray-100"
                onClick={() => setQuickDateRange(30)}
              >
                30 días
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-gray-300 text-gray-800 hover:bg-gray-100"
                onClick={() => setQuickDateRange(90)}
              >
                90 días
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-gray-300 text-gray-800 hover:bg-gray-100"
                onClick={() => {
                  const now = new Date()
                  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
                  setTempDateRange({
                    start_date: toIsoLocalDate(firstDayOfMonth),
                    end_date: toIsoLocalDate(now),
                  })
                }}
              >
                Mes actual
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-800">
                Fecha de inicio
              </label>
              <input
                type="date"
                value={tempDateRange.start_date}
                onChange={(e) =>
                  setTempDateRange((prev) => ({ ...prev, start_date: e.target.value }))
                }
                className="w-full rounded border border-gray-300 px-3 py-2 focus:border-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-500"
                max={tempDateRange.end_date || today}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-800">
                Fecha de fin
              </label>
              <input
                type="date"
                value={tempDateRange.end_date}
                onChange={(e) =>
                  setTempDateRange((prev) => ({ ...prev, end_date: e.target.value }))
                }
                className="w-full rounded border border-gray-300 px-3 py-2 focus:border-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-500"
                min={tempDateRange.start_date}
                max={today}
              />
            </div>
          </div>

          <div className="mt-6 rounded-lg border border-gray-300 bg-gray-50 p-4">
            <p className="text-sm text-gray-800">
              <span className="font-medium">Rango seleccionado:</span>{" "}
              {formatDateDisplay(tempDateRange.start_date)} - {formatDateDisplay(tempDateRange.end_date)}
            </p>
            <p className="mt-1 text-xs text-gray-600">
              {tempDateRange.start_date && tempDateRange.end_date && (
                <>
                  Duración:{" "}
                  {Math.ceil(
                    (new Date(tempDateRange.end_date).getTime() -
                      new Date(tempDateRange.start_date).getTime()) /
                      (1000 * 60 * 60 * 24)
                  ) + 1} días
                </>
              )}
            </p>
          </div>

          <div className="mt-6 flex gap-3">
            <Button
              className="flex-1 bg-black text-white hover:bg-gray-800"
              onClick={() => void handleApplyDateRange()}
            >
              Aplicar rango
            </Button>
            <Button
              variant="outline"
              className="flex-1 border-gray-300 text-gray-800 hover:bg-gray-100"
              onClick={() => setShowDateModal(false)}
            >
              Cancelar
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <DateRangeModal />

      <div className="space-y-6">
        <PageHeader title="Ventas Facturadas" />

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Buscar cliente/comprobante
              </label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Nombre, cédula, email o número de comprobante..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      void aplicarFiltros()
                    }
                  }}
                  className="h-9 pl-8 text-sm"
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="flex items-end gap-2">
              <Button
                variant="default"
                onClick={() => void aplicarFiltros()}
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
          </div>

          <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-gray-600" />
                <span className="text-sm text-gray-600">Período:</span>
              </div>

              <div className="flex flex-wrap gap-1">
                {PERIOD_OPTIONS.map((option) => (
                  <Button
                    key={option.id}
                    size="sm"
                    variant={period === option.id ? "default" : "outline"}
                    className={`border-gray-300 text-xs ${
                      period === option.id
                        ? "bg-black text-white hover:bg-gray-800"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                    onClick={() => void handlePeriodChange(option.id)}
                    disabled={isLoading}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
            {(appliedPeriodSummary || filtersApplied?.search) && (
              <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600 lg:justify-end">
                {appliedPeriodSummary && (
                  <div className="inline-flex max-w-full items-center gap-2 text-sm text-gray-700">
                    <Calendar className="h-4 w-4 text-gray-500" />
                    <span className="break-words">{appliedPeriodSummary}</span>
                  </div>
                )}
                {filtersApplied?.search && (
                  <div className="inline-flex max-w-full items-center gap-2 text-sm text-gray-700">
                    <Search className="h-4 w-4 text-gray-500" />
                    <span className="break-words">Búsqueda: {filtersApplied.search}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <PaymentMethodsSummary
          totals={paymentTotals}
          loading={isLoading}
          formatAmount={formatSummaryCurrency}
        />

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            <span className="ml-2 text-gray-600">Cargando facturas...</span>
          </div>
        )}

        {error && !isLoading && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-red-700">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => void cargarFacturas(currentPage, appliedFilters)}
            >
              Reintentar
            </Button>
          </div>
        )}

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
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">FE</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {facturas.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-6 py-12 text-center text-gray-500">
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
                        <td className="px-6 py-4 text-sm text-gray-700">
                          {formatDate(factura.fecha_comprobante || factura.fecha_pago)}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">{factura.nombre_cliente}</td>
                        <td className="px-6 py-4 text-sm text-gray-700">{factura.local}</td>
                        <td className="px-6 py-4 text-sm text-gray-700">{factura.profesional_nombre}</td>
                        <td className="px-6 py-4 text-sm text-gray-700">{factura.numero_comprobante}</td>
                        <td className="px-6 py-4 text-sm text-gray-700 capitalize">{factura.metodo_pago}</td>
                        <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                          {formatCurrency(factura.total, factura.moneda)}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">
                          {(() => {
                            const saleId = (factura as any).venta_id || (factura as any)._id || null
                            const invoiceId = (factura as any).factura_id || null
                            const statusKey = saleId || invoiceId || factura.identificador
                            const feState = feStatusById[statusKey]?.status || "idle"
                            const feMessage = feStatusById[statusKey]?.message
                            const disabled =
                              isLoading ||
                              feState === "loading" ||
                              !allegraEnabled ||
                              (!saleId && !invoiceId)

                            return (
                              <div className="space-y-1">
                                <Button
                                  size="sm"
                                  variant={feState === "success" ? "default" : "outline"}
                                  className={`h-8 px-3 ${
                                    feState === "success" ? "bg-green-600 hover:bg-green-700 text-white" : ""
                                  }`}
                                  disabled={disabled}
                                  onClick={(event) => void handleSendFe(event, factura)}
                                  title={
                                    !allegraEnabled
                                      ? allegraGate.reason || "Solo sede El Poblado"
                                      : !saleId && !invoiceId
                                        ? "Falta sale_id o factura_id"
                                        : "Enviar factura electrónica"
                                  }
                                >
                                  {feState === "loading" ? (
                                    <>
                                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                      Enviando...
                                    </>
                                  ) : feState === "success" ? (
                                    <>
                                      <Check className="mr-1.5 h-3.5 w-3.5" />
                                      Enviada
                                    </>
                                  ) : feState === "error" ? (
                                    <>
                                      <AlertCircle className="mr-1.5 h-3.5 w-3.5" />
                                      Reintentar
                                    </>
                                  ) : (
                                    <>
                                      <Send className="mr-1.5 h-3.5 w-3.5" />
                                      FE
                                    </>
                                  )}
                                </Button>

                                {!allegraEnabled && (
                                  <p className="text-[11px] text-gray-500">
                                    Solo disponible en sede El Poblado
                                  </p>
                                )}
                                {allegraEnabled && !saleId && !invoiceId && (
                                  <p className="text-[11px] text-gray-500">
                                    Falta sale_id o factura_id
                                  </p>
                                )}
                                {feState === "error" && feMessage && (
                                  <p className="text-[11px] text-red-600">{feMessage}</p>
                                )}
                                {feState === "success" && feMessage && (
                                  <p className="text-[11px] text-green-700">{feMessage}</p>
                                )}
                              </div>
                            )
                          })()}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getStatusBadgeClass(factura.estado)}`}
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

        {!isLoading && !error && pagination && pagination.total_pages > 1 && (
          <div className="flex flex-col items-center justify-between gap-4 py-4 sm:flex-row">
            <div className="text-sm text-gray-600">
              Mostrando <span className="font-semibold">{pagination.from}</span> a{" "}
              <span className="font-semibold">{pagination.to}</span> de{" "}
              <span className="font-semibold">{pagination.total}</span> facturas
            </div>

            <div className="flex items-center gap-2">
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

        {!isLoading && !error && (!pagination || pagination.total_pages <= 1) && (
          <div className="flex flex-col items-center justify-between gap-4 text-sm text-gray-600 sm:flex-row">
            <div>
              {pagination ? (
                <>
                  Mostrando {pagination.showing} de {pagination.total} facturas
                </>
              ) : (
                `Mostrando ${facturas.length} facturas`
              )}
            </div>
          </div>
        )}
      </div>

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
