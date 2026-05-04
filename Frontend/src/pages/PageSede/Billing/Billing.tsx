// app/(protected)/admin-sede/ventas/Billing.tsx
"use client"

import { useState, useEffect, useMemo } from "react"
import { ShoppingBag, Search } from "lucide-react"
import { Sidebar } from "../../../components/Layout/Sidebar"
import { Button } from "../../../components/ui/button"
import { Skeleton } from "../../../components/ui/skeleton"
import { DirectSaleModal } from "./DirectSaleModal"
import { ServiceProtocol } from "./service-protocol"
import { DEFAULT_PERIOD } from "../../../lib/period"
import { useAuth } from "../../../components/Auth/AuthContext"
import {
  getSalesMetrics,
  formatCurrencyMetric,
  extractMainMetrics,
  extractPaymentMethods,
  type PaymentMethodTotals,
} from "./salesMetricsApi"
import { API_BASE_URL } from "../../../types/config"
import { getStoredCurrency } from "../../../lib/currency"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Appointment {
  _id: string
  cliente: string
  cliente_id?: string
  cliente_nombre?: string
  fecha: string
  hora_inicio: string
  hora_fin: string
  servicio: string
  servicio_nombre?: string
  servicios?: Array<{
    servicio_id: string
    nombre: string
    precio: number
    precio_personalizado?: boolean
  }>
  precio_total?: number
  estilista?: string
  profesional_nombre?: string
  productos?: Array<{
    producto_id: string
    nombre: string
    cantidad: number
    precio_unitario: number
    subtotal: number
    moneda: string
    comision_porcentaje: number
    comision_valor: number
    agregador_por: string
    agregado_por_rol: string
    profesional_id: string
  }>
  estado: string
  sede_id: string
  valor_total?: number
  estado_pago?: string
  abono?: number
  saldo_pendiente?: number
}

interface DateRange {
  start_date: string
  end_date: string
}

type FilterStatus = "all" | "paid" | "pending" | "no-ficha"

// ─── Constants ────────────────────────────────────────────────────────────────

// All terminal states the backend may return for a finished appointment.
// Mirrors the logic in getEstadoColor() from today-appointments.tsx, plus facturado.
const BILLING_VISIBLE_STATES = new Set([
  "finalizado",
  "finalizada",
  "completado",
  "completada",
  "terminado",
  "terminada",
  "realizado",
  "realizada",
  "facturado",
  "facturada",
])

const PERIOD_CHIPS = [
  { id: "today", label: "Hoy" },
  { id: "last_7_days", label: "7 días" },
  { id: "last_30_days", label: "30 días" },
  { id: "month", label: "Mes actual" },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

const toYmd = (date: Date): string => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

const getGlobalRange = (period: string, dr: DateRange): DateRange => {
  const today = new Date()
  const todayYmd = toYmd(today)
  if (period === "custom" && dr.start_date && dr.end_date) return dr
  if (period === "last_7_days") {
    const s = new Date(today)
    s.setDate(s.getDate() - 6)
    return { start_date: toYmd(s), end_date: todayYmd }
  }
  if (period === "last_30_days") {
    const s = new Date(today)
    s.setDate(s.getDate() - 29)
    return { start_date: toYmd(s), end_date: todayYmd }
  }
  if (period === "month") {
    const s = new Date(today.getFullYear(), today.getMonth(), 1)
    return { start_date: toYmd(s), end_date: todayYmd }
  }
  return { start_date: todayYmd, end_date: todayYmd }
}

const getAppointmentDate = (a: Appointment) =>
  String(a.fecha || "").split("T")[0]

const getTimestamp = (a: Appointment): number => {
  const d = `${getAppointmentDate(a)}T${a.hora_inicio || "00:00"}:00`
  const t = new Date(d).getTime()
  return isNaN(t) ? 0 : t
}

const getInitials = (name: string): string =>
  name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()

const fmtCOP = (n: number | undefined): string =>
  "$" +
  Math.round(n ?? 0).toLocaleString("es-CO", { maximumFractionDigits: 0 })

// ─── Component ────────────────────────────────────────────────────────────────

export default function Billing() {
  const { user, isAuthenticated, activeSedeId } = useAuth()
  const isRecepcionista =
    String(user?.role ?? "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_") === "recepcionista"

  // ── Period ────────────────────────────────────────────────────────────────
  const [period, setPeriod] = useState(DEFAULT_PERIOD)
  const [dateRange, setDateRange] = useState<DateRange>({
    start_date: "",
    end_date: "",
  })
  const [showDateModal, setShowDateModal] = useState(false)
  const [tempDateRange, setTempDateRange] = useState<DateRange>({
    start_date: "",
    end_date: "",
  })

  // ── Appointments ──────────────────────────────────────────────────────────
  const [allAppointments, setAllAppointments] = useState<Appointment[]>([])
  const [loadingAppointments, setLoadingAppointments] = useState(true)
  const [errorAppointments, setErrorAppointments] = useState<string | null>(
    null,
  )

  // ── Metrics ───────────────────────────────────────────────────────────────
  const [metrics, setMetrics] = useState({
    ventas_totales: 0,
    ventas_servicios: 0,
    ventas_productos: 0,
  })
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodTotals>({
    efectivo: 0,
    transferencia: 0,
    tarjeta: 0,
    nequi: 0,
    daviplata: 0,
    otros: 0,
  })
  const [loadingMetrics, setLoadingMetrics] = useState(true)
  const [currency, setCurrency] = useState(getStoredCurrency("USD"))
  const [metricsRefreshKey, setMetricsRefreshKey] = useState(0)

  // ── UI ────────────────────────────────────────────────────────────────────
  const [selectedAppointment, setSelectedAppointment] =
    useState<Appointment | null>(null)
  const [showDirectSaleModal, setShowDirectSaleModal] = useState(false)
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all")
  const [searchQuery, setSearchQuery] = useState("")

  const appliedRange = useMemo(
    () => getGlobalRange(period, dateRange),
    [period, dateRange],
  )

  const periodRangeLabel = useMemo(() => {
    const fmt = (ymd: string) => {
      const [y, m, d] = ymd.split("-").map(Number)
      return new Date(y, m - 1, d).toLocaleDateString("es-CO", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    }
    const { start_date, end_date } = appliedRange
    if (!start_date || !end_date) return ""
    if (start_date === end_date) return fmt(start_date)
    // Different dates: "10 de abril – 16 de abril de 2026"
    const [sy, sm] = start_date.split("-").map(Number)
    const [ey, em] = end_date.split("-").map(Number)
    const startOpts: Intl.DateTimeFormatOptions =
      sy !== ey || sm !== em
        ? { day: "numeric", month: "long", year: "numeric" }
        : { day: "numeric", month: "long" }
    const startStr = new Date(sy, sm - 1, Number(start_date.split("-")[2])).toLocaleDateString(
      "es-CO",
      startOpts,
    )
    return `${startStr} – ${fmt(end_date)}`
  }, [appliedRange])

  // ── Fetch appointments ────────────────────────────────────────────────────
  const fetchAppointments = async () => {
    try {
      setLoadingAppointments(true)
      setErrorAppointments(null)
      const token =
        localStorage.getItem("access_token") ||
        sessionStorage.getItem("access_token")
      if (!token) {
        setErrorAppointments("No se encontró token de autenticación")
        return
      }
      const res = await fetch(`${API_BASE_URL}scheduling/quotes/`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      })
      if (!res.ok) throw new Error(`Error ${res.status}: ${res.statusText}`)

      const data = await res.json()
      const citas: Appointment[] = Array.isArray(data)
        ? data
        : Array.isArray(data.citas)
          ? data.citas
          : []

      const BILLING_INCLUDES = [
        "finaliz", "complet", "terminad", "realizad", "factur",
      ]
      const isBillingVisible = (estado: string) => {
        const e = String(estado || "").toLowerCase()
        return (
          BILLING_VISIBLE_STATES.has(e) ||
          BILLING_INCLUDES.some((prefix) => e.includes(prefix))
        )
      }

      const filtered = citas
        .filter((a) => {
          if (!isBillingVisible(a.estado)) return false
          const fecha = getAppointmentDate(a)
          return (
            fecha >= appliedRange.start_date && fecha <= appliedRange.end_date
          )
        })
        .sort((a, b) => getTimestamp(b) - getTimestamp(a))

      setAllAppointments(filtered)
    } catch (err) {
      setErrorAppointments(
        err instanceof Error ? err.message : "Error al cargar citas",
      )
    } finally {
      setLoadingAppointments(false)
    }
  }

  // ── Load metrics ──────────────────────────────────────────────────────────
  const loadMetrics = async () => {
    if (isRecepcionista || !isAuthenticated || !user?.access_token) return
    try {
      setLoadingMetrics(true)
      // activeSedeId reflects the currently selected sede (multi-sede users)
      const targetSedeId =
        activeSedeId ||
        (user.sede_id as string) ||
        sessionStorage.getItem("beaux-sede_id") ||
        localStorage.getItem("beaux-sede_id") ||
        ""
      if (!targetSedeId) return
      const params: Record<string, string> = { period, sede_id: targetSedeId }
      if (period === "custom") {
        params.start_date = appliedRange.start_date
        params.end_date = appliedRange.end_date
      }
      const data = await getSalesMetrics(user.access_token, params)
      const { ventas, servicios, productos, moneda } = extractMainMetrics(data)
      setCurrency(moneda)
      setMetrics({
        ventas_totales: ventas,
        ventas_servicios: servicios,
        ventas_productos: productos,
      })
      setPaymentMethods(extractPaymentMethods(data))
    } catch (err) {
      console.error("Error loading metrics:", err)
    } finally {
      setLoadingMetrics(false)
    }
  }

  useEffect(() => {
    void fetchAppointments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedRange.start_date, appliedRange.end_date])

  useEffect(() => {
    if (isAuthenticated) void loadMetrics()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    period,
    appliedRange.start_date,
    appliedRange.end_date,
    metricsRefreshKey,
    isAuthenticated,
    activeSedeId,
  ])

  // Close panel if selected appointment is filtered out by period change
  useEffect(() => {
    if (
      selectedAppointment &&
      !allAppointments.find((a) => a._id === selectedAppointment._id)
    ) {
      setSelectedAppointment(null)
    }
  }, [allAppointments, selectedAppointment])

  // ── Filtered + searched list ──────────────────────────────────────────────
  const filteredAppointments = useMemo(() => {
    let result = allAppointments
    if (filterStatus === "paid")
      result = result.filter(
        (a) => a.estado_pago?.toLowerCase() === "pagado",
      )
    else if (filterStatus === "pending")
      result = result.filter(
        (a) => a.estado_pago?.toLowerCase() !== "pagado",
      )
    // "no-ficha" requires per-appointment ficha status — TODO: endpoint needed
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((a) => {
        const prof = (a.profesional_nombre || a.estilista || "").toLowerCase()
        const cli = (a.cliente_nombre || a.cliente || "").toLowerCase()
        const svc = (a.servicio_nombre || a.servicio || "").toLowerCase()
        return prof.includes(q) || cli.includes(q) || svc.includes(q)
      })
    }
    return result
  }, [allAppointments, filterStatus, searchQuery])

  // ── Bottom bar stats ──────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const paid = allAppointments.filter(
      (a) => a.estado_pago?.toLowerCase() === "pagado",
    )
    const pending = allAppointments.filter(
      (a) => a.estado_pago?.toLowerCase() !== "pagado",
    )
    const cobrado = paid.reduce((s, a) => s + (a.valor_total ?? 0), 0)
    const pendienteAmt = pending.reduce(
      (s, a) => s + (a.saldo_pendiente ?? a.valor_total ?? 0),
      0,
    )
    return {
      total: allAppointments.length,
      paid: paid.length,
      pending: pending.length,
      noFicha: 0, // TODO: requires ficha_status per appointment from scheduling/quotes/
      cobrado,
      pendiente: pendienteAmt,
    }
  }, [allAppointments])

  const fmt = (n: number) => formatCurrencyMetric(n, currency)

  const filterChips: { id: FilterStatus; label: string; count: number }[] = [
    { id: "all", label: "Todas", count: stats.total },
    { id: "pending", label: "Pendientes", count: stats.pending },
    { id: "paid", label: "Pagadas", count: stats.paid },
    { id: "no-ficha", label: "Sin ficha", count: stats.noFicha },
  ]

  const handlePeriodChange = (newPeriod: string) => {
    if (newPeriod === "custom") {
      setTempDateRange(appliedRange)
      setShowDateModal(true)
      return
    }
    setPeriod(newPeriod)
  }

  const handleApplyDateRange = () => {
    if (!tempDateRange.start_date || !tempDateRange.end_date) return
    if (new Date(tempDateRange.start_date) > new Date(tempDateRange.end_date))
      return
    setDateRange(tempDateRange)
    setPeriod("custom")
    setShowDateModal(false)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <DirectSaleModal
        isOpen={showDirectSaleModal}
        onClose={() => setShowDirectSaleModal(false)}
        onSaleCompleted={() => setMetricsRefreshKey((k) => k + 1)}
      />

      {/* Custom date range modal */}
      {showDateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg w-full max-w-md mx-4 p-6 shadow-xl">
            <h3 className="text-xl font-bold text-gray-900 mb-1">
              Seleccionar rango de fechas
            </h3>
            <p className="text-sm text-gray-600 mb-5">
              Elige las fechas para filtrar las citas de facturación
            </p>

            {/* Quick ranges */}
            <div className="mb-4">
              <p className="text-xs font-medium text-gray-500 mb-2">Rangos rápidos:</p>
              <div className="flex gap-2">
                {[
                  { label: "7 días", days: 6 },
                  { label: "30 días", days: 29 },
                  { label: "Mes actual", days: -1 },
                ].map((r) => {
                  const today = new Date()
                  const handleQuick = () => {
                    let start: Date
                    if (r.days === -1) {
                      start = new Date(today.getFullYear(), today.getMonth(), 1)
                    } else {
                      start = new Date(today)
                      start.setDate(start.getDate() - r.days)
                    }
                    setTempDateRange({ start_date: toYmd(start), end_date: toYmd(today) })
                  }
                  return (
                    <button
                      key={r.label}
                      onClick={handleQuick}
                      className="px-3 py-1.5 border border-gray-200 rounded-full text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      {r.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fecha de inicio
                </label>
                <input
                  type="date"
                  value={tempDateRange.start_date}
                  onChange={(e) =>
                    setTempDateRange((p) => ({
                      ...p,
                      start_date: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                  max={tempDateRange.end_date || toYmd(new Date())}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fecha de fin
                </label>
                <input
                  type="date"
                  value={tempDateRange.end_date}
                  onChange={(e) =>
                    setTempDateRange((p) => ({
                      ...p,
                      end_date: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                  min={tempDateRange.start_date}
                  max={toYmd(new Date())}
                />
              </div>
            </div>

            {/* Selected range preview */}
            {tempDateRange.start_date && tempDateRange.end_date && (
              <div className="mt-4 px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700">
                <span className="font-medium">Rango seleccionado:</span>{" "}
                {tempDateRange.start_date} - {tempDateRange.end_date}
              </div>
            )}

            <div className="mt-5 flex gap-3">
              <Button
                className="flex-1 bg-black text-white hover:bg-gray-800"
                onClick={handleApplyDateRange}
              >
                Aplicar rango
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowDateModal(false)}
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col h-screen bg-white overflow-hidden">
        <Sidebar />

        {/* ── Body (nav-bar-height accounted for by flex-col above) ─────────── */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── Main ─────────────────────────────────────────────────────────── */}
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden">

          {/* Header */}
          <div className="px-8 pt-6 pb-0 flex justify-between items-start flex-shrink-0">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900">
                Facturación
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Citas finalizadas · {periodRangeLabel}
              </p>
            </div>
            <div className="flex gap-2">
              {/* Venta directa — original logic preserved, style updated */}
              <button
                onClick={() => setShowDirectSaleModal(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <ShoppingBag className="h-3.5 w-3.5" />
                Venta directa
              </button>
            </div>
          </div>

          {/* Period bar */}
          <div className="px-8 pt-4 pb-0 flex items-center gap-1.5 flex-shrink-0">
            <span className="text-xs font-medium text-gray-500 mr-1">
              Período:
            </span>
            {PERIOD_CHIPS.map((c) => (
              <button
                key={c.id}
                onClick={() => handlePeriodChange(c.id)}
                className={`px-3.5 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                  period === c.id
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                }`}
              >
                {c.label}
              </button>
            ))}
            <button
              onClick={() => handlePeriodChange("custom")}
              className={`px-3.5 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                period === "custom"
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
              }`}
            >
              Rango personalizado
            </button>
          </div>

          {/* KPI section — hidden for recepcionista */}
          {!isRecepcionista && (
            <div className="px-8 pt-4 pb-0 flex-shrink-0">
              {/* Row 1: Ventas Totales · Servicios · Productos */}
              <div className="grid grid-cols-3 gap-2.5 mb-2.5">
                {[
                  {
                    label: "Ventas Totales",
                    value: metrics.ventas_totales,
                    sub: `${stats.total} transacciones`,
                    main: true,
                  },
                  {
                    label: "Servicios",
                    value: metrics.ventas_servicios,
                    sub: `${stats.total} servicios`,
                    main: false,
                  },
                  {
                    label: "Productos",
                    value: metrics.ventas_productos,
                    sub: "productos vendidos",
                    main: false,
                  },
                ].map((card) => (
                  <div
                    key={card.label}
                    className={`p-3.5 border border-gray-200 rounded-lg ${card.main ? "bg-gray-50" : "bg-white"}`}
                  >
                    <div className="text-xs font-medium text-gray-500 mb-1">
                      {card.label}
                    </div>
                    {loadingMetrics ? (
                      <Skeleton className="h-7 w-28 bg-gray-200 my-0.5" />
                    ) : (
                      <div className="text-[22px] font-bold text-gray-900 tracking-tight leading-tight">
                        {fmt(card.value)}
                      </div>
                    )}
                    <div className="text-xs text-gray-400 mt-0.5">
                      {card.sub}
                    </div>
                  </div>
                ))}
              </div>

              {/* Row 2: Payment methods — from api/sales-dashboard/ventas/dashboard */}
              <div className="grid grid-cols-5 gap-1.5">
                {(
                  [
                    { label: "Efectivo",      value: paymentMethods.efectivo },
                    { label: "Transferencia", value: paymentMethods.transferencia },
                    { label: "Tarjeta",       value: paymentMethods.tarjeta },
                    // Nequi y Daviplata no tienen campo propio en el backend; se muestran si el
                    // backend los agrega como campos separados en el futuro.
                    { label: "Nequi",         value: paymentMethods.nequi },
                    { label: "Daviplata",     value: paymentMethods.daviplata },
                  ] as { label: string; value: number }[]
                ).map((m) => (
                  <div
                    key={m.label}
                    className="p-2.5 border border-gray-200 rounded-lg text-center bg-white"
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-0.5 leading-tight">
                      {m.label}
                    </div>
                    {loadingMetrics ? (
                      <div className="h-4 w-12 mx-auto bg-gray-100 rounded animate-pulse my-0.5" />
                    ) : (
                      <div className={`text-sm font-bold ${m.value > 0 ? "text-gray-800" : "text-gray-300"}`}>
                        {fmtCOP(m.value)}
                      </div>
                    )}
                    <div className="text-[9px] text-gray-300">
                      {m.value > 0 ? fmt(m.value) : "—"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Divider */}
          <div className="mx-8 mt-4 border-t border-gray-200 flex-shrink-0" />

          {/* Filters + search */}
          <div className="px-8 py-3 flex items-center gap-1.5 flex-shrink-0">
            {filterChips.map((c) => (
              <button
                key={c.id}
                onClick={() => setFilterStatus(c.id)}
                className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                  filterStatus === c.id
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                }`}
              >
                {c.label}
                <span className="ml-1 opacity-60 text-[10px]">{c.count}</span>
              </button>
            ))}
            <div className="ml-auto relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Buscar..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 border border-gray-200 rounded-full text-xs w-44 focus:outline-none focus:border-gray-400 bg-white placeholder:text-gray-400"
              />
            </div>
          </div>

          {/* Appointment list */}
          <div className="flex-1 overflow-y-auto px-8 pb-2 min-h-0">
            {/* Column headers */}
            <div className="flex items-center px-3.5 mb-1">
              <span className="flex-1 text-[9px] font-bold uppercase tracking-[0.5px] text-gray-400 pl-11">
                Estilista / Servicio
              </span>
              <span className="w-24 text-center text-[9px] font-bold uppercase tracking-[0.5px] text-gray-400">
                Pago
              </span>
              <span className="w-16 text-center text-[9px] font-bold uppercase tracking-[0.5px] text-gray-400">
                Ficha
              </span>
              <span className="w-24 text-right text-[9px] font-bold uppercase tracking-[0.5px] text-gray-400">
                Horario
              </span>
              <span className="w-24 text-right text-[9px] font-bold uppercase tracking-[0.5px] text-gray-400">
                Valor
              </span>
            </div>

            {loadingAppointments ? (
              <div className="py-8 text-center text-sm text-gray-400">
                Cargando citas...
              </div>
            ) : errorAppointments ? (
              <div className="py-8 text-center">
                <p className="text-sm text-red-500 mb-3">
                  {errorAppointments}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void fetchAppointments()}
                >
                  Reintentar
                </Button>
              </div>
            ) : filteredAppointments.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm text-gray-400">
                  No hay citas finalizadas para el período seleccionado
                </p>
                <p className="text-xs text-gray-300 mt-1">
                  Cambia el filtro de período para consultar más resultados
                </p>
              </div>
            ) : (
              <div>
                {filteredAppointments.map((a) => {
                  const isSelected = selectedAppointment?._id === a._id
                  const stylistName =
                    a.profesional_nombre || a.estilista || "—"
                  const clientName = (a.cliente_nombre || a.cliente || "")
                    .split(" ")
                    .slice(0, 2)
                    .join(" ")
                  const serviceName = a.servicio_nombre || a.servicio || "—"
                  const isPaid = a.estado_pago?.toLowerCase() === "pagado"

                  return (
                    <div
                      key={a._id}
                      onClick={() => setSelectedAppointment(a)}
                      className={`flex items-center px-3.5 py-2.5 rounded-lg cursor-pointer transition-colors gap-3 mb-0.5 ${
                        isSelected ? "bg-gray-100" : "hover:bg-gray-50"
                      }`}
                    >
                      {/* Avatar */}
                      <div className="w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                        {getInitials(stylistName)}
                      </div>

                      {/* Names */}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-900 truncate">
                          {stylistName}
                        </div>
                        <div className="text-xs text-gray-500 truncate mt-0.5">
                          <span className="text-gray-400">{clientName}</span>
                          {clientName && serviceName !== "—" ? " · " : ""}
                          <span className="font-medium text-gray-700">
                            {serviceName}
                          </span>
                        </div>
                      </div>

                      {/* Pago badge */}
                      <div className="w-24 flex justify-center">
                        <span
                          className={`text-[9px] font-semibold uppercase tracking-[0.3px] px-1.5 py-0.5 rounded-sm border ${
                            isPaid
                              ? "border-gray-800 text-gray-800"
                              : "border-gray-300 text-gray-400"
                          }`}
                        >
                          {isPaid ? "Pagado" : "Pendiente"}
                        </span>
                      </div>

                      {/* Ficha badge
                          TODO: ficha status not returned by scheduling/quotes/.
                          Endpoint needed to get ficha_status per appointment, or
                          add a ficha_status flag to the quotes response.
                      */}
                      <div className="w-16 flex justify-center">
                        <span className="text-[9px] font-semibold uppercase tracking-[0.3px] px-1.5 py-0.5 rounded-sm border border-gray-200 text-gray-300">
                          —
                        </span>
                      </div>

                      {/* Time */}
                      <div className="w-24 text-right text-xs text-gray-500 tabular-nums">
                        {a.hora_inicio}–{a.hora_fin}
                      </div>

                      {/* Value */}
                      <div className="w-24 text-right text-sm font-bold text-gray-900">
                        {fmtCOP(a.valor_total)}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Bottom bar */}
          <div className="px-8 py-2.5 border-t border-gray-200 bg-gray-50 flex justify-between items-center text-xs text-gray-500 flex-shrink-0">
            <div>
              <b className="text-gray-700">{stats.total}</b> citas ·{" "}
              <b className="text-gray-700">{stats.paid}</b> pagadas ·{" "}
              <b className="text-gray-700">{stats.pending}</b> pendientes ·{" "}
              <b className="text-gray-700">{stats.noFicha}</b> sin ficha
            </div>
            <div>
              Cobrado:{" "}
              <b className="text-gray-700">{fmtCOP(stats.cobrado)}</b> ·
              Pendiente:{" "}
              <b className="text-gray-700">{fmtCOP(stats.pendiente)}</b>
            </div>
          </div>
        </div>

        {/* ── Detail panel (slides in from right) ──────────────────────────── */}
        <div
          className={`flex-shrink-0 transition-all duration-200 border-gray-200 overflow-hidden ${
            selectedAppointment ? "w-[440px] border-l" : "w-0 border-0"
          }`}
        >
          {selectedAppointment && (
            <div className="w-[440px] h-full overflow-y-auto">
              <ServiceProtocol
                selectedAppointment={selectedAppointment}
                onClose={() => setSelectedAppointment(null)}
                onAppointmentUpdated={(updated) => {
                  setAllAppointments((prev) =>
                    prev.map((a) =>
                      a._id === updated._id ? { ...a, ...updated } : a,
                    ),
                  )
                  setSelectedAppointment((prev) =>
                    prev?._id === updated._id
                      ? { ...prev, ...updated }
                      : prev,
                  )
                }}
              />
            </div>
          )}
        </div>

        </div>{/* end flex body row */}
      </div>
    </>
  )
}
