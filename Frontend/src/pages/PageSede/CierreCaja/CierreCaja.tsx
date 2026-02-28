"use client";

import { useEffect, useMemo, useState } from "react";
import { Sidebar } from "../../../components/Layout/Sidebar";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Textarea } from "../../../components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { Calendar, Plus, Trash2, Wallet } from "lucide-react";
import { cashService } from "./api/cashService";
import type { CashCierre, CashEgreso, CashResumen, CashReporteRaw } from "./types";
import { formatDateDMY } from "../../../lib/dateFormat";

const toLocalDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getToday = () => toLocalDateString(new Date());

const getDateNDaysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return toLocalDateString(date);
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

const formatDate = (dateString?: string) => formatDateDMY(dateString);

export default function CierreCajaPage() {
  const [moneda, setMoneda] = useState("COP");
  const [sedeId, setSedeId] = useState<string | null>(null);
  const [sedeNombre, setSedeNombre] = useState<string | null>(null);

  const [fechaDesde, setFechaDesde] = useState(getDateNDaysAgo(7));
  const [fechaHasta, setFechaHasta] = useState(getToday());

  const [resumen, setResumen] = useState<CashResumen>({
    ingresos: 0,
    egresos: 0,
    balance: 0,
    moneda: "COP",
  });
  const [egresos, setEgresos] = useState<CashEgreso[]>([]);
  const [cierres, setCierres] = useState<CashCierre[]>([]);

  const [loadingResumen, setLoadingResumen] = useState(false);
  const [loadingEgresos, setLoadingEgresos] = useState(false);
  const [loadingCierres, setLoadingCierres] = useState(false);
  const [loadingAction, setLoadingAction] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form states
  const [egresoMonto, setEgresoMonto] = useState("");
  const [egresoMotivo, setEgresoMotivo] = useState("");
  const [egresoFecha, setEgresoFecha] = useState(getToday());
  const [egresoTipo, setEgresoTipo] = useState("gasto_operativo");
  const [egresoModalOpen, setEgresoModalOpen] = useState(false);

  const [aperturaMonto, setAperturaMonto] = useState("");
  const [aperturaNota, setAperturaNota] = useState("");
  const [aperturaFecha, setAperturaFecha] = useState(getToday());

  const [cierreNota, setCierreNota] = useState("");
  const [cierreFecha, setCierreFecha] = useState(getToday());
  const [cierreEfectivoContado, setCierreEfectivoContado] = useState("0");

  useEffect(() => {
    const sedeStorage = sessionStorage.getItem("beaux-sede_id");
    const sedeNombreStorage = sessionStorage.getItem("beaux-nombre_local");
    const monedaStorage = sessionStorage.getItem("beaux-moneda");

    setSedeId(sedeStorage);
    setSedeNombre(sedeNombreStorage);
    if (monedaStorage) {
      setMoneda(monedaStorage);
    }
  }, []);

  const egresosTotal = useMemo(() => {
    return egresos.reduce((sum, egreso) => sum + (egreso.monto || 0), 0);
  }, [egresos]);

  const balanceCalculado = useMemo(() => {
    const egresosValor = resumen.egresos || egresosTotal;
    return (resumen.ingresos || 0) - egresosValor;
  }, [resumen.ingresos, resumen.egresos, egresosTotal]);

  const formatMoney = (value: number) => {
    try {
      return new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency: moneda,
        minimumFractionDigits: 0,
      }).format(value);
    } catch (error) {
      return `${moneda} ${value.toFixed(0)}`;
    }
  };

  const normalizeResumen = (data: CashReporteRaw): CashResumen => {
    const root = unwrapData(data);
    const summary = root?.resumen ?? root?.summary ?? root;

    const ingresos =
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
      pickNumber(summary, [
        "egresos_total",
        "total_egresos",
        "egresos",
        "gastos",
      ]) ?? 0;

    const balance =
      pickNumber(summary, ["balance", "saldo", "neto", "total_balance"]) ??
      ingresos - egresos;

    return {
      ingresos,
      egresos,
      balance,
      moneda: summary?.moneda ?? root?.moneda ?? moneda,
    };
  };

  const normalizeEgresos = (data: any): CashEgreso[] => {
    const root = unwrapData(data);
    const lista =
      root?.egresos ?? root?.items ?? root?.data ?? (Array.isArray(root) ? root : []);

    if (!Array.isArray(lista)) return [];

    return lista.map((item, index) => {
      return {
        id: item._id || item.id || item.egreso_id || String(index),
        sede_id: item.sede_id,
        monto: toNumber(item.monto ?? item.valor ?? item.total ?? item.importe ?? 0),
        motivo: item.motivo ?? item.nota ?? item.descripcion ?? item.observacion ?? "Sin motivo",
        fecha: item.fecha ?? item.created_at ?? item.creado_en ?? item.fecha_egreso ?? getToday(),
        creado_en: item.creado_en,
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
    } catch (err) {
      if (start === end) {
        try {
          const efectivo = await cashService.getEfectivoDia({
            sede_id: sedeId,
            fecha: start,
          });
          setResumen(normalizeResumen(efectivo));
        } catch (innerErr) {
          setResumen({ ingresos: 0, egresos: 0, balance: 0, moneda });
          setError("No se pudieron cargar los ingresos del período");
        }
      } else {
        setResumen({ ingresos: 0, egresos: 0, balance: 0, moneda });
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
      const result = await cashService.getEgresos({
        sede_id: sedeId,
        fecha_inicio: start,
        fecha_fin: end,
      });
      setEgresos(normalizeEgresos(result));
    } catch (err) {
      setEgresos([]);
      setError("No se pudieron cargar los egresos");
    } finally {
      setLoadingEgresos(false);
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
    await Promise.all([loadResumen(), loadEgresos(), loadCierres()]);
  };

  useEffect(() => {
    if (sedeId) {
      loadAll();
    }
  }, [sedeId, fechaDesde, fechaHasta]);

  const handleCreateEgreso = async () => {
    if (!sedeId) return;

    const montoValue = toNumber(egresoMonto);
    if (!montoValue || montoValue <= 0) {
      setError("El monto del egreso debe ser mayor a 0");
      return;
    }

    if (!egresoMotivo.trim()) {
      setError("El motivo del egreso es obligatorio");
      return;
    }

    setLoadingAction(true);
    setError(null);
    setSuccess(null);

    try {
      await cashService.createEgreso({
        sede_id: sedeId,
        monto: montoValue,
        valor: montoValue,
        efectivo: montoValue,
        motivo: egresoMotivo.trim(),
        descripcion: egresoMotivo.trim(),
        nota: egresoMotivo.trim(),
        tipo: egresoTipo,
        concepto: egresoMotivo.trim(),
        fecha: egresoFecha,
      });

      setEgresoMonto("");
      setEgresoMotivo("");
      setEgresoTipo("gasto_operativo");
      setSuccess("Egreso registrado correctamente");
      setEgresoModalOpen(false);
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "No se pudo registrar el egreso");
    } finally {
      setLoadingAction(false);
    }
  };

  const handleDeleteEgreso = async (egresoId: string) => {
    if (!sedeId) return;
    setLoadingAction(true);
    setError(null);
    setSuccess(null);

    try {
      await cashService.deleteEgreso(egresoId, { sede_id: sedeId });
      setSuccess("Egreso eliminado");
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "No se pudo eliminar el egreso");
    } finally {
      setLoadingAction(false);
    }
  };

  const handleApertura = async () => {
    if (!sedeId) return;

    const montoValue = toNumber(aperturaMonto);
    if (!montoValue || montoValue <= 0) {
      setError("El monto inicial debe ser mayor a 0");
      return;
    }

    setLoadingAction(true);
    setError(null);
    setSuccess(null);

    try {
      await cashService.aperturaCaja({
        sede_id: sedeId,
        fecha: aperturaFecha,
        monto_inicial: montoValue,
        efectivo_inicial: montoValue,
        efectivo: montoValue,
        notas: aperturaNota.trim() || undefined,
        observaciones: aperturaNota.trim() || undefined,
      });

      setAperturaMonto("");
      setAperturaNota("");
      setSuccess("Caja abierta correctamente");
      await loadCierres();
    } catch (err: any) {
      setError(err?.message || "No se pudo abrir la caja");
    } finally {
      setLoadingAction(false);
    }
  };

  const handleCierre = async () => {
    if (!sedeId) return;

    const efectivoContadoValue = toNumber(cierreEfectivoContado);
    if (Number.isNaN(efectivoContadoValue) || efectivoContadoValue < 0) {
      setError("El efectivo contado debe ser mayor o igual a 0");
      return;
    }

    setLoadingAction(true);
    setError(null);
    setSuccess(null);

    try {
      await cashService.cierreCaja({
        sede_id: sedeId,
        fecha: cierreFecha,
        notas: cierreNota.trim() || undefined,
        observaciones: cierreNota.trim() || undefined,
        ingresos_total: resumen.ingresos,
        total_ingresos: resumen.ingresos,
        efectivo_total: resumen.ingresos,
        egresos_total: resumen.egresos || egresosTotal,
        total_egresos: resumen.egresos || egresosTotal,
        balance: balanceCalculado,
        saldo: balanceCalculado,
        efectivo_cierre: balanceCalculado,
        efectivo_final: balanceCalculado,
        efectivo_contado: efectivoContadoValue,
      });

      setCierreNota("");
      setSuccess("Caja cerrada correctamente");
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "No se pudo cerrar la caja");
    } finally {
      setLoadingAction(false);
    }
  };

  const applyQuickRange = (days: number) => {
    setFechaDesde(getDateNDaysAgo(days));
    setFechaHasta(getToday());
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-8 space-y-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold text-gray-900">Cierre de Caja</h1>
            <p className="text-sm text-gray-600">
              {sedeNombre ? `Sede: ${sedeNombre}` : "Gestión por sede"}
            </p>
          </div>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
              {success}
            </div>
          )}

          {/* Filtros de fecha */}
          <Card className="border-gray-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Rango de fechas
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div>
                  <label className="text-xs font-medium text-gray-600">Fecha desde</label>
                  <Input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Fecha hasta</label>
                  <Input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} />
                </div>
                <div className="flex items-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => applyQuickRange(0)}>
                    Hoy
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => applyQuickRange(7)}>
                    7 días
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => applyQuickRange(30)}>
                    30 días
                  </Button>
                </div>
              </div>
              <Button
                onClick={loadAll}
                disabled={loadingResumen || loadingEgresos || loadingCierres}
                className="bg-gray-900 hover:bg-gray-800 text-white"
              >
                Actualizar
              </Button>
            </CardContent>
          </Card>

          {/* Resumen */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card className="border-gray-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-600">Ingresos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-900">
                  {loadingResumen ? "..." : formatMoney(resumen.ingresos || 0)}
                </div>
                <p className="text-xs text-gray-500">Ventas facturadas del período</p>
              </CardContent>
            </Card>
            <Card className="border-gray-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-600">Egresos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-900">
                  {loadingEgresos ? "..." : formatMoney(resumen.egresos || egresosTotal)}
                </div>
                <p className="text-xs text-gray-500">Gastos registrados</p>
              </CardContent>
            </Card>
            <Card className="border-gray-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-600">Balance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-900">
                  {loadingResumen ? "..." : formatMoney(resumen.balance || balanceCalculado)}
                </div>
                <p className="text-xs text-gray-500">Ingresos - egresos</p>
              </CardContent>
            </Card>
          </div>

          {/* Apertura y Cierre */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="border-gray-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-700 flex items-center gap-2">
                  <Wallet className="w-4 h-4" />
                  Apertura de caja
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-600">Monto inicial</label>
                  <Input
                    type="number"
                    min="0"
                    value={aperturaMonto}
                    onChange={(e) => setAperturaMonto(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Fecha</label>
                  <Input type="date" value={aperturaFecha} onChange={(e) => setAperturaFecha(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Notas (opcional)</label>
                  <Textarea
                    value={aperturaNota}
                    onChange={(e) => setAperturaNota(e.target.value)}
                    placeholder="Observaciones de apertura"
                  />
                </div>
                <Button
                  onClick={handleApertura}
                  disabled={loadingAction}
                  className="bg-gray-900 hover:bg-gray-800 text-white"
                >
                  Abrir caja
                </Button>
              </CardContent>
            </Card>

            <Card className="border-gray-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-700 flex items-center gap-2">
                  <Wallet className="w-4 h-4" />
                  Cierre de caja
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-600">Fecha</label>
                  <Input type="date" value={cierreFecha} onChange={(e) => setCierreFecha(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Efectivo contado</label>
                  <Input
                    type="number"
                    min="0"
                    value={cierreEfectivoContado}
                    onChange={(e) => setCierreEfectivoContado(e.target.value)}
                    placeholder="0"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Monto físico contado en caja (debe ser mayor o igual a 0).
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Notas (opcional)</label>
                  <Textarea
                    value={cierreNota}
                    onChange={(e) => setCierreNota(e.target.value)}
                    placeholder="Observaciones de cierre"
                  />
                </div>
                <div className="rounded-md bg-gray-50 p-3 text-xs text-gray-600">
                  Balance estimado: <span className="font-semibold">{formatMoney(balanceCalculado)}</span>
                </div>
                <Button
                  onClick={handleCierre}
                  disabled={loadingAction}
                  className="bg-gray-900 hover:bg-gray-800 text-white"
                >
                  Cerrar caja
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Egresos y cierres */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="border-gray-200 bg-gradient-to-br from-white via-gray-50 to-gray-100 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-700 flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Registrar egreso
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-gray-200 bg-white/70 p-4 shadow-sm">
                  <div className="text-xs uppercase tracking-wide text-gray-500">Acción rápida</div>
                  <p className="mt-2 text-sm text-gray-700">
                    Registra compras internas, gastos operativos o retiros de caja con fecha y motivo.
                  </p>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Total egresos del período</span>
                  <span className="font-semibold text-gray-700">{formatMoney(egresosTotal)}</span>
                </div>
                <Button
                  onClick={() => setEgresoModalOpen(true)}
                  className="bg-gray-900 hover:bg-gray-800 text-white w-full"
                >
                  Registrar egreso
                </Button>
              </CardContent>
            </Card>

            <Card className="border-gray-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-700">Listado de egresos</CardTitle>
              </CardHeader>
              <CardContent>
                {loadingEgresos ? (
                  <div className="text-sm text-gray-500">Cargando egresos...</div>
                ) : egresos.length === 0 ? (
                  <div className="text-sm text-gray-500">No hay egresos registrados.</div>
                ) : (
                  <div className="space-y-3">
                    {egresos.map((egreso) => (
                      <div
                        key={egreso.id}
                        className="flex items-center justify-between rounded-md border border-gray-200 p-3"
                      >
                        <div>
                          <div className="text-sm font-medium text-gray-900">{egreso.motivo}</div>
                          <div className="text-xs text-gray-500">{formatDate(egreso.fecha)}</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-sm font-semibold text-gray-900">
                            {formatMoney(egreso.monto)}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteEgreso(egreso.id)}
                          >
                            <Trash2 className="h-4 w-4 text-gray-500" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-gray-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-700">Historial de cierres</CardTitle>
              </CardHeader>
              <CardContent>
                {loadingCierres ? (
                  <div className="text-sm text-gray-500">Cargando cierres...</div>
                ) : cierres.length === 0 ? (
                  <div className="text-sm text-gray-500">No hay cierres registrados.</div>
                ) : (
                  <div className="space-y-3">
                    {cierres.map((cierre) => (
                      <div key={cierre.id} className="rounded-md border border-gray-200 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {formatDate(cierre.fecha_cierre || cierre.fecha_apertura)}
                            </div>
                            <div className="text-xs text-gray-500">
                              {cierre.notas || "Sin notas"}
                            </div>
                          </div>
                          <div className="text-xs text-gray-500">
                            {cierre.estado ? `Estado: ${cierre.estado}` : ""}
                          </div>
                        </div>
                        <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-gray-600">
                          <div>Ingresos: {formatMoney(cierre.ingresos || 0)}</div>
                          <div>Egresos: {formatMoney(cierre.egresos || 0)}</div>
                          <div>Balance: {formatMoney(cierre.balance || 0)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Dialog open={egresoModalOpen} onOpenChange={setEgresoModalOpen}>
            <DialogContent className="max-w-lg overflow-hidden border-gray-200 bg-white p-0">
              <div className="bg-gray-900 px-6 py-5 text-white">
                <DialogHeader className="space-y-1 text-left">
                  <DialogTitle className="text-lg font-semibold">Registrar egreso</DialogTitle>
                  <DialogDescription className="text-gray-200">
                    Completa los datos para guardar el egreso en la caja de la sede.
                  </DialogDescription>
                </DialogHeader>
              </div>

              <div className="space-y-4 px-6 py-5">
                <div>
                  <label className="text-xs font-medium text-gray-600">Monto</label>
                  <Input
                    type="number"
                    min="0"
                    value={egresoMonto}
                    onChange={(e) => setEgresoMonto(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600">Tipo</label>
                    <select
                      value={egresoTipo}
                      onChange={(e) => setEgresoTipo(e.target.value)}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="compra_interna">Compra interna</option>
                      <option value="gasto_operativo">Gasto operativo</option>
                      <option value="retiro_caja">Retiro de caja</option>
                      <option value="otro">Otro</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Motivo</label>
                    <Input
                      value={egresoMotivo}
                      onChange={(e) => setEgresoMotivo(e.target.value)}
                      placeholder="Ej: compra insumos"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Fecha</label>
                    <Input type="date" value={egresoFecha} onChange={(e) => setEgresoFecha(e.target.value)} />
                  </div>
                </div>
              </div>

              <DialogFooter className="border-t border-gray-100 bg-gray-50 px-6 py-4">
                <Button variant="outline" onClick={() => setEgresoModalOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={handleCreateEgreso}
                  disabled={loadingAction}
                  className="bg-gray-900 hover:bg-gray-800 text-white"
                >
                  Guardar egreso
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

        </div>
      </main>
    </div>
  );
}
