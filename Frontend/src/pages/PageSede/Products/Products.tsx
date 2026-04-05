"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Search,
  SlidersHorizontal,
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

const LINEAS = [
  { id: "Rizos Felices", label: "Rizos Felices" },
  { id: "Profesional", label: "Profesional" },
  { id: "Tratamientos", label: "Tratamientos" },
  { id: "Otros", label: "Otros" },
];

const PAGE_SIZE = 8;

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

const parseApiError = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "No fue posible completar la operación";
};

const stockStatus = (producto: InventarioProducto) => {
  const actual = Number(producto.stock_actual ?? 0);
  const minimo = Number(producto.stock_minimo ?? 0);

  if (actual <= 0)
    return { label: "Sin stock", variant: "destructive" as const };
  if (actual <= minimo)
    return { label: "Crítico", variant: "secondary" as const };
  return { label: "OK", variant: "outline" as const };
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
  const [selectedCategoria, setSelectedCategoria] = useState<string>("all");
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
  const [nuevoStockInicial, setNuevoStockInicial] = useState("0");
  const [nuevoStockMinimo, setNuevoStockMinimo] = useState("5");
  const [lineaFormulario, setLineaFormulario] = useState<string>(
    LINEAS[0]?.id ?? "Rizos Felices",
  );
  const [isCreatingInventario, setIsCreatingInventario] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);

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

  const crearInventario = async () => {
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
      await Promise.all([cargarInventario(), cargarCatalogoProductos()]);
    } catch (err) {
      setCatalogoError(parseApiError(err));
    } finally {
      setIsCreatingInventario(false);
    }
  };

  const handleLineaChange = (lineaId: string) => {
    setActiveLineaTab(lineaId);
    setSelectedCategoria(lineaId);
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
  }, [searchTerm, selectedCategoria, activeLineaTab]);

  const filteredProductos = useMemo(() => {
    let data = [...productos];

    if (activeLineaTab !== "all") {
      data = data.filter((producto) =>
        normalizeText(producto.categoria).includes(
          normalizeText(activeLineaTab),
        ),
      );
    }

    if (selectedCategoria !== "all") {
      data = data.filter((producto) =>
        normalizeText(producto.categoria).includes(
          normalizeText(selectedCategoria),
        ),
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
  }, [productos, activeLineaTab, selectedCategoria, searchTerm]);

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
    const { label, variant } = stockStatus(producto);
    return <Badge variant={variant}>{label}</Badge>;
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-6 lg:p-10">
        <PageHeader
          title="Inventario"
          subtitle="Administra el stock por sede"
          actions={
            canCreateInventory ? (
              <Button onClick={scrollToCrearProducto} variant="secondary">
                <Plus className="mr-2 h-4 w-4" />
                Crear producto
              </Button>
            ) : null
          }
        />

        {error ? (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {successMessage ? (
          <Alert className="mb-4 border-emerald-200 bg-emerald-50 text-emerald-800">
            <Check className="h-4 w-4" />
            <AlertDescription>{successMessage}</AlertDescription>
          </Alert>
        ) : null}

        <Card className="mb-6 shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex flex-wrap items-center gap-3">
              {LINEAS.map((linea) => (
                <Button
                  key={linea.id}
                  variant={activeLineaTab === linea.id ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => handleLineaChange(linea.id)}
                  className={cn(
                    "rounded-full px-4",
                    activeLineaTab === linea.id && "border border-gray-200",
                  )}
                >
                  {linea.label}
                </Button>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-sm text-gray-700">
              <Badge variant="outline" className="bg-white">
                {kpis.totalProductos} productos
              </Badge>
              <Badge variant="outline" className="bg-white">
                {kpis.totalUnidades} unidades
              </Badge>
              <Badge variant="outline" className="bg-white">
                {kpis.criticos} críticos
              </Badge>
              <Badge variant="outline" className="bg-white">
                {kpis.sinStock} sin stock
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar producto..."
                className="pl-9"
              />
            </div>

            <Select
              value={selectedCategoria}
              onValueChange={(value) => setSelectedCategoria(value)}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Todas las líneas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las líneas</SelectItem>
                {LINEAS.map((linea) => (
                  <SelectItem key={linea.id} value={linea.id}>
                    {linea.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant={showLowStock ? "secondary" : "outline"}
              onClick={handleFiltrarStockBajo}
              className="gap-2"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filtre
            </Button>

            {canCreateInventory ? (
              <Button onClick={scrollToCrearProducto} className="gap-2">
                <Plus className="h-4 w-4" />
                Crear producto
              </Button>
            ) : null}
          </CardContent>
        </Card>

        <Card className="mb-8 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-lg font-semibold">Inventario</CardTitle>
            <div className="text-sm text-gray-500">
              Sede: {sedeId || "No disponible"}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-gray-50">
                <TableRow>
                  <TableHead className="w-[220px]">Producto</TableHead>
                  <TableHead>Línea</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Stock actual</TableHead>
                  <TableHead className="text-right">Stock mínimo</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead>Último movimiento</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="py-8 text-center text-sm text-gray-500"
                    >
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Cargando inventario...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : paginatedProductos.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="py-8 text-center text-sm text-gray-500"
                    >
                      No hay productos para mostrar con los filtros actuales
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedProductos.map((producto) => (
                    <TableRow
                      key={producto._id}
                      className="hover:bg-gray-50/60"
                    >
                      <TableCell>
                        <div className="font-semibold text-gray-900">
                          {producto.producto_nombre ||
                            producto.nombre ||
                            "Producto"}
                        </div>
                        <div className="text-xs text-gray-500">
                          {producto.producto_codigo}
                        </div>
                      </TableCell>
                      <TableCell>{producto.categoria || "—"}</TableCell>
                      <TableCell>{producto.producto_codigo || "—"}</TableCell>
                      <TableCell className="text-right font-semibold text-gray-900">
                        {producto.stock_actual ?? 0}
                      </TableCell>
                      <TableCell className="text-right text-gray-700">
                        {producto.stock_minimo ?? 0}
                      </TableCell>
                      <TableCell className="text-right text-gray-500">
                        —
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {producto.fecha_ultima_actualizacion
                            ? formatDate(producto.fecha_ultima_actualizacion)
                            : "Sin datos"}
                        </Badge>
                      </TableCell>
                      <TableCell>{renderEstadoBadge(producto)}</TableCell>
                      <TableCell className="text-right">
                        {canAdjustStock ? (
                          productoEditando === producto._id ? (
                            <div className="flex items-center justify-end gap-2">
                              <Input
                                type="number"
                                value={stockTemporal}
                                onChange={(e) =>
                                  setStockTemporal(e.target.value)
                                }
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
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => iniciarEdicionStock(producto)}
                            >
                              Editar stock
                            </Button>
                          )
                        ) : (
                          <span className="text-xs text-gray-500">
                            Solo lectura
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-gray-600">
              <div>
                Página {currentPageSafe} de {totalPages}
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
          <Card id="crear-producto-panel" className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">
                Crear producto
              </CardTitle>
              <p className="text-sm text-gray-500">
                Reutiliza el catálogo existente. Precios y costos no se envían
                al backend actual.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {catalogoError ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{catalogoError}</AlertDescription>
                </Alert>
              ) : null}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Select
                  value={lineaFormulario}
                  onValueChange={(value) => setLineaFormulario(value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Línea de producto" />
                  </SelectTrigger>
                  <SelectContent>
                    {LINEAS.map((linea) => (
                      <SelectItem key={linea.id} value={linea.id}>
                        {linea.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Input
                  value="No disponible (backend)"
                  readOnly
                  className="cursor-not-allowed bg-gray-100 text-gray-500"
                />

                <Select
                  value={nuevoProductoId}
                  onValueChange={(value) => setNuevoProductoId(value)}
                  disabled={isLoadingCatalogo}
                >
                  <SelectTrigger className="col-span-1 sm:col-span-2">
                    <SelectValue
                      placeholder={
                        isLoadingCatalogo
                          ? "Cargando catálogo..."
                          : "Selecciona producto"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
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
                    catalogoProductos.find(
                      (item) => item.id === nuevoProductoId,
                    )?.codigo || "SKU"
                  }
                  readOnly
                  className="col-span-1 sm:col-span-2 bg-gray-100 text-gray-600"
                />

                <Input
                  type="number"
                  min={0}
                  value={nuevoStockMinimo}
                  onChange={(e) => setNuevoStockMinimo(e.target.value)}
                  placeholder="Stock mínimo"
                />
                <Input
                  type="number"
                  min={0}
                  value={nuevoStockInicial}
                  onChange={(e) => setNuevoStockInicial(e.target.value)}
                  placeholder="Stock inicial"
                />

                <Input
                  value="Precio de venta (falta en backend)"
                  readOnly
                  className="col-span-1 sm:col-span-2 cursor-not-allowed bg-gray-100 text-gray-500"
                />
                <Input
                  value="Costo (falta en backend)"
                  readOnly
                  className="col-span-1 sm:col-span-2 cursor-not-allowed bg-gray-100 text-gray-500"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setNuevoProductoId("");
                    setNuevoStockInicial("0");
                    setNuevoStockMinimo("5");
                    setLineaFormulario(LINEAS[0]?.id ?? "Rizos Felices");
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={crearInventario}
                  disabled={isCreatingInventario}
                >
                  {isCreatingInventario ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Registrar producto
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-lg font-semibold">
                  Historial de salidas
                </CardTitle>
                <p className="text-sm text-gray-500">
                  Pendiente de endpoint de historial para mostrar movimientos.
                </p>
              </div>
              <Select disabled>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Últimos 30 días" />
                </SelectTrigger>
              </Select>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {["Todos", ...LINEAS.map((l) => l.label)].map((label) => (
                  <Button
                    key={label}
                    size="sm"
                    variant="outline"
                    disabled
                    className="rounded-full"
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
                  className="pl-9"
                />
              </div>
              <div className="flex items-center justify-center rounded-md border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                Conecta el endpoint de movimientos para mostrar el historial de
                salidas por sede.
              </div>
              <div className="flex items-center justify-end gap-2 text-sm text-gray-500">
                <Button variant="outline" size="sm" disabled>
                  Anterior
                </Button>
                <Button variant="outline" size="sm" disabled>
                  Siguiente
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
