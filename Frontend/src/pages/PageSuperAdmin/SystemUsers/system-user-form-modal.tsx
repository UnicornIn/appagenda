"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Loader, X } from "lucide-react";
import { useAuth } from "../../../components/Auth/AuthContext";
import { sedeService, type Sede } from "../Sedes/sedeService";
import { serviciosService } from "../Services/serviciosService";
import type { CreateSystemUserPayload, SystemUser, SystemUserRole } from "../../../types/system-user";
import { formatSedeNombre } from "../../../lib/sede";
import type { Service } from "../../../types/service";

interface SystemUserFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (payload: CreateSystemUserPayload) => Promise<void>;
  mode?: "create" | "edit";
  initialUser?: SystemUser | null;
  isSaving?: boolean;
}

const ROLE_OPTIONS: Array<{ label: string; value: SystemUserRole }> = [
  { label: "superadmin", value: "superadmin" },
  { label: "adminsede", value: "admin_sede" },
  { label: "recepcionista", value: "recepcionista" },
  { label: "call center", value: "call_center" },
];

export function SystemUserFormModal({
  isOpen,
  onClose,
  onSave,
  mode = "create",
  initialUser = null,
  isSaving = false,
}: SystemUserFormModalProps) {
  const { user } = useAuth();
  const isEditMode = mode === "edit";

  const [formData, setFormData] = useState({
    nombre: "",
    email: "",
    role: "admin_sede" as SystemUserRole,
    sede_id: "",
    especialidades: [] as string[],
    password: "",
    activo: true,
  });

  const [sedes, setSedes] = useState<Sede[]>([]);
  const [servicios, setServicios] = useState<Service[]>([]);
  const [isLoadingSedes, setIsLoadingSedes] = useState(false);
  const [isLoadingServicios, setIsLoadingServicios] = useState(false);

  const [isSedeDropdownOpen, setIsSedeDropdownOpen] = useState(false);
  const [isServiciosDropdownOpen, setIsServiciosDropdownOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(
    () =>
      Boolean(
        formData.nombre.trim() &&
          formData.email.trim() &&
          formData.role &&
          formData.sede_id.trim() &&
          (isEditMode || formData.password.trim())
      ),
    [formData, isEditMode]
  );

  useEffect(() => {
    if (!isOpen) return;

    if (isEditMode && initialUser) {
      setFormData({
        nombre: initialUser.nombre || "",
        email: initialUser.email || "",
        role: toSystemUserRole(initialUser.role),
        sede_id: initialUser.sede_id?.trim() || "",
        especialidades: Array.isArray(initialUser.especialidades)
          ? initialUser.especialidades.map((esp) => esp.trim()).filter(Boolean)
          : [],
        password: "",
        activo: Boolean(initialUser.activo),
      });
    } else {
      setFormData({
        nombre: "",
        email: "",
        role: "admin_sede",
        sede_id: "",
        especialidades: [],
        password: "",
        activo: true,
      });
    }
    setError(null);
  }, [isOpen, isEditMode, initialUser]);

  useEffect(() => {
    const loadData = async () => {
      if (!user?.access_token || !isOpen) return;
      try {
        setIsLoadingSedes(true);
        setIsLoadingServicios(true);

        const [sedesData, serviciosData] = await Promise.all([
          sedeService.getSedes(user.access_token),
          serviciosService.getServicios(user.access_token),
        ]);

        setSedes(sedesData);
        setServicios(serviciosData);
      } catch (err) {
        console.error("Error cargando datos para formulario de usuario del sistema:", err);
      } finally {
        setIsLoadingSedes(false);
        setIsLoadingServicios(false);
      }
    };

    loadData();
  }, [isOpen, user?.access_token]);

  useEffect(() => {
    const handleClickOutside = () => {
      setIsSedeDropdownOpen(false);
      setIsServiciosDropdownOpen(false);
    };

    if (isOpen) {
      document.addEventListener("click", handleClickOutside);
    }

    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const stopPropagation = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleSelectSede = (sede: Sede) => {
    setFormData((prev) => ({ ...prev, sede_id: sede.sede_id }));
    setIsSedeDropdownOpen(false);
  };

  const getSedeNombre = () => {
    const sedeSeleccionada = sedes.find((s) => s.sede_id === formData.sede_id);
    return sedeSeleccionada ? formatSedeNombre(sedeSeleccionada.nombre, "Seleccionar sede") : "Seleccionar sede";
  };

  const handleToggleServicio = (servicioId: string) => {
    if (!servicioId) return;

    setFormData((prev) => ({
      ...prev,
      especialidades: prev.especialidades.includes(servicioId)
        ? prev.especialidades.filter((id) => id !== servicioId)
        : [...prev.especialidades, servicioId],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setError(null);

    const nombre = formData.nombre.trim();
    const email = formData.email.trim();
    const password = formData.password.trim();
    const sedeId = formData.sede_id.trim();

    if (!nombre) {
      setError("Por favor ingresa un nombre.");
      return;
    }

    if (!email) {
      setError("Por favor ingresa un email.");
      return;
    }

    if (!sedeId) {
      setError("Por favor selecciona una sede.");
      return;
    }

    if (!isEditMode && !password) {
      setError("Por favor ingresa una contraseña.");
      return;
    }

    if (password && password.length < 6) {
      setError("La contraseña debe tener minimo 6 caracteres.");
      return;
    }

    const especialidadesValidas = (formData.especialidades || [])
      .map((esp) => esp.trim())
      .filter((esp) => Boolean(esp));

    const payload: CreateSystemUserPayload = {
      nombre,
      email,
      role: formData.role,
      sede_id: sedeId,
      especialidades: especialidadesValidas,
      password: password || undefined,
      activo: formData.activo,
    };

    try {
      await onSave(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el usuario del sistema.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4">
      <div className="flex min-h-full items-start justify-center">
        <div
          className="bg-white rounded-lg w-full max-w-md p-6 max-h-[calc(100vh-2rem)] overflow-y-auto"
          onClick={stopPropagation}
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold">
              {isEditMode ? "Editar usuario del sistema" : "Anadir usuario del sistema"}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
              disabled={isSaving}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Nombre *</label>
              <input
                type="text"
                value={formData.nombre}
                onChange={(e) => setFormData((prev) => ({ ...prev, nombre: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-[oklch(0.65_0.25_280)] focus:outline-none focus:ring-2 focus:ring-[oklch(0.65_0.25_280)]/20"
                required
                disabled={isSaving}
                placeholder="Ingresa el nombre completo"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Email *</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-[oklch(0.65_0.25_280)] focus:outline-none focus:ring-2 focus:ring-[oklch(0.65_0.25_280)]/20"
                required
                disabled={isSaving}
                placeholder="ejemplo@correo.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Rol *</label>
              <select
                value={formData.role}
                onChange={(e) => setFormData((prev) => ({ ...prev, role: e.target.value as SystemUserRole }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-[oklch(0.65_0.25_280)] focus:outline-none focus:ring-2 focus:ring-[oklch(0.65_0.25_280)]/20"
                required
                disabled={isSaving}
              >
                {ROLE_OPTIONS.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="relative">
              <label className="block text-sm font-medium mb-2">Sede *</label>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsSedeDropdownOpen(!isSedeDropdownOpen);
                  setIsServiciosDropdownOpen(false);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-[oklch(0.65_0.25_280)] focus:outline-none focus:ring-2 focus:ring-[oklch(0.65_0.25_280)]/20 text-left flex justify-between items-center"
                disabled={isSaving || isLoadingSedes}
              >
                <span className={formData.sede_id ? "text-gray-900" : "text-gray-500"}>
                  {isLoadingSedes ? "Cargando sedes..." : getSedeNombre()}
                </span>
                {isLoadingSedes ? (
                  <Loader className="h-4 w-4 animate-spin text-gray-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                )}
              </button>

              {isSedeDropdownOpen && !isLoadingSedes && (
                <div
                  className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto"
                  onClick={stopPropagation}
                >
                  {sedes.map((sede) => (
                    <button
                      key={sede.sede_id}
                      type="button"
                      onClick={() => handleSelectSede(sede)}
                      className={`w-full text-left px-3 py-2 hover:bg-gray-100 ${
                        formData.sede_id === sede.sede_id ? "bg-blue-50 text-blue-600" : ""
                      }`}
                    >
                      <div className="font-medium">{formatSedeNombre(sede.nombre)}</div>
                      <div className="text-sm text-gray-500 truncate">{sede.direccion}</div>
                    </button>
                  ))}
                  {sedes.length === 0 && (
                    <div className="px-3 py-2 text-sm text-gray-500 text-center">No hay sedes disponibles</div>
                  )}
                </div>
              )}
            </div>

            <div className="relative">
              <label className="block text-sm font-medium mb-2">Especialidades (Servicios)</label>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsServiciosDropdownOpen(!isServiciosDropdownOpen);
                  setIsSedeDropdownOpen(false);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-[oklch(0.65_0.25_280)] focus:outline-none focus:ring-2 focus:ring-[oklch(0.65_0.25_280)]/20 text-left flex justify-between items-center"
                disabled={isSaving || isLoadingServicios}
              >
                <span className={formData.especialidades.length > 0 ? "text-gray-900" : "text-gray-500"}>
                  {isLoadingServicios
                    ? "Cargando servicios..."
                    : formData.especialidades.length === 0
                    ? "Seleccionar servicios"
                    : `${formData.especialidades.length} servicio(s) seleccionado(s)`}
                </span>
                {isLoadingServicios ? (
                  <Loader className="h-4 w-4 animate-spin text-gray-400" />
                ) : isServiciosDropdownOpen ? (
                  <ChevronUp className="h-4 w-4 text-gray-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                )}
              </button>

              {isServiciosDropdownOpen && !isLoadingServicios && (
                <div
                  className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto"
                  onClick={stopPropagation}
                >
                  {servicios.map((servicio) => {
                    const servicioId = servicio.servicio_id || servicio.id;
                    if (!servicioId) return null;

                    return (
                      <label
                        key={servicioId}
                        className="flex items-start gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                      >
                        <input
                          type="checkbox"
                          checked={formData.especialidades.includes(servicioId)}
                          onChange={() => handleToggleServicio(servicioId)}
                          className="mt-1 h-4 w-4 rounded border-gray-300 text-[oklch(0.65_0.25_280)] focus:ring-[oklch(0.65_0.25_280)]"
                          disabled={isSaving}
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900">{servicio.nombre}</p>
                          <p className="text-xs text-gray-500">
                            ID: {servicioId} • {servicio.duracion || 0} min • $
                          </p>
                        </div>
                      </label>
                    );
                  })}
                  {servicios.length === 0 && (
                    <div className="px-3 py-2 text-sm text-gray-500 text-center">No hay servicios disponibles</div>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                {isEditMode ? "Contrasena (opcional)" : "Contrasena *"}
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-[oklch(0.65_0.25_280)] focus:outline-none focus:ring-2 focus:ring-[oklch(0.65_0.25_280)]/20"
                required={!isEditMode}
                placeholder={
                  isEditMode
                    ? "Dejar vacio para conservar la contrasena actual"
                    : "Ingresa una contrasena segura"
                }
                disabled={isSaving}
                minLength={6}
              />
              <p className="text-xs text-gray-500 mt-1">
                {isEditMode ? "Solo si deseas cambiarla (minimo 6 caracteres)." : "Minimo 6 caracteres"}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="activo-system-user"
                checked={formData.activo}
                onChange={(e) => setFormData((prev) => ({ ...prev, activo: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300 text-[oklch(0.65_0.25_280)] focus:ring-[oklch(0.65_0.25_280)]"
                disabled={isSaving}
              />
              <label htmlFor="activo-system-user" className="text-sm font-medium text-gray-700">
                Usuario activo
              </label>
            </div>

            {error && (
              <div className="rounded-md bg-red-50 p-3 border border-red-200 text-xs text-red-700">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                disabled={isSaving}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 px-4 py-2 bg-[oklch(0.65_0.25_280)] text-white rounded-lg hover:bg-[oklch(0.60_0.25_280)] disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                disabled={!canSubmit || isSaving}
              >
                {isSaving ? (
                  <>
                    <Loader className="h-4 w-4 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  isEditMode ? "Guardar cambios" : "Crear usuario del sistema"
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

const normalizeRole = (role: string) => role.trim().toLowerCase().replace(/[\s-]+/g, "_");

const toSystemUserRole = (role: string): SystemUserRole => {
  const normalizedRole = normalizeRole(role);

  if (normalizedRole === "super_admin") return "superadmin";
  if (normalizedRole === "adminsede") return "admin_sede";
  if (normalizedRole === "callcenter" || normalizedRole === "soporte") return "call_center";
  if (normalizedRole === "recepcionoista") return "recepcionista";

  if (normalizedRole === "superadmin") return "superadmin";
  if (normalizedRole === "admin_sede") return "admin_sede";
  if (normalizedRole === "recepcionista") return "recepcionista";
  if (normalizedRole === "call_center") return "call_center";

  return "admin_sede";
};
