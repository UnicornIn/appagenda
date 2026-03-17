import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "../../lib/utils";
import {
  LayoutDashboard,
  Users,
  Package,
  CreditCard,
  Gift,
  Wallet,
  Home,
  Menu,
  X,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "../Auth/AuthContext";
import { APP_MODULES, AGENDA_PATHS, canAccess, type AppModule } from "../../lib/access-control";
import { formatSedeNombre } from "../../lib/sede";
import { getSedeById, getSedes, type Sede as BranchSede } from "../Branch/sedesApi";

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  module: AppModule;
  currencies?: string[];
}

type SedeOption = {
  sede_id: string;
  nombre: string;
};

const normalizeRole = (value: string | null | undefined): string =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

const normalizeSedeId = (value: string | null | undefined): string => String(value ?? "").trim();

const MULTI_SEDE_ROLES = new Set([
  "super_admin",
  "superadmin",
  "admin_sede",
  "recepcionista",
  "call_center",
  "estilista",
]);

const navItems: NavItem[] = [
  { title: "Dashboard", href: "/superadmin/dashboard", icon: LayoutDashboard, module: APP_MODULES.SUPER_DASHBOARD },
  { title: "Dashboard", href: "/sede/dashboard", icon: LayoutDashboard, module: APP_MODULES.SEDE_DASHBOARD },
  { title: "Agenda", href: "/agenda", icon: Users, module: APP_MODULES.AGENDA_HOME },

  { title: "Productos", href: "/superadmin/products", icon: Package, module: APP_MODULES.SUPER_PRODUCTS },
  { title: "Clientes", href: "/superadmin/clients", icon: Users, module: APP_MODULES.SUPER_CLIENTS },
  { title: "Comisiones", href: "/superadmin/commissions", icon: CreditCard, module: APP_MODULES.SUPER_COMMISSIONS },
  { title: "Sedes", href: "/superadmin/sedes", icon: Home, module: APP_MODULES.SUPER_SEDES },
  { title: "Estilistas", href: "/superadmin/stylists", icon: Users, module: APP_MODULES.SUPER_STYLISTS },
  { title: "Usuarios Sistema", href: "/superadmin/system-users", icon: Users, module: APP_MODULES.SUPER_SYSTEM_USERS },
  { title: "Servicios", href: "/superadmin/services", icon: Package, module: APP_MODULES.SUPER_SERVICES },
  { title: "Ventas Facturadas", href: "/superadmin/sales-invoices", icon: CreditCard, module: APP_MODULES.SUPER_SALES_INVOICES },
  { title: "Gift Cards", href: "/superadmin/gift-cards", icon: Gift, module: APP_MODULES.SUPER_GIFT_CARDS },
  { title: "Cierre de Caja", href: "/superadmin/cierre-caja", icon: Wallet, module: APP_MODULES.SUPER_CIERRE_CAJA },

  { title: "Productos", href: "/sede/products", icon: Package, module: APP_MODULES.SEDE_PRODUCTS },
  { title: "Clientes", href: "/sede/clients", icon: Users, module: APP_MODULES.SEDE_CLIENTS },
  { title: "Facturación", href: "/sede/billing", icon: CreditCard, module: APP_MODULES.SEDE_BILLING },
  { title: "Gift Cards", href: "/sede/gift-cards", icon: Gift, module: APP_MODULES.SEDE_GIFT_CARDS },
  { title: "Estilistas", href: "/sede/stylists", icon: Users, module: APP_MODULES.SEDE_STYLISTS },
  { title: "Comisiones", href: "/sede/commissions", icon: CreditCard, module: APP_MODULES.SEDE_COMMISSIONS },
  { title: "Ventas Facturadas", href: "/sede/sales-invoiced", icon: CreditCard, module: APP_MODULES.SEDE_SALES_INVOICED },
  { title: "Cierre de Caja", href: "/sede/cierre-caja", icon: Wallet, module: APP_MODULES.SEDE_CIERRE_CAJA },

  { title: "Comisiones", href: "/stylist/commissions", icon: CreditCard, module: APP_MODULES.STYLIST_COMMISSIONS },
];

export function Sidebar() {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { user, activeSedeId, setActiveSedeId, logout } = useAuth();
  const [sedeOptions, setSedeOptions] = useState<SedeOption[]>([]);
  const [loadingSedeOptions, setLoadingSedeOptions] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const getStoredRole = (): string | null => {
    return (
      localStorage.getItem("beaux-role") ||
      sessionStorage.getItem("beaux-role") ||
      localStorage.getItem("beaux-rol") ||
      sessionStorage.getItem("beaux-rol") ||
      (user ? user.role : null)
    );
  };

  const getStoredCurrency = (): string => {
    return String(
      sessionStorage.getItem("beaux-moneda") ||
        localStorage.getItem("beaux-moneda") ||
        user?.moneda ||
        ""
    ).toUpperCase();
  };

  const allowedSedeIds = useMemo(() => {
    const values = new Set<string>();
    const addSedeId = (candidate: string | null | undefined) => {
      const normalized = normalizeSedeId(candidate);
      if (normalized) values.add(normalized);
    };

    addSedeId(user?.sede_id_principal);
    addSedeId(user?.sede_id);
    addSedeId(activeSedeId);

    if (Array.isArray(user?.sedes_permitidas)) {
      user.sedes_permitidas.forEach((sedeId) => addSedeId(sedeId));
    }

    return Array.from(values);
  }, [activeSedeId, user?.sede_id, user?.sede_id_principal, user?.sedes_permitidas]);

  const isSuperAdmin = useMemo(() => {
    const role = normalizeRole(getStoredRole() || "");
    return role === "super_admin" || role === "superadmin";
  }, [user?.role]);

  const supportsMultiSedeSelector = useMemo(() => {
    const role = normalizeRole(getStoredRole() || "");
    return MULTI_SEDE_ROLES.has(role);
  }, [user?.role]);

  const selectedSedeId = useMemo(() => {
    const active = normalizeSedeId(activeSedeId);
    if (active) return active;

    const current = normalizeSedeId(user?.sede_id);
    if (current) return current;

    const primary = normalizeSedeId(user?.sede_id_principal);
    if (primary) return primary;

    return sedeOptions[0]?.sede_id || "";
  }, [activeSedeId, user?.sede_id, user?.sede_id_principal, sedeOptions]);

  const shouldShowSedeSelector =
    !collapsed && !isSuperAdmin && supportsMultiSedeSelector && sedeOptions.length > 1;

  useEffect(() => {
    const fallbackOptions = allowedSedeIds.map((sedeId) => ({ sede_id: sedeId, nombre: sedeId }));

    if (isSuperAdmin) {
      setSedeOptions([]);
      setLoadingSedeOptions(false);
      return;
    }

    if (!user?.access_token) {
      setSedeOptions(fallbackOptions);
      return;
    }

    let isMounted = true;

    const loadSedeOptions = async () => {
      try {
        setLoadingSedeOptions(true);
        const sedes = await getSedes(user.access_token);
        const normalizedSedes = (Array.isArray(sedes) ? sedes : [])
          .map((sede: BranchSede) => {
            const sedeId = normalizeSedeId(sede.sede_id ?? sede.unique_id ?? sede._id);
            if (!sedeId) return null;
            return {
              sede_id: sedeId,
              nombre: formatSedeNombre(sede.nombre, sedeId),
            };
          })
          .filter((sede): sede is SedeOption => Boolean(sede));

        const allowedSet = new Set(allowedSedeIds.map((sedeId) => sedeId.toUpperCase()));
        const scopedSedes = normalizedSedes.filter((sede) =>
          allowedSet.has(sede.sede_id.toUpperCase())
        );

        const mergedById = new Map<string, SedeOption>();
        scopedSedes.forEach((sede) => {
          mergedById.set(sede.sede_id.toUpperCase(), sede);
        });

        const missingAllowedSedeIds = allowedSedeIds.filter((sedeId) => {
          return !mergedById.has(sedeId.toUpperCase());
        });

        if (missingAllowedSedeIds.length > 0) {
          const missingSedeResponses = await Promise.allSettled(
            missingAllowedSedeIds.map((sedeId) => getSedeById(user.access_token, sedeId))
          );

          missingSedeResponses.forEach((response, index) => {
            const sedeId = missingAllowedSedeIds[index];
            if (response.status !== "fulfilled" || !response.value) {
              return;
            }

            const resolvedSedeId = normalizeSedeId(
              response.value.sede_id ?? response.value.unique_id ?? response.value._id ?? sedeId
            );
            if (!resolvedSedeId) return;

            mergedById.set(resolvedSedeId.toUpperCase(), {
              sede_id: resolvedSedeId,
              nombre: formatSedeNombre(response.value.nombre, resolvedSedeId),
            });
          });
        }

        allowedSedeIds.forEach((sedeId) => {
          if (mergedById.has(sedeId.toUpperCase())) return;
          mergedById.set(sedeId.toUpperCase(), { sede_id: sedeId, nombre: sedeId });
        });

        const nextOptions = Array.from(mergedById.values());
        if (isMounted) {
          setSedeOptions(nextOptions.length > 0 ? nextOptions : fallbackOptions);
        }
      } catch (error) {
        console.error("Error cargando sedes en sidebar:", error);
        if (isMounted) {
          setSedeOptions(fallbackOptions);
        }
      } finally {
        if (isMounted) {
          setLoadingSedeOptions(false);
        }
      }
    };

    loadSedeOptions();

    return () => {
      isMounted = false;
    };
  }, [allowedSedeIds, isSuperAdmin, user?.access_token]);

  useEffect(() => {
    if (isSuperAdmin) return;
    if (!selectedSedeId) return;
    if (normalizeSedeId(activeSedeId) === selectedSedeId) return;
    setActiveSedeId(selectedSedeId);
  }, [activeSedeId, isSuperAdmin, selectedSedeId, setActiveSedeId]);

  const handleSedeChange = (sedeId: string) => {
    const normalized = normalizeSedeId(sedeId);
    if (!normalized) return;
    setActiveSedeId(normalized);
  };

  const handleNavigation = (item: NavItem) => {
    navigate(item.href);
    setIsMobileOpen(false);
  };

  const handleLogout = () => {
    localStorage.clear();
    sessionStorage.clear();
    logout?.();
    navigate("/");
  };

  const visibleItems = navItems.filter((item) => {
    const role = getStoredRole() || "";
    const currency = getStoredCurrency();
    const roleAllowed = canAccess(item.module, role);
    const currencyAllowed = item.currencies ? item.currencies.includes(currency) : true;
    return roleAllowed && currencyAllowed;
  });

  return (
    <>
      <div className="lg:hidden fixed top-0 left-0 right-0 bg-white border-b border-gray-200 z-50 h-16 flex items-center justify-between px-4">
        <h1 className="text-xl font-bold">RF Salon Agent</h1>
        <button onClick={() => setIsMobileOpen(!isMobileOpen)} className="p-2 hover:bg-gray-100 rounded-lg">
          {isMobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      <div
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-40 flex flex-col border-r border-gray-200 bg-white transition-all duration-300",
          collapsed ? "w-20" : "w-64",
          isMobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200">
          {!collapsed && <h1 className="text-lg font-bold">RF Salon Agent</h1>}
          <button onClick={() => setCollapsed(!collapsed)} className="p-2 rounded-lg hover:bg-gray-100">
            {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          </button>
        </div>

        {shouldShowSedeSelector && (
          <div className="border-b border-gray-200 bg-white px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">Sede activa</p>
            <select
              value={selectedSedeId}
              onChange={(e) => handleSedeChange(e.target.value)}
              className="mt-2 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
              disabled={loadingSedeOptions}
            >
              {sedeOptions.map((sede) => (
                <option key={sede.sede_id} value={sede.sede_id}>
                  {sede.nombre}
                </option>
              ))}
            </select>
          </div>
        )}

        <nav className="flex-1 px-2 py-4 space-y-1">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              location.pathname === item.href ||
              (item.module === APP_MODULES.AGENDA_HOME &&
                AGENDA_PATHS.includes(location.pathname as (typeof AGENDA_PATHS)[number]));

            return (
              <button
                key={item.href}
                onClick={() => handleNavigation(item)}
                className={cn(
                  "flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors w-full",
                  collapsed ? "justify-center" : "gap-3",
                  isActive ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100"
                )}
                title={collapsed ? item.title : undefined}
              >
                <Icon className="h-5 w-5" />
                {!collapsed && item.title}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-gray-200">
          <button
            onClick={handleLogout}
            className={cn(
              "flex items-center w-full rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900",
              collapsed ? "justify-center" : "gap-3"
            )}
            title={collapsed ? "Cerrar sesión" : undefined}
          >
            <LogOut className="h-5 w-5" />
            {!collapsed && "Cerrar Sesión"}
          </button>
        </div>
      </div>
    </>
  );
}
