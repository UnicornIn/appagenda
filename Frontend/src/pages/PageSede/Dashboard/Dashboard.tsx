"use client"

import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Sidebar } from "../../../components/Layout/Sidebar";
import { useAuth } from "../../../components/Auth/AuthContext";
import { formatSedeNombre } from "../../../lib/sede";
import { formatDateDMY, toLocalYMD } from "../../../lib/dateFormat";
import {
  getVentasDashboard,
  getVentasAvailablePeriods,
  getDashboard,
  getChurnClientes,
  getSedes,
  type VentasDashboardResponse,
  type VentasMetricas,
  type DashboardResponse,
  type ChurnCliente,
  type Sede,
  type PeriodOption,
} from "./analyticsApi";
import { formatMoney, extractNumericValue } from "./formatMoney";
import {
  getStoredCurrency,
  normalizeCurrencyCode,
  resolveCurrencyFromSede,
  resolveCurrencyFromCountry,
  resolveCurrencyLocale,
} from "../../../lib/currency";
import { DEFAULT_PERIOD } from "../../../lib/period";
import {
  facturaService,
  type FacturaConverted,
} from "../Sales-invoiced/facturas";
import { RefreshCw } from "lucide-react";

interface DateRange {
  start_date: string;
  end_date: string;
}

interface ExtendedMetrics {
  topServicios: Array<{ nombre: string; total: number; cantidad: number }>;
  topProductos: Array<{ nombre: string; total: number; cantidad: number }>;
  topEstilistas: Array<{
    nombre: string;
    total: number;
    citas: number;
    ticketPromedio: number;
    initials: string;
  }>;
  clientesUnicos: number;
}

const createEmptyMetricas = (): VentasMetricas => ({
  ventas_totales: 0,
  cantidad_ventas: 0,
  ventas_servicios: 0,
  ventas_productos: 0,
  metodos_pago: {
    efectivo: 0,
    transferencia: 0,
    tarjeta: 0,
    tarjeta_credito: 0,
    tarjeta_debito: 0,
    addi: 0,
    sin_pago: 0,
    otros: 0,
  },
  ticket_promedio: 0,
  crecimiento_ventas: "0%",
});

const normalizeSedeId = (value: string | null | undefined) =>
  String(value ?? "").trim();

const SALES_PAYMENT_METHODS = [
  "efectivo",
  "transferencia",
  "tarjeta",
  "tarjeta_credito",
  "tarjeta_debito",
  "addi",
  "sin_pago",
  "otros",
] as const;

const toSafeNumber = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const normalizeItemType = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const roundCurrencyMetric = (value: number): number =>
  Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;

const getErrorMessage = (error: unknown): string =>
  error instanceof Error && error.message ? error.message : "Error desconocido";

const getInitials = (nombre: string): string => {
  const parts = (nombre || "").trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (nombre || "XX").slice(0, 2).toUpperCase();
};

const buildRealMetricasFromFacturas = (
  facturas: FacturaConverted[]
): Record<string, VentasMetricas> => {
  const metricasPorMoneda: Record<string, VentasMetricas> = {};

  facturas.forEach((factura) => {
    const moneda = normalizeCurrencyCode(factura.moneda || "COP");
    if (!metricasPorMoneda[moneda])
      metricasPorMoneda[moneda] = createEmptyMetricas();

    const metricas = metricasPorMoneda[moneda];
    const totalVenta = Math.max(
      toSafeNumber(factura.total),
      toSafeNumber(factura.desglose_pagos?.total)
    );

    metricas.ventas_totales += totalVenta;
    metricas.cantidad_ventas += 1;

    (factura.items || []).forEach((item) => {
      const subtotal = toSafeNumber(item?.subtotal);
      const tipo = normalizeItemType(item?.tipo);
      if (tipo === "servicio") metricas.ventas_servicios += subtotal;
      else if (tipo === "producto") metricas.ventas_productos += subtotal;
    });

    const desglose = factura.desglose_pagos as
      | Record<string, unknown>
      | undefined;
    if (!desglose) return;

    SALES_PAYMENT_METHODS.forEach((metodo) => {
      metricas.metodos_pago[metodo] =
        (metricas.metodos_pago[metodo] || 0) + toSafeNumber(desglose[metodo]);
    });
  });

  Object.values(metricasPorMoneda).forEach((metricas) => {
    metricas.ventas_totales = roundCurrencyMetric(metricas.ventas_totales);
    metricas.ventas_servicios = roundCurrencyMetric(metricas.ventas_servicios);
    metricas.ventas_productos = roundCurrencyMetric(metricas.ventas_productos);
    metricas.ticket_promedio =
      metricas.cantidad_ventas > 0
        ? roundCurrencyMetric(
            metricas.ventas_totales / metricas.cantidad_ventas
          )
        : 0;
    metricas.crecimiento_ventas = "0%";
    SALES_PAYMENT_METHODS.forEach((metodo) => {
      metricas.metodos_pago[metodo] = roundCurrencyMetric(
        metricas.metodos_pago[metodo] || 0
      );
    });
  });

  return metricasPorMoneda;
};

const buildExtendedMetrics = (facturas: FacturaConverted[]): ExtendedMetrics => {
  const serviciosMap: Record<string, { total: number; cantidad: number }> = {};
  const productosMap: Record<string, { total: number; cantidad: number }> = {};
  const estilistasMap: Record<
    string,
    { nombre: string; total: number; citas: number }
  > = {};
  const clientesSet = new Set<string>();

  facturas.forEach((factura) => {
    if (factura.cliente_id) clientesSet.add(factura.cliente_id);

    const profKey =
      factura.profesional_id || factura.profesional_nombre || "sin_asignar";
    const profNombre = factura.profesional_nombre || "Sin asignar";
    if (!estilistasMap[profKey])
      estilistasMap[profKey] = { nombre: profNombre, total: 0, citas: 0 };
    estilistasMap[profKey].total += toSafeNumber(factura.total);
    estilistasMap[profKey].citas += 1;

    (factura.items || []).forEach((item) => {
      const tipo = normalizeItemType(item?.tipo);
      const nombre = String(item?.nombre || "").trim() || "Sin nombre";
      const subtotal = toSafeNumber(item?.subtotal);
      const cantidad = toSafeNumber(item?.cantidad) || 1;

      if (tipo === "servicio") {
        if (!serviciosMap[nombre]) serviciosMap[nombre] = { total: 0, cantidad: 0 };
        serviciosMap[nombre].total += subtotal;
        serviciosMap[nombre].cantidad += cantidad;
      } else if (tipo === "producto") {
        if (!productosMap[nombre]) productosMap[nombre] = { total: 0, cantidad: 0 };
        productosMap[nombre].total += subtotal;
        productosMap[nombre].cantidad += cantidad;
      }
    });
  });

  const topServicios = Object.entries(serviciosMap)
    .map(([nombre, data]) => ({ nombre, ...data }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 9);

  const topProductos = Object.entries(productosMap)
    .map(([nombre, data]) => ({ nombre, ...data }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 7);

  const topEstilistas = Object.values(estilistasMap)
    .sort((a, b) => b.total - a.total)
    .slice(0, 6)
    .map((est) => ({
      ...est,
      ticketPromedio: est.citas > 0 ? est.total / est.citas : 0,
      initials: getInitials(est.nombre),
    }));

  return {
    topServicios,
    topProductos,
    topEstilistas,
    clientesUnicos: clientesSet.size,
  };
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user, isAuthenticated, activeSedeId, setActiveSedeId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [loadingSedes, setLoadingSedes] = useState(true);
  const [dashboardData, setDashboardData] =
    useState<VentasDashboardResponse | null>(null);
  const [realMetricasByCurrency, setRealMetricasByCurrency] = useState<Record<
    string,
    VentasMetricas
  > | null>(null);
  const [extendedMetrics, setExtendedMetrics] =
    useState<ExtendedMetrics | null>(null);
  const [analyticsKPIs, setAnalyticsKPIs] =
    useState<DashboardResponse | null>(null);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [, setPeriods] = useState<PeriodOption[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState(DEFAULT_PERIOD);
  const [selectedSede, setSelectedSede] = useState<string>("");
  const [churnData, setChurnData] = useState<ChurnCliente[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showDateModal, setShowDateModal] = useState(false);
  const [tempDateRange, setTempDateRange] = useState<DateRange>({
    start_date: "",
    end_date: "",
  });
  const [dateRange, setDateRange] = useState<DateRange>({
    start_date: "",
    end_date: "",
  });
  const [financialTab, setFinancialTab] = useState<'pl' | 'cajas' | 'traslados' | 'registrar'>('pl');
  const [registrarSubTab, setRegistrarSubTab] = useState<'egreso-mayor' | 'ingreso-mayor' | 'traslado' | 'egreso-menor'>('egreso-mayor');
  const [transferDir, setTransferDir] = useState<'menor-mayor' | 'mayor-menor'>('menor-mayor');

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

  const resolveMetricasByCurrency = (
    metricasPorMoneda?: VentasDashboardResponse["metricas_por_moneda"]
  ) => {
    const fallbackCurrency = normalizeCurrencyCode(
      monedaUsuario || getStoredCurrency("COP")
    );
    if (!metricasPorMoneda || Object.keys(metricasPorMoneda).length === 0)
      return { metricas: undefined, moneda: fallbackCurrency };

    const sedeActual =
      selectedSede === "global"
        ? undefined
        : sedes.find((sede) => sede.sede_id === selectedSede);
    const sedeCurrency = resolveCurrencyFromSede(sedeActual, fallbackCurrency);
    const countryCurrency = resolveCurrencyFromCountry(
      user?.pais,
      sedeCurrency
    );

    const candidateCurrencies = Array.from(
      new Set(
        [sedeCurrency, countryCurrency, fallbackCurrency, "COP", "USD", "MXN"]
          .map((c) => normalizeCurrencyCode(c))
          .filter(Boolean)
      )
    );

    for (const currency of candidateCurrencies) {
      if (metricasPorMoneda[currency])
        return { metricas: metricasPorMoneda[currency], moneda: currency };
    }

    const [firstCurrency] = Object.keys(metricasPorMoneda);
    if (!firstCurrency)
      return { metricas: undefined, moneda: fallbackCurrency };
    return {
      metricas: metricasPorMoneda[firstCurrency],
      moneda: normalizeCurrencyCode(firstCurrency),
    };
  };

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
    if (isAuthenticated && user && selectedSede) loadDashboardData();
  }, [selectedSede, selectedPeriod, dateRange, monedaUsuario]);

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

  const buildDashboardParams = () => {
    if (selectedPeriod === "custom") {
      if (!dateRange.start_date || !dateRange.end_date)
        throw new Error("Por favor selecciona un rango de fechas");
      return {
        start_date: dateRange.start_date,
        end_date: dateRange.end_date,
        period: "custom",
      };
    }
    if (selectedPeriod === "today") return { period: "today" };
    return { period: selectedPeriod };
  };

  const buildInvoiceRange = (): DateRange => {
    const today = new Date();
    const todayYmd = toLocalYMD(today);

    if (selectedPeriod === "custom" && dateRange.start_date && dateRange.end_date)
      return { start_date: dateRange.start_date, end_date: dateRange.end_date };
    if (selectedPeriod === "last_7_days") {
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      return { start_date: toLocalYMD(start), end_date: todayYmd };
    }
    if (selectedPeriod === "last_30_days") {
      const start = new Date(today);
      start.setDate(start.getDate() - 29);
      return { start_date: toLocalYMD(start), end_date: todayYmd };
    }
    if (selectedPeriod === "month") {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start_date: toLocalYMD(start), end_date: todayYmd };
    }
    return { start_date: todayYmd, end_date: todayYmd };
  };

  const aggregateMetricasByCurrency = (
    responses: VentasDashboardResponse[]
  ) => {
    const aggregated: Record<string, VentasMetricas> = {};
    responses.forEach((response) => {
      Object.entries(response.metricas_por_moneda || {}).forEach(
        ([currency, metricas]) => {
          const c = normalizeCurrencyCode(currency);
          if (!aggregated[c]) aggregated[c] = createEmptyMetricas();
          const t = aggregated[c];
          t.ventas_totales += metricas.ventas_totales || 0;
          t.cantidad_ventas += metricas.cantidad_ventas || 0;
          t.ventas_servicios += metricas.ventas_servicios || 0;
          t.ventas_productos += metricas.ventas_productos || 0;
          SALES_PAYMENT_METHODS.forEach((m) => {
            t.metodos_pago[m] =
              (t.metodos_pago[m] || 0) + (metricas.metodos_pago?.[m] || 0);
          });
        }
      );
    });
    Object.values(aggregated).forEach((m) => {
      m.ticket_promedio =
        m.cantidad_ventas > 0 ? m.ventas_totales / m.cantidad_ventas : 0;
      m.crecimiento_ventas = "0%";
    });
    return aggregated;
  };

  const loadRealMetricsFromFacturas = async (
    sedeId: string
  ): Promise<boolean> => {
    try {
      const invoiceRange = buildInvoiceRange();
      const facturas = await facturaService.getVentasBySedeAllPages(
        sedeId,
        invoiceRange.start_date,
        invoiceRange.end_date
      );
      const metricasPorMoneda = buildRealMetricasFromFacturas(facturas);
      const extended = buildExtendedMetrics(facturas);
      setRealMetricasByCurrency(metricasPorMoneda);
      setExtendedMetrics(extended);
      return true;
    } catch (err) {
      console.warn("No se pudieron cargar ventas reales:", err);
      setRealMetricasByCurrency(null);
      setExtendedMetrics(null);
      return false;
    }
  };

  const loadAnalyticsKPIs = async (sedeId: string) => {
    if (!user?.access_token) return;
    try {
      const data = await getDashboard(user.access_token, {
        period: selectedPeriod !== "custom" ? selectedPeriod : undefined,
        sede_id: sedeId !== "global" ? sedeId : undefined,
      });
      setAnalyticsKPIs(data);
    } catch (err) {
      console.warn("No se pudieron cargar KPIs de clientes:", err);
      setAnalyticsKPIs(null);
    }
  };

  const loadGlobalDashboardData = async () => {
    if (!user?.access_token) return;
    setRealMetricasByCurrency(null);
    setExtendedMetrics(null);

    const sedesIds = sedes
      .map((sede) => normalizeSedeId(sede.sede_id))
      .filter(Boolean);
    if (sedesIds.length === 0) {
      setDashboardData(null);
      setChurnData([]);
      return;
    }

    const baseParams = buildDashboardParams();
    const responseList = await Promise.all(
      sedesIds.map(async (sedeId) => {
        try {
          return await getVentasDashboard(user.access_token, {
            ...baseParams,
            sede_id: sedeId,
            sede_header_id: sedeId,
          });
        } catch {
          return null;
        }
      })
    );

    const validResponses = responseList.filter(
      (r): r is VentasDashboardResponse =>
        Boolean(r && r.metricas_por_moneda)
    );

    if (validResponses.length === 0)
      throw new Error("No se pudieron cargar métricas para las sedes.");

    const baseRange = validResponses.find((r) => r.range)?.range;
    const aggregatedData: VentasDashboardResponse = {
      success: true,
      descripcion: `Vista global consolidada de ${validResponses.length} sede(s)`,
      range: baseRange,
      usuario: { sede_asignada: "global", nombre_sede: "Vista Global" },
      metricas_por_moneda: aggregateMetricasByCurrency(validResponses),
      debug_info: {
        source: "frontend_multi_sede_aggregation",
        sedes_incluidas: validResponses.length,
      },
    };
    setDashboardData(aggregatedData);

    await loadChurnData(baseRange?.start, baseRange?.end, undefined);
  };

  const loadDashboardData = async () => {
    if (!selectedSede || !user?.access_token) return;
    try {
      setLoading(true);
      setError(null);
      setRealMetricasByCurrency(null);

      if (selectedSede === "global") {
        await loadGlobalDashboardData();
        await loadAnalyticsKPIs("global");
        return;
      }

      const params = { ...buildDashboardParams(), sede_id: selectedSede };
      const data = await getVentasDashboard(user.access_token, {
        ...params,
        sede_header_id: selectedSede,
      });

      await loadRealMetricsFromFacturas(selectedSede);
      await loadAnalyticsKPIs(selectedSede);

      if (!data || !data.success)
        throw new Error("La API no devolvió datos válidos");

      setDashboardData(data);

      await loadChurnData(data.range?.start, data.range?.end, selectedSede);
    } catch (error: unknown) {
      console.error("Error cargando dashboard:", error);
      setError(`Error al cargar datos: ${getErrorMessage(error)}`);
      setDashboardData(null);
    } finally {
      setLoading(false);
    }
  };

  const loadPeriods = async () => {
    try {
      const data = await getVentasAvailablePeriods();
      setPeriods(data.periods);
    } catch (err) {
      console.error("Error cargando períodos:", err);
    }
  };

  const loadChurnData = async (
    startDate?: string,
    endDate?: string,
    sedeId?: string
  ) => {
    if (!user?.access_token) return;
    try {
      const targetSedeId =
        sedeId !== undefined
          ? sedeId
          : selectedSede !== "global"
          ? selectedSede
          : undefined;

      let finalStart = startDate;
      let finalEnd = endDate;

      if (!startDate || !endDate) {
        const today = new Date();
        const ago = new Date();
        ago.setDate(today.getDate() - 30);
        finalStart = toLocalYMD(ago);
        finalEnd = toLocalYMD(today);
      }

      const params: { sede_id?: string; start_date?: string; end_date?: string } =
        { start_date: finalStart, end_date: finalEnd };
      if (targetSedeId) params.sede_id = targetSedeId;

      const data = await getChurnClientes(user.access_token, params);
      if (data.clientes && Array.isArray(data.clientes))
        setChurnData(data.clientes.slice(0, 10));
      else setChurnData([]);
    } catch {
      setChurnData([]);
    }
  };

  const handleRefresh = () => loadDashboardData();

  const handlePeriodChange = (period: string) => {
    setSelectedPeriod(period);
    if (period === "custom") {
      setTempDateRange(dateRange);
      setShowDateModal(true);
    }
  };

  const handleSedeChange = (sedeId: string) => {
    setSelectedSede(sedeId);
    if (sedeId !== "global") setActiveSedeId(sedeId);
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
    setTimeout(() => loadDashboardData(), 100);
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

  const formatDateDisplay = (dateString: string) =>
    formatDateDMY(dateString, "");

  const getPeriodDisplay = () => {
    if (selectedPeriod === "custom")
      return `${formatDateDisplay(dateRange.start_date)} - ${formatDateDisplay(dateRange.end_date)}`;
    return periodOptions.find((p) => p.id === selectedPeriod)?.label || "Período";
  };

  const getActiveDashboardCurrency = (): string => {
    const src =
      realMetricasByCurrency !== null
        ? realMetricasByCurrency
        : dashboardData?.metricas_por_moneda;
    const { moneda } = resolveMetricasByCurrency(src);
    return moneda;
  };

  const formatCurrency = (value: number | string): string => {
    try {
      const activeCurrency = getActiveDashboardCurrency();
      const locale = resolveCurrencyLocale(activeCurrency, "es-CO");
      if (typeof value === "string")
        return formatMoney(extractNumericValue(value), activeCurrency, locale);
      return formatMoney(value, activeCurrency, locale);
    } catch {
      return formatMoney(0, "COP", "es-CO");
    }
  };

  const getMetricas = () => {
    const fallbackCurrency = getActiveDashboardCurrency();
    const src =
      realMetricasByCurrency !== null
        ? realMetricasByCurrency
        : dashboardData?.metricas_por_moneda;

    if (!src || Object.keys(src).length === 0)
      return { ...createEmptyMetricas(), moneda: fallbackCurrency };

    const { metricas, moneda } = resolveMetricasByCurrency(src);
    if (!metricas) return { ...createEmptyMetricas(), moneda };
    return { ...metricas, moneda };
  };

  const isGlobalView = selectedSede === "global";
  const currentSede = isGlobalView
    ? undefined
    : sedes.find((s) => s.sede_id === selectedSede);
  const sedeNombreDisplay = isGlobalView
    ? "Vista Global"
    : formatSedeNombre(currentSede?.nombre, "Sede seleccionada");
  const metricas = getMetricas();

  // ── Derived display values ──────────────────────────────
  const pctServicios =
    metricas.ventas_totales > 0
      ? Math.round((metricas.ventas_servicios / metricas.ventas_totales) * 100)
      : 0;
  const pctProductos =
    metricas.ventas_totales > 0
      ? Math.round((metricas.ventas_productos / metricas.ventas_totales) * 100)
      : 0;
  const dias = dashboardData?.range?.dias || 1;
  const ventaPromDia =
    metricas.ventas_totales > 0
      ? Math.round(metricas.ventas_totales / dias)
      : 0;

  const totalServicios =
    extendedMetrics?.topServicios.reduce((s, i) => s + i.cantidad, 0) || 0;
  const totalProductosVendidos =
    extendedMetrics?.topProductos.reduce((s, i) => s + i.cantidad, 0) || 0;

  const paymentRows = [
    { name: "Transferencia", value: metricas.metodos_pago?.transferencia || 0 },
    { name: "Tarjeta de Crédito", value: metricas.metodos_pago?.tarjeta_credito || 0 },
    { name: "Tarjeta de Débito", value: metricas.metodos_pago?.tarjeta_debito || 0 },
    { name: "Efectivo", value: metricas.metodos_pago?.efectivo || 0 },
    { name: "Tarjeta", value: metricas.metodos_pago?.tarjeta || 0 },
    { name: "Nequi / Addi", value: metricas.metodos_pago?.addi || 0 },
    { name: "Sin Pago", value: metricas.metodos_pago?.sin_pago || 0 },
    { name: "Otros", value: metricas.metodos_pago?.otros || 0 },
  ].filter((r) => r.value > 0).sort((a, b) => b.value - a.value);

  const totalPayments = paymentRows.reduce((s, r) => s + r.value, 0);

  const clientesUnicos = extendedMetrics?.clientesUnicos || 0;
  const nuevosClientes =
    typeof analyticsKPIs?.kpis?.nuevos_clientes?.valor === "number"
      ? analyticsKPIs.kpis.nuevos_clientes.valor
      : 0;
  const recurrentes = Math.max(0, clientesUnicos - nuevosClientes);
  const pctRecurrentes =
    clientesUnicos > 0 ? Math.round((recurrentes / clientesUnicos) * 100) : 0;

  const churnEnRiesgo = churnData.filter(
    (c) => c.dias_inactivo >= 61 && c.dias_inactivo <= 90
  ).length;
  const churnPerdidos = churnData.filter((c) => c.dias_inactivo > 90).length;

  // ── UI State checks ──────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <div className="flex flex-col h-screen items-center justify-center">
        <h2 className="text-2xl font-bold">Acceso no autorizado</h2>
        <p className="mt-2 text-gray-600">
          Por favor inicia sesión para ver el dashboard.
        </p>
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
        <p className="mt-2 text-gray-600">
          No se pudo determinar tu sede asignada.
        </p>
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
          <h3 className="text-lg font-bold text-slate-800 mb-1">
            Seleccionar rango de fechas
          </h3>
          <p className="text-sm text-slate-500 mb-5">
            Elige las fechas para filtrar las métricas
          </p>
          <p className="text-xs text-slate-600 font-medium mb-2">
            Rangos rápidos:
          </p>
          <div className="flex flex-wrap gap-2 mb-5">
            {[
              { label: "7 días", days: 7 },
              { label: "30 días", days: 30 },
              { label: "90 días", days: 90 },
            ].map(({ label, days }) => (
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
                  start_date: toLocalYMD(
                    new Date(today.getFullYear(), today.getMonth(), 1)
                  ),
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
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
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
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                max={tempDateRange.end_date || today}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Fecha de fin
              </label>
              <input
                type="date"
                value={tempDateRange.end_date}
                onChange={(e) =>
                  setTempDateRange((p) => ({ ...p, end_date: e.target.value }))
                }
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                min={tempDateRange.start_date}
                max={today}
              />
            </div>
          </div>
          <div className="mt-5 p-3 bg-slate-50 rounded-lg border border-slate-100 text-xs text-slate-600">
            <span className="font-medium">Rango:</span>{" "}
            {formatDateDisplay(tempDateRange.start_date)} –{" "}
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

  // ── Reusable mini-components ─────────────────────────────
  const SectionTitle = ({
    children,
    note,
  }: {
    children: React.ReactNode;
    note?: string;
  }) => (
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
    label,
    value,
    sub,
    change,
    featured,
  }: {
    label: string;
    value: string;
    sub?: string;
    change?: string;
    featured?: boolean;
  }) => (
    <div
      className={`bg-white rounded-[10px] px-4 py-3.5 ${
        featured
          ? "border-2 border-slate-800"
          : "border border-slate-200"
      }`}
    >
      <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-[0.4px] mb-1.5">
        {label}
      </div>
      <div className="text-[22px] font-bold tracking-tight text-slate-800">
        {value}
      </div>
      {change && change !== "0%" && (
        <div className="text-[10px] font-semibold mt-0.5 text-slate-800">
          ↑ {change} vs mes anterior
        </div>
      )}
      {sub && <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );

  const ClientMetric = ({
    label,
    value,
    sub,
  }: {
    label: string;
    value: string;
    sub?: string;
  }) => (
    <div className="p-3 border border-slate-200 rounded-lg text-center bg-white">
      <div className="text-[9px] text-slate-400 font-semibold uppercase tracking-[0.3px] mb-1">
        {label}
      </div>
      <div className="text-[22px] font-bold text-slate-800">{value}</div>
      {sub && <div className="text-[9px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );

  const RowItem = ({
    name,
    value,
    sub,
    barPct,
  }: {
    name: React.ReactNode;
    value: string;
    sub?: string;
    barPct?: number;
  }) => (
    <div className="flex justify-between items-center py-2 text-xs border-b border-slate-100 last:border-b-0">
      <span className="font-medium text-slate-700 flex-shrink-0 flex items-center">{name}</span>
      {barPct !== undefined && (
        <div className="flex-1 mx-3 h-1 bg-slate-100 rounded min-w-[40px]">
          <div
            className="h-full bg-slate-800 rounded"
            style={{ width: `${Math.max(2, barPct)}%` }}
          />
        </div>
      )}
      <div className="text-right">
        <span className="font-bold text-[13px] text-slate-800">{value}</span>
        {sub && (
          <div className="text-[10px] text-slate-400 leading-none mt-0.5">
            {sub}
          </div>
        )}
      </div>
    </div>
  );

  const Card = ({
    title,
    titleSub,
    children,
    scrollable,
    action,
  }: {
    title: string;
    titleSub?: string;
    children: React.ReactNode;
    scrollable?: boolean;
    action?: React.ReactNode;
  }) => (
    <div className="bg-white border border-slate-200 rounded-[10px] p-[18px]">
      <div className="text-[13px] font-bold mb-3 flex justify-between items-center text-slate-800">
        <span>{title}</span>
        <div className="flex items-center gap-2">
          {titleSub && (
            <span className="text-[10px] text-slate-400 font-medium">
              {titleSub}
            </span>
          )}
          {action}
        </div>
      </div>
      {scrollable ? (
        <div className="max-h-[260px] overflow-y-auto">{children}</div>
      ) : (
        children
      )}
    </div>
  );

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
              <h1 className="text-2xl font-bold tracking-tight text-slate-800">
                Dashboard
              </h1>
              <div className="text-xs text-slate-500 mt-0.5">
                Inteligencia de negocio · {user?.pais || "Colombia"} ·{" "}
                {metricas.moneda}
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
                onClick={handleRefresh}
                className="px-3.5 py-[7px] bg-white border border-slate-200 rounded-lg text-[11px] text-slate-500 font-medium flex items-center gap-1 hover:bg-slate-50"
              >
                <RefreshCw className="w-3 h-3" /> Actualizar
              </button>
            </div>
          </div>

          {/* Period filter */}
          <div className="flex items-center gap-1.5 mb-[18px] flex-wrap">
            <span className="text-xs text-slate-500 font-medium">
              Período:
            </span>
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
            {dashboardData?.range && (
              <div className="ml-auto text-xs text-slate-500">
                {getPeriodDisplay()} ·{" "}
                <b className="text-slate-800">{dias} días</b>
              </div>
            )}
          </div>

          {/* Loading state */}
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="w-10 h-10 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin mx-auto mb-4" />
                <p className="text-slate-500 text-sm">
                  Cargando datos de {sedeNombreDisplay}…
                </p>
              </div>
            </div>
          ) : error ? (
            <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
              <p className="text-slate-500 mb-4">{error}</p>
              <button
                onClick={handleRefresh}
                className="flex items-center gap-2 mx-auto px-4 py-2 border border-slate-200 rounded-lg text-sm hover:bg-slate-50"
              >
                <RefreshCw className="w-4 h-4" /> Reintentar
              </button>
            </div>
          ) : (
            <>
              {/* ══ VENTAS DEL PERÍODO ══════════════════════════════ */}
              <SectionTitle>Ventas del período</SectionTitle>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 mb-3.5">
                <KPICard
                  featured
                  label="Ventas totales"
                  value={formatCurrency(metricas.ventas_totales)}
                  change={
                    metricas.crecimiento_ventas !== "0%"
                      ? metricas.crecimiento_ventas
                      : undefined
                  }
                />
                <KPICard
                  label="Servicios"
                  value={formatCurrency(metricas.ventas_servicios)}
                  sub={`${totalServicios} servicios · ${pctServicios}%`}
                />
                <KPICard
                  label="Productos"
                  value={formatCurrency(metricas.ventas_productos)}
                  sub={`${totalProductosVendidos} ventas · ${pctProductos}%`}
                />
                <KPICard
                  label="Transacciones"
                  value={String(metricas.cantidad_ventas || 0)}
                  sub={`Ticket prom: ${formatCurrency(metricas.ticket_promedio)}`}
                />
                <KPICard
                  label="Venta promedio/día"
                  value={formatCurrency(ventaPromDia)}
                  sub={`${dias} días del período`}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 mb-3.5">
                {/* Métodos de pago */}
                <Card title="Ventas cobradas por método de pago" titleSub="solo dinero recibido">
                  {paymentRows.length > 0 ? (
                    <>
                      {paymentRows.map((row) => (
                        <RowItem
                          key={row.name}
                          name={row.name}
                          value={formatCurrency(row.value)}
                          sub={`${Math.round(
                            (row.value / (totalPayments || 1)) * 100
                          )}%`}
                          barPct={
                            totalPayments > 0
                              ? (row.value / totalPayments) * 100
                              : 0
                          }
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
                </Card>

                {/* Top servicios */}
                <Card title="Top servicios por ingreso" scrollable>
                  {extendedMetrics && extendedMetrics.topServicios.length > 0 ? (
                    <>
                      {extendedMetrics.topServicios.map((s) => (
                        <RowItem
                          key={s.nombre}
                          name={s.nombre}
                          value={formatCurrency(s.total)}
                          sub={`${s.cantidad} servicios`}
                        />
                      ))}
                    </>
                  ) : (
                    <p className="text-xs text-slate-400 py-4 text-center">
                      Sin datos de servicios para este período
                    </p>
                  )}
                </Card>
              </div>

              {/* ══ MÉTRICAS DE CLIENTES ════════════════════════════ */}
              <SectionTitle>Métricas de clientes</SectionTitle>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 mb-3.5">
                <ClientMetric
                  label="Clientes atendidos"
                  value={String(clientesUnicos || metricas.cantidad_ventas || 0)}
                  sub="este período"
                />
                <ClientMetric
                  label="Nuevos"
                  value={String(nuevosClientes)}
                  sub={
                    clientesUnicos > 0
                      ? `${Math.round((nuevosClientes / clientesUnicos) * 100)}% del total`
                      : "este período"
                  }
                />
                <ClientMetric
                  label="Recurrentes"
                  value={String(recurrentes)}
                  sub={
                    clientesUnicos > 0
                      ? `${pctRecurrentes}% del total`
                      : "este período"
                  }
                />
                <ClientMetric
                  label="Recurrencia prom."
                  value="–"
                  sub="datos no disponibles"
                />
                <ClientMetric
                  label="Ticket promedio"
                  value={formatCurrency(metricas.ticket_promedio)}
                  sub="por visita"
                />
                <ClientMetric
                  label="LTV promedio"
                  value="–"
                  sub="datos no disponibles"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 mb-3.5">
                {/* Composición clientes */}
                <Card title="Composición de clientes">
                  <div className="flex items-center gap-5">
                    <div
                      className="w-[90px] h-[90px] rounded-full relative flex-shrink-0"
                      style={{
                        background: `conic-gradient(#1E293B 0% ${pctRecurrentes}%, #E2E8F0 ${pctRecurrentes}% 100%)`,
                      }}
                    >
                      <div className="absolute inset-[18px] rounded-full bg-white flex items-center justify-center flex-col">
                        <span className="text-base font-bold text-slate-800">
                          {pctRecurrentes}%
                        </span>
                        <span className="text-[8px] text-slate-400">
                          recurrentes
                        </span>
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5 text-[11px] mb-1.5">
                        <div className="w-2 h-2 rounded-sm bg-slate-800" />
                        <span>Recurrentes: {recurrentes}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] mb-1.5">
                        <div className="w-2 h-2 rounded-sm bg-slate-200" />
                        <span>Nuevos: {nuevosClientes}</span>
                      </div>
                      <div className="mt-2.5 text-[10px] text-slate-400">
                        Meta retención: 85%
                      </div>
                    </div>
                  </div>
                </Card>

                {/* Estado de la base */}
                <Card title="Estado de la base">
                  {churnData.length > 0 ? (
                    <>
                      <RowItem
                        name="Activos (0–30 días)"
                        value="–"
                        sub="datos no disponibles"
                      />
                      <RowItem
                        name="Tibios (31–60 días)"
                        value="–"
                        sub="datos no disponibles"
                      />
                      <RowItem
                        name="En riesgo (61–90 días)"
                        value={String(churnEnRiesgo)}
                        sub="detectados"
                      />
                      <RowItem
                        name="Perdidos (90+ días)"
                        value={String(churnPerdidos)}
                        sub="detectados"
                      />
                    </>
                  ) : (
                    <>
                      <RowItem name="Activos (0–30 días)" value="–" />
                      <RowItem name="Tibios (31–60 días)" value="–" />
                      <RowItem name="En riesgo (61–90 días)" value="–" />
                      <RowItem name="Perdidos (90+ días)" value="–" />
                    </>
                  )}
                  <div className="mt-1.5 text-[10px] text-slate-400">
                    Segmentación completa requiere módulo de analítica avanzada
                  </div>
                </Card>

                {/* Nuevos por mes */}
                <Card title="Nuevos por mes">
                  <p className="text-xs text-slate-400 py-4 text-center">
                    Datos históricos mensuales no disponibles en la API actual
                  </p>
                </Card>
              </div>

              {/* ══ RENDIMIENTO POR ESTILISTA ════════════════════════ */}
              <SectionTitle>Rendimiento por estilista</SectionTitle>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 mb-3.5">
                {/* Ranking estilistas */}
                <Card
                  title="Ranking por ingreso generado"
                  titleSub="servicios + productos"
                  scrollable
                  action={
                    <button
                      onClick={() => navigate("/sede/stylists")}
                      className="text-[11px] text-slate-500 hover:text-slate-800 font-medium transition-colors"
                    >
                      Ver todos →
                    </button>
                  }
                >
                  {extendedMetrics && extendedMetrics.topEstilistas.length > 0 ? (
                    extendedMetrics.topEstilistas.map((est, idx) => (
                      <div
                        key={est.nombre}
                        className="flex items-center gap-2.5 py-2 border-b border-slate-100 last:border-b-0"
                      >
                        <span className="text-[11px] font-bold text-slate-400 w-4">
                          {idx + 1}
                        </span>
                        <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0">
                          {est.initials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-slate-800 truncate">
                            {est.nombre}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {est.citas} citas · Ticket prom:{" "}
                            {formatCurrency(est.ticketPromedio)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[13px] font-bold text-slate-800">
                            {formatCurrency(est.total)}
                          </div>
                          <div className="text-[9px] text-slate-400">
                            {metricas.ventas_totales > 0
                              ? `${Math.round((est.total / metricas.ventas_totales) * 100)}%`
                              : "–"}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-400 py-4 text-center">
                      Sin datos de estilistas para este período
                    </p>
                  )}
                </Card>

                {/* Productos más vendidos */}
                <Card
                  title="Productos más vendidos"
                  action={
                    <button
                      onClick={() => navigate("/sede/products")}
                      className="text-[11px] text-slate-500 hover:text-slate-800 font-medium transition-colors"
                    >
                      Ver todos →
                    </button>
                  }
                >
                  {extendedMetrics && extendedMetrics.topProductos.length > 0 ? (
                    <>
                      {extendedMetrics.topProductos.map((p) => (
                        <RowItem
                          key={p.nombre}
                          name={p.nombre}
                          value={formatCurrency(p.total)}
                          sub={`${p.cantidad} uds`}
                        />
                      ))}
                      <div className="mt-2 text-[10px] text-slate-400">
                        Venta prom. de producto por cita:{" "}
                        {metricas.cantidad_ventas > 0
                          ? formatCurrency(
                              metricas.ventas_productos /
                                metricas.cantidad_ventas
                            )
                          : "–"}
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-slate-400 py-4 text-center">
                      Sin datos de productos para este período
                    </p>
                  )}
                </Card>
              </div>

              {/* ══ ESTADO FINANCIERO ════════════════════════════════ */}
              <SectionTitle note="→ Contabilidad real, NO flujo de caja">
                Estado financiero de la operación
              </SectionTitle>

              {/* Financial Tabs */}
              <div className="flex gap-0 mb-4 border-b border-slate-200">
                {([
                  { id: 'pl' as const, label: 'Estado de Resultados' },
                  { id: 'cajas' as const, label: 'Cajas' },
                  { id: 'traslados' as const, label: 'Traslados' },
                  { id: 'registrar' as const, label: 'Registrar movimientos' },
                ]).map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setFinancialTab(tab.id)}
                    className={`px-5 py-2.5 text-[13px] font-medium border-b-2 transition-colors ${
                      financialTab === tab.id
                        ? 'text-slate-800 font-semibold border-slate-800'
                        : 'text-slate-500 border-transparent hover:text-slate-700'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* ── Tab: Estado de Resultados ── */}
              {financialTab === 'pl' && (
                <>
                  <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-lg text-[11px] text-slate-500 leading-relaxed mb-4">
                    <span className="font-semibold text-slate-700">Estado de Resultados (P&L)</span> — Rentabilidad real de la operación. Los traslados entre cajas NO aparecen aquí. Comisiones, arriendo y nómina SÍ aparecen aunque se paguen desde caja mayor.
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 mb-3.5">
                    <KPICard featured label="Ingresos" value={formatCurrency(metricas.ventas_totales)} sub="Servicios + Productos" />
                    <KPICard label="Costos directos" value="–" sub="Comisiones + Insumos" />
                    <KPICard label="Utilidad bruta" value="–" sub="Margen: –" />
                    <KPICard label="Gastos totales" value="–" sub="Fijos + Operativos" />
                    <KPICard label="Utilidad neta" value="–" sub="Margen: –" />
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
                    <Card title="Estado de Resultados" titleSub={getPeriodDisplay()}>
                      <div className="text-[10px] font-bold uppercase tracking-[0.5px] text-slate-400 pt-1 mb-1">Ingresos operacionales</div>
                      <RowItem name={<>Servicios <span className="inline-flex px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border border-slate-200 text-slate-400 ml-1.5">Auto · Facturación</span></>} value={formatCurrency(metricas.ventas_servicios)} />
                      <RowItem name={<>Productos vendidos <span className="inline-flex px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border border-slate-200 text-slate-400 ml-1.5">Auto · Facturación</span></>} value={formatCurrency(metricas.ventas_productos)} />
                      <div className="flex justify-between pt-2 pb-1 text-[13px] font-bold border-t border-slate-200 mt-1">
                        <span>Total ingresos</span><span>{formatCurrency(metricas.ventas_totales)}</span>
                      </div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.5px] text-slate-400 mt-3 mb-1">Costos directos</div>
                      <RowItem name={<>Comisiones estilistas <span className="inline-flex px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border border-slate-200 text-slate-400 ml-1.5">Auto · Citas</span></>} value="–" />
                      <RowItem name={<>Insumos usados <span className="inline-flex px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border border-dashed border-slate-300 text-slate-500 ml-1.5">Manual · Caja Mayor</span></>} value="–" />
                      <div className="flex justify-between pt-2 pb-1 text-[13px] font-bold border-t border-slate-200 mt-1">
                        <span>Utilidad bruta</span><span>–</span>
                      </div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.5px] text-slate-400 mt-3 mb-1">Gastos fijos</div>
                      <RowItem name={<>Arriendo <span className="inline-flex px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border border-dashed border-slate-300 text-slate-500 ml-1.5">Manual · Caja Mayor</span></>} value="–" />
                      <RowItem name={<>Nómina administrativa <span className="inline-flex px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border border-dashed border-slate-300 text-slate-500 ml-1.5">Manual · Caja Mayor</span></>} value="–" />
                      <RowItem name={<>Servicios públicos <span className="inline-flex px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border border-dashed border-slate-300 text-slate-500 ml-1.5">Manual · Caja Mayor</span></>} value="–" />
                      <div className="text-[10px] font-bold uppercase tracking-[0.5px] text-slate-400 mt-3 mb-1">Gastos operativos</div>
                      <RowItem name={<>Gastos varios <span className="inline-flex px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border border-slate-200 text-slate-400 ml-1.5">Auto · Caja Menor</span></>} value="–" />
                      <RowItem name={<>Domicilios <span className="inline-flex px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border border-slate-200 text-slate-400 ml-1.5">Auto · Caja Menor</span></>} value="–" />
                      <RowItem name={<>Alimentación <span className="inline-flex px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border border-slate-200 text-slate-400 ml-1.5">Auto · Caja Menor</span></>} value="–" />
                      <RowItem name={<>Mantenimiento <span className="inline-flex px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border border-dashed border-slate-300 text-slate-500 ml-1.5">Manual · Caja Mayor</span></>} value="–" />
                      <RowItem name={<>Software <span className="inline-flex px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border border-dashed border-slate-300 text-slate-500 ml-1.5">Manual · Caja Mayor</span></>} value="–" />
                      <RowItem name={<>Marketing <span className="inline-flex px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border border-dashed border-slate-300 text-slate-500 ml-1.5">Manual · Caja Mayor</span></>} value="–" />
                      <RowItem name={<>Impuestos <span className="inline-flex px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border border-dashed border-slate-300 text-slate-500 ml-1.5">Manual · Caja Mayor</span></>} value="–" />
                      <div className="flex justify-between pt-2 pb-1 text-[13px] font-bold border-t border-slate-200 mt-1">
                        <span>Total gastos</span><span>–</span>
                      </div>
                      <div className="flex justify-between pt-3 text-[16px] font-bold text-slate-800 border-t-2 border-slate-800 mt-1">
                        <span>Utilidad neta</span><span>–</span>
                      </div>
                    </Card>

                    <div className="flex flex-col gap-3.5">
                      <Card title="Gastos por categoría" titleSub="% del total">
                        {(['Comisiones', 'Arriendo', 'Nómina admin', 'Insumos', 'Impuestos', 'Servicios públicos', 'Otros']).map(name => (
                          <RowItem key={name} name={name} barPct={0} value="–" sub="–%" />
                        ))}
                      </Card>
                      <Card title="Origen de los datos">
                        <div className="text-[11px] text-slate-500 leading-relaxed space-y-2.5">
                          <div><span className="inline-flex px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border border-slate-200 text-slate-400">Auto · Facturación</span> — Se calcula automáticamente de las ventas cobradas en el módulo de Facturación.</div>
                          <div><span className="inline-flex px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border border-slate-200 text-slate-400">Auto · Citas</span> — Se calcula automáticamente del % de comisión configurado por estilista.</div>
                          <div><span className="inline-flex px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border border-slate-200 text-slate-400">Auto · Caja Menor</span> — Viene de los egresos registrados por recepción en la caja del punto de venta.</div>
                          <div><span className="inline-flex px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border border-dashed border-slate-300 text-slate-500">Manual · Caja Mayor</span> — Lo registra el administrador en la pestaña <span className="font-semibold text-slate-700">"Registrar movimientos"</span>. Son gastos que no pasan por la caja registradora: arriendo, nómina, impuestos, proveedores, etc.</div>
                        </div>
                      </Card>
                    </div>
                  </div>
                </>
              )}

              {/* ── Tab: Cajas ── */}
              {financialTab === 'cajas' && (
                <>
                  <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-lg text-[11px] text-slate-500 leading-relaxed mb-4">
                    <span className="font-semibold text-slate-700">Caja Menor</span> = efectivo en la sede. Se alimenta automáticamente de los cobros en efectivo. <span className="font-semibold text-slate-700">Caja Mayor</span> = cuenta principal del negocio. Recibe pagos digitales automáticamente + los movimientos que el administrador registra manualmente.
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 mb-3.5">
                    <Card title="Caja Menor" titleSub="Efectivo en sede · Auto + manual">
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        {[['Saldo', '–'], ['Entradas', formatCurrency(metricas.metodos_pago?.efectivo ?? 0)], ['Salidas', '–']].map(([lbl, val]) => (
                          <div key={lbl} className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2.5">
                            <div className="text-[9px] text-slate-400 font-semibold uppercase tracking-[0.4px] mb-1">{lbl}</div>
                            <div className="text-[17px] font-bold text-slate-800">{val}</div>
                          </div>
                        ))}
                      </div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.5px] text-slate-400 mb-1">Entradas</div>
                      <RowItem name={<>Cobros efectivo <span className="inline-flex px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border border-slate-200 text-slate-400 ml-1.5">Auto</span></>} value={formatCurrency(metricas.metodos_pago?.efectivo ?? 0)} />
                      <RowItem name={<>Base de Caja Mayor <span className="inline-flex px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border border-dashed border-slate-300 text-slate-500 ml-1.5">Manual</span></>} value="–" />
                      <div className="text-[10px] font-bold uppercase tracking-[0.5px] text-slate-400 mt-3 mb-1">Salidas</div>
                      <RowItem name={<>Gastos operativos <span className="inline-flex px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border border-dashed border-slate-300 text-slate-500 ml-1.5">Manual · Recepción</span></>} value="–" />
                      <RowItem name={<>Propinas <span className="inline-flex px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border border-dashed border-slate-300 text-slate-500 ml-1.5">Manual · Recepción</span></>} value="–" />
                      <RowItem name={<span className="text-slate-400">⇄ Entregas a Caja Mayor <span className="inline-flex px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border border-dashed border-slate-300 text-slate-400 ml-1.5">Manual</span></span>} value="–" />
                      <div className="flex justify-between pt-3 text-[15px] font-bold text-slate-800 border-t-2 border-slate-800 mt-2">
                        <span>Saldo caja menor</span><span>–</span>
                      </div>
                    </Card>

                    <Card title="Caja Mayor" titleSub="Cuenta principal · Auto + manual">
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        {[['Saldo', '–'], ['Entradas', formatCurrency((metricas.metodos_pago?.transferencia ?? 0) + (metricas.metodos_pago?.tarjeta ?? 0) + (metricas.metodos_pago?.tarjeta_credito ?? 0) + (metricas.metodos_pago?.tarjeta_debito ?? 0))], ['Salidas', '–']].map(([lbl, val]) => (
                          <div key={lbl} className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2.5">
                            <div className="text-[9px] text-slate-400 font-semibold uppercase tracking-[0.4px] mb-1">{lbl}</div>
                            <div className="text-[17px] font-bold text-slate-800">{val}</div>
                          </div>
                        ))}
                      </div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.5px] text-slate-400 mb-1">Entradas</div>
                      <RowItem name={<>Transferencias <span className="inline-flex px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border border-slate-200 text-slate-400 ml-1.5">Auto</span></>} value={formatCurrency(metricas.metodos_pago?.transferencia ?? 0)} />
                      <RowItem name={<>Tarjeta <span className="inline-flex px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border border-slate-200 text-slate-400 ml-1.5">Auto</span></>} value={formatCurrency((metricas.metodos_pago?.tarjeta ?? 0) + (metricas.metodos_pago?.tarjeta_credito ?? 0) + (metricas.metodos_pago?.tarjeta_debito ?? 0))} />
                      <RowItem name={<>Nequi / Daviplata <span className="inline-flex px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border border-slate-200 text-slate-400 ml-1.5">Auto</span></>} value={formatCurrency(metricas.metodos_pago?.otros ?? 0)} />
                      <RowItem name={<span className="text-slate-400">⇄ Recibido de Caja Menor <span className="inline-flex px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border border-dashed border-slate-300 text-slate-400 ml-1.5">Manual</span></span>} value="–" />
                      <div className="text-[10px] font-bold uppercase tracking-[0.5px] text-slate-400 mt-3 mb-1">Salidas</div>
                      <RowItem name={<>Comisiones <span className="inline-flex px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border border-dashed border-slate-300 text-slate-500 ml-1.5">Manual · Admin</span></>} value="–" />
                      <RowItem name={<>Arriendo <span className="inline-flex px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border border-dashed border-slate-300 text-slate-500 ml-1.5">Manual · Admin</span></>} value="–" />
                      <RowItem name={<>Nómina <span className="inline-flex px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border border-dashed border-slate-300 text-slate-500 ml-1.5">Manual · Admin</span></>} value="–" />
                      <RowItem name={<>Insumos <span className="inline-flex px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border border-dashed border-slate-300 text-slate-500 ml-1.5">Manual · Admin</span></>} value="–" />
                      <RowItem name={<span className="text-slate-400">⇄ Base a Caja Menor <span className="inline-flex px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border border-dashed border-slate-300 text-slate-400 ml-1.5">Manual</span></span>} value="–" />
                      <div className="flex justify-between pt-3 text-[15px] font-bold text-slate-800 border-t-2 border-slate-800 mt-2">
                        <span>Saldo caja mayor</span><span>–</span>
                      </div>
                    </Card>
                  </div>

                  <Card title="Posición consolidada">
                    <div className="grid grid-cols-3 gap-2.5">
                      <div className="bg-white border border-slate-200 rounded-[10px] px-4 py-3.5">
                        <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-[0.4px] mb-1.5">Caja Menor</div>
                        <div className="text-[22px] font-bold text-slate-800">–</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">Efectivo en sede</div>
                      </div>
                      <div className="bg-white border border-slate-200 rounded-[10px] px-4 py-3.5">
                        <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-[0.4px] mb-1.5">Caja Mayor</div>
                        <div className="text-[22px] font-bold text-slate-800">–</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">Cuenta principal</div>
                      </div>
                      <div className="bg-white border-2 border-slate-800 rounded-[10px] px-4 py-3.5">
                        <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-[0.4px] mb-1.5">Total del negocio</div>
                        <div className="text-[22px] font-bold text-slate-800">{formatCurrency(metricas.ventas_totales)}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">Los traslados no cambian este número</div>
                      </div>
                    </div>
                  </Card>
                </>
              )}

              {/* ── Tab: Traslados ── */}
              {financialTab === 'traslados' && (
                <>
                  <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-lg text-[11px] text-slate-500 leading-relaxed mb-4">
                    Traslados entre cajas = movimientos internos. <span className="font-semibold text-slate-700">No son ingresos ni gastos.</span> El total del negocio no cambia.
                  </div>
                  <div className="grid grid-cols-3 gap-2.5 mb-3.5">
                    <KPICard label="Menor → Mayor" value="–" sub="Entregas" />
                    <KPICard label="Mayor → Menor" value="–" sub="Envíos de base" />
                    <KPICard label="Neto trasladado" value="–" sub="de Menor a Mayor" />
                  </div>
                  <Card title="Detalle de traslados">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          {['Fecha', 'Dirección', 'Concepto', 'Registrado por', 'Monto'].map((h, i) => (
                            <th key={h} className={`text-left text-[9px] font-bold uppercase tracking-[0.5px] text-slate-400 pb-2 border-b border-slate-200 ${i === 4 ? 'text-right' : ''}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-[11px] text-slate-400">
                            No hay traslados registrados para este período. Regístralos en "Registrar movimientos".
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </Card>
                </>
              )}

              {/* ── Tab: Registrar movimientos ── */}
              {financialTab === 'registrar' && (
                <>
                  <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-lg text-[11px] text-slate-500 leading-relaxed mb-4">
                    Aquí el administrador registra los movimientos que <span className="font-semibold text-slate-700">no pasan por la caja registradora</span>: arriendo, nómina, comisiones, impuestos, proveedores, ingresos extras. También se registran los traslados entre Caja Menor y Caja Mayor. Los cobros a clientes (efectivo, tarjeta, Nequi, etc.) se registran automáticamente desde Facturación.
                  </div>

                  <div className="flex gap-1.5 mb-4 flex-wrap">
                    {([
                      { id: 'egreso-mayor' as const, label: 'Egreso Caja Mayor' },
                      { id: 'ingreso-mayor' as const, label: 'Ingreso Caja Mayor' },
                      { id: 'traslado' as const, label: 'Traslado entre cajas' },
                      { id: 'egreso-menor' as const, label: 'Egreso Caja Menor' },
                    ]).map(st => (
                      <button
                        key={st.id}
                        onClick={() => setRegistrarSubTab(st.id)}
                        className={`px-4 py-2 border rounded-lg text-[11px] font-medium transition-colors ${
                          registrarSubTab === st.id
                            ? 'bg-slate-800 text-white border-slate-800'
                            : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>

                  {registrarSubTab === 'egreso-mayor' && (
                    <div className="bg-white border border-slate-200 rounded-[10px] p-5 mb-4">
                      <div className="text-[14px] font-bold text-slate-800 mb-1">Registrar egreso — Caja Mayor</div>
                      <div className="text-[11px] text-slate-500 mb-4 leading-relaxed">Para gastos que se pagan desde la cuenta principal: arriendo, nómina, comisiones, impuestos, proveedores, servicios públicos. Estos gastos alimentan automáticamente el Estado de Resultados (P&L).</div>
                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="flex flex-col gap-1"><label className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.4px]">Concepto</label><input className="px-3 py-2 border border-slate-200 rounded-md text-[13px] focus:outline-none focus:border-slate-800" placeholder="Ej: Arriendo local abril 2026" /></div>
                        <div className="flex flex-col gap-1"><label className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.4px]">Monto</label><input className="px-3 py-2 border border-slate-200 rounded-md text-[13px] focus:outline-none focus:border-slate-800" placeholder="$0" /></div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.4px]">Categoría de gasto</label>
                          <select className="px-3 py-2 border border-slate-200 rounded-md text-[13px] bg-white focus:outline-none focus:border-slate-800">
                            <option value="">Seleccionar categoría...</option>
                            <option>Arriendo</option><option>Nómina administrativa</option><option>Comisiones estilistas</option><option>Servicios públicos</option><option>Impuestos</option><option>Insumos / Proveedores</option><option>Mantenimiento</option><option>Marketing y publicidad</option><option>Software y herramientas</option><option>Otro gasto fijo</option><option>Otro gasto operativo</option>
                          </select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.4px]">Método de pago</label>
                          <select className="px-3 py-2 border border-slate-200 rounded-md text-[13px] bg-white focus:outline-none focus:border-slate-800">
                            <option>Transferencia bancaria</option><option>Débito automático</option><option>Tarjeta corporativa</option><option>Cheque</option><option>Efectivo (desde caja mayor)</option><option>PSE</option>
                          </select>
                        </div>
                        <div className="flex flex-col gap-1"><label className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.4px]">Fecha</label><input type="date" className="px-3 py-2 border border-slate-200 rounded-md text-[13px] focus:outline-none focus:border-slate-800" /></div>
                        <div className="flex flex-col gap-1"><label className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.4px]">Referencia / N° factura</label><input className="px-3 py-2 border border-slate-200 rounded-md text-[13px] focus:outline-none focus:border-slate-800" placeholder="Opcional" /></div>
                        <div className="flex flex-col gap-1 col-span-2"><label className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.4px]">Observaciones</label><textarea className="px-3 py-2 border border-slate-200 rounded-md text-[12px] resize-y min-h-[56px] leading-relaxed focus:outline-none focus:border-slate-800" placeholder="Detalles adicionales..." /></div>
                      </div>
                      <div className="flex gap-2 justify-end mt-4">
                        <button className="px-4 py-2 border border-slate-200 rounded-md text-[12px] font-semibold text-slate-500 hover:bg-slate-50">Cancelar</button>
                        <button className="px-4 py-2 bg-slate-800 text-white rounded-md text-[12px] font-semibold hover:bg-slate-700">Registrar egreso</button>
                      </div>
                    </div>
                  )}

                  {registrarSubTab === 'ingreso-mayor' && (
                    <div className="bg-white border border-slate-200 rounded-[10px] p-5 mb-4">
                      <div className="text-[14px] font-bold text-slate-800 mb-1">Registrar ingreso — Caja Mayor</div>
                      <div className="text-[11px] text-slate-500 mb-4 leading-relaxed">Para ingresos que no vienen de ventas a clientes: devoluciones de proveedores, intereses bancarios, ingresos extraordinarios. Los cobros a clientes ya se registran automáticamente desde Facturación.</div>
                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="flex flex-col gap-1"><label className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.4px]">Concepto</label><input className="px-3 py-2 border border-slate-200 rounded-md text-[13px] focus:outline-none focus:border-slate-800" placeholder="Ej: Devolución proveedor XYZ" /></div>
                        <div className="flex flex-col gap-1"><label className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.4px]">Monto</label><input className="px-3 py-2 border border-slate-200 rounded-md text-[13px] focus:outline-none focus:border-slate-800" placeholder="$0" /></div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.4px]">Tipo de ingreso</label>
                          <select className="px-3 py-2 border border-slate-200 rounded-md text-[13px] bg-white focus:outline-none focus:border-slate-800">
                            <option value="">Seleccionar tipo...</option><option>Devolución de proveedor</option><option>Intereses bancarios</option><option>Ingreso extraordinario</option><option>Ajuste contable</option><option>Otro</option>
                          </select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.4px]">Método</label>
                          <select className="px-3 py-2 border border-slate-200 rounded-md text-[13px] bg-white focus:outline-none focus:border-slate-800">
                            <option>Transferencia bancaria</option><option>Consignación</option><option>Otro</option>
                          </select>
                        </div>
                        <div className="flex flex-col gap-1"><label className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.4px]">Fecha</label><input type="date" className="px-3 py-2 border border-slate-200 rounded-md text-[13px] focus:outline-none focus:border-slate-800" /></div>
                        <div className="flex flex-col gap-1"><label className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.4px]">Referencia</label><input className="px-3 py-2 border border-slate-200 rounded-md text-[13px] focus:outline-none focus:border-slate-800" placeholder="Opcional" /></div>
                        <div className="flex flex-col gap-1 col-span-2"><label className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.4px]">Observaciones</label><textarea className="px-3 py-2 border border-slate-200 rounded-md text-[12px] resize-y min-h-[56px] leading-relaxed focus:outline-none focus:border-slate-800" placeholder="Detalles adicionales..." /></div>
                      </div>
                      <div className="flex gap-2 justify-end mt-4">
                        <button className="px-4 py-2 border border-slate-200 rounded-md text-[12px] font-semibold text-slate-500 hover:bg-slate-50">Cancelar</button>
                        <button className="px-4 py-2 bg-slate-800 text-white rounded-md text-[12px] font-semibold hover:bg-slate-700">Registrar ingreso</button>
                      </div>
                    </div>
                  )}

                  {registrarSubTab === 'traslado' && (
                    <div className="bg-white border border-slate-200 rounded-[10px] p-5 mb-4">
                      <div className="text-[14px] font-bold text-slate-800 mb-1">Registrar traslado entre cajas</div>
                      <div className="text-[11px] text-slate-500 mb-4 leading-relaxed">Para mover dinero entre Caja Menor (efectivo en sede) y Caja Mayor (cuenta principal). Este movimiento NO es un gasto ni un ingreso — solo cambia la ubicación del dinero. No afecta el P&L.</div>
                      <div className="flex items-center gap-2.5 p-3 bg-slate-50 border border-slate-100 rounded-lg mb-4">
                        <div className="flex-1 text-center bg-white border border-slate-200 rounded-md px-3 py-2.5">
                          <div className="text-[9px] text-slate-400 font-semibold uppercase tracking-[0.3px]">Origen</div>
                          <div className="text-[14px] font-bold text-slate-800 mt-0.5">{transferDir === 'menor-mayor' ? 'Caja Menor' : 'Caja Mayor'}</div>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-slate-300 text-xl">→</span>
                          <button onClick={() => setTransferDir(d => d === 'menor-mayor' ? 'mayor-menor' : 'menor-mayor')} className="text-[9px] text-slate-500 underline hover:text-slate-700">Invertir</button>
                        </div>
                        <div className="flex-1 text-center bg-white border border-slate-200 rounded-md px-3 py-2.5">
                          <div className="text-[9px] text-slate-400 font-semibold uppercase tracking-[0.3px]">Destino</div>
                          <div className="text-[14px] font-bold text-slate-800 mt-0.5">{transferDir === 'menor-mayor' ? 'Caja Mayor' : 'Caja Menor'}</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="flex flex-col gap-1"><label className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.4px]">Monto a trasladar</label><input className="px-3 py-2 border border-slate-200 rounded-md text-[13px] focus:outline-none focus:border-slate-800" placeholder="$0" /></div>
                        <div className="flex flex-col gap-1"><label className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.4px]">Fecha</label><input type="date" className="px-3 py-2 border border-slate-200 rounded-md text-[13px] focus:outline-none focus:border-slate-800" /></div>
                        <div className="flex flex-col gap-1 col-span-2"><label className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.4px]">Concepto</label><input className="px-3 py-2 border border-slate-200 rounded-md text-[13px] focus:outline-none focus:border-slate-800" placeholder="Ej: Entrega excedente diario / Base de apertura" /></div>
                        <div className="flex flex-col gap-1 col-span-2"><label className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.4px]">Observaciones</label><textarea className="px-3 py-2 border border-slate-200 rounded-md text-[12px] resize-y min-h-[56px] leading-relaxed focus:outline-none focus:border-slate-800" placeholder="Opcional" /></div>
                      </div>
                      <div className="flex gap-2 justify-end mt-4">
                        <button className="px-4 py-2 border border-slate-200 rounded-md text-[12px] font-semibold text-slate-500 hover:bg-slate-50">Cancelar</button>
                        <button className="px-4 py-2 bg-slate-800 text-white rounded-md text-[12px] font-semibold hover:bg-slate-700">Registrar traslado</button>
                      </div>
                      <div className="mt-4 p-3.5 bg-slate-50 border border-slate-100 rounded-lg text-[11px] text-slate-500 leading-relaxed">
                        Al registrar el traslado, el sistema automáticamente: resta el monto de la caja origen, suma el monto a la caja destino, registra el movimiento en ambas cajas como "Traslado" y NO lo suma como gasto ni ingreso en el P&L.
                      </div>
                    </div>
                  )}

                  {registrarSubTab === 'egreso-menor' && (
                    <div className="bg-white border border-slate-200 rounded-[10px] p-5 mb-4">
                      <div className="text-[14px] font-bold text-slate-800 mb-1">Registrar egreso — Caja Menor</div>
                      <div className="text-[11px] text-slate-500 mb-4 leading-relaxed">Para gastos pequeños del día a día que se pagan desde la caja del punto de venta: almuerzos, domicilios, propinas, papelería, etc. Normalmente lo registra el recepcionista, pero el admin también puede hacerlo aquí.</div>
                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="flex flex-col gap-1"><label className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.4px]">Concepto</label><input className="px-3 py-2 border border-slate-200 rounded-md text-[13px] focus:outline-none focus:border-slate-800" placeholder="Ej: Almuerzo Delcy" /></div>
                        <div className="flex flex-col gap-1"><label className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.4px]">Monto</label><input className="px-3 py-2 border border-slate-200 rounded-md text-[13px] focus:outline-none focus:border-slate-800" placeholder="$0" /></div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.4px]">Categoría</label>
                          <select className="px-3 py-2 border border-slate-200 rounded-md text-[13px] bg-white focus:outline-none focus:border-slate-800">
                            <option>Gasto operativo</option><option>Propina</option><option>Alimentación</option><option>Domicilio / mensajería</option><option>Papelería / insumos menores</option><option>Otro</option>
                          </select>
                        </div>
                        <div className="flex flex-col gap-1"><label className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.4px]">Fecha</label><input type="date" className="px-3 py-2 border border-slate-200 rounded-md text-[13px] focus:outline-none focus:border-slate-800" /></div>
                        <div className="flex flex-col gap-1 col-span-2"><label className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.4px]">Observaciones</label><textarea className="px-3 py-2 border border-slate-200 rounded-md text-[12px] resize-y min-h-[56px] leading-relaxed focus:outline-none focus:border-slate-800" placeholder="Opcional" /></div>
                      </div>
                      <div className="flex gap-2 justify-end mt-4">
                        <button className="px-4 py-2 border border-slate-200 rounded-md text-[12px] font-semibold text-slate-500 hover:bg-slate-50">Cancelar</button>
                        <button className="px-4 py-2 bg-slate-800 text-white rounded-md text-[12px] font-semibold hover:bg-slate-700">Registrar egreso</button>
                      </div>
                    </div>
                  )}

                  <Card title="Últimos movimientos registrados manualmente" titleSub="10 más recientes" scrollable>
                    <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          {['Fecha', 'Caja', 'Tipo', 'Concepto', 'Categoría', 'Monto', ''].map((h, i) => (
                            <th key={i} className={`text-left text-[9px] font-bold uppercase tracking-[0.5px] text-slate-400 pb-2 border-b border-slate-200 ${i === 5 ? 'text-right' : ''}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-[11px] text-slate-400">
                            No hay movimientos registrados aún. Usa los formularios de arriba para registrar egresos, ingresos o traslados.
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </Card>
                </>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
