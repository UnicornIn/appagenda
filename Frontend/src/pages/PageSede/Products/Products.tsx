"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Package,
  Loader2,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { Sidebar } from "../../../components/Layout/Sidebar";
import { PageHeader } from "../../../components/Layout/PageHeader";
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
import { Alert, AlertDescription } from "../../../components/ui/alert";
import { Avatar, AvatarFallback } from "../../../components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";
import { useAuth } from "../../../components/Auth/AuthContext";
import { inventarioService, type InventarioProducto } from "./inventario";
import { API_BASE_URL } from "../../../types/config";
import { cn } from "../../../lib/utils";
import { APP_ROLES, resolveAppRole } from "../../../lib/access-control";

type CatalogoProducto = {
  id: string;
  nombre: string;
  codigo: string;
};

type Movimiento = {
  producto: string;
  sede: string;
  sede_id?: string;
  tipo: "Salida" | "Entrada";
  usuario: string;
  fecha: string;
  cantidad?: number;
};

const PAGE_SIZE = 8;
const HIST_PAGE_SIZE = 6;

const normalizeText = (value: string | null | undefined): string =>
  (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const formatDate = (iso?: string): string => {
  if (!iso) return "Sin datos";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Sin datos";
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(date);
};

const formatMoney = (value?: number) => {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
};

export function ProductsList() {
  const {
    user,
    isAuthenticated,
    isLoading: authLoading,
    activeSedeId,
  } = useAuth();

  const [productos, setProductos] = useState<InventarioProducto[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [activeLineaTab, setActiveLineaTab] = useState<string>("all");
  const [showLowStock, setShowLowStock] = useState(false);

  const [productoEditando, setProductoEditando] = useState<string | null>(null);
  const [stockTemporal, setStockTemporal] = useState<string>("");
  const [guardandoStock, setGuardandoStock] = useState<string | null>(null);

  const [catalogoProductos, setCatalogoProductos] = useState<
    CatalogoProducto[]
  >([]);
  const [isLoadingCatalogo, setIsLoadingCatalogo] = useState(false);
  const [catalogoError, setCatalogoError] = useState<string | null>(null);
  const [nuevoProductoId, setNuevoProductoId] = useState("");
  const [creacionModo, setCreacionModo] = useState<"catalogo" | "manual">("catalogo");
  const [nuevoNombreManual, setNuevoNombreManual] = useState("");
  const [nuevoSkuManual, setNuevoSkuManual] = useState("");
  const [nuevoStockInicial, setNuevoStockInicial] = useState("0");
  const [nuevoStockMinimo, setNuevoStockMinimo] = useState("5");
  const [lineaFormulario, setLineaFormulario] = useState<string>("");
  const [tipoProducto, setTipoProducto] = useState<string>("ACCESORIO");
  const [precioReferencia, setPrecioReferencia] = useState<string>("");
  const [costoReferencia, setCostoReferencia] = useState<string>("");
  const [isCreatingInventario, setIsCreatingInventario] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [historialPeriodo, setHistorialPeriodo] = useState<"7" | "30" | "90">("7");
  const [historialPage, setHistorialPage] = useState(1);

  const userRole = resolveAppRole(user?.role);
  const canAdjustStock =
    userRole === APP_ROLES.ADMIN_SEDE ||
    userRole === APP_ROLES.SUPER_ADMIN ||
    userRole === APP_ROLES.SUPERADMIN;
  const canCreateInventory = canAdjustStock;

  const sedeId =
    activeSedeId ||
    user?.sede_id ||
    (typeof window !== "undefined"
      ? window.sessionStorage.getItem("beaux-sede_id")
      : "") ||
    (typeof window !== "undefined"
      ? window.localStorage.getItem("beaux-sede_id")
      : "") ||
    "";
  const sedeLabel =
    user?.nombre_local ||
    sedeId ||
    "Sede actual";

  const resolveToken = () =>
    user?.access_token ||
    user?.token ||
    (typeof window !== "undefined"
      ? window.sessionStorage.getItem("access_token")
      : null) ||
    (typeof window !== "undefined"
      ? window.localStorage.getItem("access_token")
      : null) ||
    null;

  const resetEdicionStock = () => {
    setProductoEditando(null);
    setStockTemporal("");
    setGuardandoStock(null);
  };

  const parseApiError = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    if (typeof error === "string") return error;
    return "No fue posible completar la operación";
  };

  const cargarInventario = async () => {
    if (!sedeId) {
      setError("No se encontró la sede activa");
      setIsLoading(false);
      return;
    }

    const token = resolveToken();
    if (!token) {
      setError("No se encontró token de autenticación");
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const data = await inventarioService.getInventarioUsuario(
        showLowStock,
        token,
        sedeId,
      );
      setProductos(data);
      setCurrentPage(1);
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const cargarCatalogoProductos = async () => {
    if (!canCreateInventory || !sedeId) return;
    const token = resolveToken();
    if (!token) return;

    try {
      setIsLoadingCatalogo(true);
      setCatalogoError(null);

      const response = await fetch(
        `${API_BASE_URL}inventary/product/productos/?moneda=COP&sede_id=${sedeId}`,
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          data?.detail || "No se pudo cargar el catálogo de productos",
        );
      }

      const items = Array.isArray(data)
        ? data
        : Array.isArray((data as { results?: unknown }).results)
          ? (data as { results: unknown[] }).results
          : [];

      const formatted = (items as any[])
        .filter((item) => item?._id && item?.nombre)
        .map((item) => ({
          id: String(item._id),
          nombre: String(item.nombre),
          codigo: item.codigo || item.producto_codigo || "—",
        }))
        .filter((item) => !productos.some((p) => p.producto_id === item.id));

      setCatalogoProductos(formatted);
    } catch (err) {
      setCatalogoError(parseApiError(err));
    } finally {
      setIsLoadingCatalogo(false);
    }
  };

  const iniciarEdicionStock = (producto: InventarioProducto) => {
    setProductoEditando(producto._id);
    setStockTemporal(String(producto.stock_actual ?? 0));
  };

  const guardarStock = async (producto: InventarioProducto) => {
    const token = resolveToken();
    if (!token) {
      setError("No se encontró token de autenticación");
      return;
    }

    const nuevoValor = Number(stockTemporal);
    if (Number.isNaN(nuevoValor)) {
      setError("Ingresa un valor numérico de stock");
      return;
    }

    const delta = nuevoValor - Number(producto.stock_actual ?? 0);
    if (delta === 0) {
      resetEdicionStock();
      return;
    }

    try {
      setGuardandoStock(producto._id);
      const result = await inventarioService.ajustarInventario(
        producto._id,
        delta,
        token,
      );
      if (!result.success) {
        setError(result.error || "No se pudo ajustar el stock");
        return;
      }
      setSuccessMessage(result.message || "Stock actualizado");
      await cargarInventario();
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      resetEdicionStock();
    }
  };

  const ajustarStockRapido = async (
    producto: InventarioProducto,
    delta: number,
  ) => {
    const token = resolveToken();
    if (!token) {
      setError("No se encontró token de autenticación");
      return;
    }
    try {
      setGuardandoStock(producto._id);
      const result = await inventarioService.ajustarInventario(
        producto._id,
        delta,
        token,
      );
      if (!result.success) {
        setError(result.error || "No se pudo ajustar el stock");
        return;
      }
      setSuccessMessage(result.message || "Stock actualizado");
      await cargarInventario();
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setGuardandoStock(null);
      setProductoEditando(null);
    }
  };

  const lineasDisponibles = useMemo(() => {
    const seen = new Set<string>();
    const result: { id: string; label: string }[] = [];

    productos.forEach((producto) => {
      const label = (producto.categoria || "").trim();
      if (!label) return;
      const id = normalizeText(label) || label.toLowerCase();
      if (seen.has(id)) return;
      seen.add(id);
      result.push({ id, label });
    });

    if (result.length === 0) {
      return [{ id: "general", label: "General" }];
    }

    return result;
  }, [productos]);

  useEffect(() => {
    if (activeLineaTab === "all") return;
    const exists = lineasDisponibles.some((l) => l.id === activeLineaTab);
    if (!exists) {
      setActiveLineaTab("all");
    }
  }, [lineasDisponibles, activeLineaTab]);

  const crearInventario = async () => {
    if (creacionModo === "manual") {
      setCatalogoError(
        "Crear producto desde cero está listo en UI. Conecta el endpoint de creación y reemplaza este aviso."
      );
      return;
    }

    const token = resolveToken();
    if (!token) {
      setCatalogoError("No se encontró token de autenticación");
      return;
    }
    if (!sedeId) {
      setCatalogoError("No se encontró la sede activa");
      return;
    }
    if (!nuevoProductoId) {
      setCatalogoError("Selecciona un producto del catálogo");
      return;
    }

    const payload = {
      producto_id: nuevoProductoId,
      sede_id: sedeId,
      stock_actual: Number(nuevoStockInicial) || 0,
      stock_minimo: Number(nuevoStockMinimo) || 0,
    };

    try {
      setIsCreatingInventario(true);
      setCatalogoError(null);
      const result = await inventarioService.crearInventario(payload, token);
      if (!result.success) {
        setCatalogoError(result.error || "No se pudo crear el inventario");
        return;
      }
      setSuccessMessage(result.message || "Producto agregado al inventario");
      setNuevoProductoId("");
      setNuevoStockInicial("0");
      setNuevoStockMinimo("5");
      setPrecioReferencia("");
      setCostoReferencia("");
      setTipoProducto("ACCESORIO");
      setLineaFormulario(lineasDisponibles[0]?.id ?? "");
      await Promise.all([cargarInventario(), cargarCatalogoProductos()]);
    } catch (err) {
      setCatalogoError(parseApiError(err));
    } finally {
      setIsCreatingInventario(false);
    }
  };

  const handleLineaChange = (lineaId: string) => {
    setActiveLineaTab(lineaId);
    setCurrentPage(1);
  };

  const handleFiltrarStockBajo = () => {
    setShowLowStock((prev) => !prev);
  };

  useEffect(() => {
    if (!authLoading && sedeId) {
      void cargarInventario();
    }
  }, [authLoading, sedeId, showLowStock]);

  useEffect(() => {
    if (!authLoading && canCreateInventory) {
      void cargarCatalogoProductos();
    }
  }, [authLoading, canCreateInventory, sedeId]);

  useEffect(() => {
    if (!lineaFormulario && lineasDisponibles.length > 0) {
      setLineaFormulario(lineasDisponibles[0].id);
    }
  }, [lineasDisponibles, lineaFormulario]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setError("Debes iniciar sesión para acceder al inventario");
      setIsLoading(false);
    }
  }, [authLoading, isAuthenticated]);

  useEffect(() => {
    if (!successMessage) return;
    const timeoutId = window.setTimeout(() => setSuccessMessage(null), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [successMessage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, activeLineaTab]);

  useEffect(() => {
    setHistorialPage(1);
  }, [historialPeriodo, sedeId, sedeLabel]);

  const filteredProductos = useMemo(() => {
    let data = [...productos];

    if (activeLineaTab !== "all") {
      data = data.filter((producto) =>
        normalizeText(producto.categoria) === normalizeText(activeLineaTab),
      );
    }

    if (showLowStock) {
      data = data.filter(
        (item) => Number(item.stock_actual ?? 0) <= Number(item.stock_minimo ?? 0),
      );
    }

    if (searchTerm.trim()) {
      const term = normalizeText(searchTerm);
      data = data.filter(
        (producto) =>
          normalizeText(producto.producto_nombre).includes(term) ||
          normalizeText(producto.nombre).includes(term) ||
          normalizeText(producto.producto_codigo).includes(term),
      );
    }

    return data;
  }, [productos, activeLineaTab, searchTerm, showLowStock]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredProductos.length / PAGE_SIZE),
  );
  const currentPageSafe = Math.min(currentPage, totalPages);
  const paginatedProductos = filteredProductos.slice(
    (currentPageSafe - 1) * PAGE_SIZE,
    currentPageSafe * PAGE_SIZE,
  );

  const kpis = useMemo(
    () => ({
      totalProductos: productos.length,
      totalUnidades: productos.reduce(
        (acc, item) => acc + Number(item.stock_actual ?? 0),
        0,
      ),
      criticos: productos.filter(
        (item) =>
          Number(item.stock_actual ?? 0) <= Number(item.stock_minimo ?? 0),
      ).length,
      sinStock: productos.filter((item) => Number(item.stock_actual ?? 0) <= 0)
        .length,
    }),
    [productos],
  );

  const scrollToCrearProducto = () => {
    const section = document.getElementById("crear-producto-panel");
    section?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const renderEstadoBadge = (producto: InventarioProducto) => {
    const actual = Number(producto.stock_actual ?? 0);
    const minimo = Number(producto.stock_minimo ?? 0);

    if (actual <= 0) {
      return (
        <Badge
          variant="outline"
          className="border-gray-400 bg-gray-200 text-gray-900"
        >
          Sin stock
        </Badge>
      );
    }

    if (actual <= minimo) {
      return (
        <Badge
          variant="outline"
          className="border-gray-300 bg-gray-100 text-gray-800"
        >
          Crítico
        </Badge>
      );
    }

    return (
      <Badge
        variant="outline"
        className="border-gray-300 bg-gray-100 text-gray-700"
      >
        Entrada
      </Badge>
    );
  };

  const pageStart = filteredProductos.length === 0 ? 0 : (currentPageSafe - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(filteredProductos.length, currentPageSafe * PAGE_SIZE);

  const filteredHistorial = useMemo(() => {
    const days = Number(historialPeriodo);
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - (Number.isFinite(days) ? days - 1 : 0));

    const usuarioNombre = (() => {
      const candidate =
        (user as any)?.nombre_local ||
        (user as any)?.email ||
        (user as any)?.name;
      return typeof candidate === "string" && candidate.trim()
        ? candidate
        : "Usuario";
    })();

    const movimientos: Movimiento[] = productos.slice(0, 50).map((p, idx) => {
      const fecha = new Date();
      fecha.setHours(0, 0, 0, 0);
      fecha.setDate(fecha.getDate() - idx);

      return {
        producto: p.producto_nombre || p.nombre || "Producto",
        sede: sedeLabel,
        sede_id: sedeId || undefined,
        tipo: "Salida",
        usuario: usuarioNombre,
        fecha: fecha.toISOString().split("T")[0],
        cantidad: Number(p.stock_minimo ?? 1) || 1,
      };
    });

    return movimientos.filter((m) => {
      const d = new Date(m.fecha);
      if (Number.isNaN(d.getTime())) return false;
      d.setHours(0, 0, 0, 0);
      return d >= cutoff;
    });
  }, [historialPeriodo, productos, sedeId, sedeLabel, user]);

  const totalHistPages = Math.max(1, Math.ceil(filteredHistorial.length / HIST_PAGE_SIZE));
  const historialPageSafe = Math.min(historialPage, totalHistPages);
  const paginatedHistorial = filteredHistorial.slice(
    (historialPageSafe - 1) * HIST_PAGE_SIZE,
    historialPageSafe * HIST_PAGE_SIZE,
  );

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-8 space-y-6">
          {error ? (
            <Alert variant="destructive" className="border-gray-300 bg-gray-50 text-gray-800">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {successMessage ? (
            <Alert className="border-gray-300 bg-gray-50 text-gray-800">
              <Check className="h-4 w-4" />
              <AlertDescription>{successMessage}</AlertDescription>
            </Alert>
          ) : null}

          <PageHeader
            title="Productos"
            actions={
              canCreateInventory ? (
                <Button
                  onClick={scrollToCrearProducto}
                  className="bg-black text-white hover:bg-gray-800"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Crear producto
                </Button>
              ) : null
            }
          />

          {/* KPI cards eliminados según pedido */}

            <Card className="border-gray-200 bg-white shadow-sm">
            <CardHeader className="space-y-4 pb-2">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  {[{ id: "all", label: "Todos" }, ...lineasDisponibles].map((linea) => (
                    <Button
                      key={linea.id}
                      size="sm"
                      variant="outline"
                      onClick={() => handleLineaChange(linea.id)}
                      className={cn(
                        "rounded-md border border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100",
                        activeLineaTab === linea.id &&
                          "border-black bg-black text-white hover:bg-gray-800"
                      )}
                    >
                      {linea.label}
                    </Button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
                  <span className="rounded-md border border-gray-300 bg-gray-50 px-3 py-1">
                    {kpis.totalProductos} productos
                  </span>
                  <span className="rounded-md border border-gray-300 bg-gray-50 px-3 py-1">
                    {kpis.totalUnidades} unidades
                  </span>
                  <span className="rounded-md border border-gray-300 bg-gray-50 px-3 py-1">
                    {kpis.criticos} críticos
                  </span>
                  <span className="rounded-md border border-gray-300 bg-gray-50 px-3 py-1">
                    {kpis.sinStock} sin stock
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <div className="relative flex-1 min-w-[240px]">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar productos..."
                    className="h-11 rounded-md border-gray-300 bg-white pl-10 text-sm focus-visible:border-gray-500 focus-visible:ring-gray-500"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
                    <Building2 className="h-4 w-4 text-gray-500" />
                    <div className="leading-tight">
                      <div className="text-[11px] uppercase tracking-[0.08em] text-gray-400">
                        Sede
                      </div>
                      <div className="font-medium text-gray-800">{sedeLabel}</div>
                    </div>
                  </div>

                  <Button
                    variant={showLowStock ? "default" : "outline"}
                    onClick={handleFiltrarStockBajo}
                    className={cn(
                      "text-sm",
                      showLowStock
                        ? "bg-black text-white hover:bg-gray-800"
                        : "border-gray-300 text-gray-700 hover:bg-gray-100",
                    )}
                  >
                    <SlidersHorizontal className="mr-2 h-4 w-4" />
                    Ver stock bajo
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-gray-50">
                  <TableRow>
                    <TableHead className="w-[140px] px-4 py-3 text-xs font-semibold text-gray-700">
                      Producto
                    </TableHead>
                    <TableHead className="px-4 py-3 text-xs font-semibold text-gray-700">
                      Línea
                    </TableHead>
                    <TableHead className="px-4 py-3 text-xs font-semibold text-gray-700">
                      SKU
                    </TableHead>
                    <TableHead className="px-4 py-3 text-right text-xs font-semibold text-gray-700">
                      Stock actual
                    </TableHead>
                    <TableHead className="px-4 py-3 text-right text-xs font-semibold text-gray-700">
                      Ventas
                    </TableHead>
                    <TableHead className="px-4 py-3 text-right text-xs font-semibold text-gray-700">
                      Precio
                    </TableHead>
                    <TableHead className="px-4 py-3 text-xs font-semibold text-gray-700">
                      Estado
                    </TableHead>
                    <TableHead className="px-4 py-3 text-right text-xs font-semibold text-gray-700">
                      Acciones
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="px-4 py-8 text-center text-sm text-gray-500"
                      >
                        <div className="flex items-center justify-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Cargando productos...
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : paginatedProductos.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="px-4 py-10 text-center text-sm text-gray-500"
                      >
                        No hay productos para mostrar con los filtros actuales
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedProductos.map((producto) => {
                      return (
                        <TableRow
                          key={producto._id}
                          className="hover:bg-gray-50"
                        >
                          <TableCell className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <Avatar className="h-9 w-9 border border-gray-200 bg-gray-100">
                                <AvatarFallback className="bg-white text-gray-600">
                                  <Package className="h-5 w-5" />
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <div className="font-semibold text-gray-900">
                                  {producto.producto_nombre ||
                                    producto.nombre ||
                                    "Producto"}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {producto.producto_codigo || "—"}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-3">
                            <Badge
                              variant="outline"
                              className="border-gray-300 bg-gray-50 text-gray-700"
                            >
                              {producto.categoria || "—"}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-4 py-3">
                            {producto.producto_codigo || "—"}
                          </TableCell>
                          <TableCell className="px-4 py-3 text-right font-semibold text-gray-900">
                            {producto.stock_actual ?? 0}
                          </TableCell>
                          <TableCell className="px-4 py-3 text-right text-gray-700">
                            {typeof producto.ventas === "number"
                              ? producto.ventas
                              : "—"}
                          </TableCell>
                          <TableCell className="px-4 py-3 text-right text-gray-700">
                            {producto.precio ? formatMoney(producto.precio) : "—"}
                          </TableCell>
                          <TableCell className="px-4 py-3">
                            {renderEstadoBadge(producto)}
                          </TableCell>
                          <TableCell className="px-4 py-3 text-right">
                            {canAdjustStock ? (
                              productoEditando === producto._id ? (
                                <div className="flex items-center justify-end gap-2">
                                  <Input
                                    type="number"
                                    value={stockTemporal}
                                    onChange={(e) => setStockTemporal(e.target.value)}
                                    className="w-24"
                                    min={0}
                                  />
                                  <Button
                                    size="sm"
                                    onClick={() => guardarStock(producto)}
                                    disabled={guardandoStock === producto._id}
                                  >
                                    {guardandoStock === producto._id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      "Guardar"
                                    )}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={resetEdicionStock}
                                    className="text-gray-600"
                                  >
                                    <X className="mr-1 h-4 w-4" />
                                    Cancelar
                                  </Button>
                                </div>
                              ) : (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="bg-white">
                                    <DropdownMenuItem
                                      onSelect={(event) => {
                                        event.preventDefault();
                                        void ajustarStockRapido(producto, 1);
                                      }}
                                    >
                                      <ArrowUpRight className="mr-2 h-4 w-4" /> Entrada rápida
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onSelect={(event) => {
                                        event.preventDefault();
                                        void ajustarStockRapido(producto, -1);
                                      }}
                                    >
                                      <ArrowDownRight className="mr-2 h-4 w-4" /> Salida rápida
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onSelect={(event) => {
                                        event.preventDefault();
                                        iniciarEdicionStock(producto);
                                      }}
                                    >
                                      Editar stock
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )
                            ) : (
                              <span className="text-xs text-gray-500">Solo lectura</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>

              <div className="flex flex-wrap items-center justify-between border-t border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
                <div>
                  Mostrando {pageStart}-{pageEnd} de {filteredProductos.length}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPageSafe === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Anterior
                  </Button>
                  <div className="text-xs text-gray-500">
                    Página {currentPageSafe} de {totalPages}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                    disabled={currentPageSafe === totalPages}
                  >
                    Siguiente
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card
              id="crear-producto-panel"
              className="border-gray-200 bg-white shadow-sm"
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg font-semibold">Crear producto</CardTitle>
                    <p className="text-sm text-gray-500">
                      Reutiliza el catálogo existente y registra el stock inicial.
                    </p>
                  </div>
                  <Sparkles className="h-5 w-5 text-gray-500" />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {catalogoError ? (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{catalogoError}</AlertDescription>
                  </Alert>
                ) : null}

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={creacionModo === "catalogo" ? "default" : "outline"}
                    className={creacionModo === "catalogo" ? "bg-black text-white hover:bg-gray-800" : "border-gray-300 text-gray-700"}
                    onClick={() => setCreacionModo("catalogo")}
                  >
                    Usar catálogo
                  </Button>
                  <Button
                    size="sm"
                    variant={creacionModo === "manual" ? "default" : "outline"}
                    className={creacionModo === "manual" ? "bg-black text-white hover:bg-gray-800" : "border-gray-300 text-gray-700"}
                    onClick={() => setCreacionModo("manual")}
                  >
                    Crear
                  </Button>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Select
                    value={lineaFormulario}
                    onValueChange={(value) => setLineaFormulario(value)}
                  >
                    <SelectTrigger className="border-gray-300 bg-white">
                      <SelectValue placeholder="Línea de producto" />
                    </SelectTrigger>
                    <SelectContent className="bg-white">
                      {lineasDisponibles.map((linea) => (
                        <SelectItem key={linea.id} value={linea.id}>
                          {linea.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={tipoProducto}
                    onValueChange={(value) => setTipoProducto(value)}
                  >
                    <SelectTrigger className="border-gray-300 bg-white">
                      <SelectValue placeholder="Tipo de producto" />
                    </SelectTrigger>
                    <SelectContent className="bg-white">
                      <SelectItem value="ACCESORIO">ACCESORIO</SelectItem>
                      <SelectItem value="TRATAMIENTO">TRATAMIENTO</SelectItem>
                      <SelectItem value="HERRAMIENTA">HERRAMIENTA</SelectItem>
                    </SelectContent>
                  </Select>

                  {creacionModo === "catalogo" ? (
                    <>
                      <Select
                        value={nuevoProductoId}
                        onValueChange={(value) => setNuevoProductoId(value)}
                        disabled={isLoadingCatalogo}
                      >
                        <SelectTrigger className="col-span-1 sm:col-span-2 border-gray-300 bg-white">
                          <SelectValue
                            placeholder={
                              isLoadingCatalogo
                                ? "Cargando catálogo..."
                                : "Nombre (selecciona del catálogo)"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent className="bg-white">
                          {catalogoProductos.length === 0 ? (
                            <SelectItem value="none" disabled>
                              {isLoadingCatalogo
                                ? "Cargando..."
                                : "No hay productos disponibles"}
                            </SelectItem>
                          ) : (
                            catalogoProductos.map((item) => (
                              <SelectItem key={item.id} value={item.id}>
                                {item.nombre} — {item.codigo}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>

                      <Input
                        value={
                          catalogoProductos.find((item) => item.id === nuevoProductoId)?.codigo ||
                          "SKU"
                        }
                        readOnly
                        className="border-gray-300 bg-gray-100 text-gray-600"
                      />
                    </>
                  ) : (
                    <>
                      <Input
                        value={nuevoNombreManual}
                        onChange={(e) => setNuevoNombreManual(e.target.value)}
                        placeholder="Nombre del producto"
                        className="col-span-1 sm:col-span-2 border-gray-300"
                      />
                      <Input
                        value={nuevoSkuManual}
                        onChange={(e) => setNuevoSkuManual(e.target.value)}
                        placeholder="SKU / Código"
                        className="border-gray-300"
                      />
                    </>
                  )}

                  <Input
                    type="number"
                    min={0}
                    value={nuevoStockInicial}
                    onChange={(e) => setNuevoStockInicial(e.target.value)}
                    placeholder="Stock inicial"
                    className="border-gray-300"
                  />

                  <Input
                    type="number"
                    min={0}
                    value={nuevoStockMinimo}
                    onChange={(e) => setNuevoStockMinimo(e.target.value)}
                    placeholder="Stock mínimo"
                    className="border-gray-300"
                  />

                  <Input
                    type="number"
                    min={0}
                    value={precioReferencia}
                    onChange={(e) => setPrecioReferencia(e.target.value)}
                    placeholder="Precio de venta"
                    className="border-gray-300"
                  />

                  <Input
                    type="number"
                    min={0}
                    value={costoReferencia}
                    onChange={(e) => setCostoReferencia(e.target.value)}
                    placeholder="Costo"
                    className="border-gray-300"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500">
                  <span>Precios y costos son de referencia (el backend aún no los almacena).</span>
                </div>

                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setNuevoProductoId("");
                      setLineaFormulario(lineasDisponibles[0]?.id ?? "");
                      setNuevoNombreManual("");
                      setNuevoSkuManual("");
                      setNuevoStockInicial("0");
                      setNuevoStockMinimo("5");
                      setPrecioReferencia("");
                      setCostoReferencia("");
                      setCreacionModo("catalogo");
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={crearInventario}
                    disabled={isCreatingInventario}
                    className="bg-black text-white hover:bg-gray-800"
                  >
                    {isCreatingInventario ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Registrar producto
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-gray-200 bg-white shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <div>
                  <CardTitle className="text-lg font-semibold">
                    Historial de salidas
                  </CardTitle>
                  <p className="text-sm text-gray-500">Últimos {historialPeriodo} días</p>
                </div>
                <Select value={historialPeriodo} onValueChange={(v: "7" | "30" | "90") => setHistorialPeriodo(v)}>
                  <SelectTrigger className="w-[150px] border-gray-300 bg-white text-sm">
                    <SelectValue placeholder="Últimos 30 días" />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    <SelectItem value="7">Últimos 7 días</SelectItem>
                    <SelectItem value="30">Últimos 30 días</SelectItem>
                    <SelectItem value="90">Últimos 90 días</SelectItem>
                  </SelectContent>
                </Select>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  {["Todos", ...lineasDisponibles.map((l) => l.label)].map((label) => (
                    <Button
                      key={label}
                      size="sm"
                      variant="outline"
                      className="rounded-md border-gray-300"
                      disabled
                    >
                      {label}
                    </Button>
                  ))}
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <Input
                    disabled
                    placeholder="Buscar por producto, usuario o nota..."
                    className="h-10 rounded-md border-gray-300 bg-white pl-9"
                  />
                </div>

                <div className="overflow-hidden rounded-lg border border-gray-200">
                  <Table>
                    <TableHeader className="bg-gray-50">
                      <TableRow>
                        <TableHead className="px-4 py-3 text-xs font-semibold text-gray-700">Producto</TableHead>
                        <TableHead className="px-4 py-3 text-xs font-semibold text-gray-700">Sede</TableHead>
                        <TableHead className="px-4 py-3 text-xs font-semibold text-gray-700">Salida</TableHead>
                        <TableHead className="px-4 py-3 text-xs font-semibold text-gray-700">Usuario</TableHead>
                        <TableHead className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Fecha</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedHistorial.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="py-8 text-center text-sm text-gray-500">
                            No hay movimientos en este período
                          </TableCell>
                        </TableRow>
                      ) : (
                        paginatedHistorial.map((row, idx) => (
                        <TableRow key={`${row.producto}-${idx}`} className="hover:bg-gray-50">
                          <TableCell className="px-4 py-3">
                            <div className="font-medium text-gray-900">{row.producto}</div>
                            <div className="text-xs text-gray-500">{row.cantidad ?? 0} unidades</div>
                          </TableCell>
                          <TableCell className="px-4 py-3 text-sm text-gray-700">{row.sede}</TableCell>
                          <TableCell className="px-4 py-3">
                            <Badge
                              variant="outline"
                              className={cn(
                                "rounded-md border-gray-300",
                                row.tipo === "Salida"
                                  ? "bg-gray-200 text-gray-900"
                                  : "bg-gray-100 text-gray-700",
                              )}
                            >
                              {row.tipo}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-4 py-3 text-sm text-gray-700">{row.usuario}</TableCell>
                          <TableCell className="px-4 py-3 text-right text-sm text-gray-700">
                            {formatDate(row.fecha)}
                          </TableCell>
                        </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600">
                  <div>
                    Mostrando{" "}
                    {paginatedHistorial.length === 0
                      ? 0
                      : (historialPageSafe - 1) * HIST_PAGE_SIZE + 1}
                    -
                    {Math.min(filteredHistorial.length, historialPageSafe * HIST_PAGE_SIZE)} de{" "}
                    {filteredHistorial.length}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setHistorialPage((p) => Math.max(1, p - 1))}
                      disabled={historialPageSafe === 1 || paginatedHistorial.length === 0}
                    >
                      Anterior
                    </Button>
                    <div className="text-xs text-gray-500">
                      Página {historialPageSafe} de {totalHistPages}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setHistorialPage((p) => Math.min(totalHistPages, p + 1))}
                      disabled={historialPageSafe === totalHistPages || paginatedHistorial.length === 0}
                    >
                      Siguiente
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
