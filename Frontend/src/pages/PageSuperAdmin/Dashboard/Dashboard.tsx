"use client"

import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "../../../components/Layout/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { SalesChart } from "./sales-chart";
import { SalesDonutChart } from "./sales-donut-chart";
import { ClientIndicators } from "./client-indicators";
import { Button } from "../../../components/ui/button";
import { useAuth } from "../../../components/Auth/AuthContext";
import { formatSedeNombre } from "../../../lib/sede";
import { formatDateDMY } from "../../../lib/dateFormat";
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
  type TicketPromedioKPI
} from "./Api/analyticsApi";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import {
  BarChart3,
  AlertCircle,
  Calendar,
  RefreshCw,
  Building2,
  MapPin,
  Globe,
  DollarSign,
  Users,
  Package,
  CreditCard,
  Receipt,
  ChevronDown,
  X,
} from "lucide-react";
import { Badge } from "../../../components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { formatMoney, extractNumericValue } from "./Api/formatMoney";
import {
  getStoredCurrency,
  normalizeCurrencyCode,
  resolveCurrencyFromSede,
  resolveCurrencyLocale,
} from "../../../lib/currency";
import { DEFAULT_PERIOD } from "../../../lib/period";

interface DateRange {
  start_date: string;
  end_date: string;
}

export default function DashboardPage() {
  const { user, isAuthenticated } = useAuth();
  const [loading, setLoading] = useState(true);
  const [loadingSedes, setLoadingSedes] = useState(false);
  const [dashboardData, setDashboardData] = useState<DashboardResponse | null>(null);
  const [ventasData, setVentasData] = useState<VentasDashboardResponse | null>(null);
  const [globalData, setGlobalData] = useState<DashboardResponse | null>(null);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [, setPeriods] = useState<any[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState(DEFAULT_PERIOD);
  const [selectedSede, setSelectedSede] = useState<string>("global");
  const [showChurnList, setShowChurnList] = useState(false);
  const [churnData, setChurnData] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("dashboard");
  const [error, setError] = useState<string | null>(null);
  const [monedaUsuario, setMonedaUsuario] = useState<string>("COP");

  const getSedeNombre = useCallback(
    (sedeId: string, fallback: string = "Sede seleccionada") => {
      if (sedeId === "global") return "Vista Global";
      const nombre = sedes.find(sede => sede.sede_id === sedeId)?.nombre;
      return formatSedeNombre(nombre, fallback);
    },
    [sedes]
  );
  
  // Estados para el rango de fechas personalizado
  const [showDateModal, setShowDateModal] = useState(false);
  const [tempDateRange, setTempDateRange] = useState<DateRange>({ start_date: "", end_date: "" });
  const [dateRange, setDateRange] = useState<DateRange>({ start_date: "", end_date: "" });
  
  // Estado para el loading de 5 segundos
  const [showLoadingDelay, setShowLoadingDelay] = useState(false);

  // Opciones de período con rango personalizado
  const periodOptions = [
    { id: "today", label: "Hoy" },
    { id: "last_7_days", label: "Últimos 7 días" },
    { id: "last_30_days", label: "Últimos 30 días" },
    { id: "month", label: "Mes actual" },
    { id: "custom", label: "Rango personalizado" },
  ];

  // Obtener moneda del usuario
  useEffect(() => {
    setMonedaUsuario(getStoredCurrency("COP"));
  }, []);

  // Inicializar fechas por defecto
  useEffect(() => {
    const today = new Date();
    const last30Days = new Date();
    last30Days.setDate(today.getDate() - 30);
    
    const defaultRange: DateRange = {
      start_date: last30Days.toISOString().split('T')[0],
      end_date: today.toISOString().split('T')[0]
    };
    
    setDateRange(defaultRange);
    setTempDateRange(defaultRange);
  }, []);

  // Cargar datos iniciales
  useEffect(() => {
    if (isAuthenticated && user) {
      loadInitialData();
    }
  }, [isAuthenticated, user]);

  // Cargar datos cuando cambia sede o período
  useEffect(() => {
    if (isAuthenticated && user) {
      if (selectedSede === "global") {
        loadGlobalData();
      } else {
        loadDashboardData();
      }
    }
  }, [selectedSede, selectedPeriod]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      setError(null);
      // Cargar en paralelo solo lo esencial
      await Promise.all([
        loadSedes(),
        loadPeriods(),
        loadGlobalData()
      ]);
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
      setError("Error al cargar las sedes");
    } finally {
      setLoadingSedes(false);
    }
  };

  const loadGlobalData = async () => {
    try {
      if (selectedSede !== "global") return;

      setError(null);
      const ventasParams: any = { period: selectedPeriod };
      if (selectedPeriod === "custom") {
        if (!dateRange.start_date || !dateRange.end_date) {
          setError("Por favor selecciona un rango de fechas");
          return;
        }
        ventasParams.start_date = dateRange.start_date;
        ventasParams.end_date = dateRange.end_date;
      }

      let ventasResponse: VentasDashboardResponse | null = null;
      let analyticsResponse: DashboardResponse | null = null;

      try {
        ventasResponse = await getVentasDashboard(user!.access_token, ventasParams);
        setVentasData(ventasResponse);
      } catch (ventasError: any) {
        console.warn("Error cargando ventas globales:", ventasError.message);
      }

      try {
        const analyticsParams: any = { period: selectedPeriod };
        if (selectedPeriod === "custom") {
          analyticsParams.start_date = dateRange.start_date;
          analyticsParams.end_date = dateRange.end_date;
        }
        analyticsResponse = await getDashboard(user!.access_token, analyticsParams);
        setGlobalData(analyticsResponse);
      } catch (analyticsError: any) {
        console.warn("Error cargando analytics globales:", analyticsError.message);
      }

      // Limpiar datos de sede específica
      setDashboardData(null);
      setChurnData([]);

      if (!ventasResponse && !analyticsResponse) {
        setError("No se pudieron cargar datos globales");
      }
    } catch (error: any) {
      console.error("Error cargando datos globales:", error);
      setError("Error al cargar datos globales");
      setGlobalData(null);
    }
  };

  const loadDashboardData = async () => {
    try {
      if (selectedSede === "global") return;

      // Activar el delay de 5 segundos
      setShowLoadingDelay(true);
      setTimeout(() => {
        setShowLoadingDelay(false);
      }, 5000);

      setError(null);

      // Configurar parámetros para la API
      const params: any = {
        period: selectedPeriod,
        sede_id: selectedSede
      };

      // Si es rango personalizado, agregar fechas
      if (selectedPeriod === "custom") {
        if (!dateRange.start_date || !dateRange.end_date) {
          console.log("Por favor selecciona un rango de fechas");
          return;
        }
        params.start_date = dateRange.start_date;
        params.end_date = dateRange.end_date;
      }

      // Primero intentar cargar datos de ventas
      let ventasResponse: VentasDashboardResponse | null = null;
      let analyticsResponse: DashboardResponse | null = null;

      try {
        ventasResponse = await getVentasDashboard(user!.access_token, params);
        console.log('Datos de ventas recibidos:', ventasResponse);
      } catch (ventasError: any) {
        console.warn('Error cargando datos de ventas:', ventasError.message);
      }

      // Luego intentar cargar datos de analytics
      try {
        analyticsResponse = await getDashboard(user!.access_token, {
          period: selectedPeriod,
          sede_id: selectedSede
        });
        console.log('Datos de analytics recibidos:', analyticsResponse);
      } catch (analyticsError: any) {
        console.warn('Error cargando datos de analytics:', analyticsError.message);
      }

      // Establecer los datos que se cargaron exitosamente
      setVentasData(ventasResponse);
      setDashboardData(analyticsResponse);

      // Cargar churn data solo si hay datos de analytics
      if (analyticsResponse?.churn_actual && analyticsResponse.churn_actual > 0) {
        loadChurnData();
      } else {
        setChurnData([]);
      }

      // Si ambos fallaron, mostrar error
      if (!ventasResponse && !analyticsResponse) {
        setError("No se pudieron cargar datos ni de ventas ni de analytics");
      }

    } catch (error: any) {
      console.error("Error general cargando dashboard:", error);
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
        start_date: thirtyDaysAgo.toISOString().split('T')[0],
        end_date: today.toISOString().split('T')[0]
      });
      setChurnData(data.clientes.slice(0, 10));
    } catch (error) {
      console.error("Error cargando churn:", error);
      setChurnData([]);
    }
  };

  const handleRefresh = useCallback(() => {
    if (selectedSede === "global") {
      loadGlobalData();
    } else {
      loadDashboardData();
    }
  }, [selectedSede, selectedPeriod]);

  const handleSedeChange = (sedeId: string) => {
    setSelectedSede(sedeId);
    setDashboardData(null);
    setVentasData(null);
    setChurnData([]);
    setError(null);

    if (sedeId === "global") {
      loadGlobalData();
    } else {
      // Activar delay de 5 segundos al cambiar sede
      setShowLoadingDelay(true);
      setTimeout(() => {
        setShowLoadingDelay(false);
        loadDashboardData();
      }, 5000);
    }
  };

  const handlePeriodChange = (period: string) => {
    console.log('Cambiando período a:', period);
    setSelectedPeriod(period);
    
    // Si se selecciona "Rango personalizado", mostrar modal
    if (period === "custom") {
      handleOpenDateModal();
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
    
    // Cargar datos con delay de 5 segundos
    setShowLoadingDelay(true);
    setTimeout(() => {
      setShowLoadingDelay(false);
      loadDashboardData();
    }, 5000);
  };

  // Función para seleccionar rango rápido
  const setQuickDateRange = (days: number) => {
    const today = new Date();
    const startDate = new Date();
    startDate.setDate(today.getDate() - days);
    
    const newRange: DateRange = {
      start_date: startDate.toISOString().split('T')[0],
      end_date: today.toISOString().split('T')[0]
    };
    
    setTempDateRange(newRange);
  };

  const formatDateDisplay = (dateString: string) => formatDateDMY(dateString, "");

  const getPeriodDisplay = () => {
    if (selectedPeriod === "custom") {
      return `${formatDateDisplay(dateRange.start_date)} - ${formatDateDisplay(dateRange.end_date)}`;
    }
    return periodOptions.find(p => p.id === selectedPeriod)?.label || "Período";
  };

  const getSedeInfo = useCallback((sedeId: string) => {
    return sedes.find(sede => sede.sede_id === sedeId);
  }, [sedes]);

  const filteredSedes = sedes.filter(sede =>
    sede.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    sede.direccion.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const resolveMetricasByCurrency = (
    metricasPorMoneda?: VentasDashboardResponse["metricas_por_moneda"]
  ) => {
    const fallbackCurrency = normalizeCurrencyCode(monedaUsuario || getStoredCurrency("COP"));
    if (!metricasPorMoneda || Object.keys(metricasPorMoneda).length === 0) {
      return { metricas: undefined, moneda: fallbackCurrency };
    }

    const sedeSeleccionada = selectedSede === "global" ? undefined : getSedeInfo(selectedSede);
    const preferredCurrency = resolveCurrencyFromSede(sedeSeleccionada, fallbackCurrency);
    const candidateCurrencies = Array.from(
      new Set(
        [preferredCurrency, fallbackCurrency, "COP", "USD", "MXN"]
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

  const getActiveDashboardCurrency = () => {
    const { moneda } = resolveMetricasByCurrency(ventasData?.metricas_por_moneda);
    return moneda;
  };

  const formatCurrency = useCallback((value: number | string): string => {
    const currency = getActiveDashboardCurrency();
    const locale = resolveCurrencyLocale(currency, "es-CO");
    if (typeof value === 'string') {
      const numericValue = extractNumericValue(value);
      return formatMoney(numericValue, currency, locale);
    }
    return formatMoney(value, currency, locale);
  }, [monedaUsuario, selectedSede, sedes, ventasData]);

  const formatCurrencyShort = useCallback((value: number | string): string => {
    const numericValue = typeof value === 'string' ? extractNumericValue(value) : value;
    const currency = getActiveDashboardCurrency();
    const locale = resolveCurrencyLocale(currency, "es-CO");
    const absoluteValue = Math.abs(numericValue);

    if (absoluteValue >= 1000000) {
      return `${formatMoney(Math.round(numericValue / 1000000), currency, locale)}M`;
    }
    if (absoluteValue >= 1000) {
      return `${formatMoney(Math.round(numericValue / 1000), currency, locale)}K`;
    }
    return formatMoney(numericValue, currency, locale);
  }, [monedaUsuario, selectedSede, sedes, ventasData]);

  // Función para obtener métricas de ventas de forma segura
  const getMetricasVentas = () => {
    const fallbackCurrency = getActiveDashboardCurrency();

    if (!ventasData?.metricas_por_moneda) {
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
        moneda: fallbackCurrency,
        tieneDatos: false
      };
    }

    const { metricas, moneda } = resolveMetricasByCurrency(ventasData.metricas_por_moneda);

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
        moneda,
        tieneDatos: false
      };
    }

    return {
      ...metricas,
      moneda,
      tieneDatos: true
    };
  };

  // Datos para gráficos basados en métricas reales de ventas
  const getSalesChartData = () => {
    const metricas = getMetricasVentas();

    // Si no hay datos reales, usar datos de ejemplo
    if (!metricas.tieneDatos || metricas.ventas_totales === 0) {
      return [
        { month: "Lun", value: 4000 },
        { month: "Mar", value: 3000 },
        { month: "Mié", value: 2000 },
        { month: "Jue", value: 2780 },
        { month: "Vie", value: 1890 },
        { month: "Sáb", value: 2390 },
        { month: "Dom", value: 3490 },
      ];
    }

    // Crear datos semanales basados en las ventas totales
    const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const baseValue = metricas.ventas_totales / 7;

    return days.map((day, index) => {
      const multiplier = index < 5 ? 1.2 : 0.8; // Días laborables vs fin de semana
      const randomVariation = 0.9 + Math.random() * 0.2;
      return {
        month: day,
        value: Math.round(baseValue * multiplier * randomVariation)
      };
    });
  };

  const getDonutData = () => {
    const metricas = getMetricasVentas();

    // Si no hay datos reales, usar datos de ejemplo
    if (!metricas.tieneDatos || (metricas.ventas_servicios === 0 && metricas.ventas_productos === 0)) {
      return [
        { name: "Servicios", value: 80, color: "#333" },
        { name: "Productos", value: 20, color: "#666" }
      ];
    }

    const serviceVsProduct = [
      {
        name: 'Servicios',
        value: metricas.ventas_servicios || 0,
        color: '#333'
      },
      {
        name: 'Productos',
        value: metricas.ventas_productos || 0,
        color: '#666'
      }
    ].filter(item => item.value > 0);

    return serviceVsProduct.length > 0 ? serviceVsProduct : [
      { name: "Servicios", value: 0, color: "#333" },
      { name: "Productos", value: 0, color: "#666" },
    ];
  };

  const getPaymentMethodData = () => {
    const metricas = getMetricasVentas();

    // Si no hay datos reales, usar datos de ejemplo
    const metodosPago = metricas.metodos_pago || {};
    const totalTarjetas =
      (metodosPago.tarjeta || 0) +
      (metodosPago.tarjeta_credito || 0) +
      (metodosPago.tarjeta_debito || 0);
    const totalAddi = metodosPago.addi || 0;
    const totalSinPago = metodosPago.sin_pago || 0;
    const totalEfectivo = metodosPago.efectivo || 0;
    const totalTransferencia = metodosPago.transferencia || 0;

    if (!metricas.tieneDatos || (
      totalEfectivo === 0 &&
      totalTransferencia === 0 &&
      totalTarjetas === 0 &&
      totalAddi === 0 &&
      totalSinPago === 0
    )) {
      return [
        { name: 'Efectivo', value: 500000, color: '#888' },
        { name: 'Tarjeta de Crédito', value: 200000, color: '#666' },
        { name: 'Tarjeta de Débito', value: 100000, color: '#555' },
        { name: 'Addi', value: 100000, color: '#4d4d4d' },
        { name: 'Transferencia', value: 200000, color: '#444' },
      ];
    }

    const paymentMethods = [
      {
        name: 'Efectivo',
        value: totalEfectivo,
        color: '#888'
      },
      {
        name: 'Transferencia',
        value: totalTransferencia,
        color: '#666'
      },
      {
        name: 'Tarjeta de Crédito',
        value: metodosPago.tarjeta_credito || 0,
        color: '#444'
      },
      {
        name: 'Tarjeta de Débito',
        value: metodosPago.tarjeta_debito || 0,
        color: '#555'
      },
      {
        name: 'Addi',
        value: totalAddi,
        color: '#4d4d4d'
      },
      {
        name: 'Tarjeta',
        value: metodosPago.tarjeta || 0,
        color: '#3d3d3d'
      },
      {
        name: 'Sin Pago',
        value: totalSinPago,
        color: '#222'
      }
    ].filter(item => item.value > 0);

    return paymentMethods;
  };

  const VentasOverview = () => (
    <>
      {/* KPIs principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border border-gray-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Ventas Totales
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(getMetricasVentas().ventas_totales)}
            </div>
            <p className="text-sm text-gray-500 mt-2">
              {getMetricasVentas().cantidad_ventas || 0} transacciones
            </p>
          </CardContent>
        </Card>

        <Card className="border border-gray-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <Receipt className="w-4 h-4" />
              Transacciones
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {getMetricasVentas().cantidad_ventas || 0}
            </div>
            <p className="text-sm text-gray-500 mt-2">
              Ticket promedio: {formatCurrency(getMetricasVentas().ticket_promedio || 0)}
            </p>
          </CardContent>
        </Card>

        <Card className="border border-gray-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <Users className="w-4 h-4" />
              Servicios
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(getMetricasVentas().ventas_servicios)}
            </div>
            <p className="text-sm text-gray-500 mt-2">
              {getMetricasVentas().ventas_servicios > 0 && getMetricasVentas().ventas_totales > 0
                ? `${Math.round((getMetricasVentas().ventas_servicios / getMetricasVentas().ventas_totales) * 100)}% del total`
                : 'Sin datos'}
            </p>
          </CardContent>
        </Card>

        <Card className="border border-gray-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <Package className="w-4 h-4" />
              Productos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(getMetricasVentas().ventas_productos)}
            </div>
            <p className="text-sm text-gray-500 mt-2">
              {getMetricasVentas().ventas_productos > 0 && getMetricasVentas().ventas_totales > 0
                ? `${Math.round((getMetricasVentas().ventas_productos / getMetricasVentas().ventas_totales) * 100)}% del total`
                : 'Sin datos'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Dashboard Grid con gráficos */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left Column */}
        <div className="flex flex-col gap-6">
          <SalesChart
            salesData={getSalesChartData()}
            formatCurrency={formatCurrencyShort}
            title="Ventas Semanales"
          />

          <SalesDonutChart
            donutData={getDonutData()}
            formatCurrency={formatCurrency}
            title="Distribución de Ventas"
          />
        </div>

        {/* Right Column */}
        <div className="flex flex-col gap-6">
          {/* Métodos de Pago */}
          <Card className="border border-gray-200">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-medium text-gray-900 flex items-center gap-2">
                <CreditCard className="w-4 h-4" />
                Métodos de Pago
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                {getPaymentMethodData().map((method, index) => (
                  <div key={index} className="flex flex-col items-center justify-center p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div
                      className="w-3 h-3 rounded-full mb-1"
                      style={{ backgroundColor: method.color }}
                    />
                    <span className="text-xs font-medium">{method.name}</span>
                    <span className="text-sm font-bold mt-1">
                      {formatCurrency(method.value)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );

  // Función para convertir TicketPromedioKPI a KPI
  const convertTicketPromedioToKPI = (ticketPromedio: TicketPromedioKPI): KPI => {
    if (typeof ticketPromedio === 'object' && ticketPromedio.valor !== undefined) {
      return {
        valor: ticketPromedio.valor,
        crecimiento: ticketPromedio.crecimiento || "0%"
      };
    }

    // Si es un KPI normal (string/number)
    return ticketPromedio as KPI;
  };

  // Función segura para obtener valor de ticket promedio
  const getSafeTicketPromedioValue = (ticketPromedio: TicketPromedioKPI | KPI): string | number => {
    if (typeof ticketPromedio === 'object') {
      if ('valor' in ticketPromedio && ticketPromedio.valor !== undefined) {
        return ticketPromedio.valor;
      }
    }
    return (ticketPromedio as KPI).valor;
  };

  // Modal de selección de fechas
  const DateRangeModal = () => {
    if (!showDateModal) return null;

    const today = new Date().toISOString().split('T')[0];

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-white rounded-lg w-full max-w-md mx-4 p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-xl font-bold text-gray-900">Seleccionar rango de fechas</h3>
              <p className="text-gray-700 mt-1">Elige las fechas para filtrar las métricas</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDateModal(false)}
            >
              <X className="w-5 h-5" />
            </Button>
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
                    start_date: firstDayOfMonth.toISOString().split('T')[0],
                    end_date: today.toISOString().split('T')[0]
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
              <p className="text-sm text-gray-600 mt-1">
                {formatDateDisplay(tempDateRange.start_date)}
              </p>
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
              <p className="text-sm text-gray-600 mt-1">
                {formatDateDisplay(tempDateRange.end_date)}
              </p>
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
              className="flex-1 bg-gray-900 text-white hover:bg-gray-800"
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

  // Componente de loading con delay de 5 segundos
  const LoadingDelayOverlay = () => {
    if (!showLoadingDelay) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-gray-200 border-t-gray-900 rounded-full animate-spin mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Cargando datos...</h3>
            <p className="text-gray-600 mb-4">
              Estamos obteniendo la información más reciente para {getSedeNombre(selectedSede)}
            </p>
          <div className="flex flex-col items-center">
            <div className="w-64 h-2 bg-gray-200 rounded-full overflow-hidden mb-2">
              <div className="h-full bg-gray-900 animate-pulse" style={{ width: "70%" }} />
            </div>
            <p className="text-sm text-gray-500">Esto puede tomar unos segundos...</p>
          </div>
        </div>
      </div>
    );
  };

  if (!isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900">Acceso no autorizado</h2>
          <p className="mt-2 text-gray-600">Por favor inicia sesión para ver el dashboard.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-white">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {/* Loading overlay con delay */}
        <LoadingDelayOverlay />
        
        {/* Modal de fechas */}
        <DateRangeModal />

        {/* Top Bar */}
        <div className="border-b border-gray-100 bg-white px-6 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-900 rounded-lg">
                <BarChart3 className="w-5 h-5 text-white" />
              </div>
              <div>
                  <h1 className="text-xl font-bold text-gray-900">Dashboard Analytics</h1>
                  <p className="text-sm text-gray-600">
                    {selectedSede === "global"
                      ? 'Vista Global'
                      : `Sede: ${getSedeNombre(selectedSede)}`}
                  </p>
                <p className="text-xs text-gray-500 mt-1">
                  Período: {getPeriodDisplay()}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Selector de período personalizado */}
              <Select value={selectedPeriod} onValueChange={handlePeriodChange}>
                <SelectTrigger className="w-[180px] bg-white border border-gray-300">
                  <Calendar className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Período" />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  {periodOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedSede} onValueChange={handleSedeChange}>
                <SelectTrigger className="w-[180px] bg-white border border-gray-300">
                  <Building2 className="w-4 h-4 mr-2" />
                    <SelectValue>
                      {selectedSede === "global"
                        ? "Vista Global"
                        : getSedeNombre(selectedSede, "Sede")}
                    </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-white">
                  <SelectItem value="global">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4" />
                      Vista Global
                    </div>
                  </SelectItem>
                  {loadingSedes ? (
                    <SelectItem value="loading" disabled>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
                        <span className="text-sm">Cargando...</span>
                      </div>
                    </SelectItem>
                    ) : sedes.map((sede) => (
                      <SelectItem key={sede._id} value={sede.sede_id}>
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${sede.activa ? 'bg-green-500' : 'bg-gray-300'}`} />
                          {formatSedeNombre(sede.nombre)}
                        </div>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>

              {/* <Button
                onClick={handleRefresh}
                disabled={loading || showLoadingDelay}
                className="bg-gray-900 hover:bg-gray-800 text-white"
                size="sm"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Actualizar
              </Button> */}
            </div>
          </div>
        </div>

        {/* Tabs Navigation */}
        <div className="border-b border-gray-100 bg-white px-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="bg-gray-50">
              <TabsTrigger value="dashboard" className="data-[state=active]:bg-white">
                Dashboard
              </TabsTrigger>
              <TabsTrigger value="sedes" className="data-[state=active]:bg-white">
                Sedes
              </TabsTrigger>
            </TabsList>

            {/* Tabs Content */}
            <div className="p-4">
              <TabsContent value="dashboard" className="m-0">
                {loading && selectedSede === "global" && !globalData && !ventasData ? (
                  <div className="flex items-center justify-center h-64">
                    <div className="text-center">
                      <div className="w-10 h-10 border-3 border-gray-200 border-t-gray-900 rounded-full animate-spin mx-auto mb-4" />
                      <p className="text-gray-600">Cargando datos del dashboard...</p>
                    </div>
                  </div>
                ) : loading && selectedSede !== "global" && !ventasData && !dashboardData ? (
                  <div className="flex items-center justify-center h-64">
                    <div className="text-center">
                      <div className="w-10 h-10 border-3 border-gray-200 border-t-gray-900 rounded-full animate-spin mx-auto mb-4" />
                      <p className="text-gray-600">Cargando datos de la sede...</p>
                        <p className="text-sm text-gray-500 mt-2">
                          Sede: {getSedeNombre(selectedSede)}
                        </p>
                    </div>
                  </div>
                ) : error ? (
                  <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                    <AlertCircle className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Error al cargar datos</h3>
                    <p className="text-gray-500 mb-4">{error}</p>
                    <Button
                      onClick={handleRefresh}
                      className="bg-gray-900 hover:bg-gray-800 text-white mt-4"
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Reintentar
                    </Button>
                  </div>
                ) : selectedSede === "global" ? (
                  // Vista Global
                  globalData ? (
                    <div className="space-y-4">
                      <Card className="border border-gray-200 bg-gray-50">
                        <CardContent className="p-6">
                          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                            <div className="flex items-start gap-4">
                              <div className="p-3 bg-gray-100 rounded-xl">
                                <Globe className="w-6 h-6 text-gray-800" />
                              </div>
                              <div>
                                <h3 className="text-xl font-bold">Vista Global</h3>
                                <p className="text-gray-600 mt-2">
                                  {sedes.length} sedes activas • Período: {getPeriodDisplay()}
                                </p>
                                {globalData.range && (
                                  <p className="text-sm text-gray-500">
                                    {formatDateDMY(globalData.range.start)} - {formatDateDMY(globalData.range.end)}
                                  </p>
                                )}
                              </div>
                            </div>
                            {/* <Badge className="bg-gray-900 text-white">
                              {globalData.calidad_datos || 'BUENA'}
                            </Badge> */}
                          </div>
                        </CardContent>
                      </Card>

                      {/* Charts Grid para vista global */}
                      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                        {/* Left Column */}
                        <div className="space-y-4">
                          <Card>
                            <CardContent className="p-4">
                              <div className="text-2xl font-bold text-gray-900 mb-1">
                                {formatCurrency(getSafeTicketPromedioValue(globalData.kpis.ticket_promedio))}
                              </div>
                              <p className="text-sm text-gray-600">
                                Ticket promedio del período
                              </p>
                            </CardContent>
                          </Card>

                          <SalesDonutChart
                            donutData={[
                              { name: "Servicios", value: 80, color: "#333" },
                              { name: "Productos", value: 20, color: "#666" }
                            ]}
                            formatCurrency={formatCurrency}
                          />
                        </div>

                        {/* Right Column */}
                        <div className="space-y-4">
                          <SalesChart
                            salesData={[
                              { month: "Ene", value: 4000 },
                              { month: "Feb", value: 3000 },
                              { month: "Mar", value: 2000 },
                              { month: "Abr", value: 2780 },
                              { month: "May", value: 1890 },
                            ]}
                            formatCurrency={formatCurrencyShort}
                          />

                          <ClientIndicators
                            nuevosClientes={globalData.kpis.nuevos_clientes}
                            tasaRecurrencia={globalData.kpis.tasa_recurrencia}
                            tasaChurn={globalData.kpis.tasa_churn}
                            ticketPromedio={convertTicketPromedioToKPI(globalData.kpis.ticket_promedio)}
                            currency={getMetricasVentas().moneda}
                          />
                        </div>
                      </div>
                    </div>
                  ) : ventasData ? (
                    <div className="space-y-4">
                      <Card className="border border-gray-200 bg-gray-50">
                        <CardContent className="p-6">
                          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                            <div className="flex items-start gap-4">
                              <div className="p-3 bg-gray-100 rounded-xl">
                                <Globe className="w-6 h-6 text-gray-800" />
                              </div>
                              <div>
                                <h3 className="text-xl font-bold">Vista Global (Ventas)</h3>
                                <p className="text-gray-600 mt-2">
                                  {sedes.length} sedes activas • Período: {getPeriodDisplay()}
                                </p>
                              </div>
                            </div>
                            {/* <Badge className="bg-gray-900 text-white">Ventas</Badge> */}
                          </div>
                        </CardContent>
                      </Card>

                      <VentasOverview />
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <BarChart3 className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No hay datos globales disponibles</h3>
                      <Button onClick={handleRefresh} className="bg-gray-900 hover:bg-gray-800 text-white">
                        Recargar datos
                      </Button>
                    </div>
                  )
                ) : (
                  // Vista de Sede Específica
                  <div className="space-y-6">
                    {/* Header de sede */}
                    <Card className="border border-gray-200 bg-gray-50">
                      <CardContent className="p-6">
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                          <div className="flex items-start gap-4">
                            <div className="p-3 bg-gray-100 rounded-xl">
                              <Building2 className="w-6 h-6 text-gray-800" />
                            </div>
                            <div>
                              <h3 className="text-xl font-bold">
                                {getSedeNombre(selectedSede, "Sede Desconocida")}
                              </h3>
                              <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-600">
                                <div className="flex items-center gap-1">
                                  <MapPin className="w-4 h-4" />
                                  {getSedeInfo(selectedSede)?.direccion || 'Sin dirección'}
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="font-medium">Tel:</span> {getSedeInfo(selectedSede)?.telefono || 'Sin teléfono'}
                                </div>
                              </div>
                                <p className="text-sm text-gray-500 mt-2">
                                  Período: {getPeriodDisplay()} • Sede: {getSedeNombre(selectedSede)}
                                </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={`${getSedeInfo(selectedSede)?.activa ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                              {getSedeInfo(selectedSede)?.activa ? 'Activa' : 'Inactiva'}
                            </Badge>
                            <Button
                              onClick={() => handleSedeChange("global")}
                              variant="outline"
                              size="sm"
                              className="border-gray-300 text-gray-700"
                            >
                              <Globe className="w-4 h-4 mr-2" />
                              Vista Global
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Mostrar datos de ventas si existen */}
                    {ventasData ? (
                      <>
                        {/* KPIs principales */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                          <Card className="border border-gray-200">
                            <CardHeader className="pb-2">
                              <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                                <DollarSign className="w-4 h-4" />
                                Ventas Totales
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="text-2xl font-bold">
                                {formatCurrency(getMetricasVentas().ventas_totales)}
                              </div>
                              <p className="text-sm text-gray-500 mt-2">
                                {getMetricasVentas().cantidad_ventas || 0} transacciones
                              </p>
                            </CardContent>
                          </Card>

                          <Card className="border border-gray-200">
                            <CardHeader className="pb-2">
                              <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                                <Receipt className="w-4 h-4" />
                                Transacciones
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="text-2xl font-bold">
                                {getMetricasVentas().cantidad_ventas || 0}
                              </div>
                              <p className="text-sm text-gray-500 mt-2">
                                Ticket promedio: {formatCurrency(getMetricasVentas().ticket_promedio || 0)}
                              </p>
                            </CardContent>
                          </Card>

                          <Card className="border border-gray-200">
                            <CardHeader className="pb-2">
                              <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                                <Users className="w-4 h-4" />
                                Servicios
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="text-2xl font-bold">
                                {formatCurrency(getMetricasVentas().ventas_servicios)}
                              </div>
                              <p className="text-sm text-gray-500 mt-2">
                                {getMetricasVentas().ventas_servicios > 0 && getMetricasVentas().ventas_totales > 0
                                  ? `${Math.round((getMetricasVentas().ventas_servicios / getMetricasVentas().ventas_totales) * 100)}% del total`
                                  : 'Sin datos'}
                              </p>
                            </CardContent>
                          </Card>

                          <Card className="border border-gray-200">
                            <CardHeader className="pb-2">
                              <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                                <Package className="w-4 h-4" />
                                Productos
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="text-2xl font-bold">
                                {formatCurrency(getMetricasVentas().ventas_productos)}
                              </div>
                              <p className="text-sm text-gray-500 mt-2">
                                {getMetricasVentas().ventas_productos > 0 && getMetricasVentas().ventas_totales > 0
                                  ? `${Math.round((getMetricasVentas().ventas_productos / getMetricasVentas().ventas_totales) * 100)}% del total`
                                  : 'Sin datos'}
                              </p>
                            </CardContent>
                          </Card>
                        </div>

                        {/* Main Dashboard Grid con gráficos */}
                        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                          {/* Left Column */}
                          <div className="flex flex-col gap-6">
                            <SalesChart
                              salesData={getSalesChartData()}
                              formatCurrency={formatCurrencyShort}
                              title="Ventas Semanales"
                            />

                            <SalesDonutChart
                              donutData={getDonutData()}
                              formatCurrency={formatCurrency}
                              title="Distribución de Ventas"
                            />
                          </div>

                          {/* Right Column */}
                          <div className="flex flex-col gap-6">
                            {/* Métodos de Pago */}
                            <Card className="border border-gray-200">
                              <CardHeader className="p-4 pb-2">
                                <CardTitle className="text-sm font-medium text-gray-900 flex items-center gap-2">
                                  <CreditCard className="w-4 h-4" />
                                  Métodos de Pago
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="p-4 pt-2">
                                <div className="grid grid-cols-2 gap-3">
                                  {getPaymentMethodData().map((method, index) => (
                                    <div key={index} className="flex flex-col items-center justify-center p-3 bg-gray-50 rounded-lg border border-gray-200">
                                      <div
                                        className="w-3 h-3 rounded-full mb-1"
                                        style={{ backgroundColor: method.color }}
                                      />
                                      <span className="text-xs font-medium">{method.name}</span>
                                      <span className="text-sm font-bold mt-1">
                                        {formatCurrency(method.value)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </CardContent>
                            </Card>

                            {/* Información de Clientes (si hay datos de analytics) */}
                            {dashboardData && (
                              <>
                                <ClientIndicators
                                  nuevosClientes={dashboardData.kpis.nuevos_clientes}
                                  tasaRecurrencia={dashboardData.kpis.tasa_recurrencia}
                                  tasaChurn={dashboardData.kpis.tasa_churn}
                                  ticketPromedio={convertTicketPromedioToKPI(dashboardData.kpis.ticket_promedio)}
                                  currency={getMetricasVentas().moneda}
                                />

                                {/* Churn Card */}
                                <Card className="border border-gray-200">
                                  <CardHeader className="p-4 pb-2">
                                    <div className="flex items-center justify-between">
                                      <CardTitle className="text-sm font-medium text-gray-900">Clientes en Riesgo (Churn)</CardTitle>
                                      <Badge className="bg-gray-100 text-gray-800 border border-gray-300">
                                        {dashboardData.churn_actual || 0} detectados
                                      </Badge>
                                    </div>
                                  </CardHeader>
                                  <CardContent className="p-4 pt-2">
                                    <div className="space-y-2">
                                      {churnData.length > 0 ? (
                                        <>
                                          {churnData.slice(0, 3).map((cliente, index) => (
                                            <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded border border-gray-200">
                                              <div className="flex items-center gap-2">
                                                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 border border-gray-300">
                                                  <Users className="w-3 h-3 text-gray-700" />
                                                </div>
                                                <div>
                                                  <span className="text-sm font-medium">{cliente.nombre}</span>
                                                  <div className="text-xs text-gray-500">{cliente.dias_inactivo} días inactivo</div>
                                                </div>
                                              </div>
                                              <Badge className={
                                                cliente.dias_inactivo > 90 ? 'bg-red-100 text-red-800' :
                                                  cliente.dias_inactivo > 60 ? 'bg-yellow-100 text-yellow-800' :
                                                    'bg-gray-100 text-gray-800'
                                              }>
                                                {cliente.dias_inactivo > 90 ? 'Alto' :
                                                  cliente.dias_inactivo > 60 ? 'Medio' : 'Bajo'}
                                              </Badge>
                                            </div>
                                          ))}
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="w-full text-sm text-gray-600"
                                            onClick={() => setShowChurnList(true)}
                                          >
                                            <ChevronDown className="w-4 h-4 mr-2" />
                                            Ver todos ({churnData.length})
                                          </Button>
                                        </>
                                      ) : (dashboardData.churn_actual || 0) > 0 ? (
                                        <div className="text-center py-4 text-gray-500">
                                          Cargando clientes en riesgo...
                                        </div>
                                      ) : (
                                        <div className="text-center py-4 text-gray-500">
                                          No hay clientes en riesgo de churn para este período
                                        </div>
                                      )}
                                    </div>
                                  </CardContent>
                                </Card>
                              </>
                            )}
                          </div>
                        </div>

                      </>
                    ) : dashboardData ? (
                      // Mostrar datos de analytics si no hay datos de ventas
                      <div className="space-y-4">
                        <Card className="border border-gray-200">
                          <CardHeader>
                            <CardTitle className="text-lg font-semibold">Datos de Analytics</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              <div className="text-center">
                                <div className="text-2xl font-bold text-gray-900">
                                  {typeof dashboardData.kpis.nuevos_clientes.valor === 'number'
                                    ? dashboardData.kpis.nuevos_clientes.valor
                                    : extractNumericValue(dashboardData.kpis.nuevos_clientes.valor as string)}
                                </div>
                                <p className="text-sm text-gray-600">Nuevos Clientes</p>
                              </div>
                              <div className="text-center">
                                <div className="text-2xl font-bold text-gray-900">
                                  {dashboardData.kpis.tasa_recurrencia.valor}
                                </div>
                                <p className="text-sm text-gray-600">Tasa Recurrencia</p>
                              </div>
                              <div className="text-center">
                                <div className="text-2xl font-bold text-gray-900">
                                  {dashboardData.kpis.tasa_churn.valor}
                                </div>
                                <p className="text-sm text-gray-600">Tasa Churn</p>
                              </div>
                              <div className="text-center">
                                <div className="text-2xl font-bold text-gray-900">
                                  {dashboardData.kpis.ticket_promedio.valor
                                    ? formatCurrency(dashboardData.kpis.ticket_promedio.valor)
                                    : formatCurrency(0)}
                                </div>
                                <p className="text-sm text-gray-600">Ticket Promedio</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    ) : (
                      <div className="text-center py-12">
                        <AlertCircle className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">No hay datos disponibles</h3>
                        <p className="text-gray-500 mb-4">
                          No se pudieron cargar datos para esta sede.
                        </p>
                        <Button onClick={handleRefresh} className="bg-gray-900 hover:bg-gray-800 text-white mt-4">
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Reintentar
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="sedes" className="m-0">
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="p-4">
                      <CardTitle className="text-lg font-bold">Sedes</CardTitle>
                      <div className="relative mt-2">
                        <input
                          type="text"
                          placeholder="Buscar sede..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                        />
                        <Building2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      </div>
                    </CardHeader>
                    <CardContent className="p-4">
                      {loadingSedes ? (
                        <div className="text-center py-12">
                          <div className="w-10 h-10 border-3 border-gray-200 border-t-gray-900 rounded-full animate-spin mx-auto mb-4" />
                          <p className="text-gray-600">Cargando sedes...</p>
                        </div>
                      ) : filteredSedes.length === 0 ? (
                        <div className="text-center py-12">
                          <Building2 className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                          <p className="text-gray-600">No se encontraron sedes</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {filteredSedes.map((sede) => (
                            <Card
                              key={sede._id}
                              className={`border cursor-pointer transition-colors hover:border-gray-400 ${selectedSede === sede.sede_id
                                  ? 'border-gray-900 bg-gray-50'
                                  : 'border-gray-200'
                                }`}
                              onClick={() => {
                                handleSedeChange(sede.sede_id);
                                setActiveTab("dashboard");
                              }}
                            >
                              <CardContent className="p-3">
                                <div className="flex items-start justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <Building2 className="w-4 h-4 text-gray-600" />
                                    <h4 className="font-medium text-gray-900">{formatSedeNombre(sede.nombre)}</h4>
                                  </div>
                                  {sede.activa ? (
                                    <div className="w-2 h-2 rounded-full bg-green-500" />
                                  ) : (
                                    <div className="w-2 h-2 rounded-full bg-gray-300" />
                                  )}
                                </div>
                                  <p className="text-xs text-gray-600 truncate">{sede.direccion}</p>
                                  <p className="text-xs text-gray-600 mt-1">{sede.telefono}</p>
                                  <div className="flex items-center justify-between mt-2">
                                    {selectedSede === sede.sede_id && (
                                      <Badge className="bg-gray-900 text-white text-xs">
                                        Seleccionada
                                      </Badge>
                                    )}
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>

        {/* Churn Modal */}
        {showChurnList && churnData.length > 0 && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg w-full max-w-2xl max-h-[80vh] overflow-hidden border border-gray-200">
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-lg">Clientes en Riesgo - {getSedeNombre(selectedSede)}</h3>
                  <p className="text-sm text-gray-600">
                    {churnData.length} clientes detectados con inactividad
                  </p>
                </div>
                <Button onClick={() => setShowChurnList(false)} variant="ghost" size="sm">
                  Cerrar
                </Button>
              </div>
              <div className="overflow-auto max-h-[60vh] p-4">
                <Table>
                  <TableHeader className="bg-gray-50">
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Contacto</TableHead>
                      <TableHead>Última Visita</TableHead>
                      <TableHead>Días Inactivo</TableHead>
                      <TableHead>Riesgo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {churnData.map((cliente, index) => (
                      <TableRow key={cliente.cliente_id || index} className="hover:bg-gray-50">
                        <TableCell>
                          <div className="font-medium">{cliente.nombre}</div>
                          <div className="text-xs text-gray-500">ID: {cliente.cliente_id}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{cliente.correo}</div>
                          <div className="text-xs text-gray-500">{cliente.telefono}</div>
                        </TableCell>
                        <TableCell>
                          {formatDateDMY(cliente.ultima_visita)}
                        </TableCell>
                        <TableCell>
                          <div className={`font-semibold ${cliente.dias_inactivo > 90 ? 'text-red-600' :
                              cliente.dias_inactivo > 60 ? 'text-yellow-600' : 'text-gray-600'
                            }`}>
                            {cliente.dias_inactivo} días
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={
                            cliente.dias_inactivo > 90 ? 'bg-red-100 text-red-800 border-red-200' :
                              cliente.dias_inactivo > 60 ? 'bg-yellow-100 text-yellow-800 border-yellow-200' :
                                'bg-gray-100 text-gray-800 border-gray-200'
                          }>
                            {cliente.dias_inactivo > 90 ? 'Alto' :
                              cliente.dias_inactivo > 60 ? 'Medio' : 'Bajo'}
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
      </main>
    </div>
  );
}
