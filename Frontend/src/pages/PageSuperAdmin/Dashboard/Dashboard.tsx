"use client"

import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "../../../components/Layout/Sidebar";
import { DashboardSedeView } from "../../PageSede/Dashboard/DashboardSedeView";
import { useAuth } from "../../../components/Auth/AuthContext";
import { formatSedeNombre } from "../../../lib/sede";
import { formatDateDMY, toLocalYMD } from "../../../lib/dateFormat";
import {
  getSedes,
  getAvailablePeriods,
  type Sede,
} from "./Api/analyticsApi";
import {
  getStoredCurrency,
  normalizeCurrencyCode,
} from "../../../lib/currency";
import { RefreshCw, Building2 } from "lucide-react";
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
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState(SUPER_ADMIN_DEFAULT_PERIOD);
  const [selectedSede, setSelectedSede] = useState<string>("global");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("dashboard");
  const [monedaUsuario, setMonedaUsuario] = useState<string>("COP");
  const [showDateModal, setShowDateModal] = useState(false);
  const [tempDateRange, setTempDateRange] = useState<DateRange>({ start_date: "", end_date: "" });
  const [dateRange, setDateRange] = useState<DateRange>({ start_date: "", end_date: "" });
  const [dateError, setDateError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

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

  const loadInitialData = async () => {
    try {
      setLoading(true);
      await Promise.all([loadSedes(), loadPeriods()]);
    } catch (error) {
      console.error("Error cargando datos iniciales:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadSedes = async () => {
    try {
      setLoadingSedes(true);
      const sedesData = await getSedes(user!.access_token, true);
      setSedes(sedesData);
    } catch (error) {
      console.error("Error cargando sedes:", error);
    } finally {
      setLoadingSedes(false);
    }
  };

  const loadPeriods = async () => {
    try {
      await getAvailablePeriods();
    } catch {
      // periods not critical
    }
  };

  const handleRefresh = useCallback(() => {
    setReloadNonce((n) => n + 1);
  }, []);

  const handleSedeChange = (sedeId: string) => {
    setSelectedSede(sedeId);
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
      setDateError("Por favor selecciona ambas fechas");
      return;
    }
    if (new Date(tempDateRange.start_date) > new Date(tempDateRange.end_date)) {
      setDateError("La fecha de inicio no puede ser mayor a la fecha de fin");
      return;
    }
    setDateRange(tempDateRange);
    setShowDateModal(false);
    setSelectedPeriod("custom");
    setDateError(null);
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

  const filteredSedes = sedes.filter(
    (sede) =>
      sede.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sede.direccion.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const activeCurrency = normalizeCurrencyCode(monedaUsuario || "COP");

  // ── Date Range Modal ─────────────────────────────────────

  const DateRangeModal = () => {
    if (!showDateModal) return null;
    const today = toLocalYMD(new Date());
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-white rounded-xl w-full max-w-md mx-4 p-6">
          <h3 className="text-lg font-bold text-slate-800 mb-1">Seleccionar rango de fechas</h3>
          <p className="text-sm text-slate-500 mb-5">Elige las fechas para filtrar las métricas</p>
          {dateError && <p className="text-xs text-red-500 mb-3">{dateError}</p>}
          <p className="text-xs text-slate-600 font-medium mb-2">Rangos rápidos:</p>
          <div className="flex flex-wrap gap-2 mb-5">
            {[{ label: "7 días", days: 7 }, { label: "30 días", days: 30 }, { label: "90 días", days: 90 }].map(
              ({ label, days }) => (
                <button
                  key={label}
                  onClick={() => setQuickDateRange(days)}
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
              <input
                type="date"
                value={tempDateRange.start_date}
                onChange={(e) => setTempDateRange((p) => ({ ...p, start_date: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                max={tempDateRange.end_date || today}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Fecha de fin</label>
              <input
                type="date"
                value={tempDateRange.end_date}
                onChange={(e) => setTempDateRange((p) => ({ ...p, end_date: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                min={tempDateRange.start_date}
                max={today}
              />
            </div>
          </div>
          <div className="mt-5 p-3 bg-slate-50 rounded-lg border border-slate-100 text-xs text-slate-600">
            <span className="font-medium">Rango:</span> {formatDateDisplay(tempDateRange.start_date)} –{" "}
            {formatDateDisplay(tempDateRange.end_date)}
          </div>
          <div className="mt-5 flex gap-3">
            <button
              onClick={handleApplyDateRange}
              className="flex-1 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-700"
            >
              Aplicar rango
            </button>
            <button
              onClick={() => setShowDateModal(false)}
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
              <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                <span>Inteligencia de negocio · Super Admin · {activeCurrency}</span>
                <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] font-semibold">
                  {loading ? "–" : sedes.length} sedes
                </span>
                <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] font-semibold">
                  Moneda: {activeCurrency}
                </span>
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
              ) : (
                <DashboardSedeView
                  key={`${selectedSede}-${reloadNonce}`}
                  token={user!.access_token}
                  sedeId={selectedSede}
                  selectedPeriod={selectedPeriod}
                  dateRange={dateRange}
                  sedes={sedes}
                  monedaUsuario={activeCurrency}
                  getPeriodDisplay={getPeriodDisplay}
                  userPais={user?.pais}
                  stylistsPath="/superadmin/stylists"
                  productsPath="/superadmin/products"
                />
              )}
            </>
          )}

          {/* ── SEDES TAB ─────────────────────────────────── */}
          {activeTab === "sedes" && (
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
                          <Badge className="text-[9px] bg-slate-800 text-white px-1.5 py-0.5 rounded font-medium">
                            Seleccionada
                          </Badge>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
