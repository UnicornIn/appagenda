"use client"

import { useState, useEffect, useMemo } from "react";
import { Sidebar } from "../../../components/Layout/Sidebar";
import { useAuth } from "../../../components/Auth/AuthContext";
import { formatSedeNombre } from "../../../lib/sede";
import { formatDateDMY, toLocalYMD } from "../../../lib/dateFormat";
import { getSedes, getVentasAvailablePeriods, type Sede } from "./analyticsApi";
import {
  normalizeCurrencyCode,
  getStoredCurrency,
} from "../../../lib/currency";
import { DEFAULT_PERIOD } from "../../../lib/period";
import { RefreshCw } from "lucide-react";
import { DashboardSedeView } from "./DashboardSedeView";

interface DateRange {
  start_date: string;
  end_date: string;
}

const normalizeSedeId = (value: string | null | undefined) =>
  String(value ?? "").trim();

export default function DashboardPage() {
  const { user, isAuthenticated, activeSedeId, setActiveSedeId } = useAuth();
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [loadingSedes, setLoadingSedes] = useState(true);
  const [selectedSede, setSelectedSede] = useState<string>("");
  const [selectedPeriod, setSelectedPeriod] = useState(DEFAULT_PERIOD);
  const [showDateModal, setShowDateModal] = useState(false);
  const [tempDateRange, setTempDateRange] = useState<DateRange>({
    start_date: "",
    end_date: "",
  });
  const [dateRange, setDateRange] = useState<DateRange>({
    start_date: "",
    end_date: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const monedaUsuario = normalizeCurrencyCode(
    user?.moneda || getStoredCurrency("COP")
  );

  const allowedSedeIds = useMemo(() => {
    const values = new Set<string>();
    const add = (candidate: string | null | undefined) => {
      const normalized = normalizeSedeId(candidate);
      if (normalized) values.add(normalized);
    };
    add(user?.sede_id_principal);
    add(user?.sede_id);
    add(activeSedeId);
    if (Array.isArray(user?.sedes_permitidas)) {
      user.sedes_permitidas.forEach((sedeId) => add(sedeId));
    }
    return Array.from(values);
  }, [activeSedeId, user?.sede_id, user?.sede_id_principal, user?.sedes_permitidas]);

  const isAdminSede = useMemo(() => {
    const normalizedRole = String(user?.role ?? "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
    return (
      normalizedRole === "admin_sede" ||
      normalizedRole === "adminsede" ||
      normalizedRole === "admin"
    );
  }, [user?.role]);

  const periodOptions = [
    { id: "today", label: "Hoy" },
    { id: "last_7_days", label: "7 días" },
    { id: "month", label: "Mes actual" },
    { id: "last_30_days", label: "30 días" },
    { id: "custom", label: "Rango" },
  ];

  useEffect(() => {
    const today = new Date();
    const last7Days = new Date();
    last7Days.setDate(today.getDate() - 7);
    const defaultRange: DateRange = {
      start_date: toLocalYMD(last7Days),
      end_date: toLocalYMD(today),
    };
    setDateRange(defaultRange);
    setTempDateRange(defaultRange);
  }, []);

  useEffect(() => {
    if (isAuthenticated && user) {
      loadSedes();
      loadPeriods();
    }
  }, [isAuthenticated, user]);

  useEffect(() => {
    const normalizedActiveSedeId = normalizeSedeId(activeSedeId);
    if (!normalizedActiveSedeId) return;
    setSelectedSede((current) => {
      if (!current || current === "global") return current;
      if (normalizeSedeId(current) === normalizedActiveSedeId) return current;
      return normalizedActiveSedeId;
    });
  }, [activeSedeId]);

  const loadSedes = async () => {
    try {
      setLoadingSedes(true);
      const sedesData = await getSedes(user!.access_token, true);
      const allowedSet =
        allowedSedeIds.length > 0
          ? new Set(allowedSedeIds.map((s) => s.toUpperCase()))
          : null;

      const filteredSedes = sedesData.filter((sede) => {
        const sedeId = normalizeSedeId(sede.sede_id);
        if (!sedeId) return false;
        if (!isAdminSede) return true;
        if (!allowedSet) return false;
        return allowedSet.has(sedeId.toUpperCase());
      });

      setSedes(filteredSedes);
      if (filteredSedes.length === 0) {
        setSelectedSede("");
        return;
      }

      const preferredSedeId =
        normalizeSedeId(activeSedeId) ||
        normalizeSedeId(user?.sede_id) ||
        normalizeSedeId(user?.sede_id_principal) ||
        "";

      const preferredExists = filteredSedes.some(
        (sede) => sede.sede_id === preferredSedeId
      );

      if (filteredSedes.length > 1) {
        setSelectedSede((current) => {
          if (current === "global") return "global";
          if (current && filteredSedes.some((s) => s.sede_id === current))
            return current;
          return "global";
        });
      } else {
        const onlySedeId = filteredSedes[0].sede_id;
        setSelectedSede(preferredExists ? preferredSedeId : onlySedeId);
      }
    } catch (error) {
      console.error("Error cargando sedes:", error);
    } finally {
      setLoadingSedes(false);
    }
  };

  const loadPeriods = async () => {
    try {
      await getVentasAvailablePeriods();
    } catch {
      // periods are not critical
    }
  };

  const handleSedeChange = (sedeId: string) => {
    setSelectedSede(sedeId);
    if (sedeId !== "global") setActiveSedeId(sedeId);
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
    setError(null);
  };

  const setQuickDateRange = (days: number) => {
    const today = new Date();
    const start = new Date();
    start.setDate(today.getDate() - days);
    setTempDateRange({
      start_date: toLocalYMD(start),
      end_date: toLocalYMD(today),
    });
  };

  const formatDateDisplay = (dateString: string) => formatDateDMY(dateString, "");

  const getPeriodDisplay = () => {
    if (selectedPeriod === "custom")
      return `${formatDateDisplay(dateRange.start_date)} - ${formatDateDisplay(dateRange.end_date)}`;
    return periodOptions.find((p) => p.id === selectedPeriod)?.label || "Período";
  };

  // ── Auth & loading guards ────────────────────────────────

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col h-screen items-center justify-center">
        <h2 className="text-2xl font-bold">Acceso no autorizado</h2>
        <p className="mt-2 text-gray-600">Por favor inicia sesión para ver el dashboard.</p>
      </div>
    );
  }

  if (loadingSedes) {
    return (
      <div className="flex flex-col h-screen items-center justify-center">
        <div className="w-12 h-12 border-4 border-gray-200 border-t-gray-800 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-600">Cargando información de la sede...</p>
      </div>
    );
  }

  if (!selectedSede) {
    return (
      <div className="flex flex-col h-screen items-center justify-center text-center">
        <h2 className="text-2xl font-bold">Sede no disponible</h2>
        <p className="mt-2 text-gray-600">No se pudo determinar tu sede asignada.</p>
        <button
          onClick={() => loadSedes()}
          className="mt-4 flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
        >
          <RefreshCw className="w-4 h-4" /> Reintentar
        </button>
      </div>
    );
  }

  // ── Date Range Modal ─────────────────────────────────────

  const DateRangeModal = () => {
    if (!showDateModal) return null;
    const today = toLocalYMD(new Date());
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-white rounded-xl w-full max-w-md mx-4 p-6">
          <h3 className="text-lg font-bold text-slate-800 mb-1">Seleccionar rango de fechas</h3>
          <p className="text-sm text-slate-500 mb-5">Elige las fechas para filtrar las métricas</p>
          {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
          <p className="text-xs text-slate-600 font-medium mb-2">Rangos rápidos:</p>
          <div className="flex flex-wrap gap-2 mb-5">
            {[{ label: "7 días", days: 7 }, { label: "30 días", days: 30 }, { label: "90 días", days: 90 }].map(({ label, days }) => (
              <button
                key={label}
                onClick={() => setQuickDateRange(days)}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-700 hover:bg-slate-50"
              >
                {label}
              </button>
            ))}
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

  // ── Main Render ──────────────────────────────────────────

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
                Inteligencia de negocio · {user?.pais || "Colombia"} · {monedaUsuario}
              </div>
            </div>
            <div className="flex gap-1.5 items-center">
              {sedes.length > 1 && (
                <select
                  value={selectedSede}
                  onChange={(e) => handleSedeChange(e.target.value)}
                  className="px-3 py-[7px] border border-slate-200 rounded-lg text-xs bg-white font-semibold text-slate-700 focus:outline-none"
                >
                  <option value="global">Todas las sedes</option>
                  {sedes.map((sede) => (
                    <option key={sede.sede_id} value={sede.sede_id}>
                      {formatSedeNombre(sede.nombre, sede.sede_id)}
                    </option>
                  ))}
                </select>
              )}
              <button
                onClick={() => setReloadNonce((n) => n + 1)}
                className="px-3.5 py-[7px] bg-white border border-slate-200 rounded-lg text-[11px] text-slate-500 font-medium flex items-center gap-1 hover:bg-slate-50"
              >
                <RefreshCw className="w-3 h-3" /> Actualizar
              </button>
            </div>
          </div>

          {/* Period filter */}
          <div className="flex items-center gap-1.5 mb-[18px] flex-wrap">
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
          </div>

          {/* Content */}
          <DashboardSedeView
            key={`${selectedSede}-${reloadNonce}`}
            token={user!.access_token}
            sedeId={selectedSede}
            selectedPeriod={selectedPeriod}
            dateRange={dateRange}
            sedes={sedes}
            monedaUsuario={monedaUsuario}
            getPeriodDisplay={getPeriodDisplay}
            userPais={user?.pais}
          />
        </div>
      </main>
    </div>
  );
}
