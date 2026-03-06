import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { cn } from '../../lib/utils';
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
} from 'lucide-react';
import { useAuth } from '../Auth/AuthContext';
import { APP_MODULES, AGENDA_PATHS, canAccess, type AppModule } from '../../lib/access-control';

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  module: AppModule;
  currencies?: string[];
}

const navItems: NavItem[] = [
  { title: 'Dashboard', href: '/superadmin/dashboard', icon: LayoutDashboard, module: APP_MODULES.SUPER_DASHBOARD },
  { title: 'Dashboard', href: '/sede/dashboard', icon: LayoutDashboard, module: APP_MODULES.SEDE_DASHBOARD },
  { title: 'Agenda', href: '/agenda', icon: Users, module: APP_MODULES.AGENDA_HOME },

  { title: 'Productos', href: '/superadmin/products', icon: Package, module: APP_MODULES.SUPER_PRODUCTS },
  { title: 'Clientes', href: '/superadmin/clients', icon: Users, module: APP_MODULES.SUPER_CLIENTS },
  { title: 'Comisiones', href: '/superadmin/commissions', icon: CreditCard, module: APP_MODULES.SUPER_COMMISSIONS },
  { title: 'Sedes', href: '/superadmin/sedes', icon: Home, module: APP_MODULES.SUPER_SEDES },
  { title: 'Estilistas', href: '/superadmin/stylists', icon: Users, module: APP_MODULES.SUPER_STYLISTS },
  { title: 'Usuarios Sistema', href: '/superadmin/system-users', icon: Users, module: APP_MODULES.SUPER_SYSTEM_USERS },
  { title: 'Servicios', href: '/superadmin/services', icon: Package, module: APP_MODULES.SUPER_SERVICES },
  { title: 'Ventas Facturadas', href: '/superadmin/sales-invoices', icon: CreditCard, module: APP_MODULES.SUPER_SALES_INVOICES },
  { title: 'Gift Cards', href: '/superadmin/gift-cards', icon: Gift, module: APP_MODULES.SUPER_GIFT_CARDS },
  { title: 'Cierre de Caja', href: '/superadmin/cierre-caja', icon: Wallet, module: APP_MODULES.SUPER_CIERRE_CAJA },

  { title: 'Productos', href: '/sede/products', icon: Package, module: APP_MODULES.SEDE_PRODUCTS },
  { title: 'Clientes', href: '/sede/clients', icon: Users, module: APP_MODULES.SEDE_CLIENTS },
  { title: 'Facturación', href: '/sede/billing', icon: CreditCard, module: APP_MODULES.SEDE_BILLING },
  { title: 'Gift Cards', href: '/sede/gift-cards', icon: Gift, module: APP_MODULES.SEDE_GIFT_CARDS },
  { title: 'Estilistas', href: '/sede/stylists', icon: Users, module: APP_MODULES.SEDE_STYLISTS },
  { title: 'Comisiones', href: '/sede/commissions', icon: CreditCard, module: APP_MODULES.SEDE_COMMISSIONS },
  { title: 'Ventas Facturadas', href: '/sede/sales-invoiced', icon: CreditCard, module: APP_MODULES.SEDE_SALES_INVOICED },
  { title: 'Cierre de Caja', href: '/sede/cierre-caja', icon: Wallet, module: APP_MODULES.SEDE_CIERRE_CAJA },
  { title: 'Performance', href: '/sede/performance', icon: LayoutDashboard, module: APP_MODULES.SEDE_PERFORMANCE },

  { title: 'Comisiones', href: '/stylist/commissions', icon: CreditCard, module: APP_MODULES.STYLIST_COMMISSIONS },
];

export function Sidebar() {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const getStoredRole = (): string | null => {
    return (
      localStorage.getItem('beaux-role') ||
      sessionStorage.getItem('beaux-role') ||
      localStorage.getItem('beaux-rol') ||
      sessionStorage.getItem('beaux-rol') ||
      (user ? user.role : null)
    );
  };

  const getStoredCurrency = (): string => {
    return String(
      sessionStorage.getItem('beaux-moneda') ||
      localStorage.getItem('beaux-moneda') ||
      user?.moneda ||
      ''
    ).toUpperCase();
  };

  const handleNavigation = (item: NavItem) => {
    navigate(item.href);
    setIsMobileOpen(false);
  };

  const handleLogout = () => {
    localStorage.clear();
    sessionStorage.clear();
    logout?.();
    navigate('/');
  };

  const visibleItems = navItems.filter((item) => {
    const role = getStoredRole() || '';
    const currency = getStoredCurrency();
    const roleAllowed = canAccess(item.module, role);
    const currencyAllowed = item.currencies ? item.currencies.includes(currency) : true;
    return roleAllowed && currencyAllowed;
  });

  return (
    <>
      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 bg-white border-b border-gray-200 z-50 h-16 flex items-center justify-between px-4">
        <h1 className="text-xl font-bold">RF Salon Agent</h1>
        <button 
          onClick={() => setIsMobileOpen(!isMobileOpen)}
          className="p-2 hover:bg-gray-100 rounded-lg"
        >
          {isMobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Sidebar */}
      <div
        className={cn(
          'fixed lg:static inset-y-0 left-0 z-40 flex flex-col border-r border-gray-200 bg-white transition-all duration-300',
          collapsed ? 'w-20' : 'w-64',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200">
          {!collapsed && <h1 className="text-lg font-bold">RF Salon Agent</h1>}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-2 rounded-lg hover:bg-gray-100"
          >
            {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          </button>
        </div>

        {/* Nav */}
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
                  'flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors w-full',
                  collapsed ? 'justify-center' : 'gap-3',
                  isActive
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                )}
                title={collapsed ? item.title : undefined}
              >
                <Icon className="h-5 w-5" />
                {!collapsed && item.title}
              </button>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="p-3 border-t border-gray-200">
          <button
            onClick={handleLogout}
            className={cn(
              'flex items-center w-full rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900',
              collapsed ? 'justify-center' : 'gap-3'
            )}
            title={collapsed ? 'Cerrar sesión' : undefined}
          >
            <LogOut className="h-5 w-5" />
            {!collapsed && 'Cerrar Sesión'}
          </button>
        </div>
      </div>
    </>
  );
}
