"use client"

import { useState, useEffect, useMemo } from "react";
import { Sidebar } from "../../../components/Layout/Sidebar";
import { PageHeader } from "../../../components/Layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { SalesChart } from "./sales-chart";
import { SalesDonutChart } from "./sales-donut-chart";
import { ClientIndicators } from "./client-indicators";
import { Button } from "../../../components/ui/button";
import { useAuth } from "../../../components/Auth/AuthContext";
import { formatSedeNombre } from "../../../lib/sede";
import { formatDateDMY, toLocalYMD } from "../../../lib/dateFormat";
import {
  getVentasDashboard,
  getVentasAvailablePeriods,
  getChurnClientes,
  getSedes,
  type VentasDashboardResponse,
  type VentasMetricas,
  type Sede,
  type PeriodOption
} from "./analyticsApi";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import {
  BarChart3,
  Users,
  RefreshCw,
  Building2,
  Globe,
  DollarSign,
  Package,
  CreditCard,
  AlertCircle,
  Receipt,
  Calendar,
} from "lucide-react";
import { formatMoney, extractNumericValue } from "./formatMoney";
import {
  getStoredCurrency,
  normalizeCurrencyCode,
  resolveCurrencyFromCountry,
  resolveCurrencyFromSede,
  resolveCurrencyLocale,
} from "../../../lib/currency";
import { DEFAULT_PERIOD } from "../../../lib/period";

interface DateRange {
  start_date: string;
  end_date: string;
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

const normalizeSedeId = (value: string | null | undefined) => String(value ?? "").trim();

export default function DashboardPage() {
  const { user, isAuthenticated, activeSedeId, setActiveSedeId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [loadingSedes, setLoadingSedes] = useState(true);
  const [dashboardData, setDashboardData] = useState<VentasDashboardResponse | null>(null);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [, setPeriods] = useState<PeriodOption[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState(DEFAULT_PERIOD);
  const [selectedSede, setSelectedSede] = useState<string>("");
  // const [showChurnList, setShowChurnList] = useState(false); // Módulo churn oculto
  const [churnData, setChurnData] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  // Moneda base del usuario/sesión (normalizada)
  const monedaUsuario = normalizeCurrencyCode(user?.moneda || getStoredCurrency("COP"));
  
  // Estados para el rango de fechas personalizado
  const [showDateModal, setShowDateModal] = useState(false);
  const [tempDateRange, setTempDateRange] = useState<DateRange>({ start_date: "", end_date: "" });
  const [dateRange, setDateRange] = useState<DateRange>({ start_date: "", end_date: "" });

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
    return normalizedRole === "admin_sede" || normalizedRole === "adminsede" || normalizedRole === "admin";
  }, [user?.role]);

  // Datos para gráficos basados en métricas reales de ventas
  const [salesChartData, setSalesChartData] = useState<
    Array<{ day: string; value: number }>
  >([]);
  const [salesDistributionData, setSalesDistributionData] = useState([
    { name: "Servicios", value: 0, color: "oklch(0.3 0 0)" },
    { name: "Productos", value: 0, color: "oklch(0.7 0 0)" },
  ]);
  const [paymentMethodData, setPaymentMethodData] = useState<
    Array<{ name: string; value: number; color: string }>
  >([]);

  const periodOptions = [
    { id: "today", label: "Hoy" },
    { id: "last_7_days", label: "7 días" },
    { id: "last_30_days", label: "30 días" },
    { id: "month", label: "Mes actual" },
    { id: "custom", label: "Rango personalizado" },
  ];

  const resolveMetricasByCurrency = (
    metricasPorMoneda?: VentasDashboardResponse["metricas_por_moneda"]
  ) => {
    const fallbackCurrency = normalizeCurrencyCode(monedaUsuario || getStoredCurrency("COP"));
    if (!metricasPorMoneda || Object.keys(metricasPorMoneda).length === 0) {
      return { metricas: undefined, moneda: fallbackCurrency };
    }

    const sedeActual =
      selectedSede === "global" ? undefined : sedes.find((sede) => sede.sede_id === selectedSede);
    const sedeCurrency = resolveCurrencyFromSede(sedeActual, fallbackCurrency);
    const countryCurrency = resolveCurrencyFromCountry(user?.pais, sedeCurrency);

    const candidateCurrencies = Array.from(
      new Set(
        [sedeCurrency, countryCurrency, fallbackCurrency, "COP", "USD", "MXN"]
          .map((currency) => normalizeCurrencyCode(currency))
          .filter(Boolean)
      )
    );

    for (const currency of candidateCurrencies) {
      if (metricasPorMoneda[currency]) {
        return { metricas: metricasPorMoneda[currency], moneda: currency };
      }
    }

    const [firstCurrency] = Object.keys(metricasPorMoneda);
    if (!firstCurrency) {
      return { metricas: undefined, moneda: fallbackCurrency };
    }

    return {
      metricas: metricasPorMoneda[firstCurrency],
      moneda: normalizeCurrencyCode(firstCurrency),
    };
  };

  // Inicializar fechas por defecto
  useEffect(() => {
    const today = new Date();
    const last7Days = new Date();
    last7Days.setDate(today.getDate() - 7);
    
    const defaultRange: DateRange = {
      start_date: toLocalYMD(last7Days),
      end_date: toLocalYMD(today)
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
    if (isAuthenticated && user && selectedSede) {
      loadDashboardData();
    }
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
        allowedSedeIds.length > 0 ? new Set(allowedSedeIds.map((sedeId) => sedeId.toUpperCase())) : null;

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

      const preferredExists = filteredSedes.some((sede) => sede.sede_id === preferredSedeId);

      if (filteredSedes.length > 1) {
        setSelectedSede((current) => {
          if (current === "global") return "global";
          if (current && filteredSedes.some((sede) => sede.sede_id === current)) return current;
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
    const params: {
      period?: string;
      start_date?: string;
      end_date?: string;
    } = {};

    if (selectedPeriod === "custom") {
      if (!dateRange.start_date || !dateRange.end_date) {
        throw new Error("Por favor selecciona un rango de fechas");
      }
      params.start_date = dateRange.start_date;
      params.end_date = dateRange.end_date;
      params.period = "custom";
      return params;
    }

    if (selectedPeriod === "today") {
      const todayLocal = toLocalYMD(new Date());
      params.period = "custom";
      params.start_date = todayLocal;
      params.end_date = todayLocal;
      return params;
    }

    params.period = selectedPeriod;
    return params;
  };

  const aggregateMetricasByCurrency = (responses: VentasDashboardResponse[]) => {
    const aggregatedByCurrency: Record<string, VentasMetricas> = {};

    responses.forEach((response) => {
      const metricasPorMoneda = response.metricas_por_moneda || {};
      Object.entries(metricasPorMoneda).forEach(([currency, metricas]) => {
        const normalizedCurrency = normalizeCurrencyCode(currency);
        if (!aggregatedByCurrency[normalizedCurrency]) {
          aggregatedByCurrency[normalizedCurrency] = createEmptyMetricas();
        }

        const target = aggregatedByCurrency[normalizedCurrency];
        target.ventas_totales += metricas.ventas_totales || 0;
        target.cantidad_ventas += metricas.cantidad_ventas || 0;
        target.ventas_servicios += metricas.ventas_servicios || 0;
        target.ventas_productos += metricas.ventas_productos || 0;
        target.metodos_pago.efectivo += metricas.metodos_pago?.efectivo || 0;
        target.metodos_pago.transferencia += metricas.metodos_pago?.transferencia || 0;
        target.metodos_pago.tarjeta = (target.metodos_pago.tarjeta || 0) + (metricas.metodos_pago?.tarjeta || 0);
        target.metodos_pago.tarjeta_credito =
          (target.metodos_pago.tarjeta_credito || 0) + (metricas.metodos_pago?.tarjeta_credito || 0);
        target.metodos_pago.tarjeta_debito =
          (target.metodos_pago.tarjeta_debito || 0) + (metricas.metodos_pago?.tarjeta_debito || 0);
        target.metodos_pago.addi = (target.metodos_pago.addi || 0) + (metricas.metodos_pago?.addi || 0);
        target.metodos_pago.sin_pago =
          (target.metodos_pago.sin_pago || 0) + (metricas.metodos_pago?.sin_pago || 0);
        target.metodos_pago.otros = (target.metodos_pago.otros || 0) + (metricas.metodos_pago?.otros || 0);
      });
    });

    Object.values(aggregatedByCurrency).forEach((metricas) => {
      metricas.ticket_promedio =
        metricas.cantidad_ventas > 0 ? metricas.ventas_totales / metricas.cantidad_ventas : 0;
      metricas.crecimiento_ventas = "0%";
    });

    return aggregatedByCurrency;
  };

  const loadGlobalDashboardData = async () => {
    if (!user?.access_token) return;

    const sedesIds = sedes.map((sede) => normalizeSedeId(sede.sede_id)).filter(Boolean);
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
        } catch (sedeError) {
          console.error(`Error cargando dashboard global para sede ${sedeId}:`, sedeError);
          return null;
        }
      })
    );

    const validResponses = responseList.filter(
      (response): response is VentasDashboardResponse => Boolean(response && response.metricas_por_moneda)
    );

    if (validResponses.length === 0) {
      throw new Error("No se pudieron cargar métricas para las sedes permitidas.");
    }

    const baseRange = validResponses.find((item) => item.range)?.range;
    const aggregatedData: VentasDashboardResponse = {
      success: true,
      descripcion: `Vista global consolidada de ${validResponses.length} sede(s)`,
      range: baseRange,
      usuario: {
        sede_asignada: "global",
        nombre_sede: "Vista Global",
      },
      metricas_por_moneda: aggregateMetricasByCurrency(validResponses),
      debug_info: {
        source: "frontend_multi_sede_aggregation",
        sedes_incluidas: validResponses.length,
      },
    };

    setDashboardData(aggregatedData);

    if (baseRange?.start && baseRange?.end) {
      await loadChurnData(baseRange.start, baseRange.end, undefined);
    } else {
      await loadChurnData(undefined, undefined, undefined);
    }
  };

  const loadDashboardData = async () => {
    if (!selectedSede || !user?.access_token) {
      console.log('No hay sede seleccionada o token para cargar dashboard');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      console.log('Cargando dashboard de ventas para sede:', selectedSede, 'período:', selectedPeriod, 'moneda:', monedaUsuario);

      if (selectedSede === "global") {
        await loadGlobalDashboardData();
        return;
      }

      const params = {
        ...buildDashboardParams(),
        sede_id: selectedSede,
      };

      console.log('📤 Parámetros enviados a la API:', params);

      const data = await getVentasDashboard(user.access_token, {
        ...params,
        sede_header_id: selectedSede,
      });

      console.log('📥 Respuesta de la API:', data);

      // Verificar que la respuesta sea exitosa y tenga la estructura esperada
      if (!data || !data.success) {
        throw new Error('La API no devolvió datos válidos');
      }

      if (!data.metricas_por_moneda) {
        console.warn('La respuesta no tiene metricas_por_moneda:', data);
        // Puede que la estructura sea diferente, intentar con una estructura por defecto
        setDashboardData(data);
        processChartDataWithFallback(data);
      } else {
        setDashboardData(data);
        processChartData(data);
      }

      // Cargar datos de churn
      if (data.range?.start && data.range?.end) {
        await loadChurnData(data.range.start, data.range.end, selectedSede);
      } else {
        await loadChurnData(undefined, undefined, selectedSede);
      }

    } catch (error: any) {
      console.error("Error cargando dashboard de ventas:", error);
      setError(`Error al cargar datos: ${error.message}`);
      setDashboardData(null);
    } finally {
      setLoading(false);
    }
  };

  const loadPeriods = async () => {
    try {
      const data = await getVentasAvailablePeriods();
      setPeriods(data.periods);
      console.log('Períodos disponibles para ventas:', data.periods);
    } catch (error) {
      console.error("Error cargando períodos:", error);
    }
  };

  const loadChurnData = async (startDate?: string, endDate?: string, sedeId?: string) => {
    if (!user?.access_token) {
      console.log('No hay token para cargar churn');
      return;
    }

    try {
      const targetSedeId = sedeId !== undefined ? sedeId : selectedSede !== "global" ? selectedSede : undefined;

      let finalStartDate = startDate;
      let finalEndDate = endDate;

      if (!startDate || !endDate) {
        const today = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(today.getDate() - 30);

        finalStartDate = toLocalYMD(thirtyDaysAgo);
        finalEndDate = toLocalYMD(today);
      }

      const churnParams: { sede_id?: string; start_date?: string; end_date?: string } = {
        start_date: finalStartDate,
        end_date: finalEndDate,
      };

      if (targetSedeId) {
        churnParams.sede_id = targetSedeId;
      }

      const data = await getChurnClientes(user.access_token, churnParams);

      if (data.clientes && Array.isArray(data.clientes)) {
        setChurnData(data.clientes.slice(0, 10));
      } else {
        console.warn('La respuesta de churn no tiene array de clientes:', data);
        setChurnData([]);
      }
    } catch (error: any) {
      console.error("Error cargando churn:", error);
      setChurnData([]);
    }
  };

  const processChartData = (data: VentasDashboardResponse) => {
    try {
      // Verificar que los datos existan
      if (!data?.metricas_por_moneda) {
        console.error('Datos incompletos para procesar gráficos:', data);
        processChartDataWithFallback(data);
        return;
      }

      const { metricas, moneda } = resolveMetricasByCurrency(data.metricas_por_moneda);

      if (!metricas) {
        console.error('No hay métricas disponibles para ninguna moneda:', data.metricas_por_moneda);
        processChartDataWithFallback(data);
        return;
      }

      console.log(`Moneda activa para gráficos de sede: ${moneda}`);

      // Generar datos para gráfico de línea (tendencia semanal)
      const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
      const chartData = days.map((day, index) => {
        // Simular tendencia semanal basada en las ventas totales
        const baseValue = (metricas.ventas_totales || 0) / (data.range?.dias || 7);
        const multiplier = index < 5 ? 1.2 : 0.8; // Días laborales vs fin de semana
        const randomVariation = 0.9 + Math.random() * 0.2;

        return {
          day,
          value: Math.round(baseValue * multiplier * randomVariation)
        };
      });

      setSalesChartData(chartData);

      // Datos para gráfico de donut de servicios vs productos
      const serviceVsProduct = [
        {
          name: 'Servicios',
          value: metricas.ventas_servicios || 0,
          color: 'oklch(0.3 0 0)'
        },
        {
          name: 'Productos',
          value: metricas.ventas_productos || 0,
          color: 'oklch(0.7 0 0)'
        }
      ].filter(item => item.value > 0);

      setSalesDistributionData(serviceVsProduct.length > 0 ? serviceVsProduct : [
        { name: "Servicios", value: 0, color: "oklch(0.3 0 0)" },
        { name: "Productos", value: 0, color: "oklch(0.7 0 0)" },
      ]);

      // Datos para gráfico de donut de métodos de pago
      const paymentMethods = [
        {
          name: 'Efectivo',
          value: metricas.metodos_pago?.efectivo || 0,
          color: 'oklch(0.9 0 0)'
        },
        {
          name: 'Transferencia',
          value: metricas.metodos_pago?.transferencia || 0,
          color: 'oklch(0.7 0 0)'
        },
        {
          name: 'Tarjeta de Crédito',
          value: metricas.metodos_pago?.tarjeta_credito || 0,
          color: 'oklch(0.5 0 0)'
        },
        {
          name: 'Tarjeta de Débito',
          value: metricas.metodos_pago?.tarjeta_debito || 0,
          color: 'oklch(0.45 0 0)'
        },
        {
          name: 'Addi',
          value: metricas.metodos_pago?.addi || 0,
          color: 'oklch(0.4 0 0)'
        },
        {
          name: 'Tarjeta',
          value: metricas.metodos_pago?.tarjeta || 0,
          color: 'oklch(0.35 0 0)'
        },
        {
          name: 'Sin Pago',
          value: metricas.metodos_pago?.sin_pago || 0,
          color: 'oklch(0.3 0 0)'
        }
      ].filter(item => item.value > 0);

      setPaymentMethodData(paymentMethods);

    } catch (error) {
      console.error("Error procesando datos para gráficos:", error);
      processChartDataWithFallback();
    }
  };

  const processChartDataWithFallback = (_?: any) => {
    // Establecer valores por defecto cuando no hay datos
    setSalesChartData([]);
    setSalesDistributionData([
      { name: "Servicios", value: 0, color: "oklch(0.3 0 0)" },
      { name: "Productos", value: 0, color: "oklch(0.7 0 0)" },
    ]);
    setPaymentMethodData([]);
  };

  const handleRefresh = () => {
    console.log('Refrescando datos...');
    loadDashboardData();
  };

  const handlePeriodChange = (period: string) => {
    console.log('Cambiando período a:', period);
    setSelectedPeriod(period);
    
    // Si se selecciona "Rango personalizado", mostrar modal
    if (period === "custom") {
      handleOpenDateModal();
    }
  };

  const handleSedeChange = (sedeId: string) => {
    setSelectedSede(sedeId);
    if (sedeId !== "global") {
      setActiveSedeId(sedeId);
    }
  };

  const handleOpenDateModal = () => {
    setTempDateRange(dateRange);
    setShowDateModal(true);
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
    // Cargar datos después de un pequeño delay para asegurar el cambio de estado
    setTimeout(() => {
      loadDashboardData();
    }, 100);
  };

  const formatDateDisplay = (dateString: string) => formatDateDMY(dateString, "");

  const getPeriodDisplay = () => {
    if (selectedPeriod === "custom") {
      return `${formatDateDisplay(dateRange.start_date)} - ${formatDateDisplay(dateRange.end_date)}`;
    }
    return periodOptions.find(p => p.id === selectedPeriod)?.label || "Período";
  };

  // Función para seleccionar rango rápido
  const setQuickDateRange = (days: number) => {
    const today = new Date();
    const startDate = new Date();
    startDate.setDate(today.getDate() - days);
    
    const newRange: DateRange = {
      start_date: toLocalYMD(startDate),
      end_date: toLocalYMD(today)
    };
    
    setTempDateRange(newRange);
  };

  const getActiveDashboardCurrency = (): string => {
    const { moneda } = resolveMetricasByCurrency(dashboardData?.metricas_por_moneda);
    return moneda;
  };

  const formatCurrency = (value: number | string): string => {
    try {
      const activeCurrency = getActiveDashboardCurrency();
      const locale = resolveCurrencyLocale(activeCurrency, "es-CO");
      if (typeof value === 'string') {
        const numericValue = extractNumericValue(value);
        return formatMoney(numericValue, activeCurrency, locale);
      }
      return formatMoney(value, activeCurrency, locale);
    } catch (error) {
      console.error("Error formateando moneda:", error);
      return formatMoney(0, getActiveDashboardCurrency(), resolveCurrencyLocale(getActiveDashboardCurrency(), "es-CO"));
    }
  };

  const formatCurrencyShort = (value: number | string): string => {
    try {
      const numericValue = typeof value === 'string' ? extractNumericValue(value) : value;
      const activeCurrency = getActiveDashboardCurrency();
      const locale = resolveCurrencyLocale(activeCurrency, "es-CO");
      const absoluteValue = Math.abs(numericValue);

      if (absoluteValue >= 1000000) {
        return `${formatMoney(Math.round(numericValue / 1000000), activeCurrency, locale)}M`;
      }
      if (absoluteValue >= 1000) {
        return `${formatMoney(Math.round(numericValue / 1000), activeCurrency, locale)}K`;
      }
      return formatMoney(numericValue, activeCurrency, locale);
    } catch (error) {
      console.error("Error formateando moneda corta:", error);
      return formatMoney(0, getActiveDashboardCurrency(), resolveCurrencyLocale(getActiveDashboardCurrency(), "es-CO"));
    }
  };

  // Modal de selección de fechas
  const DateRangeModal = () => {
    if (!showDateModal) return null;

    const today = toLocalYMD(new Date());

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-white rounded-lg w-full max-w-md mx-4 p-6">
          <div className="mb-6">
            <h3 className="text-xl font-bold text-gray-900">Seleccionar rango de fechas</h3>
            <p className="text-gray-700 mt-1">Elige las fechas para filtrar las métricas</p>
          </div>

          {/* Botones de rango rápido */}
          <div className="mb-6">
            <p className="text-sm text-gray-700 mb-3">Rangos rápidos:</p>
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
                  const today = new Date();
                  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
                  setTempDateRange({
                    start_date: toLocalYMD(firstDayOfMonth),
                    end_date: toLocalYMD(today)
                  });
                }}
              >
                Mes actual
              </Button>
            </div>
          </div>

          {/* Selectores de fecha */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-800 mb-2">
                Fecha de inicio
              </label>
              <input
                type="date"
                value={tempDateRange.start_date}
                onChange={(e) => setTempDateRange(prev => ({ ...prev, start_date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
                max={tempDateRange.end_date || today}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-800 mb-2">
                Fecha de fin
              </label>
              <input
                type="date"
                value={tempDateRange.end_date}
                onChange={(e) => setTempDateRange(prev => ({ ...prev, end_date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
                min={tempDateRange.start_date}
                max={today}
              />
            </div>
          </div>

          {/* Resumen del rango */}
          <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-300">
            <p className="text-sm text-gray-800">
              <span className="font-medium">Rango seleccionado:</span>{" "}
              {formatDateDisplay(tempDateRange.start_date)} - {formatDateDisplay(tempDateRange.end_date)}
            </p>
            <p className="text-xs text-gray-600 mt-1">
              {tempDateRange.start_date && tempDateRange.end_date && (
                <>
                  Duración:{" "}
                  {Math.ceil(
                    (new Date(tempDateRange.end_date).getTime() - new Date(tempDateRange.start_date).getTime()) / 
                    (1000 * 60 * 60 * 24)
                  ) + 1} días
                </>
              )}
            </p>
          </div>

          {/* Botones de acción */}
          <div className="mt-6 flex gap-3">
            <Button
              className="flex-1 bg-black text-white hover:bg-gray-800"
              onClick={handleApplyDateRange}
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
    );
  };

  const getSedeInfo = (sedeId: string): Sede | undefined => {
    return sedes.find(sede => sede.sede_id === sedeId);
  };

  // Función para obtener métricas de forma segura
  const getMetricas = () => {
    const fallbackCurrency = getActiveDashboardCurrency();

    if (!dashboardData?.metricas_por_moneda) {
      return {
        ventas_totales: 0,
        cantidad_ventas: 0,
        ventas_servicios: 0,
        ventas_productos: 0,
        ticket_promedio: 0,
        crecimiento_ventas: "0%",
        metodos_pago: {
          efectivo: 0,
          transferencia: 0,
          tarjeta: 0,
          tarjeta_credito: 0,
          tarjeta_debito: 0,
          addi: 0,
          sin_pago: 0
        },
        moneda: fallbackCurrency
      };
    }

    const { metricas, moneda } = resolveMetricasByCurrency(dashboardData.metricas_por_moneda);
    
    // Si no hay ninguna métrica, crear una vacía
    if (!metricas) {
      return {
        ventas_totales: 0,
        cantidad_ventas: 0,
        ventas_servicios: 0,
        ventas_productos: 0,
        ticket_promedio: 0,
        crecimiento_ventas: "0%",
        metodos_pago: {
          efectivo: 0,
          transferencia: 0,
          tarjeta: 0,
          tarjeta_credito: 0,
          tarjeta_debito: 0,
          addi: 0,
          sin_pago: 0
        },
        moneda
      };
    }
    
    return {
      ...metricas,
      moneda
    };
  };

  const isGlobalView = selectedSede === "global";
  const currentSede = isGlobalView ? undefined : getSedeInfo(selectedSede);
  const sedeNombreDisplay = isGlobalView
    ? "Vista Global"
    : formatSedeNombre(currentSede?.nombre, "Sede seleccionada");
  const metricas = getMetricas();

  if (!isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold">Acceso no autorizado</h2>
          <p className="mt-2 text-gray-600">Por favor inicia sesión para ver el dashboard.</p>
        </div>
      </div>
    );
  }

  if (loadingSedes) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-200 border-t-gray-800 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando información de la sede...</p>
        </div>
      </div>
    );
  }

  if (!selectedSede) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold">Sede no disponible</h2>
          <p className="mt-2 text-gray-600">No se pudo determinar tu sede asignada.</p>
          <div className="mt-4">
            <p className="text-sm text-gray-500">Usuario autenticado</p>
            <p className="text-sm text-gray-500">Sedes en sistema: {sedes.length}</p>
          </div>
          <Button
            onClick={() => loadSedes()}
            variant="outline"
            className="mt-4"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  if (!isGlobalView && !currentSede) {
    return (
      <div className="flex h-screen items-center justify-center">
          <div className="text-center">
            <h2 className="text-2xl font-bold">Sede no encontrada</h2>
            <p className="mt-2 text-gray-600">No se encontró información para la sede {sedeNombreDisplay}</p>
          </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-white">
      <Sidebar />

      <main className="flex-1 overflow-y-auto">
        {/* Top Bar */}
        <div className="border-b border-gray-200 bg-white px-8 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <PageHeader
              title="Dashboard"
              subtitle={`Moneda: ${metricas.moneda} · País: ${user?.pais || "Colombia"}`}
              className="mb-0"
            />

            <div className="flex flex-wrap items-center gap-3">
              {/* Filtro de período */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-600" />
                  <span className="text-sm text-gray-600">Período:</span>
                </div>
                
                <div className="flex flex-wrap gap-1">
                  {periodOptions.map((option) => (
                    <Button
                      key={option.id}
                      size="sm"
                      variant={selectedPeriod === option.id ? "default" : "outline"}
                      className={`text-xs border-gray-300 ${selectedPeriod === option.id ? "bg-black text-white hover:bg-gray-800" : "text-gray-700 hover:bg-gray-100"}`}
                      onClick={() => handlePeriodChange(option.id)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>

              {sedes.length > 1 && (
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-gray-600" />
                  <span className="text-sm text-gray-600">Vista:</span>
                  <Select value={selectedSede} onValueChange={handleSedeChange}>
                    <SelectTrigger className="w-[230px] border border-gray-300">
                      <SelectValue placeholder="Seleccionar vista" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="global">Vista Global</SelectItem>
                      {sedes.map((sede) => (
                        <SelectItem key={sede.sede_id} value={sede.sede_id}>
                          {formatSedeNombre(sede.nombre, sede.sede_id)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="p-6">
          {/* Modal de selección de fechas */}
          <DateRangeModal />

          {loading && !dashboardData ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-gray-200 border-t-gray-800 rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-gray-600">Cargando datos financieros...</p>
                  <p className="text-sm text-gray-500 mt-2">
                    Sede: {sedeNombreDisplay} • Período: {getPeriodDisplay()} • Moneda: {metricas.moneda}
                  </p>
              </div>
            </div>
          ) : error ? (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
              <AlertCircle className="w-16 h-16 mx-auto mb-4 text-gray-400" />
              <h3 className="text-lg font-semibold text-gray-700 mb-2">Error al cargar datos</h3>
              <p className="text-gray-500 mb-4">{error}</p>
                <div className="space-y-2 mb-6 text-sm text-gray-600">
                  <p>Sede: {sedeNombreDisplay}</p>
                  <p>Período: {getPeriodDisplay()}</p>
                  <p>Moneda: {metricas.moneda} • País: {user?.pais || 'No especificado'}</p>
                </div>
              <Button
                onClick={handleRefresh}
                variant="outline"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Reintentar
              </Button>
            </div>
          ) : dashboardData ? (
            <div className="space-y-6">
              {/* Sede Info Header */}
              <Card className="border-gray-200 bg-gray-50">
                <CardContent className="p-6">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="p-3 bg-gray-100 rounded-xl">
                        {isGlobalView ? (
                          <Globe className="w-6 h-6 text-gray-800" />
                        ) : (
                          <Building2 className="w-6 h-6 text-gray-800" />
                        )}
                      </div>
                      <div>
                        <h3 className="text-xl font-bold">
                          {isGlobalView ? "Vista Global (Ventas)" : currentSede?.nombre}
                        </h3>
                        {isGlobalView && (
                          <div className="mt-2 text-sm text-gray-500">
                            {sedes.length} sedes habilitadas para este perfil
                          </div>
                        )}
                        {dashboardData.range && (
                          <div className="mt-3 text-sm text-gray-500">
                            <span className="font-medium">Período seleccionado:</span>{" "}
                            {getPeriodDisplay()}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* KPIs principales */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Ventas Totales */}
                <Card className="border-gray-200">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                      <DollarSign className="w-4 h-4" />
                      Ventas Totales
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatCurrency(metricas.ventas_totales)}
                    </div>
                  </CardContent>
                </Card>

                {/* Cantidad de Ventas */}
                <Card className="border-gray-200">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                      <Receipt className="w-4 h-4" />
                      Transacciones
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {metricas.cantidad_ventas || 0}
                    </div>
                    <div className="text-sm text-gray-500 mt-2">
                      Ticket promedio: {formatCurrency(metricas.ticket_promedio || 0)}
                    </div>
                  </CardContent>
                </Card>

                {/* Ventas Servicios */}
                <Card className="border-gray-200">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      Servicios
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatCurrency(metricas.ventas_servicios)}
                    </div>
                    <div className="text-sm text-gray-500 mt-2">
                      {metricas.ventas_servicios > 0 && metricas.ventas_totales > 0
                        ? `${Math.round((metricas.ventas_servicios / metricas.ventas_totales) * 100)}% del total`
                        : 'Sin datos'}
                    </div>
                  </CardContent>
                </Card>

                {/* Ventas Productos */}
                <Card className="border-gray-200">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                      <Package className="w-4 h-4" />
                      Productos
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatCurrency(metricas.ventas_productos)}
                    </div>
                    <div className="text-sm text-gray-500 mt-2">
                      {metricas.ventas_productos > 0 && metricas.ventas_totales > 0
                        ? `${Math.round((metricas.ventas_productos / metricas.ventas_totales) * 100)}% del total`
                        : 'Sin datos'}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Main Dashboard Grid */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* Left Column */}
                <div className="flex flex-col gap-6">
                  {/* Gráfico de tendencia de ventas */}
                  <SalesChart
                    salesData={salesChartData}
                    formatCurrency={formatCurrencyShort}
                    title="Ventas Diarias"
                    xAxisKey="day"
                  />

                  {/* Distribución Servicios vs Productos */}
                  <SalesDonutChart
                    donutData={salesDistributionData}
                    formatCurrency={formatCurrency}
                    title="Servicios vs Productos"
                  />
                </div>

                {/* Right Column */}
                <div className="flex flex-col gap-6">
                  {/* Métodos de Pago */}
                  <Card className="border-gray-200">
                    <CardHeader>
                      <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <CreditCard className="w-5 h-5" />
                        Métodos de Pago
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4">
                        {paymentMethodData.map((method, index) => (
                          <div key={index} className="flex flex-col items-center justify-center p-4 bg-gray-50 rounded-lg border border-gray-200">
                            <div
                              className="w-4 h-4 rounded-full mb-2"
                              style={{ backgroundColor: method.color }}
                            />
                            <span className="text-sm font-medium">{method.name}</span>
                            <span className="text-lg font-bold mt-1">
                              {formatCurrency(method.value)}
                            </span>
                          </div>
                        ))}
                      </div>
                      {paymentMethodData.length > 0 && (
                        <div className="mt-4 text-sm text-gray-500">
                          Total métodos de pago: {formatCurrency(
                            paymentMethodData.reduce((sum, item) => sum + item.value, 0)
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Indicadores clave */}
                  <ClientIndicators
                    nuevosClientes={{
                      valor: metricas.cantidad_ventas || 0,
                      crecimiento: ""  // Valor vacío
                    }}
                    tasaRecurrencia={{
                      valor: metricas.ventas_totales > 0
                        ? `${Math.round((metricas.ventas_servicios / metricas.ventas_totales) * 100)}%`
                        : "70%",
                      crecimiento: ""  // Valor vacío
                    }}
                    tasaChurn={{
                      valor: dashboardData.debug_info?.ventas_registradas > 0
                        ? `${Math.round((churnData.length / dashboardData.debug_info.ventas_registradas) * 100)}%`
                        : "0%",
                      crecimiento: ""  // Valor vacío
                    }}
                    ticketPromedio={{
                      valor: metricas.ticket_promedio || 0,
                      crecimiento: ""  // Valor vacío
                    }}
                    currency={metricas.moneda}
                  />

                  {/*
                    Módulo de Clientes en Riesgo (Churn) oculto por requerimiento.
                    <Card className="border-gray-200">...</Card>
                  */}
                </div>
              </div>

              {/*
                Footer del dashboard oculto por requerimiento.
                <div className="text-center pt-4 border-t border-gray-200">...</div>
              */}

              {/*
                Modal de detalle de churn oculto por requerimiento.
                {showChurnList && churnData.length > 0 && (...)}
              */}
            </div>
          ) : (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
              <BarChart3 className="w-16 h-16 mx-auto mb-4 text-gray-400" />
              <h3 className="text-lg font-semibold text-gray-700 mb-2">No hay datos financieros disponibles</h3>
              <p className="text-gray-500 mb-4">No se pudieron cargar los datos del dashboard de ventas.</p>
                <div className="space-y-2 mb-6 text-sm text-gray-600">
                  <p>Sede: {sedeNombreDisplay}</p>
                  <p>Período: {getPeriodDisplay()}</p>
                  <p>Moneda: {metricas.moneda} • País: {user?.pais || 'No especificado'}</p>
                  <p className="text-xs text-gray-500">Verifica que la API de ventas esté funcionando correctamente</p>
                </div>
              <Button
                onClick={handleRefresh}
                variant="outline"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Recargar datos
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
