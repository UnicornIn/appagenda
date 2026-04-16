import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  AlertTriangle,
  Package,
  Search,
  X,
} from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { Badge } from "../../../components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";
import type { InventarioProducto } from "./inventario";
import { cn } from "../../../lib/utils";

// ─── Shared helpers ────────────────────────────────────────────────────────

const stockColor = (actual: number, minimo: number) => {
  if (actual <= 0) return "text-gray-400";
  if (actual <= minimo) return "text-red-600";
  if (actual <= minimo * 1.5) return "text-amber-600";
  return "text-emerald-600";
};

const stockDot = (actual: number, minimo: number) => {
  if (actual <= 0) return "bg-gray-400";
  if (actual <= minimo) return "bg-red-500";
  if (actual <= minimo * 1.5) return "bg-amber-500";
  return "bg-emerald-500";
};

const formatDate = (iso?: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(d);
};

// ─── DASHBOARD TAB ──────────────────────────────────────────────────────────

interface DashboardTabProps {
  productos: InventarioProducto[];
  sedeLabel?: string;
}

export function InventoryDashboardTab({ productos, sedeLabel = "Sede" }: DashboardTabProps) {
  const totalProductos = productos.length;
  const totalUnidades = productos.reduce((a, p) => a + Number(p.stock_actual ?? 0), 0);
  const criticos = productos.filter(
    (p) => Number(p.stock_actual) > 0 && Number(p.stock_actual) <= Number(p.stock_minimo)
  ).length;
  const sinStock = productos.filter((p) => Number(p.stock_actual ?? 0) <= 0).length;

  // Sort by stock ratio to find slow movers (high stock vs low sales) and critical
  const críticos = [...productos]
    .filter((p) => Number(p.stock_actual) <= Number(p.stock_minimo))
    .sort((a, b) => Number(a.stock_actual) - Number(b.stock_actual))
    .slice(0, 5);

  const topProductos = [...productos]
    .sort((a, b) => Number(b.ventas ?? 0) - Number(a.ventas ?? 0))
    .slice(0, 5);

  const slowMovers = [...productos]
    .filter((p) => Number(p.stock_actual) > 0 && !Number(p.ventas))
    .slice(0, 4);

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Total productos" value={totalProductos} />
        <KpiCard label="Unidades en stock" value={totalUnidades} />
        <KpiCard label="Stock crítico" value={criticos} alert={criticos > 0} />
        <KpiCard label="Sin stock" value={sinStock} alert={sinStock > 0} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Productos bajo stock */}
        <Card className="border-gray-200">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-gray-700">Productos bajo stock</CardTitle>
            <Badge variant="outline" className="text-xs border-gray-200 text-gray-500">
              {críticos.length} alertas
            </Badge>
          </CardHeader>
          <CardContent className="p-0">
            {críticos.length === 0 ? (
              <p className="px-4 py-6 text-sm text-center text-gray-400">Sin alertas activas</p>
            ) : (
              críticos.map((p) => {
                const actual = Number(p.stock_actual ?? 0);
                const min = Number(p.stock_minimo ?? 0);
                const deficit = min - actual;
                return (
                  <div
                    key={p._id}
                    className="flex items-center justify-between px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-800">
                        {p.producto_nombre || p.nombre}
                      </p>
                      <p className="text-xs text-gray-400">
                        Mín: {min} · Déficit: {deficit > 0 ? deficit : 0}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "flex items-center gap-1.5 text-sm font-semibold",
                        stockColor(actual, min)
                      )}
                    >
                      <span className={cn("w-1.5 h-1.5 rounded-full", stockDot(actual, min))} />
                      {actual}
                    </span>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Top más vendidos */}
        <Card className="border-gray-200">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-gray-700">Top más vendidos</CardTitle>
            <Badge variant="outline" className="text-xs border-gray-200 text-gray-500">
              {sedeLabel}
            </Badge>
          </CardHeader>
          <CardContent className="p-0">
            {topProductos.length === 0 ? (
              <p className="px-4 py-6 text-sm text-center text-gray-400">Sin datos de ventas</p>
            ) : (
              topProductos.map((p, i) => (
                <div
                  key={p._id}
                  className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50"
                >
                  <span className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold bg-gray-100 text-gray-500 shrink-0">
                    {i + 1}
                  </span>
                  <span className="flex-1 text-sm text-gray-800 truncate">
                    {p.producto_nombre || p.nombre}
                  </span>
                  <span className="text-sm font-semibold text-gray-700">
                    {Number(p.ventas ?? 0)}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Slow movers */}
      {slowMovers.length > 0 && (
        <Card className="border-gray-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700">
              Productos sin ventas registradas
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-gray-50">
                <TableRow>
                  <TableHead className="text-xs font-semibold text-gray-500">Producto</TableHead>
                  <TableHead className="text-xs font-semibold text-gray-500">Línea</TableHead>
                  <TableHead className="text-xs font-semibold text-gray-500 text-right">
                    Stock actual
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-gray-500 text-right">
                    Stock mínimo
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {slowMovers.map((p) => (
                  <TableRow key={p._id} className="hover:bg-gray-50">
                    <TableCell className="font-medium text-gray-800">
                      {p.producto_nombre || p.nombre}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs border-gray-200 text-gray-600">
                        {p.categoria || "—"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-gray-700">
                      {p.stock_actual ?? 0}
                    </TableCell>
                    <TableCell className="text-right text-gray-500">
                      {p.stock_minimo ?? 0}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  alert = false,
}: {
  label: string;
  value: number;
  alert?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className={cn("text-2xl font-bold mt-1.5", alert ? "text-red-600" : "text-gray-900")}>
        {value}
      </p>
    </div>
  );
}

// ─── MOVIMIENTOS TAB ─────────────────────────────────────────────────────────

interface MovimientosTabProps {
  productos: InventarioProducto[];
  sedeLabel?: string;
}

type MovTipo = "Entrada" | "Salida";

interface Movimiento {
  id: string;
  producto: string;
  tipo: MovTipo;
  cantidad: number;
  saldo: number;
  motivo: string;
  usuario: string;
  fecha: string;
  sede: string;
}

// Generate mock movements from products list for display purposes
function buildMovimientos(
  productos: InventarioProducto[],
  sedeLabel: string
): Movimiento[] {
  const motivos: Record<MovTipo, string[]> = {
    Salida: ["Venta", "Uso interno", "Muestra", "Pérdida"],
    Entrada: ["Compra", "Ajuste manual", "Transferencia"],
  };

  return productos.slice(0, 20).flatMap((p, idx) => {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() - idx);
    const tipo: MovTipo = idx % 3 === 0 ? "Entrada" : "Salida";
    const cantidad = tipo === "Entrada" ? Math.max(1, (idx % 5) + 1) * 5 : Math.max(1, idx % 4) + 1;
    const saldo = Number(p.stock_actual ?? 0);
    const motivoList = motivos[tipo];
    const motivo = motivoList[idx % motivoList.length];

    return [
      {
        id: `${p._id}-${idx}`,
        producto: p.producto_nombre || p.nombre || "Producto",
        tipo,
        cantidad,
        saldo,
        motivo,
        usuario: idx % 2 === 0 ? "Admin" : "Recepcionista",
        fecha: fecha.toISOString(),
        sede: sedeLabel,
      },
    ];
  });
}

type MovFiltroTipo = "todos" | "entradas" | "salidas";

export function InventoryMovimientosTab({ productos, sedeLabel = "Sede" }: MovimientosTabProps) {
  const [filtroTipo, setFiltroTipo] = useState<MovFiltroTipo>("todos");
  const [search, setSearch] = useState("");
  const [showEntradaModal, setShowEntradaModal] = useState(false);
  const [showSalidaModal, setShowSalidaModal] = useState(false);

  const movimientos = buildMovimientos(productos, sedeLabel);

  const filtered = movimientos.filter((m) => {
    if (filtroTipo === "entradas" && m.tipo !== "Entrada") return false;
    if (filtroTipo === "salidas" && m.tipo !== "Salida") return false;
    if (search.trim()) {
      const s = search.toLowerCase();
      return (
        m.producto.toLowerCase().includes(s) ||
        m.motivo.toLowerCase().includes(s) ||
        m.usuario.toLowerCase().includes(s)
      );
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1.5 flex-wrap">
          {(
            [
              { id: "todos", label: "Todos" },
              { id: "entradas", label: "Entradas" },
              { id: "salidas", label: "Salidas" },
            ] as { id: MovFiltroTipo; label: string }[]
          ).map((f) => (
            <button
              key={f.id}
              onClick={() => setFiltroTipo(f.id)}
              className={cn(
                "px-3 py-1.5 rounded-md border text-xs font-medium transition-colors",
                filtroTipo === f.id
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            className="bg-gray-900 text-white hover:bg-gray-800 text-xs"
            onClick={() => setShowEntradaModal(true)}
          >
            <ArrowDown className="h-3.5 w-3.5 mr-1.5" />
            Registrar entrada
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-gray-300 text-gray-700 text-xs hover:bg-gray-50"
            onClick={() => setShowSalidaModal(true)}
          >
            <ArrowUp className="h-3.5 w-3.5 mr-1.5" />
            Registrar salida
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por producto, usuario o motivo..."
          className="pl-9 border-gray-200 bg-white text-sm"
        />
      </div>

      {/* Table */}
      <Card className="border-gray-200">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-gray-50">
              <TableRow>
                <TableHead className="w-8 px-3" />
                <TableHead className="text-xs font-semibold text-gray-500">Producto</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500">Tipo</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500">Motivo</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 text-center">
                  Cantidad
                </TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 text-center">
                  Saldo
                </TableHead>
                <TableHead className="text-xs font-semibold text-gray-500">Usuario</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500">Fecha</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500">Sede</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="py-10 text-center text-sm text-gray-400"
                  >
                    No hay movimientos para mostrar
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((m) => (
                  <TableRow key={m.id} className="hover:bg-gray-50">
                    <TableCell className="px-3 py-2.5">
                      <div className="w-6 h-6 rounded-md bg-gray-100 flex items-center justify-center">
                        {m.tipo === "Entrada" ? (
                          <ArrowDown className="h-3 w-3 text-gray-500" />
                        ) : (
                          <ArrowUp className="h-3 w-3 text-gray-500" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium text-gray-800 py-2.5">
                      {m.producto}
                    </TableCell>
                    <TableCell className="py-2.5">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[11px] font-medium",
                          m.tipo === "Entrada"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-red-200 bg-red-50 text-red-700"
                        )}
                      >
                        {m.tipo}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-gray-600 py-2.5">{m.motivo}</TableCell>
                    <TableCell className="text-center font-semibold text-sm py-2.5">
                      <span
                        className={m.tipo === "Entrada" ? "text-emerald-600" : "text-red-600"}
                      >
                        {m.tipo === "Entrada" ? "+" : "-"}
                        {m.cantidad}
                      </span>
                    </TableCell>
                    <TableCell className="text-center text-sm py-2.5">
                      <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">
                        {m.saldo}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-gray-400 py-2.5">{m.usuario}</TableCell>
                    <TableCell className="text-xs text-gray-400 py-2.5">
                      {formatDate(m.fecha)}
                    </TableCell>
                    <TableCell className="text-xs text-gray-400 py-2.5">{m.sede}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Entrada modal */}
      {showEntradaModal && (
        <MovimientoModal
          titulo="Registrar entrada"
          descripcion="Ingresa productos al inventario de la sede."
          productos={productos}
          tipo="Entrada"
          onClose={() => setShowEntradaModal(false)}
        />
      )}

      {/* Salida modal */}
      {showSalidaModal && (
        <MovimientoModal
          titulo="Registrar salida"
          descripcion="Retira productos del inventario de la sede."
          productos={productos}
          tipo="Salida"
          onClose={() => setShowSalidaModal(false)}
        />
      )}
    </div>
  );
}

function MovimientoModal({
  titulo,
  descripcion,
  productos,
  tipo,
  onClose,
}: {
  titulo: string;
  descripcion: string;
  productos: InventarioProducto[];
  tipo: MovTipo;
  onClose: () => void;
}) {
  const [selectedProductId, setSelectedProductId] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [motivo, setMotivo] = useState("");
  const [observaciones, setObservaciones] = useState("");

  const selectedProduct = productos.find(
    (p) => p._id === selectedProductId || p.producto_id === selectedProductId
  );
  const stockActual = Number(selectedProduct?.stock_actual ?? 0);
  const stockMinimo = Number(selectedProduct?.stock_minimo ?? 0);
  const cantidadNum = Number(cantidad) || 0;
  const stockResultante = tipo === "Salida" ? stockActual - cantidadNum : stockActual + cantidadNum;
  const bajoMinimo = tipo === "Salida" && stockResultante < stockMinimo && cantidadNum > 0;

  const motivosSalida = ["Venta", "Uso interno", "Obsequio", "Muestra", "Pérdida", "Ajuste manual"];
  const motivosEntrada = ["Compra a proveedor", "Ajuste manual", "Devolución cliente", "Transferencia", "Stock inicial"];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white shadow-2xl p-6 mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{titulo}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{descripcion}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Product selector */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Producto</label>
            <Select value={selectedProductId} onValueChange={setSelectedProductId}>
              <SelectTrigger className="border-gray-200 bg-white text-sm">
                <SelectValue placeholder="Buscar por nombre o SKU..." />
              </SelectTrigger>
              <SelectContent className="bg-white border-gray-200">
                {productos.map((p) => (
                  <SelectItem key={p._id} value={p._id}>
                    {p.producto_nombre || p.nombre} — {p.producto_codigo || p.categoria}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedProduct && (
            <div className="flex items-center justify-between rounded-lg bg-gray-50 border border-gray-100 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-gray-800">
                  {selectedProduct.producto_nombre || selectedProduct.nombre}
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  SKU: {selectedProduct.producto_codigo || "—"} · {selectedProduct.categoria || "—"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-gray-400">Stock actual</p>
                <span
                  className={cn(
                    "flex items-center gap-1 text-sm font-semibold",
                    stockColor(stockActual, stockMinimo)
                  )}
                >
                  <span
                    className={cn("w-1.5 h-1.5 rounded-full", stockDot(stockActual, stockMinimo))}
                  />
                  {stockActual}
                </span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Cantidad</label>
              <Input
                type="number"
                min={1}
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                placeholder="0"
                className="border-gray-200 bg-white text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Motivo</label>
              <Select value={motivo} onValueChange={setMotivo}>
                <SelectTrigger className="border-gray-200 bg-white text-sm">
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent className="bg-white border-gray-200">
                  {(tipo === "Salida" ? motivosSalida : motivosEntrada).map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Observaciones</label>
            <Input
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Notas opcionales..."
              className="border-gray-200 bg-white text-sm"
            />
          </div>

          {bajoMinimo && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Esta salida dejará el stock en{" "}
                <strong className="font-semibold">{stockResultante}</strong> unidad(es) (mínimo:{" "}
                {stockMinimo})
              </span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1 border-t border-gray-100">
            <Button
              variant="outline"
              size="sm"
              className="border-gray-200 text-gray-600 text-xs"
              onClick={onClose}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              className="bg-gray-900 text-white hover:bg-gray-800 text-xs"
              onClick={onClose}
            >
              Confirmar {tipo === "Entrada" ? "entrada" : "salida"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── KARDEX TAB ──────────────────────────────────────────────────────────────

interface KardexTabProps {
  productos: InventarioProducto[];
}

interface KardexRow {
  fecha: string;
  tipo: string;
  referencia: string;
  entrada?: number;
  salida?: number;
  saldo: number;
  usuario: string;
}

function buildKardex(producto: InventarioProducto): KardexRow[] {
  const stock = Number(producto.stock_actual ?? 0);
  const rows: KardexRow[] = [
    {
      fecha: new Date(Date.now() - 1 * 86400000).toISOString(),
      tipo: "Venta",
      referencia: "Venta #1892",
      salida: 2,
      saldo: stock,
      usuario: "Recepcionista",
    },
    {
      fecha: new Date(Date.now() - 2 * 86400000).toISOString(),
      tipo: "Venta",
      referencia: "Venta #1887",
      salida: 1,
      saldo: stock + 2,
      usuario: "Recepcionista",
    },
    {
      fecha: new Date(Date.now() - 4 * 86400000).toISOString(),
      tipo: "Compra",
      referencia: "OC #0234",
      entrada: 12,
      saldo: stock + 3,
      usuario: "Admin",
    },
    {
      fecha: new Date(Date.now() - 6 * 86400000).toISOString(),
      tipo: "Uso interno",
      referencia: "Servicio",
      salida: 2,
      saldo: stock + 3 - 12,
      usuario: "Estilista",
    },
    {
      fecha: new Date(Date.now() - 11 * 86400000).toISOString(),
      tipo: "Compra",
      referencia: "OC #0228",
      entrada: 20,
      saldo: stock + 3 - 12 + 2,
      usuario: "Admin",
    },
    {
      fecha: new Date(Date.now() - 13 * 86400000).toISOString(),
      tipo: "Stock inicial",
      referencia: "Apertura",
      saldo: stock + 3 - 12 + 2 - 20,
      usuario: "Sistema",
    },
  ];
  return rows;
}

const kardexTypeBadge = (tipo: string) => {
  if (tipo === "Venta" || tipo === "Uso interno") {
    return "border-red-200 bg-red-50 text-red-700";
  }
  if (tipo === "Compra" || tipo === "Stock inicial") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  return "border-gray-200 bg-gray-50 text-gray-600";
};

export function InventoryKardexTab({ productos }: KardexTabProps) {
  const [selectedId, setSelectedId] = useState(productos[0]?._id ?? "");
  const [search, setSearch] = useState("");

  const selectedProduct = productos.find((p) => p._id === selectedId);
  const kardex = selectedProduct ? buildKardex(selectedProduct) : [];

  const filteredProductos = productos.filter((p) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      (p.producto_nombre || p.nombre || "").toLowerCase().includes(s) ||
      (p.producto_codigo || "").toLowerCase().includes(s)
    );
  });

  const stockActual = Number(selectedProduct?.stock_actual ?? 0);
  const stockMinimo = Number(selectedProduct?.stock_minimo ?? 0);

  return (
    <div className="space-y-4">
      {/* Product search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar producto..."
            className="pl-9 border-gray-200 bg-white text-sm"
          />
        </div>
        <Select value={selectedId} onValueChange={setSelectedId}>
          <SelectTrigger className="border-gray-200 bg-white text-sm w-full sm:w-72">
            <SelectValue placeholder="Seleccionar producto" />
          </SelectTrigger>
          <SelectContent className="bg-white border-gray-200">
            {filteredProductos.map((p) => (
              <SelectItem key={p._id} value={p._id}>
                {p.producto_nombre || p.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedProduct ? (
        <>
          {/* Product summary */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-xl bg-gray-50 border border-gray-100 px-5 py-4">
            <div>
              <h3 className="text-base font-bold text-gray-900">
                {selectedProduct.producto_nombre || selectedProduct.nombre}
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                SKU: {selectedProduct.producto_codigo || "—"} · {selectedProduct.categoria || "—"}
              </p>
            </div>
            <div className="flex gap-6">
              <div className="text-center">
                <p className="text-[10px] uppercase tracking-wide text-gray-400">Stock actual</p>
                <span
                  className={cn(
                    "flex items-center gap-1.5 mt-1 text-sm font-bold justify-center",
                    stockColor(stockActual, stockMinimo)
                  )}
                >
                  <span
                    className={cn("w-2 h-2 rounded-full", stockDot(stockActual, stockMinimo))}
                  />
                  {stockActual}
                </span>
              </div>
              <div className="text-center">
                <p className="text-[10px] uppercase tracking-wide text-gray-400">Mínimo</p>
                <p className="text-sm font-bold text-gray-500 mt-1">{stockMinimo}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] uppercase tracking-wide text-gray-400">Última actualización</p>
                <p className="text-sm font-bold text-gray-700 mt-1">
                  {formatDate(selectedProduct.fecha_ultima_actualizacion)}
                </p>
              </div>
            </div>
          </div>

          {/* Kardex table */}
          <Card className="border-gray-200">
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-gray-50">
                  <TableRow>
                    <TableHead className="text-xs font-semibold text-gray-500">Fecha</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-500">Motivo</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-500">Referencia</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-500 text-center">
                      Entrada
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-gray-500 text-center">
                      Salida
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-gray-500 text-center">
                      Saldo
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-gray-500">Usuario</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {kardex.map((row, i) => (
                    <TableRow key={i} className="hover:bg-gray-50">
                      <TableCell className="text-xs text-gray-500 py-3">
                        {formatDate(row.fecha)}
                      </TableCell>
                      <TableCell className="py-3">
                        <Badge
                          variant="outline"
                          className={cn("text-[11px] font-medium", kardexTypeBadge(row.tipo))}
                        >
                          {row.tipo}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-gray-400 py-3">{row.referencia}</TableCell>
                      <TableCell className="text-center text-sm font-semibold text-emerald-600 py-3">
                        {row.entrada !== undefined ? `+${row.entrada}` : <span className="text-gray-300">—</span>}
                      </TableCell>
                      <TableCell className="text-center text-sm font-semibold text-red-600 py-3">
                        {row.salida !== undefined ? `-${row.salida}` : <span className="text-gray-300">—</span>}
                      </TableCell>
                      <TableCell className="text-center py-3">
                        <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-700">
                          {row.saldo}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-gray-400 py-3">{row.usuario}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-16 text-center">
          <Package className="h-10 w-10 text-gray-300 mb-3" />
          <p className="text-sm text-gray-400">Selecciona un producto para ver su kardex</p>
        </div>
      )}
    </div>
  );
}
