"use client";

import { type ComponentType, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  Loader2,
  Plus,
  Save,
  Settings2,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Sidebar } from "../../components/Layout/Sidebar";
import { PageHeader } from "../../components/Layout/PageHeader";
import { Button } from "../../components/ui/button";
import { Avatar, AvatarFallback } from "../../components/ui/avatar";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { useAuth } from "../../components/Auth/AuthContext";
import { facturaService, type FacturaConverted } from "../../pages/PageSuperAdmin/Sales-invoiced/facturas";
import { sedeService, type Sede } from "../../pages/PageSuperAdmin/Sedes/sedeService";
import { systemUsersService } from "../../pages/PageSuperAdmin/SystemUsers/systemUsersService";
import type { Estilista, CreateEstilistaData } from "../../types/estilista";
import type { SystemUser } from "../../types/system-user";
import { formatSedeNombre } from "../../lib/sede";
import { formatCurrencyNoDecimals, getStoredCurrency } from "../../lib/currency";
import {
  buildCategoryCommissionPayload,
  resolveCategoryCommissionEntries,
  resolveServiceCommissions,
  type ServiceCommissionEntry,
} from "../../lib/serviceCommissions";
import { getCitas } from "../../components/Quotes/citasApi";
import { getHorariosEstilista } from "../../components/Quotes/horariosApi";
import {
  buildStylistDashboardRows,
  buildVendorRows,
  enumerateDateRange,
  getAllowedSedeIds,
  getDefaultDateRange,
  normalizeAppointmentRecord,
  normalizeScheduleRecord,
  type DateRangeValue,
  type StylistDashboardRow,
  type TeamAppointmentRecord,
  type TeamScheduleRecord,
} from "./stylists-team.utils";

type DashboardRowWithProducts = StylistDashboardRow & { cantidadProductos: number };

const DEFAULT_STYLIST_PASSWORD = "Temporal123!";

type StylistsTeamWorkspaceProps = {
  servicesApi: {
    getServicios: (
      token: string,
      moneda?: string,
    ) => Promise<
      Array<{
        id?: string;
        servicio_id?: string;
        nombre: string;
        categoria?: string;
        duracion?: number;
        precio?: number;
        precio_local?: number;
      }>
    >;
  };
  stylistApi: {
    getEstilistas: (token: string) => Promise<Estilista[]>;
    createEstilista: (token: string, payload: CreateEstilistaData) => Promise<Estilista>;
    createHorario?: (token: string, horario: LegacyScheduleData) => Promise<unknown>;
    updateHorario?: (token: string, horarioId: string, horario: LegacyScheduleData) => Promise<unknown>;
    updateEstilista: (
      token: string,
      profesionalId: string,
      payload: Partial<Estilista> & Record<string, unknown>,
    ) => Promise<Estilista>;
    updateServicios?: (
      token: string,
      profesionalId: string,
      serviciosNoPresta: string[],
    ) => Promise<unknown>;
    updateServiceCommissions?: (
      token: string,
      profesionalId: string,
      payload: Record<string, number>,
    ) => Promise<unknown>;
    deleteEstilista: (token: string, profesionalId: string) => Promise<void>;
  };
  legacyCreateModal?: ComponentType<LegacyCreateModalProps>;
};

type ViewMode = "dashboard" | "settings";

type ServiceOption = {
  id: string;
  nombre: string;
  categoria: string;
  duracion: number;
  precio: number;
};

type EditorState = {
  mode: "create" | "edit";
  nombre: string;
  email: string;
  telefono: string;
  rol: string;
  sede_id: string;
  comision: string;
  password: string;
  activo: boolean;
  serviceIds: string[];
  serviceCommissions: ServiceCommissionEntry[];
  productCommission: string;
};

type LegacyScheduleData = {
  profesional_id: string;
  sede_id: string;
  disponibilidad: Array<{
    dia_semana: number;
    hora_inicio: string;
    hora_fin: string;
    activo: boolean;
  }>;
};

type LegacyCreatePayload = Partial<Estilista> & {
  password?: string;
  horario?: LegacyScheduleData;
  horarioId?: string;
};

type LegacyCreateModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSave: (payload: LegacyCreatePayload) => void;
  estilista: Estilista | null;
  isSaving?: boolean;
};

const DASHBOARD_HEADERS: Array<{ key: keyof DashboardRowWithProducts; lines: string[] }> = [
  { key: "nombre", lines: ["Estilistas"] },
  { key: "citas", lines: ["# de Citas"] },
  { key: "cantidadProductos", lines: ["Cantidad de", "Productos"] },
  { key: "totalVentaServicios", lines: ["Total Venta", "Servicios"] },
  { key: "totalVentaProductos", lines: ["Total Ventas", "Productos"] },
  { key: "totalVentas", lines: ["Total", "Ventas"] },
  { key: "comisionesServicios", lines: ["Comisiones por", "Servicios"] },
  { key: "comisionesProductos", lines: ["Comisiones", "Productos"] },
  { key: "totalComisiones", lines: ["Total", "Comisiones"] },
];

const ROLE_LABELS: Record<string, string> = {
  admin_sede: "Admin sede",
  recepcionista: "Recepcionista",
  estilista: "Estilista",
  call_center: "Call center",
  super_admin: "Super admin",
  superadmin: "Super admin",
};

const ALL_SEDES_VALUE = "__ALL_SEDES__";

const normalizeText = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const getRoleLabel = (role: string): string => {
  const normalized = normalizeText(role).replace(/[\s-]+/g, "_");
  return ROLE_LABELS[normalized] ?? role ?? "Sin rol";
};

const getInitials = (name: string): string =>
  name
    .split(" ")
    .map((part) => part.trim().charAt(0).toUpperCase())
    .filter(Boolean)
    .slice(0, 2)
    .join("") || "ST";

const parseCommissionValue = (value: string): number | null => {
  const raw = value.trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && !Number.isNaN(parsed) ? parsed : null;
};

const formatDateRangeSelectValue = (value?: string): string => {
  const date = value ? new Date(`${value}T00:00:00`) : null;
  if (!date || Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
    .format(date)
    .replace(/\./g, "")
    .replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
};

const formatDateRangeSelectLabel = (range: DateRangeValue): string => {
  const startLabel = formatDateRangeSelectValue(range.start);
  const endLabel = formatDateRangeSelectValue(range.end);

  if (!startLabel || !endLabel) {
    return "Seleccionar rango";
  }

  return `${startLabel} - ${endLabel}`;
};

const chunk = <T,>(items: T[], size: number): T[][] => {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
};

function HeaderLabel({ lines }: { lines: string[] }) {
  return (
    <span className="inline-flex min-w-[88px] flex-col leading-[1.15] whitespace-normal">
      {lines.map((line) => (
        <span key={line}>{line}</span>
      ))}
    </span>
  );
}

function EmptyPanel({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 p-8 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm">
        <Users className="h-6 w-6 text-slate-500" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-slate-500">{description}</p>
    </div>
  );
}

export function StylistsTeamWorkspace({
  servicesApi,
  stylistApi,
  legacyCreateModal: LegacyCreateModal,
}: StylistsTeamWorkspaceProps) {
  const { user, activeSedeId, setActiveSedeId, isLoading: authLoading } = useAuth();
  const [viewMode, setViewMode] = useState<ViewMode>("dashboard");
  const [dateRange, setDateRange] = useState<DateRangeValue>(getDefaultDateRange);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [stylists, setStylists] = useState<Estilista[]>([]);
  const [systemUsers, setSystemUsers] = useState<SystemUser[]>([]);
  const [selectedSedeId, setSelectedSedeId] = useState("");
  const [selectedStylistId, setSelectedStylistId] = useState("");
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [metricsWarning, setMetricsWarning] = useState<string | null>(null);
  const [isBootLoading, setIsBootLoading] = useState(true);
  const [isMetricsLoading, setIsMetricsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLegacyCreateOpen, setIsLegacyCreateOpen] = useState(false);
  const [isLegacyCreateSaving, setIsLegacyCreateSaving] = useState(false);
  const [legacyEditStylist, setLegacyEditStylist] = useState<Estilista | null>(null);
  const [isDateRangeOpen, setIsDateRangeOpen] = useState(false);
  const [invoices, setInvoices] = useState<FacturaConverted[]>([]);
  const [appointments, setAppointments] = useState<TeamAppointmentRecord[]>([]);
  const [schedulesByStylist, setSchedulesByStylist] = useState<Record<string, TeamScheduleRecord[]>>({});
  const commissionsSectionRef = useRef<HTMLDivElement | null>(null);

  const invoicesCacheRef = useRef<Map<string, FacturaConverted[]>>(new Map());
  const appointmentsCacheRef = useRef<Map<string, TeamAppointmentRecord[]>>(new Map());
  const schedulesCacheRef = useRef<Map<string, TeamScheduleRecord[]>>(new Map());

  const token =
    user?.access_token ||
    sessionStorage.getItem("access_token") ||
    localStorage.getItem("access_token") ||
    "";
  const currency = String(user?.moneda || getStoredCurrency("USD")).toUpperCase();

  const isSuperAdmin = useMemo(() => {
    const role = normalizeText(user?.role).replace(/[\s-]+/g, "_");
    return role === "super_admin" || role === "superadmin";
  }, [user?.role]);

  const allowedSedeIds = useMemo(
    () => getAllowedSedeIds(user ?? null, activeSedeId),
    [activeSedeId, user],
  );

  const visibleSedes = useMemo(() => {
    if (isSuperAdmin) {
      return sedes;
    }

    const allowedSet = new Set(allowedSedeIds);
    if (allowedSet.size === 0) {
      return sedes;
    }

    return sedes.filter((sede) => allowedSet.has(String(sede.sede_id ?? "").trim()));
  }, [allowedSedeIds, isSuperAdmin, sedes]);

  const canSelectAllSedes = visibleSedes.length > 1;
  const shouldShowSedeDropdown = visibleSedes.length > 1;
  const isAllSedesSelected = selectedSedeId === ALL_SEDES_VALUE;

  const selectedSedeIds = useMemo(() => {
    if (isAllSedesSelected) {
      return visibleSedes
        .map((sede) => String(sede.sede_id ?? "").trim())
        .filter(Boolean);
    }

    return selectedSedeId ? [selectedSedeId] : [];
  }, [isAllSedesSelected, selectedSedeId, visibleSedes]);

  const primarySelectedSedeId = selectedSedeIds[0] ?? "";

  const selectedSede = useMemo(
    () => visibleSedes.find((sede) => sede.sede_id === selectedSedeId) ?? null,
    [selectedSedeId, visibleSedes],
  );

  const selectedSedeLabel = useMemo(() => {
    if (isAllSedesSelected) {
      return "Todas las sedes";
    }

    return selectedSede
      ? formatSedeNombre(selectedSede.nombre, selectedSede.sede_id)
      : "Equipo";
  }, [isAllSedesSelected, selectedSede]);

  const filteredStylists = useMemo(() => {
    if (selectedSedeIds.length === 0) return [];
    const selectedIds = new Set(selectedSedeIds);
    return stylists
      .filter((stylist) => selectedIds.has(String(stylist.sede_id ?? "").trim()))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [selectedSedeIds, stylists]);

  const selectedStylist = useMemo(
    () => filteredStylists.find((stylist) => stylist.profesional_id === selectedStylistId) ?? null,
    [filteredStylists, selectedStylistId],
  );

  const serviceOptionsById = useMemo(
    () => new Map(services.map((service) => [service.id, service])),
    [services],
  );

  const getServiceIdForCategory = useCallback(
    (category: string): string | null => {
      const normalized = normalizeText(category);
      const match = services.find(
        (service) => normalizeText(service.categoria) === normalized && service.id,
      );
      return match?.id ?? null;
    },
    [services],
  );

  const buildServiceIdsFromCategoryCommissions = useCallback(
    (categoryMap: unknown): string[] => {
      if (!categoryMap || typeof categoryMap !== "object" || Array.isArray(categoryMap)) {
        return [];
      }

      const ids = Object.keys(categoryMap as Record<string, unknown>)
        .map((category) => getServiceIdForCategory(category))
        .filter((id): id is string => Boolean(id));

      return Array.from(new Set(ids));
    },
    [getServiceIdForCategory],
  );

  const categoryOptions = useMemo(() => {
    if (!selectedStylist) return [];
    const categoryMap = selectedStylist.comisiones_por_categoria;
    if (!categoryMap || typeof categoryMap !== "object" || Array.isArray(categoryMap)) return [];

    return Object.keys(categoryMap as Record<string, unknown>)
      .map((category) => {
        const serviceId = getServiceIdForCategory(category);
        return serviceId ? { category, serviceId } : null;
      })
      .filter((item): item is { category: string; serviceId: string } => Boolean(item));
  }, [getServiceIdForCategory, selectedStylist]);

  const useCategoryOptions = categoryOptions.length > 0;

  const resolveServiceIdsAndCommissions = useCallback(
    (stylist: Estilista, targetSedeId: string) => {
      const resolvedCommissions = resolveServiceCommissions(
        stylist as unknown as Record<string, unknown>,
        targetSedeId,
      );

      const specialtyServiceIds = Array.isArray(stylist.especialidades_detalle)
        ? stylist.especialidades_detalle.map((detail) => detail.id).filter(Boolean)
        : [];

    const categoryServiceIds = buildServiceIdsFromCategoryCommissions(
      stylist.comisiones_por_categoria,
    );

      const commissionServiceIds = resolvedCommissions.entries.map((entry) => entry.servicio_id);

      const mergedServiceIds = Array.from(
        new Set([...specialtyServiceIds, ...categoryServiceIds, ...commissionServiceIds]),
      );

      return {
        serviceIds: mergedServiceIds,
        resolvedCommissions,
      };
    },
    [buildServiceIdsFromCategoryCommissions],
  );

  const selectServiceOptions = useMemo(() => {
    if (!useCategoryOptions) {
      return services;
    }

    // Priorizar las categorías ya configuradas, pero mostrar todos los servicios disponibles
    const categoryServices = categoryOptions.map(({ category, serviceId }) => ({
      id: serviceId,
      nombre: category,
      categoria: category,
      duracion: 0,
      precio: 0,
    }));

    const categoryIds = new Set(categoryServices.map((s) => s.id));
    const remainingServices = services.filter((s) => !categoryIds.has(s.id));

    return [...categoryServices, ...remainingServices];
  }, [categoryOptions, services, useCategoryOptions]);

  const baseDashboardRows = useMemo(
    () =>
      buildStylistDashboardRows({
        stylists: filteredStylists,
        invoices,
        appointments,
        schedulesByStylist,
        range: dateRange,
      }),
    [appointments, dateRange, filteredStylists, invoices, schedulesByStylist],
  );

  const dashboardRows: DashboardRowWithProducts[] = useMemo(() => {
    if (baseDashboardRows.length === 0) return [];

    const productCountByStylist = new Map<string, number>();

    invoices.forEach((invoice) => {
      const stylistId = String(invoice.profesional_id ?? "").trim();
      if (!stylistId || !Array.isArray(invoice.items)) return;

      const productCount = invoice.items.reduce((total, item) => {
        const itemType = normalizeText(item.tipo);
        const isProduct =
          itemType.includes("producto") || (item.producto_id && !item.servicio_id);
        const quantity = Number(item.cantidad ?? 0);

        if (!isProduct || !Number.isFinite(quantity)) return total;
        return total + quantity;
      }, 0);

      if (productCount > 0) {
        productCountByStylist.set(
          stylistId,
          (productCountByStylist.get(stylistId) ?? 0) + productCount,
        );
      }
    });

    return baseDashboardRows.map((row) => ({
      ...row,
      cantidadProductos: productCountByStylist.get(row.profesionalId) ?? 0,
    }));
  }, [baseDashboardRows, invoices]);

  const vendorRows = useMemo(
    () => buildVendorRows(systemUsers, selectedSedeIds, filteredStylists, invoices),
    [filteredStylists, invoices, selectedSedeIds, systemUsers],
  );

  const initializeEditorState = useCallback(
    (stylist: Estilista | null, mode: "create" | "edit" = "edit") => {
      const targetSedeId =
        String(stylist?.sede_id ?? "").trim() ||
        String(primarySelectedSedeId ?? "").trim() ||
        String(selectedSedeId ?? "").trim();

      if (!targetSedeId || selectedSedeId === ALL_SEDES_VALUE && mode === "create") {
        setEditorState(null);
        return;
      }

      if (!stylist || mode === "create") {
        setEditorState({
          mode: "create",
          nombre: "",
          email: "",
          telefono: "",
          rol: "estilista",
          sede_id: targetSedeId,
          comision: "",
          password: "",
          activo: true,
          serviceIds: [],
          serviceCommissions: [],
          productCommission: "",
        });
        return;
      }

      const { serviceIds, resolvedCommissions } = resolveServiceIdsAndCommissions(
        stylist,
        targetSedeId,
      );
      const categoryCommissions = resolveCategoryCommissionEntries(
        stylist as unknown as Record<string, unknown>,
        services,
        serviceIds,
      );

      const matchedUser =
        systemUsers.find(
          (systemUser) => normalizeText(systemUser.email) === normalizeText(stylist.email),
        ) ?? null;

      setEditorState({
        mode: "edit",
        nombre: stylist.nombre || "",
        email: stylist.email || "",
        telefono: stylist.telefono || "",
        rol: matchedUser?.role || stylist.rol || "estilista",
        sede_id: stylist.sede_id || targetSedeId,
        comision:
          stylist.comision !== null && stylist.comision !== undefined ? String(stylist.comision) : "",
        password: "",
        activo: Boolean(stylist.activo),
        serviceIds,
        serviceCommissions: (categoryCommissions.length > 0
          ? categoryCommissions
          : resolvedCommissions.entries
        ).map((entry) => ({
        ...entry,
        tipo: "%",
      })),
        productCommission:
          stylist.comision_productos !== null && stylist.comision_productos !== undefined
            ? String(stylist.comision_productos)
            : "",
      });
    },
    [primarySelectedSedeId, resolveServiceIdsAndCommissions, selectedSedeId, services, systemUsers],
  );

  const loadBaseData = useCallback(async () => {
    if (!token) {
      setBootError("No hay token de autenticación disponible.");
      setIsBootLoading(false);
      return;
    }

    setIsBootLoading(true);
    setBootError(null);

    try {
      const [sedesData, stylistsData, servicesData, usersData] = await Promise.all([
        sedeService.getSedes(token),
        stylistApi.getEstilistas(token),
        servicesApi.getServicios(token, currency),
        systemUsersService.getSystemUsers(token).catch(() => []),
      ]);

      const normalizedServices = servicesData
        .map((service) => {
          const serviceId = String(service.servicio_id ?? service.id ?? "").trim();
          if (!serviceId) return null;

          return {
            id: serviceId,
            nombre: service.nombre,
            categoria: String(service.categoria ?? "").trim(),
            duracion: Number(service.duracion ?? 0),
            precio: Number(service.precio_local ?? service.precio ?? 0),
          } satisfies ServiceOption;
        })
        .filter((service): service is ServiceOption => Boolean(service))
        .sort((a, b) => a.nombre.localeCompare(b.nombre));

      setSedes(Array.isArray(sedesData) ? sedesData : []);
      setStylists(Array.isArray(stylistsData) ? stylistsData : []);
      setServices(normalizedServices);
      setSystemUsers(Array.isArray(usersData) ? usersData : []);
    } catch (error) {
      console.error("Error cargando módulo de estilistas:", error);
      setBootError(
        error instanceof Error
          ? error.message
          : "No se pudo cargar la información del módulo de equipo.",
      );
    } finally {
      setIsBootLoading(false);
    }
  }, [currency, servicesApi, stylistApi, token]);

  const loadAppointmentsForRange = useCallback(
    async (sedeId: string, range: DateRangeValue): Promise<TeamAppointmentRecord[]> => {
      const dates = enumerateDateRange(range);
      const results: TeamAppointmentRecord[] = [];

      for (const group of chunk(dates, 5)) {
        const groupResults = await Promise.all(
          group.map(async (dateValue) => {
            const cacheKey = `${sedeId}:${dateValue}`;
            const cached = appointmentsCacheRef.current.get(cacheKey);
            if (cached) {
              return cached;
            }

            try {
              const response = await getCitas({ sede_id: sedeId, fecha: dateValue }, token);
              const source = Array.isArray((response as { citas?: unknown[] })?.citas)
                ? ((response as { citas?: unknown[] }).citas ?? [])
                : Array.isArray(response)
                  ? response
                  : [];

              const normalized = source
                .map((item) => normalizeAppointmentRecord(item))
                .filter((item): item is TeamAppointmentRecord => Boolean(item));

              appointmentsCacheRef.current.set(cacheKey, normalized);
              return normalized;
            } catch (error) {
              console.error(`Error cargando citas para ${dateValue}:`, error);
              appointmentsCacheRef.current.set(cacheKey, []);
              return [];
            }
          }),
        );

        groupResults.forEach((items) => results.push(...items));
      }

      return results;
    },
    [token],
  );

  const loadSchedulesForStylists = useCallback(
    async (items: Estilista[]): Promise<Record<string, TeamScheduleRecord[]>> => {
      const nextSchedules: Record<string, TeamScheduleRecord[]> = {};

      const responses = await Promise.allSettled(
        items.map(async (stylist) => {
          const cacheKey = stylist.profesional_id;
          const cached = schedulesCacheRef.current.get(cacheKey);
          if (cached) {
            return { profesionalId: cacheKey, schedules: cached };
          }

          const source = await getHorariosEstilista(token, cacheKey);
          const normalized = (Array.isArray(source) ? source : [])
            .map((schedule) => normalizeScheduleRecord(schedule))
            .filter((schedule): schedule is TeamScheduleRecord => Boolean(schedule));

          schedulesCacheRef.current.set(cacheKey, normalized);
          return { profesionalId: cacheKey, schedules: normalized };
        }),
      );

      responses.forEach((response) => {
        if (response.status === "fulfilled") {
          nextSchedules[response.value.profesionalId] = response.value.schedules;
        }
      });

      return nextSchedules;
    },
    [token],
  );

  useEffect(() => {
    if (!authLoading && token) {
      void loadBaseData();
    }
  }, [authLoading, loadBaseData, token]);

  useEffect(() => {
    if (visibleSedes.length === 0) {
      setSelectedSedeId("");
      return;
    }

    if (
      selectedSedeId &&
      ((selectedSedeId === ALL_SEDES_VALUE && canSelectAllSedes) ||
        visibleSedes.some((sede) => sede.sede_id === selectedSedeId))
    ) {
      return;
    }

    const nextSedeId =
      canSelectAllSedes && isSuperAdmin
        ? ALL_SEDES_VALUE
        : activeSedeId && visibleSedes.some((sede) => sede.sede_id === activeSedeId)
        ? activeSedeId
        : String(user?.sede_id_principal ?? "").trim() &&
            visibleSedes.some((sede) => sede.sede_id === user?.sede_id_principal)
          ? String(user?.sede_id_principal ?? "").trim()
          : visibleSedes[0]?.sede_id || "";

    setSelectedSedeId(nextSedeId);
  }, [activeSedeId, canSelectAllSedes, isSuperAdmin, selectedSedeId, user?.sede_id_principal, visibleSedes]);

  useEffect(() => {
    if (!selectedSedeId || selectedSedeId === ALL_SEDES_VALUE || selectedSedeId === activeSedeId) {
      return;
    }
    setActiveSedeId(selectedSedeId);
  }, [activeSedeId, selectedSedeId, setActiveSedeId]);

  useEffect(() => {
    if (filteredStylists.length === 0) {
      setSelectedStylistId("");
      initializeEditorState(null, "create");
      return;
    }

    if (selectedStylistId && filteredStylists.some((stylist) => stylist.profesional_id === selectedStylistId)) {
      return;
    }

    setSelectedStylistId(filteredStylists[0].profesional_id);
  }, [filteredStylists, initializeEditorState, selectedStylistId]);

  useEffect(() => {
    if (!selectedStylist) {
      initializeEditorState(null, "create");
      return;
    }

    initializeEditorState(selectedStylist, "edit");
  }, [initializeEditorState, selectedStylist]);

  useEffect(() => {
    if (!token || selectedSedeIds.length === 0 || filteredStylists.length === 0) {
      setInvoices([]);
      setAppointments([]);
      setSchedulesByStylist({});
      return;
    }

    let isMounted = true;
    const loadMetrics = async () => {
      setIsMetricsLoading(true);
      setMetricsError(null);
      setMetricsWarning(null);

      const invoiceResults = await Promise.allSettled(
        selectedSedeIds.map(async (sedeId) => {
          const rangeKey = `${sedeId}:${dateRange.start}:${dateRange.end}`;
          const cached = invoicesCacheRef.current.get(rangeKey);
          if (cached) {
            return cached;
          }

          const result = await facturaService.getTodasVentasBySede(sedeId, {
            fecha_desde: dateRange.start,
            fecha_hasta: dateRange.end,
            pageSize: 200,
          });

          invoicesCacheRef.current.set(rangeKey, result);
          return result;
        }),
      );

      const appointmentResults = await Promise.allSettled(
        selectedSedeIds.map((sedeId) => loadAppointmentsForRange(sedeId, dateRange)),
      );

      const schedulesResult = await Promise.allSettled([
        loadSchedulesForStylists(filteredStylists),
      ]);

      if (!isMounted) return;

      const successfulInvoices = invoiceResults
        .filter(
          (result): result is PromiseFulfilledResult<FacturaConverted[]> =>
            result.status === "fulfilled",
        )
        .flatMap((result) => result.value);

      if (successfulInvoices.length > 0 || invoiceResults.length === 0) {
        setInvoices(successfulInvoices);
      } else {
        console.error("Error cargando ventas del equipo:", invoiceResults);
        setInvoices([]);
        setMetricsError("No se pudieron cargar las ventas del equipo para el rango seleccionado.");
      }

      const successfulAppointments = appointmentResults
        .filter(
          (result): result is PromiseFulfilledResult<TeamAppointmentRecord[]> =>
            result.status === "fulfilled",
        )
        .flatMap((result) => result.value);

      if (successfulAppointments.length > 0 || appointmentResults.length === 0) {
        setAppointments(successfulAppointments);
      } else {
        console.error("Error cargando citas del equipo:", appointmentResults);
        setAppointments([]);
        setMetricsWarning(
          "No se pudieron calcular las citas y la ocupación para este rango. Las ventas y comisiones siguen disponibles.",
        );
      }

      if (schedulesResult[0]?.status === "fulfilled") {
        setSchedulesByStylist(schedulesResult[0].value);
      } else {
        console.error("Error cargando horarios del equipo:", schedulesResult[0]);
        setSchedulesByStylist({});
        setMetricsWarning(
          "No se pudo calcular la ocupación con los horarios actuales. Las demás métricas siguen disponibles.",
        );
      }

      const failedInvoiceCount = invoiceResults.filter((result) => result.status === "rejected").length;
      const failedAppointmentCount = appointmentResults.filter((result) => result.status === "rejected").length;

      if (
        (failedInvoiceCount > 0 && successfulInvoices.length > 0) ||
        (failedAppointmentCount > 0 && successfulAppointments.length > 0)
      ) {
        setMetricsWarning(
          "Se cargaron datos parciales: una o más sedes no respondieron a tiempo para este rango.",
        );
      }

      setIsMetricsLoading(false);
    };

    void loadMetrics();

    return () => {
      isMounted = false;
    };
  }, [dateRange, filteredStylists, loadAppointmentsForRange, loadSchedulesForStylists, selectedSedeIds, token]);

  const updateEditor = <K extends keyof EditorState>(key: K, value: EditorState[K]) => {
    setEditorState((current) => (current ? { ...current, [key]: value } : current));
  };

  const getNormalizedCategoryForService = (serviceId: string): string =>
    normalizeText(serviceOptionsById.get(serviceId)?.categoria ?? "");

  const addServiceToEditor = () => {
    if (!editorState) return;

    const nextService = selectServiceOptions.find(
      (service) => !editorState.serviceIds.includes(service.id),
    );
    if (!nextService) return;

    setEditorState((current) =>
      current
        ? {
            ...current,
            serviceIds: [...current.serviceIds, nextService.id],
            serviceCommissions: [
              ...current.serviceCommissions,
              {
                servicio_id: nextService.id,
                valor:
                  current.serviceCommissions.find(
                    (entry) =>
                      getNormalizedCategoryForService(entry.servicio_id) ===
                      getNormalizedCategoryForService(nextService.id),
                  )?.valor ?? 0,
                tipo: "%" as const,
              },
            ],
          }
        : current,
    );
  };

  const updateServiceSelection = (currentServiceId: string, nextServiceId: string) => {
    setEditorState((current) => {
      if (!current) return current;

      const nextIds = current.serviceIds.map((serviceId) =>
        serviceId === currentServiceId ? nextServiceId : serviceId,
      );
      const dedupedIds = Array.from(new Set(nextIds.filter(Boolean)));
      const draftEntries = current.serviceCommissions.map((entry) =>
        entry.servicio_id === currentServiceId ? { ...entry, servicio_id: nextServiceId } : entry,
      );
      const nextEntries = dedupedIds.map((serviceId) => {
        const existingEntry = draftEntries.find((entry) => entry.servicio_id === serviceId);
        if (existingEntry) {
          return { ...existingEntry, tipo: "%" as const };
        }

        const category = getNormalizedCategoryForService(serviceId);
        const categoryMatch = draftEntries.find(
          (entry) => getNormalizedCategoryForService(entry.servicio_id) === category,
        );

        return {
          servicio_id: serviceId,
          valor: categoryMatch?.valor ?? 0,
          tipo: "%" as const,
        } satisfies ServiceCommissionEntry;
      });

      return {
        ...current,
        serviceIds: dedupedIds,
        serviceCommissions: nextEntries,
      };
    });
  };

  const removeServiceSelection = (serviceId: string) => {
    setEditorState((current) =>
      current
        ? {
            ...current,
            serviceIds: current.serviceIds.filter((currentServiceId) => currentServiceId !== serviceId),
            serviceCommissions: current.serviceCommissions.filter(
              (entry) => entry.servicio_id !== serviceId,
            ),
          }
        : current,
    );
  };

  const updateServiceCommission = (
    serviceId: string,
    updates: Partial<ServiceCommissionEntry>,
  ) => {
    setEditorState((current) => {
      if (!current) return current;

      const category = getNormalizedCategoryForService(serviceId);
      const hasEntry = current.serviceCommissions.some((entry) => entry.servicio_id === serviceId);
      const nextEntries = hasEntry
        ? current.serviceCommissions.map((entry) =>
            entry.servicio_id === serviceId ||
            (category && getNormalizedCategoryForService(entry.servicio_id) === category)
              ? { ...entry, ...updates, tipo: "%" as const }
              : entry,
          )
        : [
            ...current.serviceCommissions,
            { servicio_id: serviceId, valor: Number(updates.valor ?? 0), tipo: "%" as const },
          ];

      return {
        ...current,
        serviceCommissions: nextEntries,
      };
    });
  };

  const reloadStylists = useCallback(async () => {
    if (!token) return;
    const data = await stylistApi.getEstilistas(token);
    setStylists(Array.isArray(data) ? data : []);
  }, [stylistApi, token]);

  const handleSave = async () => {
    const targetSedeId =
      editorState?.mode === "edit"
        ? String(selectedStylist?.sede_id ?? editorState?.sede_id ?? primarySelectedSedeId).trim()
        : String(editorState?.sede_id ?? primarySelectedSedeId).trim();

    if (!token || !editorState || !targetSedeId) return;
    if (!editorState.nombre.trim() || !editorState.email.trim()) return;
    if (editorState.mode === "create" && !editorState.password.trim()) return;

    try {
      setIsSaving(true);
      const commission = parseCommissionValue(editorState.comision);
      const productCommission = parseCommissionValue(editorState.productCommission);

      if (productCommission !== null && (productCommission < 0 || productCommission > 100)) {
        setBootError("La comisión por productos debe estar entre 0 y 100.");
        setIsSaving(false);
        return;
      }

      if (editorState.mode === "create") {
        const payload: CreateEstilistaData = {
          nombre: editorState.nombre.trim(),
          email: editorState.email.trim(),
          sede_id: targetSedeId,
          especialidades: true,
          comision: commission,
          comision_productos: productCommission,
          password: editorState.password.trim(),
          activo: editorState.activo,
        };

        const created = await stylistApi.createEstilista(token, payload);
        if (typeof stylistApi.updateServicios === "function") {
          const selectedIds = new Set(editorState.serviceIds);
          const serviciosNoPresta = services
            .map((service) => service.id)
            .filter((serviceId) => !selectedIds.has(serviceId));
          await stylistApi.updateServicios(token, created.profesional_id, serviciosNoPresta);
        }
        if (
          typeof stylistApi.updateServiceCommissions === "function" &&
          (editorState.serviceIds.length > 0 || editorState.serviceCommissions.length > 0)
        ) {
          const categoryPayload = buildCategoryCommissionPayload(
            services,
            editorState.serviceIds,
            editorState.serviceCommissions,
          );
          await stylistApi.updateServiceCommissions(token, created.profesional_id, categoryPayload);
        }
        await reloadStylists();
        setSelectedStylistId(created.profesional_id);
      } else if (selectedStylist) {
        const { serviceIds: initialServiceIds } = resolveServiceIdsAndCommissions(
          selectedStylist,
          targetSedeId,
        );
        const nextServiceIds = editorState.serviceIds.filter(Boolean);
        const normalizedInitialServiceIds = [...new Set(initialServiceIds)].sort();
        const normalizedNextServiceIds = [...new Set(nextServiceIds)].sort();
        const hasServiceSelectionChanges =
          JSON.stringify(normalizedInitialServiceIds) !== JSON.stringify(normalizedNextServiceIds);

        const initialCommission = selectedStylist.comision ?? null;
        const initialProductCommission = selectedStylist.comision_productos ?? null;
        const hasBasicChanges =
          selectedStylist.nombre !== editorState.nombre.trim() ||
          selectedStylist.email !== editorState.email.trim() ||
          String(selectedStylist.sede_id ?? "").trim() !== targetSedeId ||
          Boolean(selectedStylist.activo) !== editorState.activo ||
          initialCommission !== commission ||
          initialProductCommission !== productCommission;

        const initialCommissionEntries = resolveCategoryCommissionEntries(
          selectedStylist as unknown as Record<string, unknown>,
          services,
          initialServiceIds,
        );
        const currentCategoryPayload = buildCategoryCommissionPayload(
          services,
          nextServiceIds,
          editorState.serviceCommissions,
        );
        const initialCategoryPayload = buildCategoryCommissionPayload(
          services,
          initialServiceIds,
          initialCommissionEntries,
        );
        const hasServiceCommissionChanges =
          JSON.stringify(Object.entries(initialCategoryPayload).sort(([a], [b]) => a.localeCompare(b))) !==
          JSON.stringify(Object.entries(currentCategoryPayload).sort(([a], [b]) => a.localeCompare(b)));

        if (hasBasicChanges) {
          const payload: Partial<Estilista> & Record<string, unknown> = {
            nombre: editorState.nombre.trim(),
            email: editorState.email.trim(),
            sede_id: targetSedeId,
            especialidades: true,
            activo: editorState.activo,
            comision: commission,
            comision_productos: productCommission,
            password: editorState.password.trim() || DEFAULT_STYLIST_PASSWORD,
          };

          await stylistApi.updateEstilista(token, selectedStylist.profesional_id, payload);
        }
        if (hasServiceSelectionChanges && typeof stylistApi.updateServicios === "function") {
          const selectedIds = new Set(nextServiceIds);
          const serviciosNoPresta = services
            .map((service) => service.id)
            .filter((serviceId) => !selectedIds.has(serviceId));
          await stylistApi.updateServicios(token, selectedStylist.profesional_id, serviciosNoPresta);
        }
        if (hasServiceCommissionChanges && typeof stylistApi.updateServiceCommissions === "function") {
          await stylistApi.updateServiceCommissions(
            token,
            selectedStylist.profesional_id,
            currentCategoryPayload,
          );
        }
        await reloadStylists();
      }
    } catch (error) {
      console.error("Error guardando estilista:", error);
      setBootError(
        error instanceof Error ? error.message : "No se pudo guardar la configuración del estilista.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!token || !selectedStylist) return;
    if (!confirm(`¿Eliminar a ${selectedStylist.nombre}?`)) return;

    try {
      setIsSaving(true);
      await stylistApi.deleteEstilista(token, selectedStylist.profesional_id);
      await reloadStylists();
    } catch (error) {
      console.error("Error eliminando estilista:", error);
      setBootError(
        error instanceof Error ? error.message : "No se pudo eliminar el estilista seleccionado.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleLegacyCreateSave = async (payload: LegacyCreatePayload) => {
    if (!token) {
      setBootError("No hay token de autenticación disponible.");
      return;
    }

    const targetSedeId = String(
      payload.sede_id ?? legacyEditStylist?.sede_id ?? primarySelectedSedeId ?? "",
    ).trim();
    if (!targetSedeId) {
      setBootError("Debes seleccionar una sede para crear el estilista.");
      return;
    }

    try {
      setIsLegacyCreateSaving(true);
      setBootError(null);

      const normalizeCommission = (value: unknown): number | null => {
        if (typeof value === "number") return value;
        if (value === null || value === undefined) return null;
        const num = Number(value);
        return Number.isFinite(num) ? num : null;
      };

      if (legacyEditStylist) {
        const updatePayload: Partial<Estilista> & Record<string, unknown> = {
          nombre: String(payload.nombre ?? legacyEditStylist.nombre ?? "").trim(),
          email: String(payload.email ?? legacyEditStylist.email ?? "").trim(),
          sede_id: targetSedeId,
          especialidades: true,
          comision: normalizeCommission(payload.comision),
          comision_productos: normalizeCommission((payload as any).comision_productos),
          activo: payload.activo ?? legacyEditStylist.activo ?? true,
          telefono: typeof payload.telefono === "string" ? payload.telefono.trim() : undefined,
          password: String(payload.password ?? "").trim() || DEFAULT_STYLIST_PASSWORD,
        };

        await stylistApi.updateEstilista(token, legacyEditStylist.profesional_id, updatePayload);

        if (payload.horario) {
          if (typeof stylistApi.updateHorario === "function" && payload.horarioId) {
            await stylistApi.updateHorario(token, payload.horarioId, {
              ...payload.horario,
              profesional_id: legacyEditStylist.profesional_id,
              sede_id: targetSedeId,
            });
          } else if (typeof stylistApi.createHorario === "function") {
            await stylistApi.createHorario(token, {
              ...payload.horario,
              profesional_id: legacyEditStylist.profesional_id,
              sede_id: targetSedeId,
            });
          }
        }

        setSelectedStylistId(legacyEditStylist.profesional_id);
      } else {
        const createPayload: CreateEstilistaData = {
          nombre: String(payload.nombre ?? "").trim(),
          email: String(payload.email ?? "").trim(),
          sede_id: targetSedeId,
          especialidades: true,
          comision: normalizeCommission(payload.comision),
          telefono: typeof payload.telefono === "string" ? payload.telefono.trim() : undefined,
          password: String(payload.password ?? "").trim() || DEFAULT_STYLIST_PASSWORD,
          activo: payload.activo ?? true,
        };

        const created = await stylistApi.createEstilista(token, createPayload);

        if (payload.horario && typeof stylistApi.createHorario === "function") {
          await stylistApi.createHorario(token, {
            ...payload.horario,
            profesional_id: created.profesional_id,
            sede_id: targetSedeId,
          });
        }

        if (selectedSedeId !== ALL_SEDES_VALUE && selectedSedeId !== targetSedeId) {
          setSelectedSedeId(targetSedeId);
        }

        setSelectedStylistId(created.profesional_id);
      }

      await reloadStylists();
      setIsLegacyCreateOpen(false);
      setLegacyEditStylist(null);
    } catch (error) {
      console.error("Error creando estilista desde modal legado:", error);
      setBootError(
        error instanceof Error
          ? error.message
          : "No se pudo crear el estilista con el formulario anterior.",
      );
    } finally {
      setIsLegacyCreateSaving(false);
    }
  };

  const handleOpenCreate = () => {
    if (LegacyCreateModal) {
      setIsLegacyCreateOpen(true);
      setLegacyEditStylist(null);
      return;
    }

    setSelectedStylistId("");
    initializeEditorState(null, "create");
  };

  const canPersistServiceCommissions =
    typeof stylistApi.updateServiceCommissions === "function";

  if (authLoading || isBootLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="flex items-center gap-3 text-slate-700">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Cargando módulo de equipo...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#f8fafc] text-slate-900">
      <Sidebar />

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8">
          <PageHeader
            title={
              viewMode === "dashboard"
                ? "Dashboard de Estilistas / Equipo"
                : "Configuración de Equipo"
            }
            subtitle={
              viewMode === "dashboard"
                ? `Sede: ${selectedSedeLabel}`
                : `Sede activa: ${selectedSedeLabel}`
            }
            actions={
              <div className="flex flex-wrap items-center gap-2">
                {viewMode === "dashboard" ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="border-slate-200 bg-white"
                    onClick={() => setViewMode("settings")}
                  >
                    <Settings2 className="mr-2 h-4 w-4" />
                    Configuración de equipo
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="border-slate-200 bg-white"
                    onClick={() => setViewMode("dashboard")}
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Volver al dashboard
                  </Button>
                )}
              </div>
            }
          />

          <section className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-[0_10px_35px_rgba(15,23,42,0.04)]">
            <div className="grid gap-4 xl:grid-cols-[minmax(240px,300px)_minmax(320px,360px)] xl:items-end xl:justify-between">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Sede
                </label>
                {shouldShowSedeDropdown ? (
                  <select
                    value={selectedSedeId}
                    onChange={(event) => setSelectedSedeId(event.target.value)}
                    className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm shadow-sm outline-none transition focus:border-slate-300"
                  >
                    {canSelectAllSedes ? (
                      <option value={ALL_SEDES_VALUE}>Todas las sedes</option>
                    ) : null}
                    {visibleSedes.map((sede) => (
                      <option key={sede.sede_id} value={sede.sede_id}>
                        {formatSedeNombre(sede.nombre, sede.sede_id)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="flex h-11 w-full items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 shadow-sm">
                    {selectedSedeLabel}
                  </div>
                )}
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Rango
                </label>
                <Popover open={isDateRangeOpen} onOpenChange={setIsDateRangeOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex h-11 w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 text-left text-sm text-slate-900 shadow-sm transition hover:border-slate-300"
                    >
                      <span className="truncate">{formatDateRangeSelectLabel(dateRange)}</span>
                      <ChevronDown
                        className={`ml-3 h-4 w-4 shrink-0 text-slate-500 transition-transform ${
                          isDateRangeOpen ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    className="w-[min(92vw,360px)] rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_18px_50px_rgba(15,23,42,0.12)]"
                  >
                    <div className="space-y-4">
                      <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Fecha inicial
                        </label>
                        <Input
                          type="date"
                          value={dateRange.start}
                          max={dateRange.end || undefined}
                          onChange={(event) =>
                            setDateRange((current) => ({ ...current, start: event.target.value }))
                          }
                          className="h-11 rounded-2xl border-slate-200 shadow-none focus-visible:ring-0"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Fecha final
                        </label>
                        <Input
                          type="date"
                          value={dateRange.end}
                          min={dateRange.start || undefined}
                          onChange={(event) =>
                            setDateRange((current) => ({ ...current, end: event.target.value }))
                          }
                          className="h-11 rounded-2xl border-slate-200 shadow-none focus-visible:ring-0"
                        />
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                        {formatDateRangeSelectLabel(dateRange)}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </section>

          {bootError ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {bootError}
            </div>
          ) : null}

          {metricsError ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {metricsError}
            </div>
          ) : null}

          {metricsWarning ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {metricsWarning}
            </div>
          ) : null}

          {viewMode === "dashboard" ? (
            <div className="mt-6 space-y-6">
              <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_10px_35px_rgba(15,23,42,0.04)]">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-semibold text-slate-950">Estilistas</h2>
                    <p className="text-sm text-slate-500">
                      Métricas por estilista para la sede y el rango seleccionados.
                    </p>
                  </div>
                  {isMetricsLoading ? (
                    <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Actualizando métricas
                    </div>
                  ) : null}
                </div>

                {dashboardRows.length === 0 ? (
                  <EmptyPanel
                    title="No hay estilistas en esta sede"
                    description="Selecciona otra sede o agrega estilistas al equipo para ver el tablero."
                  />
                ) : (
                  <div className="overflow-hidden rounded-3xl border border-slate-200">
                    <div className="overflow-x-auto">
                      <table className="min-w-[1240px] w-full text-sm">
                        <thead className="bg-slate-50/90">
                          <tr>
                            {DASHBOARD_HEADERS.map((header) => (
                              <th
                                key={header.key}
                                className="px-4 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500"
                              >
                                <HeaderLabel lines={header.lines} />
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="bg-white">
                          {dashboardRows.map((row) => (
                            <tr
                              key={row.profesionalId}
                              className="border-t border-slate-100 hover:bg-slate-50/60"
                            >
                              <td className="px-4 py-4 font-medium text-slate-900">{row.nombre}</td>
                              <td className="px-4 py-4 font-medium text-slate-900">{row.citas ?? "--"}</td>
                              <td className="px-4 py-4 font-medium text-slate-900">
                                {row.cantidadProductos ?? 0}
                              </td>
                              <td className="px-4 py-4 font-medium text-slate-900">
                                {formatCurrencyNoDecimals(row.totalVentaServicios, currency)}
                              </td>
                              <td className="px-4 py-4 font-medium text-slate-900">
                                {formatCurrencyNoDecimals(row.totalVentaProductos, currency)}
                              </td>
                              <td className="px-4 py-4 font-semibold text-slate-950">
                                {formatCurrencyNoDecimals(row.totalVentas, currency)}
                              </td>
                              <td className="px-4 py-4 font-medium text-slate-900">
                                {formatCurrencyNoDecimals(row.comisionesServicios, currency)}
                              </td>
                              <td className="px-4 py-4 font-medium text-slate-900">
                                {formatCurrencyNoDecimals(row.comisionesProductos, currency)}
                              </td>
                              <td className="px-4 py-4 font-semibold text-slate-950">
                                {formatCurrencyNoDecimals(row.totalComisiones, currency)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </section>

              <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_10px_35px_rgba(15,23,42,0.04)]">
                <div className="mb-4">
                  <h2 className="text-2xl font-semibold text-slate-950">Vendedores</h2>
                  <p className="text-sm text-slate-500">
                    Ventas de productos y comisiones registradas para usuarios de la sede actual.
                  </p>
                </div>

                {vendorRows.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/70 px-5 py-8 text-sm text-slate-500">
                    No hay vendedores configurados o no existen ventas de productos para este rango.
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-3xl border border-slate-200">
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="bg-slate-50/90">
                          <tr>
                            <th className="px-4 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                              Vendedor
                            </th>
                            <th className="px-4 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                              <HeaderLabel lines={["Total de Ventas", "Productos"]} />
                            </th>
                            <th className="px-4 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                              <HeaderLabel lines={["Comisiones por", "Productos"]} />
                            </th>
                            <th className="px-4 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                              <HeaderLabel lines={["Total", "Comisiones"]} />
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white">
                          {vendorRows.map((vendor) => (
                            <tr key={vendor.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                              <td className="px-4 py-4">
                                <p className="font-medium text-slate-900">{vendor.nombre}</p>
                              </td>
                              <td className="px-4 py-4 font-medium text-slate-900">
                                {formatCurrencyNoDecimals(vendor.totalVentaProductos, currency)}
                              </td>
                              <td className="px-4 py-4 font-medium text-slate-900">
                                {formatCurrencyNoDecimals(vendor.comisionesProductos, currency)}
                              </td>
                              <td className="px-4 py-4 font-semibold text-slate-950">
                                {formatCurrencyNoDecimals(vendor.totalComisiones, currency)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </section>
            </div>
          ) : (
            <div className="mt-6 overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.06)] xl:grid xl:grid-cols-[minmax(0,1fr)_420px]">
              <section className="p-5 sm:p-6">
                <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
                  <div className="flex items-center gap-6 border-b border-slate-200">
                    <button
                      type="button"
                      className="border-b-2 border-slate-900 pb-3 text-sm font-semibold text-slate-900"
                      onClick={() =>
                        commissionsSectionRef.current?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        })
                      }
                    >
                      Estilistas
                    </button>
                    <button
                      type="button"
                      className="pb-3 text-sm font-medium text-slate-500"
                      onClick={() =>
                        commissionsSectionRef.current?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        })
                      }
                    >
                      Configurar Comisiones
                    </button>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-slate-200 bg-white"
                    onClick={handleOpenCreate}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Nuevo estilista
                  </Button>
                </div>

                <div className="space-y-8">
                  <div>
                    <h2 className="text-2xl font-semibold text-slate-950">Estilistas del equipo</h2>

                    <div className="mt-4 overflow-hidden rounded-3xl border border-slate-200">
                      {filteredStylists.length === 0 ? (
                        <EmptyPanel
                          title="No hay estilistas para configurar"
                          description="Esta sede todavía no tiene estilistas activos en el módulo."
                        />
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-sm">
                            <thead className="bg-slate-50/90">
                              <tr>
                                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                  Estilistas
                                </th>
                                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                  Servicios
                                </th>
                                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                  Configurar
                                </th>
                              </tr>
                            </thead>
                            <tbody className="bg-white">
                              {filteredStylists.map((stylist) => {
                                const isSelected =
                                  selectedStylistId === stylist.profesional_id &&
                                  editorState?.mode === "edit";
                                const servicesCount = Array.isArray(stylist.especialidades_detalle)
                                  ? stylist.especialidades_detalle.length
                                  : 0;

                                return (
                                  <tr
                                    key={stylist.profesional_id}
                                    className={`cursor-pointer border-t border-slate-100 transition ${
                                      isSelected ? "bg-slate-50" : "hover:bg-slate-50/70"
                                    }`}
                                    onClick={() => {
                                      setSelectedStylistId(stylist.profesional_id);
                                      initializeEditorState(stylist, "edit");
                                    }}
                                  >
                                    <td className="px-4 py-3">
                                      <div className="flex items-center gap-3">
                                        <Avatar className="h-9 w-9 bg-slate-100">
                                          <AvatarFallback className="bg-slate-200 text-[11px] font-semibold text-slate-700">
                                            {getInitials(stylist.nombre)}
                                          </AvatarFallback>
                                        </Avatar>
                                        <div className="min-w-0">
                                          <p className="truncate font-medium text-slate-900">
                                            {stylist.nombre}
                                          </p>
                                        </div>
                                      </div>
                                    </td>
                                    <td className="px-4 py-3 text-slate-600">
                                      {servicesCount > 0 ? "Configurar" : "Sin servicios"}
                                    </td>
                                    <td className="px-4 py-3">
                                      <Badge
                                        variant="outline"
                                        className="border-slate-200 bg-white text-slate-700"
                                      >
                                        {stylist.comision !== null && stylist.comision !== undefined
                                          ? `${stylist.comision}%`
                                          : "--"}
                                      </Badge>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>

                  <div ref={commissionsSectionRef}>
                    <h3 className="text-2xl font-semibold text-slate-950">Configurar Comisiones</h3>

                    <div className="mt-4 overflow-hidden rounded-3xl border border-slate-200">
                      {filteredStylists.length === 0 ? (
                        <EmptyPanel
                          title="Sin registros para configurar"
                          description="Cuando existan estilistas en la sede, verás aquí el resumen de comisiones."
                        />
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-sm">
                            <thead className="bg-slate-50/90">
                              <tr>
                                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                  Nombre
                                </th>
                                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                  Correo
                                </th>
                                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                  Teléfono
                                </th>
                                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                  Comisión base
                                </th>
                                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                  Estado
                                </th>
                              </tr>
                            </thead>
                            <tbody className="bg-white">
                              {filteredStylists.map((stylist) => (
                                <tr
                                  key={`commission-${stylist.profesional_id}`}
                                  className="cursor-pointer border-t border-slate-100 hover:bg-slate-50/60"
                                  onClick={() => {
                                    setSelectedStylistId(stylist.profesional_id);
                                    initializeEditorState(stylist, "edit");
                                  }}
                                >
                                  <td className="px-4 py-3 font-medium text-slate-900">{stylist.nombre}</td>
                                  <td className="px-4 py-3 text-slate-600">{stylist.email}</td>
                                  <td className="px-4 py-3 text-slate-600">--</td>
                                  <td className="px-4 py-3 text-slate-900">
                                    {stylist.comision !== null && stylist.comision !== undefined
                                      ? `${stylist.comision}%`
                                      : "--"}
                                  </td>
                                  <td className="px-4 py-3">
                                    <Badge
                                      variant="outline"
                                      className={`${
                                        stylist.activo
                                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                          : "border-slate-200 bg-slate-100 text-slate-500"
                                      }`}
                                    >
                                      {stylist.activo ? "Activo" : "Inactivo"}
                                    </Badge>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-2xl font-semibold text-slate-950">Vendedores</h3>

                    <div className="mt-4 overflow-hidden rounded-3xl border border-slate-200">
                      {vendorRows.length === 0 ? (
                        <div className="px-4 py-6 text-sm text-slate-500">
                          No hay vendedores configurados para esta sede.
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-sm">
                            <thead className="bg-slate-50/90">
                              <tr>
                                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                  Vendedor
                                </th>
                                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                  <HeaderLabel lines={["Total de Ventas", "Productos"]} />
                                </th>
                                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                  <HeaderLabel lines={["Comisiones por", "Productos"]} />
                                </th>
                                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                  <HeaderLabel lines={["Total", "Comisiones"]} />
                                </th>
                              </tr>
                            </thead>
                            <tbody className="bg-white">
                              {vendorRows.map((vendor) => (
                                <tr key={vendor.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                                  <td className="px-4 py-3">
                                    <p className="font-medium text-slate-900">{vendor.nombre}</p>
                                    <p className="text-xs text-slate-500">{vendor.email}</p>
                                  </td>
                                  <td className="px-4 py-3 text-slate-900">
                                    {formatCurrencyNoDecimals(vendor.totalVentaProductos, currency)}
                                  </td>
                                  <td className="px-4 py-3 text-slate-900">
                                    {formatCurrencyNoDecimals(vendor.comisionesProductos, currency)}
                                  </td>
                                  <td className="px-4 py-3 font-semibold text-slate-950">
                                    {formatCurrencyNoDecimals(vendor.totalComisiones, currency)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              <aside className="border-t border-slate-200 bg-slate-50/50 p-5 xl:border-l xl:border-t-0 xl:p-6">
                {editorState ? (
                  <div className="space-y-6">
                    <div className="flex items-start justify-between gap-4">
                      <h2 className="text-2xl font-semibold text-slate-950">
                        {editorState.mode === "create" ? "Nuevo Estilista" : "Editar Estilista"}
                      </h2>
                      <button
                        type="button"
                        className="rounded-full p-2 text-slate-400 transition hover:bg-white hover:text-slate-700"
                        onClick={() => {
                          if (selectedStylist) {
                            initializeEditorState(selectedStylist, "edit");
                          } else {
                            initializeEditorState(null, "create");
                          }
                        }}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="flex items-center gap-4">
                      <Avatar className="h-16 w-16 bg-slate-100">
                        <AvatarFallback className="bg-slate-200 text-lg font-semibold text-slate-700">
                          {getInitials(editorState.nombre || selectedStylist?.nombre || "ST")}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate text-xl font-semibold text-slate-950">
                          {editorState.nombre || "Nuevo estilista"}
                        </p>
                        <p className="truncate text-sm text-slate-500">
                          {editorState.mode === "edit"
                            ? getRoleLabel(editorState.rol)
                            : "Perfil en creación"}
                        </p>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-base font-semibold text-slate-950">Datos generales</h3>
                      <div className="mt-3 grid gap-3">
                        <div>
                          <label className="mb-1.5 block text-sm font-medium text-slate-700">Nombre</label>
                          <Input
                            value={editorState.nombre}
                            onChange={(event) => updateEditor("nombre", event.target.value)}
                            className="h-11 rounded-2xl border-slate-200"
                            placeholder="Nombre completo"
                          />
                        </div>

                        <div>
                          <label className="mb-1.5 block text-sm font-medium text-slate-700">Correo</label>
                          <Input
                            value={editorState.email}
                            onChange={(event) => updateEditor("email", event.target.value)}
                            className="h-11 rounded-2xl border-slate-200"
                            placeholder="nombre@correo.com"
                          />
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-slate-700">
                              Teléfono
                            </label>
                          <Input
                            value={editorState.telefono}
                            onChange={(event) => updateEditor("telefono", event.target.value)}
                            className="h-11 rounded-2xl border-slate-200"
                          placeholder="No disponible"
                        />
                      </div>
                      <div>
                            <label className="mb-1.5 block text-sm font-medium text-slate-700">
                              Cargo o tipo
                            </label>
                            <Input
                              value={getRoleLabel(editorState.rol)}
                              className="h-11 rounded-2xl border-slate-200"
                              disabled
                            />
                          </div>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <label className="mb-1.5 block text-sm font-medium text-slate-700">
                              Comisión base
                            </label>
                            <Input
                              value={editorState.comision}
                              onChange={(event) => updateEditor("comision", event.target.value)}
                              className="h-11 rounded-2xl border-slate-200"
                              placeholder="Ej: 20"
                            />
                          </div>
                          <div>
                            <label className="mb-1.5 block text-sm font-medium text-slate-700">
                              Estado
                            </label>
                            <select
                              value={editorState.activo ? "activo" : "inactivo"}
                              onChange={(event) =>
                                updateEditor("activo", event.target.value === "activo")
                              }
                              className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-slate-300"
                            >
                              <option value="activo">Activo</option>
                              <option value="inactivo">Inactivo</option>
                            </select>
                          </div>
                        </div>

                        {editorState.mode === "create" ? (
                          <div>
                            <label className="mb-1.5 block text-sm font-medium text-slate-700">
                              Contraseña
                            </label>
                            <Input
                              type="password"
                              value={editorState.password}
                              onChange={(event) => updateEditor("password", event.target.value)}
                              className="h-11 rounded-2xl border-slate-200"
                              placeholder="Mínimo 6 caracteres"
                            />
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-base font-semibold text-slate-950">Servicios que presta</h3>
                      </div>

                      <div className="mt-4 overflow-hidden rounded-3xl border border-slate-200 bg-white">
                        {editorState.serviceIds.length === 0 ? (
                          <div className="px-4 py-6 text-sm text-slate-500">
                            Todavía no hay servicios asignados a este perfil.
                          </div>
                        ) : (
                          <div className="divide-y divide-slate-100">
                            {editorState.serviceIds.map((serviceId) => {
                              const service = serviceOptionsById.get(serviceId);
                              const commissionEntry =
                                editorState.serviceCommissions.find(
                                  (entry) => entry.servicio_id === serviceId,
                                ) ?? { servicio_id: serviceId, valor: 0, tipo: "%" };

                              return (
                                <div
                                  key={serviceId}
                                  className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_110px_84px_40px] md:items-center"
                                >
                                  <div>
                                    <select
                                      value={serviceId}
                                      onChange={(event) =>
                                        updateServiceSelection(serviceId, event.target.value)
                                      }
                                      className="h-10 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-slate-300"
                                    >
                                      {selectServiceOptions.map((optionItem) => (
                                        <option key={optionItem.id} value={optionItem.id}>
                                          {optionItem.nombre}
                                        </option>
                                      ))}
                                    </select>
                                    {useCategoryOptions ? (
                                      <p className="mt-1 text-xs text-slate-500">Categoría</p>
                                    ) : service ? (
                                      <p className="mt-1 text-xs text-slate-500">
                                        {service.duracion} min • {formatCurrencyNoDecimals(service.precio, currency)}
                                      </p>
                                    ) : null}
                                  </div>

                                  <div>
                                    <Input
                                      type="number"
                                      min={0}
                                      step={1}
                                      max={commissionEntry.tipo === "%" ? 100 : undefined}
                                      value={commissionEntry.valor}
                                      disabled={isSaving}
                                      onChange={(event) =>
                                        updateServiceCommission(serviceId, {
                                          valor: Number(event.target.value || 0),
                                        })
                                      }
                                      className="h-10 rounded-2xl border-slate-200 bg-white"
                                    />
                                  </div>

                                  <div>
                                    <select
                                      value="%"
                                      disabled
                                      className="h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-slate-300"
                                    >
                                      <option value="%">%</option>
                                    </select>
                                  </div>

                                  <div className="flex justify-end">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className="h-10 w-10 border-slate-200 bg-white p-0 text-slate-600"
                                      onClick={() => removeServiceSelection(serviceId)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div className="mt-3 flex justify-center">
                        <Button
                          type="button"
                          variant="outline"
                          className="border-slate-200 bg-white"
                          onClick={addServiceToEditor}
                          disabled={
                            selectServiceOptions.filter(
                              (option) => !editorState.serviceIds.includes(option.id),
                            ).length === 0
                          }
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Agregar Servicio
                        </Button>
                      </div>

                      <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                        {canPersistServiceCommissions
                          ? "Las comisiones se guardan por categoría con porcentaje. Si varios servicios comparten categoría, se sincronizan automáticamente."
                          : "Este perfil no tiene configurado un endpoint de guardado para comisiones por servicio."}
                      </div>
                    </div>

                    <div>
                      <h3 className="text-base font-semibold text-slate-950">Comisión por productos</h3>
                      <div className="mt-3 rounded-3xl border border-slate-200 bg-white p-4">
                        <label className="mb-1.5 block text-sm font-medium text-slate-700">
                          Comisión por venta de productos
                        </label>
                        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_76px_52px]">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step={0.01}
                            value={editorState.productCommission}
                            onChange={(event) => updateEditor("productCommission", event.target.value)}
                            className="h-11 rounded-2xl border-slate-200 bg-white"
                            placeholder="Ej: 10"
                          />
                          <Input
                            value={
                              editorState.productCommission
                                ? `${editorState.productCommission}%`
                                : ""
                            }
                            className="h-11 rounded-2xl border-slate-200 bg-white text-center"
                            readOnly
                          />
                          <Input
                            value="%"
                            className="h-11 rounded-2xl border-slate-200 bg-white text-center"
                            readOnly
                          />
                        </div>
                        <p className="mt-2 text-xs text-slate-500">
                          Opcional. Valor entre 0 y 100. Si se deja vacío se usará la comisión del inventario/sede o la global del producto.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                      <div>
                        {editorState.mode === "edit" ? (
                          <Button
                            type="button"
                            variant="outline"
                            className="border-rose-200 bg-white text-rose-600 hover:bg-rose-50"
                            onClick={handleDelete}
                            disabled={isSaving}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Eliminar Estilista
                          </Button>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="border-slate-200 bg-white text-slate-600"
                          onClick={() => {
                            if (selectedStylist) {
                              initializeEditorState(selectedStylist, "edit");
                            } else {
                              initializeEditorState(null, "create");
                            }
                          }}
                          disabled={isSaving}
                        >
                          Cancelar
                        </Button>
                        <Button
                          type="button"
                          className="bg-black text-white hover:bg-neutral-900"
                          onClick={handleSave}
                          disabled={
                            isSaving ||
                            !editorState.nombre.trim() ||
                            !editorState.email.trim() ||
                            (editorState.mode === "create" && !editorState.password.trim())
                          }
                        >
                          {isSaving ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Guardando
                            </>
                          ) : (
                            <>
                              <Save className="mr-2 h-4 w-4" />
                              Guardar
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <EmptyPanel
                    title="Selecciona un estilista"
                    description="Desde el panel izquierdo podrás abrir el perfil del equipo y editarlo aquí."
                  />
                )}
              </aside>
            </div>
          )}
        </div>
      </main>

      {LegacyCreateModal ? (
        <LegacyCreateModal
          isOpen={isLegacyCreateOpen}
          onClose={() => setIsLegacyCreateOpen(false)}
          onSave={handleLegacyCreateSave}
          estilista={null}
          isSaving={isLegacyCreateSaving}
        />
      ) : null}
    </div>
  );
}
