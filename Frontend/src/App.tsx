import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import BeauxLogin from "./pages/LoginPage/LoginPage";
import { AuthProvider, useAuth } from "./components/Auth/AuthContext";
import "./index.css";

/* --- Super Admin Pages --- */
import SuperDashboard from "./pages/PageSuperAdmin/Dashboard/Dashboard";
import SuperPerformance from "./pages/PageSuperAdmin/Perfomance/Perfomance";
import SuperAppointment from "./pages/PageSuperAdmin/Appoinment/Appointment";
import { ProductsList as SuperProducts } from "./pages/PageSuperAdmin/Products/Products";
import SuperSede from "./pages/PageSuperAdmin/Sedes/Sede";
import SuperServices from './pages/PageSuperAdmin/Services/Services';
import SuperComisiones from "./pages/PageSuperAdmin/Comisiones/Comisiones";
import SuperStylist from "./pages/PageSuperAdmin/Styslit/Sytlist";
import SuperClients from "./pages/PageSuperAdmin/Clients/Clients";
import SuperPay from "./pages/PageSuperAdmin/Appoinment/PaymentMethods/PaymentMethods"
import SuperInvoices from "./pages/PageSuperAdmin/Sales-invoiced/Sales-invoiced"

/* --- Sede Pages --- */
import SedeDashboard from "./pages/PageSede/Dashboard/Dashboard";
import SedePerformance from "./pages/PageSede/Perfomance/Perfomance";
import SedeAppointment from "./pages/PageSede/Appoinment/Appointment";
import { ProductsList } from "./pages/PageSede/Products/Products";
import SedeClients from "./pages/PageSede/Clients/Clients";
import SedeBilling from "./pages/PageSede/Billing/Billing";
import SedeServices from './pages/PageSede/Services/Services';
import SedeStylists from './pages/PageSede/Styslit/Sytlist';
import SedeCommissions from './pages/PageSede/Comisiones/Comisiones'
import SedeInvoices from "./pages/PageSede/Sales-invoiced/Sales-invoiced"
// import CierreCajaPage from "./pages/PageSede/CierreCaja/CierreCaja"

/* --- Stylist Pages --- */
import StylistAppointment from "./pages/PageStylist/Appoinment/Appointment";
import StylistCommissions from "./pages/PageStylist/Comisiones/Comisiones";

/** 🔒 RUTA PRIVADA: Verifica usuario y rol */
const PrivateRoute = ({
  children,
  allowedRoles,
}: {
  children: JSX.Element;
  allowedRoles: string[];
}) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-lg">Cargando...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  // Si el rol del usuario no está permitido
  if (!allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
};

function App() {
  return (
    <Router>
      <AuthProvider>
        <div className="App">
          <Routes>
            {/* --- LOGIN --- */}
            <Route path="/" element={<BeauxLogin />} />

            {/* --- SUPER ADMIN --- */}
            <Route
              path="/superadmin/dashboard"
              element={
                <PrivateRoute allowedRoles={["super_admin"]}>
                  <SuperDashboard />
                </PrivateRoute>
              }
            />
            <Route
              path="/superadmin/sales-invoices"
              element={
                <PrivateRoute allowedRoles={["super_admin"]}>
                  <SuperInvoices />
                </PrivateRoute>
              }
            />
            <Route
              path="/superadmin/paymethods"
              element={
                <PrivateRoute allowedRoles={["super_admin"]}>
                  <SuperPay />
                </PrivateRoute>
              }
            />
            <Route
              path="/superadmin/performance"
              element={
                <PrivateRoute allowedRoles={["super_admin"]}>
                  <SuperPerformance />
                </PrivateRoute>
              }
            />
            <Route
              path="/superadmin/appointments"
              element={
                <PrivateRoute allowedRoles={["super_admin"]}>
                  <SuperAppointment />
                </PrivateRoute>
              }
            />
            <Route
              path="/superadmin/products"
              element={
                <PrivateRoute allowedRoles={["super_admin"]}>
                  <SuperProducts />
                </PrivateRoute>
              }
            />
            <Route
              path="/superadmin/sedes"
              element={
                <PrivateRoute allowedRoles={["super_admin"]}>
                  <SuperSede />
                </PrivateRoute>
              }
            />
            <Route
              path="/superadmin/stylists"
              element={
                <PrivateRoute allowedRoles={["super_admin"]}>
                  <SuperStylist />
                </PrivateRoute>
              }
            />
            <Route
              path="/superadmin/services"
              element={
                <PrivateRoute allowedRoles={["super_admin"]}>
                  <SuperServices />
                </PrivateRoute>
              }
            />
            <Route
              path="/superadmin/commissions"
              element={
                <PrivateRoute allowedRoles={["super_admin"]}>
                  <SuperComisiones />
                </PrivateRoute>
              }
            />
            <Route
              path="/superadmin/clients"
              element={
                <PrivateRoute allowedRoles={["super_admin"]}>
                  <SuperClients />
                </PrivateRoute>
              }
            />


            {/* --- ADMIN SEDE --- */}
            <Route
              path="/sede/dashboard"
              element={
                <PrivateRoute allowedRoles={["admin_sede"]}>
                  <SedeDashboard />
                </PrivateRoute>
              }
            />
            <Route
              path="/sede/sales-invoiced"
              element={
                <PrivateRoute allowedRoles={["admin_sede"]}>
                  <SedeInvoices />
                </PrivateRoute>
              }
            />
            {/* <Route
              path="/sede/cierre-caja"
              element={
                <PrivateRoute allowedRoles={["admin_sede"]}>
                  <CierreCajaPage />
                </PrivateRoute>
              }
            /> */}
            <Route
              path="/sede/commissions"
              element={
                <PrivateRoute allowedRoles={["admin_sede"]}>
                  <SedeCommissions />
                </PrivateRoute>
              }
            />
            <Route
              path="/sede/billing"
              element={
                <PrivateRoute allowedRoles={["admin_sede"]}>
                  <SedeBilling />
                </PrivateRoute>
              }
            />
            <Route
              path="/sede/performance"
              element={
                <PrivateRoute allowedRoles={["admin_sede"]}>
                  <SedePerformance />
                </PrivateRoute>
              }
            />
            <Route
              path="/sede/appointments"
              element={
                <PrivateRoute allowedRoles={["admin_sede"]}>
                  <SedeAppointment />
                </PrivateRoute>
              }
            />
            <Route
              path="/sede/products"
              element={
                <PrivateRoute allowedRoles={["admin_sede"]}>
                  <ProductsList />
                </PrivateRoute>
              }
            />
            <Route
              path="/sede/clients"
              element={
                <PrivateRoute allowedRoles={["admin_sede"]}>
                  <SedeClients />
                </PrivateRoute>
              }
            />
            <Route
              path="/sede/services"
              element={
                <PrivateRoute allowedRoles={["admin_sede"]}>
                  <SedeServices />
                </PrivateRoute>
              }
            />
            <Route
              path="/sede/stylists"
              element={
                <PrivateRoute allowedRoles={["admin_sede"]}>
                  <SedeStylists />
                </PrivateRoute>
              }
            />

            {/* --- ESTILISTA --- */}
            <Route
              path="/stylist/appointments"
              element={
                <PrivateRoute allowedRoles={["estilista"]}>
                  <StylistAppointment />
                </PrivateRoute>
              }
            />
            <Route
              path="/stylist/commissions"
              element={
                <PrivateRoute allowedRoles={["estilista"]}>
                  <StylistCommissions />
                </PrivateRoute>
              }
            />
            {/* --- SIN PERMISOS --- */}
            <Route
              path="/unauthorized"
              element={
                <div className="flex h-screen items-center justify-center text-lg text-gray-600">
                  No tienes permiso para acceder a esta página.
                </div>
              }
            />

            {/* --- DEFAULT: cualquier ruta redirige --- */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </AuthProvider>
    </Router>
  );
}

export default App;
