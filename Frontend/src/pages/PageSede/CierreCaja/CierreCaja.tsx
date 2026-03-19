"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Sidebar } from "../../../components/Layout/Sidebar";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
// import { Textarea } from "../../../components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Calendar, Loader2 } from "lucide-react"; //Wallet +
import { cashService, getEfectivoDia } from "./api/cashService";
import type { CashCierre, CashEgreso, CashIngreso, CashResumen, CashReporteRaw } from "./types";
import { formatDateDMY, parseDateToDate, toBackendDate } from "../../../lib/dateFormat";
import { toast } from "../../../hooks/use-toast";
import { useAuth } from "../../../components/Auth/AuthContext";
import {
  CASH_EXPENSE_TYPE_OPTIONS,
  CASH_INCOME_TYPE_OPTIONS,
  CASH_PAYMENT_METHOD_OPTIONS,
  DEFAULT_CASH_EXPENSE_TYPE,
  DEFAULT_CASH_INCOME_TYPE,
  DEFAULT_CASH_PAYMENT_METHOD,
  getCashMovementTypeLabel,
  getCashPaymentMethodLabel,
} from "./constants";

const toLocalDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getToday = () => toLocalDateString(new Date());

type HeaderPeriod = "today" | "last_7_days" | "last_30_days" | "month" | "custom";

interface HeaderDateRange {
  start_date: string;
  end_date: string;
}

const HEADER_PERIOD_OPTIONS: Array<{ id: HeaderPeriod; label: string }> = [
  { id: "today", label: "Hoy" },
  { id: "last_7_days", label: "7 días" },
  { id: "last_30_days", label: "30 días" },
  { id: "month", label: "Mes actual" },
  { id: "custom", label: "Rango personalizado" },
];

const getRangeByPeriod = (period: HeaderPeriod, customRange?: HeaderDateRange): HeaderDateRange => {
  const today = new Date();
  const todayYmd = toLocalDateString(today);

  if (period === "custom" && customRange?.start_date && customRange?.end_date) {
    return {
      start_date: customRange.start_date,
      end_date: customRange.end_date,
    };
  }

  if (period === "last_7_days") {
    const start = new Date(today);
    start.setDate(start.getDate() - 6);
    return { start_date: toLocalDateString(start), end_date: todayYmd };
  }

  if (period === "last_30_days") {
    const start = new Date(today);
    start.setDate(start.getDate() - 29);
    return { start_date: toLocalDateString(start), end_date: todayYmd };
  }

  if (period === "month") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { start_date: toLocalDateString(start), end_date: todayYmd };
  }

  return { start_date: todayYmd, end_date: todayYmd };
};

const normalizeDateRange = (start?: string, end?: string) => {
  if (!start || !end) return { start, end };
  if (start > end) {
    return { start: end, end: start };
  }
  return { start, end };
};

const toNumber = (value: any): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const normalized = value.replace(/[^0-9.-]/g, "");
    const parsed = Number(normalized);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

const pickNumber = (source: any, keys: string[]): number | undefined => {
  if (!source) return undefined;
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) {
      return toNumber(source[key]);
    }
  }
  return undefined;
};

const unwrapData = (data: any) => data?.data ?? data?.result ?? data;
const pickArray = (...candidates: any[]): any[] => {
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
};

const formatDate = (dateString?: string) => formatDateDMY(dateString);
const hasClockTime = (value?: string) => {
  if (!value) return false;
  return /\d{2}:\d{2}/.test(value);
};

const parseBackendDateTime = (value?: string | number | Date): Date | null => {
  if (value === undefined || value === null || value === "") return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const normalized = raw.includes(" ") ? raw.replace(" ", "T") : raw;
  const hasTime = hasClockTime(normalized);
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  const candidate = hasTime && !hasTimezone ? `${normalized}Z` : normalized;

  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatTimeLabel = (value?: string) => {
  const parsed = parseBackendDateTime(value);
  if (!parsed) return "--";
  return parsed
    .toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .toUpperCase();
};

const formatTableTime = (value?: string) => {
  const parsed = parseBackendDateTime(value);
  if (!parsed) return "--";

  const hours = String(parsed.getHours()).padStart(2, "0");
  const minutes = String(parsed.getMinutes()).padStart(2, "0");
  return `${hours}.${minutes}`;
};

const formatHeaderDate = (value?: string) => {
  if (!value) return "--";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return formatDate(value);

  const monthIndex = Number(month) - 1;
  const baseDate = new Date(Number(year), monthIndex, Number(day));
  if (Number.isNaN(baseDate.getTime())) return formatDate(value);

  const monthName = baseDate.toLocaleDateString("es-CO", { month: "long" });
  const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
  return `${day} ${capitalizedMonth} ${year}`;
};

const normalizePaymentMethod = (value?: string) => getCashPaymentMethodLabel(value);

const normalizePaymentMethodKey = (value?: string) => {
  return String(value || "otros")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
};

const toTimestamp = (value?: string) => {
  const parsed = parseBackendDateTime(value);
  if (!parsed) return 0;
  return parsed.getTime();
};

const toComparableDate = (value?: string) => {
  const parsed = parseDateToDate(value);
  return parsed ? toLocalDateString(parsed) : "";
};

const isWithinDateRange = (value: string | undefined, start: string, end: string) => {
  const comparable = toComparableDate(value);
  if (!comparable) return false;
  return comparable >= start && comparable <= end;
};

const buildRangeVariants = (start: string, end: string) => {
  const legacyStart = toBackendDate(start);
  const legacyEnd = toBackendDate(end);
  const variants: Array<{
    params: { fecha_inicio: string; fecha_fin: string };
    options?: { preserveDateParams?: boolean };
  }> = [
    {
      params: {
        fecha_inicio: start,
        fecha_fin: end,
      },
      options: { preserveDateParams: true },
    },
  ];

  if (legacyStart !== start || legacyEnd !== end) {
    variants.push({
      params: {
        fecha_inicio: legacyStart,
        fecha_fin: legacyEnd,
      },
    });
  }

  return variants;
};

const mergeCashRecords = <T extends { id: string; fecha?: string; creado_en?: string }>(records: T[]) => {
  const deduplicated = new Map<string, T>();

  for (const record of records) {
    const key = String(record.id);
    const current = deduplicated.get(key);
    if (!current) {
      deduplicated.set(key, record);
      continue;
    }

    const currentTimestamp = toTimestamp(current.creado_en || current.fecha);
    const nextTimestamp = toTimestamp(record.creado_en || record.fecha);
    if (nextTimestamp >= currentTimestamp) {
      deduplicated.set(key, record);
    }
  }

  return Array.from(deduplicated.values()).sort((a, b) => {
    return toTimestamp(b.creado_en || b.fecha) - toTimestamp(a.creado_en || a.fecha);
  });
};

export default function CierreCajaPage() {
  const { user } = useAuth();
  const [moneda, setMoneda] = useState("COP");
  const [sedeId, setSedeId] = useState<string | null>(null);
  const [sedeNombre, setSedeNombre] = useState<string | null>(null);
  const monedaSede = String(moneda || "COP").toUpperCase();

  const today = useMemo(() => getToday(), []);
  const [periodoSeleccionado, setPeriodoSeleccionado] = useState<HeaderPeriod>("today");
  const [fechaDesde, setFechaDesde] = useState(today);
  const [fechaHasta, setFechaHasta] = useState(today);
  const [showDateModal, setShowDateModal] = useState(false);
  const [tempDateRange, setTempDateRange] = useState<HeaderDateRange>({
    start_date: today,
    end_date: today,
  });

  const [resumen, setResumen] = useState<CashResumen>({
    ingresos: 0,
    egresos: 0,
    balance: 0,
    moneda: "COP",
  });
  const [ingresos, setIngresos] = useState<CashIngreso[]>([]);
  const [egresos, setEgresos] = useState<CashEgreso[]>([]);
  const [cierres, setCierres] = useState<CashCierre[]>([]);

  const [loadingResumen, setLoadingResumen] = useState(false);
  const [loadingIngresos, setLoadingIngresos] = useState(false);
  const [loadingEgresos, setLoadingEgresos] = useState(false);
  const [loadingCierres, setLoadingCierres] = useState(false);
  const [loadingAction, setLoadingAction] = useState(false);
  const [activeAction, setActiveAction] = useState<"ingreso" | "egreso" | "apertura" | "cierre" | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [reportePeriodo, setReportePeriodo] = useState<CashReporteRaw | null>(null);
  const [descargandoReporte, setDescargandoReporte] = useState(false);

  // Form states
  const [ingresoMonto, setIngresoMonto] = useState("");
  const [ingresoMetodoPago, setIngresoMetodoPago] = useState<string>(DEFAULT_CASH_PAYMENT_METHOD);
  const [ingresoTipo, setIngresoTipo] = useState<string>(DEFAULT_CASH_INCOME_TYPE);
  const [ingresoMotivo, setIngresoMotivo] = useState("");
  const [ingresoFecha, setIngresoFecha] = useState(getToday());

  const [egresoMonto, setEgresoMonto] = useState("");
  const [egresoMotivo, setEgresoMotivo] = useState("");
  const [egresoFecha, setEgresoFecha] = useState(getToday());
  const [egresoMetodoPago, setEgresoMetodoPago] = useState<string>(DEFAULT_CASH_PAYMENT_METHOD);
  const [egresoTipo, setEgresoTipo] = useState<string>(DEFAULT_CASH_EXPENSE_TYPE);

  const [efectivoEnCaja, setEfectivoEnCaja] = useState<number | null>(null);
  const [loadingEfectivoEnCaja, setLoadingEfectivoEnCaja] = useState(false);

  const [aperturaMonto, setAperturaMonto] = useState("");
  const [aperturaNota, setAperturaNota] = useState("");
  const [aperturaFecha, setAperturaFecha] = useState(getToday());

  const [cierreNota, setCierreNota] = useState("");
  const [cierreFecha, setCierreFecha] = useState(getToday());
  const [cierreEfectivoContado, setCierreEfectivoContado] = useState("");

  useEffect(() => {
    const resolvedSedeId = String(
      user?.sede_id ||
        sessionStorage.getItem("beaux-sede_id") ||
        localStorage.getItem("beaux-sede_id") ||
        ""
    ).trim();
    const resolvedSedeNombre = String(
      user?.nombre_local ||
        sessionStorage.getItem("beaux-nombre_local") ||
        localStorage.getItem("beaux-nombre_local") ||
        ""
    ).trim();
    const resolvedMoneda = String(
      user?.moneda ||
        sessionStorage.getItem("beaux-moneda") ||
        localStorage.getItem("beaux-moneda") ||
        "COP"
    ).trim();

    setSedeId(resolvedSedeId || null);
    setSedeNombre(resolvedSedeNombre || null);
    setMoneda((resolvedMoneda || "COP").toUpperCase());
  }, [user?.sede_id, user?.nombre_local, user?.moneda]);

  const handlePeriodChange = (newPeriod: HeaderPeriod) => {
    if (newPeriod === "custom") {
      setTempDateRange({
        start_date: fechaDesde || today,
        end_date: fechaHasta || today,
      });
      setShowDateModal(true);
      return;
    }

    const range = getRangeByPeriod(newPeriod);
    const normalized = normalizeDateRange(range.start_date, range.end_date);
    if (!normalized.start || !normalized.end) return;

    setPeriodoSeleccionado(newPeriod);
    setFechaDesde(normalized.start);
    setFechaHasta(normalized.end);
  };

  const setQuickDateRange = (days: number) => {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - (days - 1));
    setTempDateRange({
      start_date: toLocalDateString(startDate),
      end_date: toLocalDateString(endDate),
    });
  };

  const handleApplyDateRange = () => {
    const normalized = normalizeDateRange(tempDateRange.start_date, tempDateRange.end_date);
    if (!normalized.start || !normalized.end) return;

    setPeriodoSeleccionado("custom");
    setFechaDesde(normalized.start);
    setFechaHasta(normalized.end);
    setShowDateModal(false);
  };

  const displayDateRange = useMemo(() => {
    if (!fechaDesde || !fechaHasta) return "--";
    if (fechaDesde === fechaHasta) return formatHeaderDate(fechaHasta);
    return `${formatDate(fechaDesde)} - ${formatDate(fechaHasta)}`;
  }, [fechaDesde, fechaHasta]);

  const egresosTotal = useMemo(() => {
    return egresos.reduce((sum, egreso) => sum + (egreso.monto || 0), 0);
  }, [egresos]);

  const cierreDiferencia = useMemo(() => {
    if (efectivoEnCaja === null || !cierreEfectivoContado.trim()) {
      return null;
    }

    const contado = toNumber(cierreEfectivoContado);
    if (Number.isNaN(contado)) {
      return null;
    }

    return Number((contado - efectivoEnCaja).toFixed(2));
  }, [cierreEfectivoContado, efectivoEnCaja]);

  const formatMoney = (value: number) => {
    const locale = monedaSede === "USD" ? "en-US" : monedaSede === "MXN" ? "es-MX" : "es-CO";
    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: monedaSede,
        minimumFractionDigits: 0,
      }).format(value);
    } catch (error) {
      return `${monedaSede} ${value.toFixed(0)}`;
    }
  };

  const normalizeResumen = (data: CashReporteRaw): CashResumen => {
    const root = unwrapData(data) || {};
    const summary = root?.resumen ?? root?.summary ?? root;
    const periodTotals = root?.totales;

    const ingresos =
      pickNumber(periodTotals, ["ingresos", "total_ingresos", "ventas", "total_ventas"]) ??
      pickNumber(root?.ingresos_efectivo, ["total"]) ??
      pickNumber(summary, [
        "ingresos_total",
        "total_ingresos",
        "ventas_totales",
        "total_ventas",
        "ingresos",
        "efectivo_total",
        "efectivo_dia",
        "total",
      ]) ?? 0;

    const egresos =
      pickNumber(periodTotals, ["egresos", "total_egresos"]) ??
      pickNumber(root?.egresos, ["total"]) ??
      pickNumber(summary, [
        "egresos_total",
        "total_egresos",
        "egresos",
        "gastos",
      ]) ?? 0;

    const balance =
      pickNumber(periodTotals, ["neto", "balance", "saldo"]) ??
      pickNumber(summary, ["balance", "saldo", "neto", "total_balance"]) ??
      (ingresos - egresos);

    return {
      ingresos,
      egresos,
      balance,
      moneda: summary?.moneda ?? root?.moneda ?? monedaSede,
    };
  };

  const normalizeEgresos = (data: any): CashEgreso[] => {
    const root = unwrapData(data);
    const lista = pickArray(
      root?.egresos,
      root?.items,
      root?.data,
      root?.results,
      root?.rows,
      root?.movimientos,
      root?.egresos?.items,
      root?.egresos?.data,
      root?.data?.egresos,
      root
    );

    return lista.map((item, index) => {
      return {
        id: item._id || item.id || item.egreso_id || String(index),
        sede_id: item.sede_id,
        monto: toNumber(item.monto ?? item.valor ?? item.total ?? item.importe ?? 0),
        motivo:
          item.motivo ??
          item.nota ??
          item.descripcion ??
          item.concepto ??
          item.observacion ??
          "Sin motivo",
        concepto: item.concepto ?? item.descripcion ?? item.motivo ?? item.nota,
        tipo: item.tipo ?? item.tipo_movimiento,
        metodo_pago: item.metodo_pago ?? item.medio_pago ?? item.medio ?? "efectivo",
        fecha:
          item.fecha ??
          item.created_at ??
          item.creado_en ??
          item.fecha_creacion ??
          item.fecha_egreso ??
          getToday(),
        creado_en: item.creado_en ?? item.created_at ?? item.fecha_creacion,
      };
    });
  };

  const formatSignedMoney = (value: number) => {
    if (value < 0) return `-${formatMoney(Math.abs(value))}`;
    return formatMoney(value);
  };

  const formatTrendMoney = (value: number) => {
    if (value > 0) return `↑ ${formatMoney(value)}`;
    if (value < 0) return `↓ ${formatMoney(Math.abs(value))}`;
    return formatMoney(0);
  };

  const normalizeIngresos = (data: any): CashIngreso[] => {
    const root = unwrapData(data);
    const lista = pickArray(
      root?.ingresos,
      root?.items,
      root?.data,
      root?.results,
      root?.rows,
      root?.movimientos,
      root?.ingresos?.items,
      root?.ingresos?.data,
      root?.data?.ingresos,
      root
    );

    return lista.map((item, index) => {
      return {
        id: item._id || item.id || item.ingreso_id || String(index),
        sede_id: item.sede_id,
        monto: toNumber(item.monto ?? item.valor ?? item.total ?? item.importe ?? 0),
        motivo:
          item.motivo ??
          item.descripcion ??
          item.concepto ??
          item.nota ??
          item.observacion ??
          "Ingreso manual",
        tipo: item.tipo ?? item.tipo_movimiento ?? item.categoria ?? "otro",
        metodo_pago: item.metodo_pago ?? item.metodo ?? item.medio_pago ?? item.medio ?? "otros",
        fecha:
          item.fecha ??
          item.created_at ??
          item.creado_en ??
          item.fecha_creacion ??
          item.fecha_ingreso ??
          getToday(),
        creado_en: item.creado_en ?? item.created_at ?? item.fecha_creacion,
      };
    });
  };

  const normalizeCierres = (data: any): CashCierre[] => {
    const root = unwrapData(data);
    const lista =
      root?.cierres ?? root?.items ?? root?.data ?? (Array.isArray(root) ? root : []);

    if (!Array.isArray(lista)) return [];

    return lista.map((item, index) => {
      const ingresos = toNumber(
        item.ingresos_total ?? item.total_ingresos ?? item.ventas_totales ?? item.ingresos ?? 0
      );
      const egresos = toNumber(
        item.egresos_total ?? item.total_egresos ?? item.egresos ?? item.gastos ?? 0
      );

      return {
        id: item._id || item.id || item.cierre_id || String(index),
        sede_id: item.sede_id,
        fecha_apertura: item.fecha_apertura ?? item.apertura ?? item.fecha_inicio ?? item.fecha,
        fecha_cierre: item.fecha_cierre ?? item.cierre ?? item.fecha_fin ?? item.fecha,
        ingresos,
        egresos,
        balance: toNumber(item.balance ?? item.saldo ?? ingresos - egresos),
        notas: item.notas ?? item.observaciones ?? item.nota,
        estado: item.estado ?? item.status,
      };
    });
  };

  const normalizeEfectivoEnCaja = (data: any): number => {
    const root = unwrapData(data) || {};
    const dataNode = unwrapData(root?.data) || root?.data;
    const resultNode = unwrapData(root?.result) || root?.result;
    const resumenNode = unwrapData(root?.resumen) || root?.resumen;
    const efectivoCalculado =
      toNumber(root?.efectivo_inicial) +
      toNumber(root?.ingresos_efectivo?.total) -
      toNumber(root?.egresos?.total);

    const efectivo =
      pickNumber(root, [
        "efectivo",
        "efectivo_esperado",
        "efectivo_total",
        "efectivo_en_caja",
        "saldo",
      ]) ??
      pickNumber(resumenNode, [
        "efectivo",
        "efectivo_esperado",
        "efectivo_total",
        "efectivo_en_caja",
        "saldo",
      ]) ??
      pickNumber(dataNode, [
        "efectivo",
        "efectivo_esperado",
        "efectivo_total",
        "efectivo_en_caja",
        "saldo",
      ]) ??
      pickNumber(resultNode, [
        "efectivo",
        "efectivo_esperado",
        "efectivo_total",
        "efectivo_en_caja",
        "saldo",
      ]) ??
      efectivoCalculado ??
      0;

    return toNumber(efectivo);
  };

  const loadEfectivoEnCaja = useCallback(async () => {
    if (!sedeId) return;

    const token = String(
      user?.access_token ||
        user?.token ||
        sessionStorage.getItem("access_token") ||
        localStorage.getItem("access_token") ||
        ""
    ).trim();
    if (!token) {
      setEfectivoEnCaja(null);
      return;
    }

    setLoadingEfectivoEnCaja(true);

    try {
      const data = await getEfectivoDia(token, {
        sede_id: sedeId,
        fecha: cierreFecha,
      });
      const efectivo = normalizeEfectivoEnCaja(data);
      setEfectivoEnCaja(efectivo);
    } catch {
      setEfectivoEnCaja(null);
    } finally {
      setLoadingEfectivoEnCaja(false);
    }
  }, [cierreFecha, sedeId, user?.access_token, user?.token]);

  const loadResumen = async () => {
    if (!sedeId) return;
    const { start, end } = normalizeDateRange(fechaDesde, fechaHasta);
    if (!start || !end) return;
    setLoadingResumen(true);
    setError(null);

    try {
      const reporte = await cashService.getReportePeriodo({
        sede_id: sedeId,
        fecha_inicio: start,
        fecha_fin: end,
      });
      setResumen(normalizeResumen(reporte));
      setReportePeriodo(reporte);
    } catch (err) {
      if (start === end) {
        try {
          const efectivo = await cashService.getEfectivoDia({
            sede_id: sedeId,
            fecha: start,
          });
          setResumen(normalizeResumen(efectivo));
          setReportePeriodo(null);
        } catch (innerErr) {
          setResumen({ ingresos: 0, egresos: 0, balance: 0, moneda: monedaSede });
          setReportePeriodo(null);
          setError("No se pudieron cargar los ingresos del período");
        }
      } else {
        setResumen({ ingresos: 0, egresos: 0, balance: 0, moneda: monedaSede });
        setReportePeriodo(null);
        setError("No se pudieron cargar los ingresos del período");
      }
    } finally {
      setLoadingResumen(false);
    }
  };

  const loadEgresos = async () => {
    if (!sedeId) return;
    const { start, end } = normalizeDateRange(fechaDesde, fechaHasta);
    if (!start || !end) return;
    setLoadingEgresos(true);
    setError(null);

    try {
      const responses = await Promise.allSettled(
        buildRangeVariants(start, end).map(({ params, options }) =>
          cashService.getEgresos(
            {
              sede_id: sedeId,
              ...params,
            },
            options
          )
        )
      );

      const successful = responses.flatMap((response) => {
        return response.status === "fulfilled" ? normalizeEgresos(response.value) : [];
      });

      if (successful.length === 0 && responses.every((response) => response.status === "rejected")) {
        throw new Error("No se pudieron cargar los egresos");
      }

      const egresosNormalizados = mergeCashRecords(successful).filter((egreso) =>
        isWithinDateRange(egreso.fecha || egreso.creado_en, start, end)
      );
      setEgresos(egresosNormalizados);
    } catch (err) {
      setEgresos([]);
      setError("No se pudieron cargar los egresos");
    } finally {
      setLoadingEgresos(false);
    }
  };

  const loadIngresos = async () => {
    if (!sedeId) return;
    const { start, end } = normalizeDateRange(fechaDesde, fechaHasta);
    if (!start || !end) return;
    setLoadingIngresos(true);
    setError(null);

    try {
      const responses = await Promise.allSettled(
        buildRangeVariants(start, end).map(({ params, options }) =>
          cashService.getIngresos(
            {
              sede_id: sedeId,
              ...params,
            },
            options
          )
        )
      );

      const successful = responses.flatMap((response) => {
        return response.status === "fulfilled" ? normalizeIngresos(response.value) : [];
      });

      if (successful.length === 0 && responses.every((response) => response.status === "rejected")) {
        throw new Error("No se pudieron cargar los ingresos");
      }

      const ingresosNormalizados = mergeCashRecords(successful).filter((ingreso) =>
        isWithinDateRange(ingreso.fecha || ingreso.creado_en, start, end)
      );
      setIngresos(ingresosNormalizados);
    } catch (err) {
      setIngresos([]);
      setError("No se pudieron cargar los ingresos registrados");
    } finally {
      setLoadingIngresos(false);
    }
  };

  const loadCierres = async () => {
    if (!sedeId) return;
    setLoadingCierres(true);

    try {
      const result = await cashService.getCierres({
        sede_id: sedeId,
      });
      setCierres(normalizeCierres(result));
    } catch (err) {
      setCierres([]);
    } finally {
      setLoadingCierres(false);
    }
  };

  const loadAll = async () => {
    await Promise.all([
      loadResumen(),
      loadIngresos(),
      loadEgresos(),
      loadCierres(),
      loadEfectivoEnCaja(),
    ]);
  };

  useEffect(() => {
    if (sedeId) {
      loadAll();
    }
  }, [sedeId, fechaDesde, fechaHasta]);

  useEffect(() => {
    if (sedeId) {
      loadEfectivoEnCaja();
    }
  }, [sedeId, loadEfectivoEnCaja]);

  const handleCreateIngreso = async () => {
    if (!sedeId) return;

    const montoValue = toNumber(ingresoMonto);
    if (!montoValue || montoValue <= 0) {
      setError("El monto del ingreso debe ser mayor a 0");
      return;
    }

    if (!ingresoMotivo.trim()) {
      setError("El motivo del ingreso es obligatorio");
      return;
    }

    setLoadingAction(true);
    setActiveAction("ingreso");
    setError(null);
    setSuccess(null);

    try {
      await cashService.createIngreso({
        sede_id: sedeId,
        monto: montoValue,
        tipo: ingresoTipo,
        metodo_pago: ingresoMetodoPago,
        motivo: ingresoMotivo.trim(),
        fecha: toBackendDate(ingresoFecha),
        moneda: monedaSede,
      });

      setIngresoMonto("");
      setIngresoMetodoPago(DEFAULT_CASH_PAYMENT_METHOD);
      setIngresoTipo(DEFAULT_CASH_INCOME_TYPE);
      setIngresoMotivo("");
      setIngresoFecha(getToday());
      setSuccess("Ingreso registrado correctamente");
      toast({
        title: "Ingreso registrado",
        description: "El ingreso manual se guardó correctamente.",
      });
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "No se pudo registrar el ingreso");
    } finally {
      setLoadingAction(false);
      setActiveAction(null);
    }
  };

  const handleCreateEgreso = async () => {
    if (!sedeId) return;

    const montoValue = toNumber(egresoMonto);
    const motivo = egresoMotivo.trim();
    if (!montoValue || montoValue <= 0) {
      setError("El monto del egreso debe ser mayor a 0");
      return;
    }

    if (!motivo) {
      setError("El motivo del egreso es obligatorio");
      return;
    }

    setLoadingAction(true);
    setActiveAction("egreso");
    setError(null);
    setSuccess(null);

    try {
      const response = await cashService.createEgreso({
        sede_id: sedeId,
        monto: montoValue,
        valor: montoValue,
        efectivo: montoValue,
        metodo_pago: egresoMetodoPago,
        motivo,
        descripcion: motivo,
        nota: motivo,
        tipo: egresoTipo,
        concepto: motivo,
        fecha: toBackendDate(egresoFecha),
        moneda: monedaSede,
      });

      const egresoRegistradoId = String(
        response?.egreso_id || response?.id || `tmp-egreso-${Date.now()}`
      );

      setEgresos((prev) => {
        const nuevoEgreso: CashEgreso = {
          id: egresoRegistradoId,
          sede_id: sedeId,
          monto: montoValue,
          motivo,
          concepto: motivo,
          tipo: egresoTipo,
          metodo_pago: egresoMetodoPago,
          fecha: egresoFecha,
          creado_en: response?.creado_en || new Date().toISOString(),
        };

        return [nuevoEgreso, ...prev.filter((item) => String(item.id) !== egresoRegistradoId)];
      });

      setEgresoMonto("");
      setEgresoMotivo("");
      setEgresoMetodoPago(DEFAULT_CASH_PAYMENT_METHOD);
      setEgresoTipo(DEFAULT_CASH_EXPENSE_TYPE);
      setSuccess("Egreso registrado correctamente");
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "No se pudo registrar el egreso");
    } finally {
      setLoadingAction(false);
      setActiveAction(null);
    }
  };

  const handleCierreCaja = async () => {
    if (!sedeId) {
      setError("No se encontró la sede actual para cerrar caja");
      return;
    }

    if (efectivoEnCaja === null) {
      setError("No se pudo obtener el efectivo en caja desde backend. Actualiza e intenta de nuevo.");
      return;
    }

    if (!cierreEfectivoContado.trim()) {
      setError("Debes ingresar el efectivo contado para cerrar caja");
      return;
    }

    const efectivoContadoValue = toNumber(cierreEfectivoContado);
    if (Number.isNaN(efectivoContadoValue) || efectivoContadoValue < 0) {
      setError("El efectivo contado debe ser mayor o igual a 0");
      return;
    }

    const diferencia = Number((efectivoContadoValue - efectivoEnCaja).toFixed(2));

    setLoadingAction(true);
    setActiveAction("cierre");
    setError(null);
    setSuccess(null);

    try {
      await cashService.cierreCaja({
        sede_id: sedeId,
        fecha: toBackendDate(cierreFecha),
        moneda: monedaSede,
        observaciones: cierreNota.trim() || undefined,
        efectivo_contado: efectivoContadoValue,
        efectivo_sistema: efectivoEnCaja,
        diferencia,
      });

      setCierreNota("");
      setCierreEfectivoContado("");
      setSuccess("Caja cerrada correctamente");
      toast({
        title: "Cierre realizado",
        description: "La caja se cerró usando el efectivo calculado por backend.",
      });

      await loadAll();
    } catch (err: any) {
      setError(err?.message || "No se pudo cerrar la caja");
    } finally {
      setLoadingAction(false);
      setActiveAction(null);
    }
  };

  const handleApertura = async () => {
    if (!sedeId) {
      setError("No se encontró la sede actual para abrir caja");
      return;
    }

    if (!aperturaFecha) {
      setError("Debes seleccionar la fecha de apertura");
      return;
    }

    const montoValue = toNumber(aperturaMonto);
    if (!montoValue || montoValue <= 0) {
      setError("El monto inicial debe ser mayor a 0");
      return;
    }

    setLoadingAction(true);
    setActiveAction("apertura");
    setError(null);
    setSuccess(null);

    try {
      await cashService.aperturaCaja({
        sede_id: sedeId,
        monto_inicial: montoValue,
        efectivo_inicial: montoValue,
        efectivo: montoValue,
        notas: aperturaNota.trim() || undefined,
        observaciones: aperturaNota.trim() || undefined,
        moneda: monedaSede,
        fecha: toBackendDate(aperturaFecha),
        fecha_apertura: toBackendDate(aperturaFecha),
      });

      setAperturaMonto("");
      setAperturaNota("");
      setAperturaFecha(getToday());
      setSuccess("Caja abierta correctamente");
      toast({
        title: "Caja abierta",
        description: "La apertura de caja se registró correctamente.",
      });

      await loadAll();
    } catch (err: any) {
      setError(err?.message || "No se pudo abrir la caja");
    } finally {
      setLoadingAction(false);
      setActiveAction(null);
    }
  };

  // const handleCierre = async () => {
  //   if (!sedeId) return;

  //   const efectivoContadoValue = toNumber(cierreEfectivoContado);
  //   if (Number.isNaN(efectivoContadoValue) || efectivoContadoValue < 0) {
  //     setError("El efectivo contado debe ser mayor o igual a 0");
  //     return;
  //   }

  //   setLoadingAction(true);
  //   setError(null);
  //   setSuccess(null);

  //   try {
  //     const totalIngresos = resumen.ingresos || 0;
  //     const totalEgresos = resumen.egresos || egresosTotal;
  //     const efectivoEsperado = resumen.balance || balanceCalculado;

  //     await cashService.cierreCaja({
  //       sede_id: sedeId,
  //       fecha: cierreFecha,
  //       notas: cierreNota.trim() || undefined,
  //       observaciones: cierreNota.trim() || undefined,
  //       moneda: monedaSede,
  //       ingresos_total: totalIngresos,
  //       total_ingresos: totalIngresos,
  //       total_ventas: totalIngresos,
  //       efectivo_total: totalIngresos,
  //       efectivo_recibido: totalIngresos,
  //       egresos_total: totalEgresos,
  //       total_egresos: totalEgresos,
  //       balance: efectivoEsperado,
  //       saldo: efectivoEsperado,
  //       efectivo_esperado: efectivoEsperado,
  //       efectivo_cierre: efectivoEsperado,
  //       efectivo_final: efectivoEsperado,
  //       efectivo_contado: efectivoContadoValue,
  //     });

  //     setCierreNota("");
  //     setSuccess("Caja cerrada correctamente");
  //     await loadAll();
  //   } catch (err: any) {
  //     setError(err?.message || "No se pudo cerrar la caja");
  //   } finally {
  //     setLoadingAction(false);
  //   }
  // };

  const abonosTotal = useMemo(() => {
    return ingresos.reduce((sum, ingreso) => {
      const metodo = String(ingreso.metodo_pago || "").toLowerCase();
      return metodo === "abonos" ? sum + (ingreso.monto || 0) : sum;
    }, 0);
  }, [ingresos]);

  type MovimientoDia = {
    id: string;
    tipo: "ingreso" | "egreso";
    etiquetaTipo: string;
    detalle: string;
    medio: string;
    monto: number;
    hora: string;
    timestamp: number;
    orden: number;
  };

  const movimientosDia = useMemo<MovimientoDia[]>(() => {
    const ingresosNormalizados: MovimientoDia[] = ingresos.map((ingreso, index) => {
      const fechaMovimiento = ingreso.creado_en || ingreso.fecha;
      const metodo = String(ingreso.metodo_pago || "").toLowerCase();

      return {
        id: `ingreso-${ingreso.id}`,
        tipo: "ingreso",
        etiquetaTipo:
          metodo === "abonos"
            ? "Abono"
            : getCashMovementTypeLabel("ingreso", ingreso.tipo, "Ingreso manual"),
        detalle: ingreso.motivo || "Ingreso manual",
        medio: normalizePaymentMethod(ingreso.metodo_pago),
        monto: ingreso.monto || 0,
        hora: formatTableTime(fechaMovimiento),
        timestamp: toTimestamp(fechaMovimiento),
        orden: index,
      };
    });

    const egresosNormalizados: MovimientoDia[] = egresos.map((egreso, index) => {
      const fechaMovimiento = egreso.creado_en || egreso.fecha;
      return {
        id: `egreso-${egreso.id}`,
        tipo: "egreso",
        etiquetaTipo: getCashMovementTypeLabel("egreso", egreso.tipo, "Egreso"),
        detalle: egreso.concepto || egreso.motivo || "Egreso",
        medio: normalizePaymentMethod(egreso.metodo_pago),
        monto: -Math.abs(egreso.monto || 0),
        hora: formatTableTime(fechaMovimiento),
        timestamp: toTimestamp(fechaMovimiento),
        orden: index,
      };
    });

    return [...ingresosNormalizados, ...egresosNormalizados].sort((a, b) => {
      const aHasTimestamp = a.timestamp > 0;
      const bHasTimestamp = b.timestamp > 0;

      if (aHasTimestamp && bHasTimestamp && a.timestamp !== b.timestamp) {
        return a.timestamp - b.timestamp;
      }
      if (aHasTimestamp !== bHasTimestamp) {
        return aHasTimestamp ? -1 : 1;
      }
      if (a.orden !== b.orden) {
        return a.orden - b.orden;
      }
      return a.id.localeCompare(b.id);
    });
  }, [egresos, ingresos]);

  const movimientosConSaldo = useMemo(() => {
    let saldoAcumulado = 0;
    return movimientosDia.map((movimiento) => {
      saldoAcumulado = Number((saldoAcumulado + movimiento.monto).toFixed(2));
      return {
        ...movimiento,
        saldo_esperado: saldoAcumulado,
      };
    });
  }, [movimientosDia]);

  const saldosPorMedio = useMemo(() => {
    const reportRoot = unwrapData(reportePeriodo) || {};
    const reportSummary = reportRoot?.resumen ?? reportRoot?.summary ?? reportRoot;
    const reportIngresosEfectivo = reportSummary?.ingresos_efectivo ?? reportRoot?.ingresos_efectivo ?? {};
    const reportOtrosMetodos = reportSummary?.ingresos_otros_metodos ?? reportRoot?.ingresos_otros_metodos ?? {};
    const hasReportMethods =
      reportOtrosMetodos &&
      typeof reportOtrosMetodos === "object" &&
      Object.keys(reportOtrosMetodos).length > 0;

    if (hasReportMethods) {
      const fromReport = (keys: string[]) =>
        keys.reduce((sum, key) => sum + toNumber((reportOtrosMetodos as Record<string, unknown>)[key]), 0);

      const efectivo =
        pickNumber(reportIngresosEfectivo, ["total", "efectivo_total", "total_efectivo"]) ?? 0;
      const tarjetas = fromReport([
        "tarjeta_credito",
        "tarjeta_debito",
        "tarjeta",
        "pos",
      ]);
      const transferencias = fromReport(["transferencia", "link_de_pago"]);
      const creditoEmpleados = fromReport([
        "credito_empleados",
        "abonos",
        "descuento_por_nomina",
        "decuento_por_nomina",
      ]);
      const addi = fromReport(["addi"]);
      const total =
        pickNumber(reportSummary, ["total_vendido", "ventas_totales", "total_ingresos"]) ??
        (efectivo + tarjetas + transferencias + creditoEmpleados + addi);

      return {
        izquierda: [
          { label: "Efectivo", value: efectivo, trend: true },
          { label: "Tarjetas", value: tarjetas, trend: true },
          { label: "Transferencias", value: transferencias, trend: true },
          { label: "Total", value: total, trend: false, total: true },
        ],
        derecha: [
          { label: "Tarjeta", value: tarjetas, trend: true },
          { label: "Transferencias", value: transferencias, trend: true },
          { label: "Crédito empleados", value: creditoEmpleados, trend: false },
          { label: "Addi", value: addi, trend: false },
        ],
      };
    }

    const totales: Record<string, number> = {};
    const accumulate = (method: string | undefined, amount: number) => {
      const key = normalizePaymentMethodKey(method);
      totales[key] = Number(((totales[key] || 0) + amount).toFixed(2));
    };

    for (const ingreso of ingresos) {
      accumulate(ingreso.metodo_pago, ingreso.monto || 0);
    }

    for (const egreso of egresos) {
      accumulate(egreso.metodo_pago, -Math.abs(egreso.monto || 0));
    }

    const sumMethods = (methods: string[]) => {
      return methods.reduce((sum, method) => sum + (totales[normalizePaymentMethodKey(method)] || 0), 0);
    };

    const efectivo = sumMethods(["efectivo"]);
    const tarjetas = sumMethods(["tarjeta_credito", "tarjeta_debito", "tarjeta", "pos"]);
    const transferencias = sumMethods(["transferencia", "link_de_pago"]);
    const creditoEmpleados = sumMethods(["credito_empleados", "abonos"]);
    const addi = sumMethods(["addi"]);
    const total = efectivo + tarjetas + transferencias + creditoEmpleados + addi;

    return {
      izquierda: [
        { label: "Efectivo", value: efectivo, trend: true },
        { label: "Tarjetas", value: tarjetas, trend: true },
        { label: "Transferencias", value: transferencias, trend: true },
        { label: "Total", value: total, trend: false, total: true },
      ],
      derecha: [
        { label: "Tarjeta", value: tarjetas, trend: true },
        { label: "Transferencias", value: transferencias, trend: true },
        { label: "Crédito empleados", value: creditoEmpleados, trend: false },
        { label: "Addi", value: addi, trend: false },
      ],
    };
  }, [egresos, ingresos, reportePeriodo]);

  const reporteResumen = useMemo(() => {
    if (!reportePeriodo) return null;
    const root = unwrapData(reportePeriodo) || {};
    const totales = root?.totales || {};
    const periodo = root?.periodo || {};
    const cierresReporte = Array.isArray(root?.cierres) ? root.cierres : [];

    return {
      inicio: String(periodo?.inicio || fechaDesde || ""),
      fin: String(periodo?.fin || fechaHasta || ""),
      ingresos: toNumber(totales?.ingresos),
      egresos: toNumber(totales?.egresos),
      neto: toNumber(totales?.neto),
      diferencias: toNumber(totales?.diferencias_acumuladas),
      cierres: cierresReporte,
    };
  }, [reportePeriodo, fechaDesde, fechaHasta]);

  const showManualCashForms = true;

  const handleDescargarReporte = async () => {
    if (!sedeId) return;
    const { start, end } = normalizeDateRange(fechaDesde, fechaHasta);
    if (!start || !end) return;

    setDescargandoReporte(true);
    setError(null);

    try {
      const { blob, filename } = await cashService.getReporteExcel({
        sede_id: sedeId,
        fecha_inicio: start,
        fecha_fin: end,
      });
      const blobUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = filename || `reporte_caja_${start}${start !== end ? `_a_${end}` : ""}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(blobUrl);
    } catch (err: any) {
      setError(err?.message || "No se pudo descargar el reporte en Excel");
    } finally {
      setDescargandoReporte(false);
    }
  };

  const cajaAbiertaDesde = useMemo(() => {
    const ultimoCierre = [...cierres].sort((a, b) => {
      const bTime = toTimestamp(b.fecha_apertura || b.fecha_cierre);
      const aTime = toTimestamp(a.fecha_apertura || a.fecha_cierre);
      return bTime - aTime;
    })[0];

    const desdeCierre = formatTimeLabel(ultimoCierre?.fecha_apertura);
    if (desdeCierre !== "--") return desdeCierre;

    const primerMovimiento = [...movimientosDia]
      .filter((movimiento) => movimiento.timestamp > 0)
      .sort((a, b) => a.timestamp - b.timestamp)[0];

    if (!primerMovimiento?.timestamp) return "--";
    return formatTimeLabel(new Date(primerMovimiento.timestamp).toISOString());
  }, [cierres, movimientosDia]);

  const resetIngresoForm = () => {
    setIngresoMonto("");
    setIngresoMetodoPago(DEFAULT_CASH_PAYMENT_METHOD);
    setIngresoTipo(DEFAULT_CASH_INCOME_TYPE);
    setIngresoMotivo("");
    setIngresoFecha(getToday());
    setError(null);
  };

  const resetEgresoForm = () => {
    setEgresoMonto("");
    setEgresoMotivo("");
    setEgresoMetodoPago(DEFAULT_CASH_PAYMENT_METHOD);
    setEgresoTipo(DEFAULT_CASH_EXPENSE_TYPE);
    setEgresoFecha(getToday());
    setError(null);
  };

  const DateRangeModal = () => {
    if (!showDateModal) return null;

    const maxDate = getToday();

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6">
          <div className="mb-6">
            <h3 className="text-xl font-bold text-gray-900">Seleccionar rango de fechas</h3>
            <p className="mt-1 text-gray-700">Elige las fechas para filtrar el cierre de caja</p>
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
                onClick={() => {
                  const endDate = new Date();
                  const firstDayOfMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
                  setTempDateRange({
                    start_date: toLocalDateString(firstDayOfMonth),
                    end_date: toLocalDateString(endDate),
                  });
                }}
              >
                Mes actual
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-800">Fecha de inicio</label>
              <Input
                type="date"
                value={tempDateRange.start_date}
                onChange={(event) => setTempDateRange((prev) => ({ ...prev, start_date: event.target.value }))}
                max={tempDateRange.end_date || maxDate}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-800">Fecha de fin</label>
              <Input
                type="date"
                value={tempDateRange.end_date}
                onChange={(event) => setTempDateRange((prev) => ({ ...prev, end_date: event.target.value }))}
                min={tempDateRange.start_date}
                max={maxDate}
              />
            </div>
          </div>

          <div className="mt-6 rounded-lg border border-gray-300 bg-gray-50 p-4">
            <p className="text-sm text-gray-800">
              <span className="font-medium">Rango seleccionado:</span>{" "}
              {formatDate(tempDateRange.start_date)} - {formatDate(tempDateRange.end_date)}
            </p>
          </div>

          <div className="mt-6 flex gap-3">
            <Button className="flex-1 bg-black text-white hover:bg-gray-800" onClick={handleApplyDateRange}>
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

  return (
    <div className="flex h-screen bg-[#f1eff6]">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-[1360px] p-3 sm:p-6 lg:p-8">
          <div className="space-y-4">
            <DateRangeModal />
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-gray-900">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                {success}
              </div>
            )}

            <section className="space-y-4 rounded-2xl border border-[#d8d4e2] bg-[#f7f5fb] p-4 shadow-sm sm:p-6">
              <div className="space-y-1 border-b border-[#dfdce8] pb-4">
                <h1 className="text-4xl font-semibold tracking-tight text-[#2e2d35]">Cierres de caja</h1>
                <p className="text-xl text-[#656271]">{sedeNombre ? `Caja Sede ${sedeNombre}` : "Caja de la sede"}</p>
              </div>

              <div className="flex flex-col gap-3 border-b border-[#dfdce8] pb-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-gray-600" />
                    <span className="text-sm text-gray-600">Período:</span>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {HEADER_PERIOD_OPTIONS.map((option) => (
                      <Button
                        key={option.id}
                        size="sm"
                        variant={periodoSeleccionado === option.id ? "default" : "outline"}
                        className={`border-gray-300 text-xs ${
                          periodoSeleccionado === option.id
                            ? "bg-black text-white hover:bg-gray-800"
                            : "text-gray-700 hover:bg-gray-100"
                        }`}
                        onClick={() => handlePeriodChange(option.id)}
                      >
                        {option.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-0.5 lg:text-right">
                  <p className="text-lg font-semibold text-[#2e2d35]">{displayDateRange}</p>
                  <p className="text-xs text-[#6d6a77]">Caja abierta desde: {loadingCierres ? "..." : cajaAbiertaDesde}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Card className="border-[#d7d4df] bg-white/80 shadow-[0_1px_2px_rgba(17,24,39,0.06)]">
                  <CardContent className="space-y-2 p-4">
                    <p className="text-sm text-[#656271]">Dinero recibido hoy</p>
                    <p className="text-4xl font-semibold text-[#2e2d35]">
                      {loadingResumen ? "..." : formatMoney(resumen.ingresos || 0)}
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-[#d7d4df] bg-white/80 shadow-[0_1px_2px_rgba(17,24,39,0.06)]">
                  <CardContent className="space-y-2 p-4">
                    <p className="text-sm text-[#656271]">Abonos recibidos</p>
                    <p className="text-4xl font-semibold text-[#2e2d35]">
                      {loadingIngresos ? "..." : formatMoney(abonosTotal)}
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-[#d7d4df] bg-white/80 shadow-[0_1px_2px_rgba(17,24,39,0.06)]">
                  <CardContent className="space-y-2 p-4">
                    <p className="text-sm text-[#656271]">Egresos</p>
                    <p className="text-4xl font-semibold text-[#2e2d35]">
                      {loadingEgresos ? "..." : formatSignedMoney(-Math.abs(resumen.egresos || egresosTotal))}
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-[#d7d4df] bg-white/80 shadow-[0_1px_2px_rgba(17,24,39,0.06)]">
                  <CardContent className="space-y-2 p-4">
                    <p className="text-sm text-[#656271]">Efectivo en caja</p>
                    <p className="text-4xl font-semibold text-[#2e2d35]">
                      {loadingEfectivoEnCaja ? "..." : efectivoEnCaja === null ? "--" : formatMoney(efectivoEnCaja)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Card className="border-[#d7d4df] bg-white/80 shadow-none">
                <CardHeader className="border-b border-[#e3e0ea] pb-3">
                  <CardTitle className="text-2xl font-semibold text-[#2e2d35]">Saldos por medio de pago</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-2 px-4 py-3 md:grid-cols-2 md:gap-4">
                  <div className="space-y-1 md:border-r md:border-[#e3e0ea] md:pr-4">
                    {saldosPorMedio.izquierda.map((item) => (
                      <div
                        key={`left-${item.label}`}
                        className={`flex items-center justify-between gap-3 rounded-md px-2 py-1 ${
                          item.total ? "bg-[#efedf5]" : ""
                        }`}
                      >
                        <span className={`text-[#3c3946] ${item.total ? "text-2xl font-semibold" : "text-xl"}`}>
                          {item.label}
                        </span>
                        <span className={`font-semibold text-[#2e2d35] ${item.total ? "text-3xl" : "text-2xl"}`}>
                          {item.trend ? formatTrendMoney(item.value) : formatMoney(item.value)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-1">
                    {saldosPorMedio.derecha.map((item) => (
                      <div key={`right-${item.label}`} className="flex items-center justify-between gap-3 rounded-md px-2 py-1">
                        <span className="text-xl text-[#3c3946]">{item.label}</span>
                        <span className="text-2xl font-semibold text-[#2e2d35]">
                          {item.trend ? formatTrendMoney(item.value) : formatMoney(item.value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-[#d7d4df] bg-white/80 shadow-none">
                <CardHeader className="border-b border-[#e3e0ea] pb-2">
                  <CardTitle className="text-2xl font-semibold text-[#2e2d35]">Abrir caja</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-3 pt-4 md:grid-cols-5">
                  <div>
                    <label className="text-xs font-medium text-[#666370]">Fecha de apertura</label>
                    <Input type="date" value={aperturaFecha} onChange={(e) => setAperturaFecha(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[#666370]">Monto inicial</label>
                    <Input
                      type="number"
                      min="0"
                      value={aperturaMonto}
                      onChange={(e) => setAperturaMonto(e.target.value)}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs font-medium text-[#666370]">Observaciones (opcional)</label>
                    <Input value={aperturaNota} onChange={(e) => setAperturaNota(e.target.value)} />
                  </div>
                  <div className="flex flex-col justify-end gap-2">
                    <div className="rounded-md border border-[#ddd9e6] bg-[#f2f0f7] p-2 text-xs text-[#4b4857]">
                      El monto inicial se registra como efectivo de apertura.
                    </div>
                    <Button
                      onClick={handleApertura}
                      disabled={loadingAction || !aperturaMonto.trim()}
                      className="w-full bg-[#6b6878] text-white hover:bg-[#5e5b6d]"
                    >
                      {loadingAction && activeAction === "apertura" ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Abriendo caja...
                        </>
                      ) : (
                        "Abrir caja"
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-[#d7d4df] bg-white/80 shadow-none">
                <CardHeader className="border-b border-[#e3e0ea] pb-2">
                  <CardTitle className="text-2xl font-semibold text-[#2e2d35]">Cierre de caja</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-3 pt-4 md:grid-cols-4">
                  <div>
                    <label className="text-xs font-medium text-[#666370]">Fecha de cierre</label>
                    <Input type="date" value={cierreFecha} onChange={(e) => setCierreFecha(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[#666370]">Efectivo contado</label>
                    <Input
                      type="number"
                      min="0"
                      value={cierreEfectivoContado}
                      onChange={(e) => setCierreEfectivoContado(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[#666370]">Observaciones (opcional)</label>
                    <Input value={cierreNota} onChange={(e) => setCierreNota(e.target.value)} />
                  </div>
                  <div className="flex flex-col justify-end gap-2">
                    <div className="rounded-md border border-[#ddd9e6] bg-[#f2f0f7] p-2 text-xs text-[#4b4857]">
                      <div className="flex items-center justify-between">
                        <span>Diferencia</span>
                        <span
                          className={`font-semibold ${
                            cierreDiferencia === null
                              ? "text-[#4b4857]"
                              : cierreDiferencia > 0
                                ? "text-emerald-700"
                                : "text-[#2e2d35]"
                          }`}
                        >
                          {cierreDiferencia === null ? "--" : formatMoney(cierreDiferencia)}
                        </span>
                      </div>
                    </div>
                    <Button
                      onClick={handleCierreCaja}
                      disabled={
                        loadingAction || loadingEfectivoEnCaja || efectivoEnCaja === null || !cierreEfectivoContado.trim()
                      }
                      className="w-full bg-[#6b6878] text-white hover:bg-[#5e5b6d]"
                    >
                      {loadingAction && activeAction === "cierre" ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Cerrando caja...
                        </>
                      ) : (
                        "Cerrar caja"
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {reporteResumen ? (
                <Card className="border-[#d7d4df] bg-white/80 shadow-none">
                  <CardHeader className="border-b border-[#e3e0ea] pb-2">
                    <CardTitle className="text-2xl font-semibold text-[#2e2d35]">Reporte del cierre</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-4">
                    <p className="text-sm text-[#666370]">
                      Período: {formatDate(reporteResumen.inicio)} - {formatDate(reporteResumen.fin)}
                    </p>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-md border border-[#e2deea] bg-[#f3f1f8] p-3">
                        <p className="text-xs text-[#666370]">Ingresos</p>
                        <p className="text-lg font-semibold text-[#2e2d35]">{formatMoney(reporteResumen.ingresos)}</p>
                      </div>
                      <div className="rounded-md border border-[#e2deea] bg-[#f3f1f8] p-3">
                        <p className="text-xs text-[#666370]">Egresos</p>
                        <p className="text-lg font-semibold text-[#2e2d35]">{formatSignedMoney(-Math.abs(reporteResumen.egresos))}</p>
                      </div>
                      <div className="rounded-md border border-[#e2deea] bg-[#f3f1f8] p-3">
                        <p className="text-xs text-[#666370]">Neto</p>
                        <p className="text-lg font-semibold text-[#2e2d35]">{formatMoney(reporteResumen.neto)}</p>
                      </div>
                      <div className="rounded-md border border-[#e2deea] bg-[#f3f1f8] p-3">
                        <p className="text-xs text-[#666370]">Diferencias</p>
                        <p className="text-lg font-semibold text-[#2e2d35]">{formatMoney(reporteResumen.diferencias)}</p>
                      </div>
                    </div>

                    {reporteResumen.cierres.length > 0 ? (
                      <div className="rounded-md border border-[#e2deea] bg-[#f8f7fc] p-3 text-sm text-[#44414f]">
                        Último cierre: {String(reporteResumen.cierres[0]?.cierre_id || "--")} | Estado: {" "}
                        {String(reporteResumen.cierres[0]?.estado || "--")}
                      </div>
                    ) : null}

                    <div className="flex justify-end">
                      <Button
                        type="button"
                        onClick={handleDescargarReporte}
                        disabled={descargandoReporte}
                        className="bg-[#6b6878] text-white hover:bg-[#5e5b6d]"
                      >
                        {descargandoReporte ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Descargando...
                          </>
                        ) : (
                          "Descargar reporte Excel"
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              {showManualCashForms ? (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card className="border-[#d7d4df] bg-white/80 shadow-none">
                  <CardHeader className="border-b border-[#e3e0ea] pb-2">
                    <CardTitle className="text-2xl font-semibold text-[#2e2d35]">Registrar egreso</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-4">
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="text-base text-[#666370]">Concepto</label>
                          <Input
                            value={egresoMotivo}
                            onChange={(e) => {
                              setEgresoMotivo(e.target.value);
                              if (error && e.target.value.trim()) setError(null);
                            }}
                          />
                        </div>
                        <div>
                          <label className="text-base text-[#666370]">Cantidad</label>
                          <Input
                            type="number"
                            min="0"
                            value={egresoMonto}
                            onChange={(e) => setEgresoMonto(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div>
                          <label className="text-xs font-medium text-[#666370]">Método de pago</label>
                          <select
                            value={egresoMetodoPago}
                            onChange={(e) => setEgresoMetodoPago(e.target.value)}
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {CASH_PAYMENT_METHOD_OPTIONS.map((option) => (
                              <option key={`egreso-metodo-${option.value}`} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-[#666370]">Tipo</label>
                          <select
                            value={egresoTipo}
                            onChange={(e) => setEgresoTipo(e.target.value)}
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {CASH_EXPENSE_TYPE_OPTIONS.map((option) => (
                              <option key={`egreso-tipo-${option.value}`} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-[#666370]">Fecha</label>
                          <Input type="date" value={egresoFecha} onChange={(e) => setEgresoFecha(e.target.value)} />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 border-t border-[#e4e1eb] pt-3">
                      <Button variant="outline" onClick={resetEgresoForm} className="min-w-24">
                        Cancelar
                      </Button>
                      <Button
                        onClick={handleCreateEgreso}
                        disabled={loadingAction || !egresoMotivo.trim()}
                        className="min-w-24 bg-[#6b6878] text-white hover:bg-[#5e5b6d]"
                      >
                        Guardar
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-[#d7d4df] bg-white/80 shadow-none">
                  <CardHeader className="border-b border-[#e3e0ea] pb-2">
                    <CardTitle className="text-2xl font-semibold text-[#2e2d35]">Registrar ingreso manual</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-4">
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="text-base text-[#666370]">Concepto</label>
                          <Input
                            value={ingresoMotivo}
                            onChange={(e) => {
                              setIngresoMotivo(e.target.value);
                              if (error && e.target.value.trim()) setError(null);
                            }}
                          />
                        </div>
                        <div>
                          <label className="text-base text-[#666370]">Cantidad</label>
                          <Input
                            type="number"
                            min="0"
                            value={ingresoMonto}
                            onChange={(e) => setIngresoMonto(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div>
                          <label className="text-xs font-medium text-[#666370]">Método de pago</label>
                          <select
                            value={ingresoMetodoPago}
                            onChange={(e) => setIngresoMetodoPago(e.target.value)}
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {CASH_PAYMENT_METHOD_OPTIONS.map((option) => (
                              <option key={`ingreso-metodo-${option.value}`} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-[#666370]">Tipo</label>
                          <select
                            value={ingresoTipo}
                            onChange={(e) => setIngresoTipo(e.target.value)}
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {CASH_INCOME_TYPE_OPTIONS.map((option) => (
                              <option key={`ingreso-tipo-${option.value}`} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-[#666370]">Fecha</label>
                          <Input type="date" value={ingresoFecha} onChange={(e) => setIngresoFecha(e.target.value)} />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 border-t border-[#e4e1eb] pt-3">
                      <Button variant="outline" onClick={resetIngresoForm} className="min-w-24">
                        Cancelar
                      </Button>
                      <Button
                        onClick={handleCreateIngreso}
                        disabled={loadingAction}
                        className="min-w-24 bg-[#6b6878] text-white hover:bg-[#5e5b6d]"
                      >
                        Guardar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
              ) : null}

              <Card className="border-[#d7d4df] bg-white/80 shadow-none">
                <CardHeader className="border-b border-[#e3e0ea] pb-2">
                  <CardTitle className="text-2xl font-semibold text-[#2e2d35]">Movimientos del día</CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="overflow-x-auto rounded-md border border-[#dcd9e6]">
                    <table className="min-w-full text-sm">
                      <thead className="bg-[#eeebf4] text-left text-sm font-medium text-[#5f5c69]">
                        <tr>
                          <th className="px-3 py-2">Hora</th>
                          <th className="px-3 py-2">Tipo</th>
                          <th className="px-3 py-2">Concepto</th>
                          <th className="px-3 py-2">Medio</th>
                          <th className="px-3 py-2 text-right">Monto</th>
                          <th className="px-3 py-2 text-right">Efectivo esperado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#ece9f2] text-[#3d3a46]">
                        {loadingIngresos || loadingEgresos ? (
                          <tr>
                            <td colSpan={6} className="px-3 py-6 text-center text-sm text-[#6b6878]">
                              Cargando movimientos...
                            </td>
                          </tr>
                        ) : movimientosConSaldo.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-3 py-6 text-center text-sm text-[#6b6878]">
                              No hay movimientos registrados para el día.
                            </td>
                          </tr>
                        ) : (
                          movimientosConSaldo.map((movimiento) => (
                            <tr key={movimiento.id}>
                              <td className="px-3 py-2 font-medium text-[#2e2d35]">{movimiento.hora}</td>
                              <td className="px-3 py-2">
                                <span
                                  className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${
                                    movimiento.tipo === "egreso"
                                      ? "bg-[#e9e6f0] text-[#4c4958]"
                                      : "bg-[#efedf5] text-[#4f4b5d]"
                                  }`}
                                >
                                  {movimiento.etiquetaTipo}
                                </span>
                              </td>
                              <td className="px-3 py-2">{movimiento.detalle}</td>
                              <td className="px-3 py-2">{movimiento.medio}</td>
                              <td className="px-3 py-2 text-right font-semibold text-[#2e2d35]">
                                {formatSignedMoney(movimiento.monto)}
                              </td>
                              <td className="px-3 py-2 text-right font-semibold text-[#2e2d35]">
                                {formatMoney(movimiento.saldo_esperado)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
