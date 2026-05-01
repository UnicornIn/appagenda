"use client"

import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "../../../components/Layout/Sidebar";
import { SuperAdminGlobalDashboard } from "./SuperAdminGlobalDashboard";
import { useAuth } from "../../../components/Auth/AuthContext";
import { formatSedeNombre } from "../../../lib/sede";
import { formatDateDMY, toLocalYMD } from "../../../lib/dateFormat";
import {
  getDashboard,
  getVentasDashboard,
  getAvailablePeriods,
  getChurnClientes,
  getSedes,
  type DashboardResponse,
  type VentasDashboardResponse,
  type Sede,
  type KPI,
  type TicketPromedioKPI,
} from "./Api/analyticsApi";
import { formatMoney, extractNumericValue } from "./Api/formatMoney";
import {
  getStoredCurrency,
  normalizeCurrencyCode,
  resolveCurrencyFromSede,
  resolveCurrencyLocale,
} from "../../../lib/currency";
import { RefreshCw, Building2, Globe } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";
import { Badge } from "../../../components/ui/badge";

interface DateRange {
  start_date: string;
  end_date: string;
}

const SUPER_ADMIN_DEFAULT_PERIOD = "month";

export default function DashboardPage() {
  const { user, isAuthenticated } = useAuth();
  const [loading, setLoading] = useState(true);
  const [loadingSedes, setLoadingSedes] = useState(false);
  const [dashboardData, setDashboardData] = useState<DashboardResponse | null>(null);
  const [ventasData, setVentasData] = useState<VentasDashboardResponse | null>(null);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [, setPeriods] = useState<any[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState(SUPER_ADMIN_DEFAULT_PERIOD);
  const [selectedSede, setSelectedSede] = useState<string>("global");
  const [showChurnList, setShowChurnList] = useState(false);
  const [churnData, setChurnData] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("dashboard");
  const [error, setError] = useState<string | null>(null);
  const [monedaUsuario, setMonedaUsuario] = useState<string>("COP");
  const [showDateModal, setShowDateModal] = useState(false);
  const [tempDateRange, setTempDateRange] = useState<DateRange>({ start_date: "", end_date: "" });
  const [dateRange, setDateRange] = useState<DateRange>({ start_date: "", end_date: "" });

  const getSedeNombre = useCallback(
    (sedeId: string, fallback: string = "Sede seleccionada") => {
      if (sedeId === "global") return "Vista Global";
      const nombre = sedes.find((sede) => sede.sede_id === sedeId)?.nombre;
      return formatSedeNombre(nombre, fallback);
    },
    [sedes]
  );

  const periodOptions = [
    { id: "today", label: "Hoy" },
    { id: "last_7_days", label: "7 días" },
    { id: "month", label: "Mes actual" },
    { id: "last_30_days", label: "30 días" },
    { id: "custom", label: "Rango" },
  ];

  useEffect(() => {
    setMonedaUsuario(getStoredCurrency("COP"));
  }, []);

  useEffect(() => {
    const today = new Date();
    const last30Days = new Date();
    last30Days.setDate(today.getDate() - 30);
    const defaultRange: DateRange = {
      start_date: toLocalYMD(last30Days),
      end_date: toLocalYMD(today),
    };
    setDateRange(defaultRange);
    setTempDateRange(defaultRange);
  }, []);

  useEffect(() => {
    if (isAuthenticated && user) {
      loadInitialData();
    }
  }, [isAuthenticated, user]);

  useEffect(() => {
    if (isAuthenticated && user && selectedSede !== "global") {
      loadDashboardData();
    }
  }, [selectedSede, selectedPeriod]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      setError(null);
      await Promise.all([loadSedes(), loadPeriods()]);
    } catch (error: any) {
      console.error("Error cargando datos iniciales:", error);
      setError("Error al cargar datos iniciales");
    } finally {
      setLoading(false);
    }
  };

  const loadSedes = async () => {
    try {
      setLoadingSedes(true);
      const sedesData = await getSedes(user!.access_token, true);
      setSedes(sedesData);
    } catch (error: any) {
      console.error("Error cargando sedes:", error);
    } finally {
      setLoadingSedes(false);
    }
  };

  const loadDashboardData = async () => {
    try {
      if (selectedSede === "global") return;
      setError(null);

      const params: any = { sede_id: selectedSede };
      if (selectedPeriod === "custom") {
        if (!dateRange.start_date || !dateRange.end_date) return;
        params.start_date = dateRange.start_date;
        params.end_date = dateRange.end_date;
        params.period = "custom";
      } else if (selectedPeriod === "today") {
        params.period = "today";
      } else {
        params.period = selectedPeriod;
      }

      let ventasResponse: VentasDashboardResponse | null = null;
      let analyticsResponse: DashboardResponse | null = null;

      try {
        ventasResponse = await getVentasDashboard(user!.access_token, params);
      } catch (err: any) {
        console.warn("Error cargando ventas:", err.message);
      }

      try {
        const analyticsParams: any = { sede_id: selectedSede };
        if (selectedPeriod === "custom") {
          analyticsParams.period = "custom";
          analyticsParams.start_date = dateRange.start_date;
          analyticsParams.end_date = dateRange.end_date;
        } else {
          analyticsParams.period = selectedPeriod;
        }
        analyticsResponse = await getDashboard(user!.access_token, analyticsParams);
      } catch (err: any) {
        console.warn("Error cargando analytics:", err.message);
      }

      setVentasData(ventasResponse);
      setDashboardData(analyticsResponse);

      if (analyticsResponse?.churn_actual && analyticsResponse.churn_actual > 0) {
        loadChurnData();
      } else {
        setChurnData([]);
      }

      if (!ventasResponse && !analyticsResponse)
        setError("No se pudieron cargar datos de ventas ni analytics");
    } catch (error: any) {
      console.error("Error cargando dashboard:", error);
      setError(`Error al cargar datos: ${error.message}`);
      setDashboardData(null);
      setVentasData(null);
    }
  };

  const loadPeriods = async () => {
    try {
      const data = await getAvailablePeriods();
      setPeriods(data.periods);
    } catch (error) {
      console.error("Error cargando períodos:", error);
    }
  };

  const loadChurnData = async () => {
    try {
      const today = new Date();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(today.getDate() - 30);
      const data = await getChurnClientes(user!.access_token, {
        sede_id: selectedSede,
        start_date: toLocalYMD(thirtyDaysAgo),
        end_date: toLocalYMD(today),
      });
      setChurnData(data.clientes.slice(0, 10));
    } catch {
      setChurnData([]);
    }
  };

  const handleRefresh = useCallback(() => {
    if (selectedSede !== "global") loadDashboardData();
  }, [selectedSede, selectedPeriod]);

  const handleSedeChange = (sedeId: string) => {
    setSelectedSede(sedeId);
    setDashboardData(null);
    setVentasData(null);
    setChurnData([]);
    setError(null);
  };

  const handlePeriodChange = (period: string) => {
    setSelectedPeriod(period);
    if (period === "custom") {
      setTempDateRange(dateRange);
      setShowDateModal(true);
    }
  };

  const handleApplyDateRange = () => {
    if (!tempDateRange.start_date || !tempDateRange.end_date) {
      setError("Por favor selecciona ambas fechas");
      return;
    }
    if (new Date(tempDateRange.start_date) > new Date(tempDateRange.end_date)) {
      setError("La fecha de inicio no puede ser mayor a la fecha de fin");
      return;
    }
    setDateRange(tempDateRange);
    setShowDateModal(false);
    setSelectedPeriod("custom");
    if (selectedSede !== "global") loadDashboardData();
  };

  const setQuickDateRange = (days: number) => {
    const today = new Date();
    const start = new Date();
    start.setDate(today.getDate() - days);
    setTempDateRange({ start_date: toLocalYMD(start), end_date: toLocalYMD(today) });
  };

  const formatDateDisplay = (dateString: string) => formatDateDMY(dateString, "");

  const getPeriodDisplay = () => {
    if (selectedPeriod === "custom")
      return `${formatDateDisplay(dateRange.start_date)} – ${formatDateDisplay(dateRange.end_date)}`;
    return periodOptions.find((p) => p.id === selectedPeriod)?.label || "Período";
  };

  const getSedeInfo = useCallback(
    (sedeId: string) => sedes.find((sede) => sede.sede_id === sedeId),
    [sedes]
  );

  const filteredSedes = sedes.filter(
    (sede) =>
      sede.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sede.direccion.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const resolveMetricasByCurrency = (
    metricasPorMoneda?: VentasDashboardResponse["metricas_por_moneda"]
  ) => {
    const fallbackCurrency = normalizeCurrencyCode(monedaUsuario || getStoredCurrency("COP"));
    if (!metricasPorMoneda || Object.keys(metricasPorMoneda).length === 0)
      return { metricas: undefined, moneda: fallbackCurrency };

    const sedeSeleccionada =
      selectedSede === "global" ? undefined : getSedeInfo(selectedSede);
    const preferredCurrency = resolveCurrencyFromSede(sedeSeleccionada, fallbackCurrency);
    const candidateCurrencies = Array.from(
      new Set(
        [preferredCurrency, fallbackCurrency, "COP", "USD", "MXN"]
          .map((c) => normalizeCurrencyCode(c))
          .filter(Boolean)
      )
    );

    for (const currency of candidateCurrencies) {
      if (metricasPorMoneda[currency])
        return { metricas: metricasPorMoneda[currency], moneda: currency };
    }

    const [firstCurrency] = Object.keys(metricasPorMoneda);
    if (!firstCurrency) return { metricas: undefined, moneda: fallbackCurrency };
    return {
      metricas: metricasPorMoneda[firstCurrency],
      moneda: normalizeCurrencyCode(firstCurrency),
    };
  };

  const getActiveDashboardCurrency = () => {
    const { moneda } = resolveMetricasByCurrency(ventasData?.metricas_por_moneda);
    return moneda;
  };

  const formatCurrency = useCallback(
    (value: number | string): string => {
      const currency = getActiveDashboardCurrency();
      const locale = resolveCurrencyLocale(currency, "es-CO");
      if (typeof value === "string")
        return formatMoney(extractNumericValue(value), currency, locale);
      return formatMoney(value, currency, locale);
    },
    [monedaUsuario, selectedSede, sedes, ventasData]
  );

  const getMetricasVentas = () => {
    const fallbackCurrency = getActiveDashboardCurrency();
    if (!ventasData?.metricas_por_moneda) {
      return {
        ventas_totales: 0, cantidad_ventas: 0, ventas_servicios: 0,
        ventas_productos: 0, ticket_promedio: 0, crecimiento_ventas: "0%",
        metodos_pago: { efectivo: 0, transferencia: 0, tarjeta: 0, tarjeta_credito: 0,
          tarjeta_debito: 0, addi: 0, sin_pago: 0 },
        moneda: fallbackCurrency, tieneDatos: false,
      };
    }
    const { metricas, moneda } = resolveMetricasByCurrency(ventasData.metricas_por_moneda);
    if (!metricas) {
      return {
        ventas_totales: 0, cantidad_ventas: 0, ventas_servicios: 0,
        ventas_productos: 0, ticket_promedio: 0, crecimiento_ventas: "0%",
        metodos_pago: { efectivo: 0, transferencia: 0, tarjeta: 0, tarjeta_credito: 0,
          tarjeta_debito: 0, addi: 0, sin_pago: 0 },
        moneda, tieneDatos: false,
      };
    }
    return { ...metricas, moneda, tieneDatos: true };
  };

  // ── Mini UI components ───────────────────────────────────

  const SectionTitle = ({ children, note }: { children: React.ReactNode; note?: string }) => (
    <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.6px] text-slate-400 mt-[22px] mb-2.5">
      <span>{children}</span>
      {note && (
        <span className="text-[10px] font-normal normal-case tracking-normal text-slate-400 italic ml-2">
          {note}
        </span>
      )}
      <div className="flex-1 h-px bg-slate-200" />
    </div>
  );

  const KPICard = ({
    label, value, sub, featured,
  }: {
    label: string; value: string; sub?: string; featured?: boolean;
  }) => (
    <div className={`bg-white rounded-[10px] px-4 py-3.5 ${featured ? "border-2 border-slate-800" : "border border-slate-200"}`}>
      <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-[0.4px] mb-1.5">{label}</div>
      <div className="text-[22px] font-bold tracking-tight text-slate-800">{value}</div>
      {sub && <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );

  const RowItem = ({ name, value, sub, barPct }: {
    name: string; value: string; sub?: string; barPct?: number;
  }) => (
    <div className="flex justify-between items-center py-2 text-xs border-b border-slate-100 last:border-b-0">
      <span className="font-medium text-slate-700 flex-shrink-0">{name}</span>
      {barPct !== undefined && (
        <div className="flex-1 mx-3 h-1 bg-slate-100 rounded min-w-[40px]">
          <div className="h-full bg-slate-800 rounded" style={{ width: `${Math.max(2, barPct)}%` }} />
        </div>
      )}
      <div className="text-right">
        <span className="font-bold text-[13px] text-slate-800">{value}</span>
        {sub && <div className="text-[10px] text-slate-400 leading-none mt-0.5">{sub}</div>}
      </div>
    </div>
  );

  const DashCard = ({
    title, titleSub, children, scrollable,
  }: {
    title: string; titleSub?: string; children: React.ReactNode; scrollable?: boolean;
  }) => (
    <div className="bg-white border border-slate-200 rounded-[10px] p-[18px]">
      <div className="text-[13px] font-bold mb-3 flex justify-between items-center text-slate-800">
        <span>{title}</span>
        {titleSub && <span className="text-[10px] text-slate-400 font-medium">{titleSub}</span>}
      </div>
      {scrollable ? (
        <div className="max-h-[260px] overflow-y-auto">{children}</div>
      ) : (
        children
      )}
    </div>
  );

  // ── Payment methods for specific sede ────────────────────
  const metricas = getMetricasVentas();
  const paymentRows = [
    { name: "Transferencia", value: metricas.metodos_pago?.transferencia || 0 },
    { name: "Tarjeta de Crédito", value: metricas.metodos_pago?.tarjeta_credito || 0 },
    { name: "Tarjeta de Débito", value: metricas.metodos_pago?.tarjeta_debito || 0 },
    { name: "Efectivo", value: metricas.metodos_pago?.efectivo || 0 },
    { name: "Tarjeta", value: metricas.metodos_pago?.tarjeta || 0 },
    { name: "Addi", value: metricas.metodos_pago?.addi || 0 },
    { name: "Sin Pago", value: metricas.metodos_pago?.sin_pago || 0 },
  ].filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
  const totalPayments = paymentRows.reduce((s, r) => s + r.value, 0);

  const pctServicios =
    metricas.ventas_totales > 0
      ? Math.round((metricas.ventas_servicios / metricas.ventas_totales) * 100)
      : 0;
  const pctProductos =
    metricas.ventas_totales > 0
      ? Math.round((metricas.ventas_productos / metricas.ventas_totales) * 100)
      : 0;
  const diasPeriodo = ventasData?.range?.dias || 1;
  const ventaPromDia =
    metricas.ventas_totales > 0 ? Math.round(metricas.ventas_totales / diasPeriodo) : 0;

  // Client KPIs from analytics
  const nuevosClientes =
    typeof dashboardData?.kpis?.nuevos_clientes?.valor === "number"
      ? dashboardData.kpis.nuevos_clientes.valor
      : 0;
  const tasaRecurrencia = dashboardData?.kpis?.tasa_recurrencia?.valor ?? "–";
  const churnEnRiesgo = churnData.filter((c) => c.dias_inactivo >= 61 && c.dias_inactivo <= 90).length;
  const churnPerdidos = churnData.filter((c) => c.dias_inactivo > 90).length;

  // ── Date Range Modal ─────────────────────────────────────
  const DateRangeModal = () => {
    if (!showDateModal) return null;
    const today = toLocalYMD(new Date());
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-white rounded-xl w-full max-w-md mx-4 p-6">
          <h3 className="text-lg font-bold text-slate-800 mb-1">Seleccionar rango de fechas</h3>
          <p className="text-sm text-slate-500 mb-5">Elige las fechas para filtrar las métricas</p>
          <p className="text-xs text-slate-600 font-medium mb-2">Rangos rápidos:</p>
          <div className="flex flex-wrap gap-2 mb-5">
            {[{ label: "7 días", days: 7 }, { label: "30 días", days: 30 }, { label: "90 días", days: 90 }].map(
              ({ label, days }) => (
                <button key={label} onClick={() => setQuickDateRange(days)}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-700 hover:bg-slate-50"
                >
                  {label}
                </button>
              )
            )}
            <button
              onClick={() => {
                const today = new Date();
                setTempDateRange({
                  start_date: toLocalYMD(new Date(today.getFullYear(), today.getMonth(), 1)),
                  end_date: toLocalYMD(today),
                });
              }}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-700 hover:bg-slate-50"
            >
              Mes actual
            </button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Fecha de inicio</label>
              <input type="date" value={tempDateRange.start_date}
                onChange={(e) => setTempDateRange((p) => ({ ...p, start_date: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                max={tempDateRange.end_date || today}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Fecha de fin</label>
              <input type="date" value={tempDateRange.end_date}
                onChange={(e) => setTempDateRange((p) => ({ ...p, end_date: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                min={tempDateRange.start_date} max={today}
              />
            </div>
          </div>
          <div className="mt-5 p-3 bg-slate-50 rounded-lg border border-slate-100 text-xs text-slate-600">
            <span className="font-medium">Rango:</span> {formatDateDisplay(tempDateRange.start_date)} –{" "}
            {formatDateDisplay(tempDateRange.end_date)}
          </div>
          <div className="mt-5 flex gap-3">
            <button onClick={handleApplyDateRange}
              className="flex-1 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-700"
            >
              Aplicar rango
            </button>
            <button onClick={() => setShowDateModal(false)}
              className="flex-1 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col h-screen items-center justify-center">
        <h2 className="text-2xl font-bold text-slate-800">Acceso no autorizado</h2>
        <p className="mt-2 text-slate-500">Por favor inicia sesión para ver el dashboard.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-white">
      <Sidebar />
      <DateRangeModal />

      <main className="flex-1 overflow-y-auto bg-[#F8FAFC]">
        <div className="max-w-[1300px] mx-auto px-7 py-5 pb-10">

          {/* Header */}
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-800">Dashboard</h1>
              <div className="text-xs text-slate-500 mt-0.5">
                Inteligencia de negocio · Super Admin · {metricas.moneda}
              </div>
            </div>
            <div className="flex gap-1.5 items-center">
              <select
                value={selectedSede}
                onChange={(e) => handleSedeChange(e.target.value)}
                className="px-3 py-[7px] border border-slate-200 rounded-lg text-xs bg-white font-semibold text-slate-700 focus:outline-none"
              >
                <option value="global">Todas las sedes</option>
                {sedes.map((sede) => (
                  <option key={sede._id} value={sede.sede_id}>
                    {formatSedeNombre(sede.nombre, sede.sede_id)}
                  </option>
                ))}
              </select>
              <button
                onClick={handleRefresh}
                className="px-3.5 py-[7px] bg-white border border-slate-200 rounded-lg text-[11px] text-slate-500 font-medium flex items-center gap-1 hover:bg-slate-50"
              >
                <RefreshCw className="w-3 h-3" /> Actualizar
              </button>
            </div>
          </div>

          {/* Period + Tab filter row */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <span className="text-xs text-slate-500 font-medium">Período:</span>
            {periodOptions.map((option) => (
              <button
                key={option.id}
                onClick={() => handlePeriodChange(option.id)}
                className={`px-3.5 py-1.5 border rounded-full text-[11px] font-medium transition-colors ${
                  selectedPeriod === option.id
                    ? "bg-slate-800 text-white border-slate-800"
                    : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                }`}
              >
                {option.label}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2">
              {/* Tab buttons */}
              <div className="flex border border-slate-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => setActiveTab("dashboard")}
                  className={`px-3.5 py-1.5 text-[11px] font-medium transition-colors ${
                    activeTab === "dashboard"
                      ? "bg-slate-800 text-white"
                      : "bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  Dashboard
                </button>
                <button
                  onClick={() => setActiveTab("sedes")}
                  className={`px-3.5 py-1.5 text-[11px] font-medium transition-colors border-l border-slate-200 ${
                    activeTab === "sedes"
                      ? "bg-slate-800 text-white"
                      : "bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  Sedes
                </button>
              </div>
            </div>
          </div>

          {/* ── DASHBOARD TAB ─────────────────────────────── */}
          {activeTab === "dashboard" && (
            <>
              {loading && sedes.length === 0 ? (
                <div className="flex items-center justify-center h-64">
                  <div className="text-center">
                    <div className="w-10 h-10 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-slate-500 text-sm">Cargando dashboard…</p>
                  </div>
                </div>
              ) : error ? (
                <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
                  <p className="text-slate-500 mb-4">{error}</p>
                  <button onClick={handleRefresh}
                    className="flex items-center gap-2 mx-auto px-4 py-2 border border-slate-200 rounded-lg text-sm hover:bg-slate-50"
                  >
                    <RefreshCw className="w-4 h-4" /> Reintentar
                  </button>
                </div>
              ) : selectedSede === "global" ? (
                /* Global view */
                <SuperAdminGlobalDashboard
                  token={user!.access_token}
                  sedes={sedes}
                  selectedPeriod={selectedPeriod}
                  dateRange={dateRange}
                  preferredCurrency={monedaUsuario}
                />
              ) : (
                /* Specific sede view — new design */
                <>
                  {/* Sede header */}
                  <div className="bg-white border border-slate-200 rounded-[10px] px-5 py-4 mb-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-5 h-5 text-slate-700" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-base font-bold text-slate-800">
                        {getSedeNombre(selectedSede, "Sede Desconocida")}
                      </h3>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {getSedeInfo(selectedSede)?.direccion || "Sin dirección"} ·{" "}
                        {getPeriodDisplay()}
                        {getSedeInfo(selectedSede)?.activa !== undefined && (
                          <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            getSedeInfo(selectedSede)?.activa
                              ? "bg-green-100 text-green-700"
                              : "bg-slate-100 text-slate-500"
                          }`}>
                            {getSedeInfo(selectedSede)?.activa ? "Activa" : "Inactiva"}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleSedeChange("global")}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-[11px] text-slate-500 hover:bg-slate-50"
                    >
                      <Globe className="w-3 h-3" /> Vista Global
                    </button>
                  </div>

                  {/* KPIs Ventas */}
                  <SectionTitle>Ventas del período</SectionTitle>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 mb-3.5">
                    <KPICard featured label="Ventas totales" value={formatCurrency(metricas.ventas_totales)} />
                    <KPICard label="Servicios" value={formatCurrency(metricas.ventas_servicios)}
                      sub={`${pctServicios}% del total`} />
                    <KPICard label="Productos" value={formatCurrency(metricas.ventas_productos)}
                      sub={`${pctProductos}% del total`} />
                    <KPICard label="Transacciones" value={String(metricas.cantidad_ventas || 0)}
                      sub={`Ticket prom: ${formatCurrency(metricas.ticket_promedio)}`} />
                    <KPICard label="Venta promedio/día" value={formatCurrency(ventaPromDia)}
                      sub={`${diasPeriodo} días del período`} />
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 mb-3.5">
                    {/* Métodos de pago */}
                    <DashCard title="Ventas por método de pago" titleSub="solo dinero recibido">
                      {paymentRows.length > 0 ? (
                        <>
                          {paymentRows.map((row) => (
                            <RowItem
                              key={row.name}
                              name={row.name}
                              value={formatCurrency(row.value)}
                              sub={`${Math.round((row.value / (totalPayments || 1)) * 100)}%`}
                              barPct={totalPayments > 0 ? (row.value / totalPayments) * 100 : 0}
                            />
                          ))}
                          <div className="flex justify-between pt-2.5 text-[13px] font-bold border-t-2 border-slate-200 mt-1">
                            <span>Total cobrado</span>
                            <span>{formatCurrency(totalPayments)}</span>
                          </div>
                        </>
                      ) : (
                        <p className="text-xs text-slate-400 py-4 text-center">
                          Sin datos de pagos para este período
                        </p>
                      )}
                    </DashCard>

                    {/* Indicadores de clientes */}
                    <DashCard title="Métricas de clientes">
                      <div className="grid grid-cols-2 gap-2.5">
                        {[
                          { label: "Nuevos clientes", value: String(nuevosClientes) },
                          { label: "Tasa recurrencia", value: String(tasaRecurrencia) },
                          {
                            label: "Churn en riesgo",
                            value: churnData.length > 0 ? String(churnEnRiesgo) : "–",
                          },
                          {
                            label: "Perdidos",
                            value: churnData.length > 0 ? String(churnPerdidos) : "–",
                          },
                        ].map(({ label, value }) => (
                          <div key={label} className="p-3 border border-slate-100 rounded-lg bg-slate-50 text-center">
                            <div className="text-[9px] text-slate-400 font-semibold uppercase tracking-[0.3px] mb-1">
                              {label}
                            </div>
                            <div className="text-[20px] font-bold text-slate-800">{value}</div>
                          </div>
                        ))}
                      </div>
                    </DashCard>
                  </div>

                  {/* Clientes en riesgo (churn) */}
                  {churnData.length > 0 && (
                    <>
                      <SectionTitle>Clientes en riesgo</SectionTitle>
                      <div className="bg-white border border-slate-200 rounded-[10px] p-[18px] mb-3.5">
                        <div className="max-h-[220px] overflow-y-auto">
                          {churnData.slice(0, 5).map((cliente, index) => (
                            <div
                              key={cliente.cliente_id || index}
                              className="flex items-center justify-between py-2 border-b border-slate-100 last:border-b-0"
                            >
                              <div>
                                <div className="text-xs font-semibold text-slate-800">
                                  {cliente.nombre}
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  {cliente.dias_inactivo} días inactivo
                                </div>
                              </div>
                              <span
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                  cliente.dias_inactivo > 90
                                    ? "bg-red-50 text-red-600"
                                    : cliente.dias_inactivo > 60
                                    ? "bg-amber-50 text-amber-600"
                                    : "bg-slate-100 text-slate-500"
                                }`}
                              >
                                {cliente.dias_inactivo > 90
                                  ? "Alto"
                                  : cliente.dias_inactivo > 60
                                  ? "Medio"
                                  : "Bajo"}
                              </span>
                            </div>
                          ))}
                        </div>
                        {churnData.length > 5 && (
                          <button
                            onClick={() => setShowChurnList(true)}
                            className="mt-3 w-full text-xs text-slate-500 py-1.5 hover:text-slate-800"
                          >
                            Ver todos ({churnData.length})
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}
            </>
          )}

          {/* ── SEDES TAB ─────────────────────────────────── */}
          {activeTab === "sedes" && (
            <>
              <div className="bg-white border border-slate-200 rounded-[10px] p-[18px] mb-3.5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[13px] font-bold text-slate-800">Sedes registradas</span>
                  <span className="text-[10px] text-slate-400">{sedes.length} total</span>
                </div>
                <input
                  type="text"
                  placeholder="Buscar sede..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs mb-3 focus:outline-none"
                />
                {loadingSedes ? (
                  <div className="text-center py-8">
                    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-xs text-slate-400">Cargando sedes…</p>
                  </div>
                ) : filteredSedes.length === 0 ? (
                  <div className="text-center py-8">
                    <Building2 className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                    <p className="text-xs text-slate-400">No se encontraron sedes</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filteredSedes.map((sede) => (
                      <div
                        key={sede._id}
                        onClick={() => {
                          handleSedeChange(sede.sede_id);
                          setActiveTab("dashboard");
                        }}
                        className={`p-3 border rounded-lg cursor-pointer transition-colors hover:border-slate-400 ${
                          selectedSede === sede.sede_id
                            ? "border-slate-800 bg-slate-50"
                            : "border-slate-200"
                        }`}
                      >
                        <div className="flex items-start justify-between mb-1.5">
                          <div className="flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-slate-500" />
                            <span className="text-xs font-semibold text-slate-800">
                              {formatSedeNombre(sede.nombre)}
                            </span>
                          </div>
                          <div className={`w-2 h-2 rounded-full mt-0.5 ${sede.activa ? "bg-green-500" : "bg-slate-300"}`} />
                        </div>
                        <p className="text-[10px] text-slate-500 truncate">{sede.direccion}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{sede.telefono}</p>
                        {selectedSede === sede.sede_id && (
                          <div className="mt-2">
                            <span className="text-[9px] bg-slate-800 text-white px-1.5 py-0.5 rounded font-medium">
                              Seleccionada
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>

      {/* Churn detail modal */}
      {showChurnList && churnData.length > 0 && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[80vh] overflow-hidden border border-slate-200">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base text-slate-800">
                  Clientes en Riesgo — {getSedeNombre(selectedSede)}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {churnData.length} clientes con inactividad detectada
                </p>
              </div>
              <button
                onClick={() => setShowChurnList(false)}
                className="text-xs text-slate-500 px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                Cerrar
              </button>
            </div>
            <div className="overflow-auto max-h-[60vh] p-4">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="text-[11px]">Cliente</TableHead>
                    <TableHead className="text-[11px]">Contacto</TableHead>
                    <TableHead className="text-[11px]">Última visita</TableHead>
                    <TableHead className="text-[11px]">Días inactivo</TableHead>
                    <TableHead className="text-[11px]">Riesgo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {churnData.map((cliente, index) => (
                    <TableRow key={cliente.cliente_id || index} className="hover:bg-slate-50">
                      <TableCell>
                        <div className="text-xs font-medium text-slate-800">{cliente.nombre}</div>
                        <div className="text-[10px] text-slate-400">ID: {cliente.cliente_id}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs text-slate-700">{cliente.correo}</div>
                        <div className="text-[10px] text-slate-400">{cliente.telefono}</div>
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">
                        {formatDateDMY(cliente.ultima_visita)}
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs font-semibold ${
                          cliente.dias_inactivo > 90 ? "text-red-600" :
                          cliente.dias_inactivo > 60 ? "text-amber-600" : "text-slate-600"
                        }`}>
                          {cliente.dias_inactivo} días
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge className={
                          cliente.dias_inactivo > 90 ? "bg-red-50 text-red-700 border-red-100" :
                          cliente.dias_inactivo > 60 ? "bg-amber-50 text-amber-700 border-amber-100" :
                          "bg-slate-100 text-slate-600 border-slate-200"
                        }>
                          {cliente.dias_inactivo > 90 ? "Alto" : cliente.dias_inactivo > 60 ? "Medio" : "Bajo"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
