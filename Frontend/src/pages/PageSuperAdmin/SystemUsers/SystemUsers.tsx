"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader, Plus, Search, ShieldCheck, UserCog } from "lucide-react";
import { Sidebar } from "../../../components/Layout/Sidebar";
import { useAuth } from "../../../components/Auth/AuthContext";
import type { CreateSystemUserPayload, SystemUser } from "../../../types/system-user";
import { systemUsersService } from "./systemUsersService";
import { SystemUserFormModal } from "./system-user-form-modal";
import { formatSedeNombre } from "../../../lib/sede";
import { sedeService } from "../Sedes/sedeService";

const roleBadgeClasses: Record<string, string> = {
  superadmin: "bg-gray-900 text-white",
  admin_sede: "bg-blue-50 text-blue-700",
};

const roleLabels: Record<string, string> = {
  superadmin: "superadmin",
  admin_sede: "adminsede",
};

export default function SystemUsersPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [sedeNamesById, setSedeNamesById] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const isSuperAdmin = useMemo(
    () => user?.role === "superadmin" || user?.role === "super_admin",
    [user?.role]
  );

  const selectedUser = useMemo(
    () => users.find((systemUser) => systemUser._id === selectedUserId) || null,
    [users, selectedUserId]
  );

  const getSedeDisplayName = (systemUser: Pick<SystemUser, "sede_id" | "sede_nombre">) => {
    const sedeNombreRaw = systemUser.sede_nombre?.trim();
    if (sedeNombreRaw) {
      return formatSedeNombre(sedeNombreRaw, sedeNombreRaw);
    }

    const sedeId = systemUser.sede_id?.trim();
    if (!sedeId) {
      return "Sin sede asignada";
    }

    return sedeNamesById[sedeId] || "Sede no disponible";
  };

  const filteredUsers = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return users;

    return users.filter((systemUser) => {
      const roleLabel = (roleLabels[systemUser.role] || systemUser.role).toLowerCase();
      const sedeNombre = getSedeDisplayName(systemUser).toLowerCase();

      return (
        systemUser.nombre.toLowerCase().includes(query) ||
        systemUser.email.toLowerCase().includes(query) ||
        roleLabel.includes(query) ||
        sedeNombre.includes(query)
      );
    });
  }, [searchTerm, users, sedeNamesById]);

  const loadSystemUsers = async () => {
    if (!user?.access_token) {
      setError("No hay token de autenticación disponible");
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const data = await systemUsersService.getSystemUsers(user.access_token);
      setUsers(data);
      setSelectedUserId((currentSelectedUserId) => {
        if (data.length === 0) return "";
        if (currentSelectedUserId && data.some((systemUser) => systemUser._id === currentSelectedUserId)) {
          return currentSelectedUserId;
        }
        return data[0]._id;
      });
    } catch (err) {
      console.error("Error cargando usuarios del sistema:", err);
      setError(err instanceof Error ? err.message : "Error al cargar usuarios del sistema");
    } finally {
      setIsLoading(false);
    }
  };

  const loadSedeNames = async () => {
    if (!user?.access_token) return;
    try {
      const sedes = await sedeService.getSedes(user.access_token);
      const nextSedeNamesById = sedes.reduce<Record<string, string>>((acc, sede) => {
        const sedeId = sede.sede_id?.trim();
        if (!sedeId) return acc;

        const sedeNombre = formatSedeNombre(sede.nombre, sede.nombre);
        acc[sedeId] = sedeNombre || sede.nombre || "Sede";
        return acc;
      }, {});
      setSedeNamesById(nextSedeNamesById);
    } catch (err) {
      console.error("Error cargando nombres de sedes para usuarios del sistema:", err);
    }
  };

  useEffect(() => {
    if (!authLoading && user) {
      loadSystemUsers();
      loadSedeNames();
    }
  }, [authLoading, user?.access_token]);

  const handleCreateSystemUser = async (payload: CreateSystemUserPayload) => {
    if (!user?.access_token) {
      throw new Error("No hay token de autenticación disponible");
    }
    if (!isSuperAdmin) {
      throw new Error("No autorizado para crear usuarios del sistema");
    }

    setIsSaving(true);
    try {
      await systemUsersService.createSystemUser(user.access_token, payload);
      await loadSystemUsers();
      setIsModalOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  if (authLoading || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-3">
          <Loader className="h-8 w-8 animate-spin text-gray-900" />
          <span className="text-sm text-gray-600">
            {authLoading ? "Verificando autenticación..." : "Cargando usuarios del sistema..."}
          </span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="text-center">
          <div className="text-sm text-gray-600 mb-2">No autenticado</div>
          <div className="text-xs text-gray-500">Inicia sesión para acceder</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-white">
      <Sidebar />

      <div className="flex flex-1 overflow-hidden">
        <div className="w-96 border-r border-gray-100 bg-white overflow-y-auto">
          <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-gray-900" />
                <h1 className="text-lg font-semibold text-gray-900">Usuarios del Sistema</h1>
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                  {searchTerm ? `${filteredUsers.length}/${users.length}` : users.length}
                </span>
              </div>

              {isSuperAdmin && (
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="h-8 px-3 text-xs bg-gray-900 text-white rounded hover:bg-gray-800 flex items-center gap-1"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Nuevo
                </button>
              )}
            </div>

            <div className="mt-3 relative">
              <Search className="h-4 w-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nombre, email o sede..."
                className="w-full h-9 pl-8 pr-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-gray-300"
              />
            </div>
          </div>

          {!isSuperAdmin && (
            <div className="mx-6 mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
              Solo superadmin puede gestionar usuarios del sistema.
            </div>
          )}

          {error && (
            <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded">
              <div className="text-xs text-red-700">{error}</div>
              <button
                onClick={loadSystemUsers}
                className="mt-2 text-xs text-red-700 hover:text-red-900 underline"
              >
                Reintentar
              </button>
            </div>
          )}

          <div className="p-2">
            {filteredUsers.length === 0 && (
              <div className="px-4 py-6 text-center text-xs text-gray-500">
                No se encontraron usuarios con ese criterio.
              </div>
            )}

            {filteredUsers.map((systemUser) => {
              const badgeClass = roleBadgeClasses[systemUser.role] || "bg-gray-100 text-gray-700";
              const isSelected = selectedUserId === systemUser._id;

              return (
                <button
                  key={systemUser._id}
                  onClick={() => setSelectedUserId(systemUser._id)}
                  className={`w-full text-left p-3 rounded-lg border mb-2 transition-colors ${
                    isSelected
                      ? "border-gray-900 bg-gray-50"
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{systemUser.nombre}</div>
                      <div className="text-xs text-gray-600 truncate">{systemUser.email}</div>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${badgeClass}`}>
                      {roleLabels[systemUser.role] || systemUser.role}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500">
                    <span>{systemUser.activo ? "Activo" : "Inactivo"}</span>
                    <span>{getSedeDisplayName(systemUser)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-gray-50">
          {selectedUser ? (
            <div className="max-w-3xl mx-auto p-6">
              <div className="bg-white border border-gray-100 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                    <UserCog className="h-5 w-5 text-gray-700" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">{selectedUser.nombre}</h2>
                    <p className="text-sm text-gray-600">{selectedUser.email}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500 mb-1">Rol</p>
                    <p className="text-gray-900 font-medium">
                      {roleLabels[selectedUser.role] || selectedUser.role}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500 mb-1">Estado</p>
                    <p className="text-gray-900 font-medium">
                      {selectedUser.activo ? "Activo" : "Inactivo"}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500 mb-1">Sede</p>
                    <p className="text-gray-900 font-medium">
                      {getSedeDisplayName(selectedUser)}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500 mb-1">Tipo de usuario</p>
                    <p className="text-gray-900 font-medium">{selectedUser.user_type || "system"}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 mb-1">Especialidades</p>
                    <p className="text-gray-900 font-medium">
                      {selectedUser.especialidades?.length
                        ? `${selectedUser.especialidades.length} servicio(s)`
                        : "Sin especialidades"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center p-8">
              <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center mb-6">
                <UserCog className="h-12 w-12 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {users.length === 0 ? "No hay usuarios del sistema" : "Selecciona un usuario"}
              </h3>
              <p className="text-sm text-gray-600 text-center max-w-sm">
                {users.length === 0
                  ? "Crea el primer usuario administrativo desde el boton Nuevo."
                  : "Selecciona un usuario del listado para ver sus datos."}
              </p>
            </div>
          )}
        </div>
      </div>

      <SystemUserFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleCreateSystemUser}
        isSaving={isSaving}
      />
    </div>
  );
}
