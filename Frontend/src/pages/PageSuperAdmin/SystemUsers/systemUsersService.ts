import { API_BASE_URL } from "../../../types/config";
import type { CreateSystemUserPayload, SystemUser } from "../../../types/system-user";

const parseErrorMessage = async (response: Response) => {
  const raw = await response.text().catch(() => "");
  if (!raw) return `Error ${response.status}: ${response.statusText}`;

  try {
    const parsed = JSON.parse(raw);
    return parsed?.detail || parsed?.message || raw;
  } catch {
    return raw;
  }
};

const normalizeRole = (role: string | null | undefined) =>
  String(role || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

const isFallbackCandidate = (response: Response) => response.status === 404 || response.status === 405;

const toPublicRole = (rawRole: string): string => {
  const role = normalizeRole(rawRole);
  if (role === "super_admin") return "superadmin";
  if (role === "adminsede") return "admin_sede";
  if (role === "callcenter" || role === "soporte") return "call_center";
  if (role === "recepcionoista") return "recepcionista";
  return role;
};

const SYSTEM_ROLES = new Set([
  "superadmin",
  "admin_sede",
  "recepcionista",
  "call_center",
  "admin",
]);

const isSystemUser = (user: SystemUser) => {
  const role = normalizeRole(user.role);
  const userType = normalizeRole(user.user_type);
  return SYSTEM_ROLES.has(role) || userType === "system" || userType === "";
};

const mapToSystemUser = (rawUser: any): SystemUser => {
  const id = String(rawUser?._id ?? rawUser?.id ?? "");
  return {
    _id: id,
    nombre: String(rawUser?.nombre ?? rawUser?.name ?? ""),
    email: String(rawUser?.email ?? rawUser?.correo_electronico ?? ""),
    role: toPublicRole(String(rawUser?.role ?? rawUser?.rol ?? "")) as SystemUser["role"],
    sede_id: rawUser?.sede_id ?? null,
    sede_nombre: rawUser?.sede_nombre ?? rawUser?.nombre_local ?? null,
    especialidades: Array.isArray(rawUser?.especialidades) ? rawUser.especialidades : [],
    activo: Boolean(rawUser?.activo ?? true),
    user_type: String(rawUser?.user_type ?? "system"),
    fecha_creacion: rawUser?.fecha_creacion,
    creado_por: rawUser?.creado_por,
  };
};

const getAuthPatchRoleCandidates = (role: CreateSystemUserPayload["role"]): string[] => {
  const normalized = normalizeRole(role);

  if (normalized === "superadmin") return ["super_admin", "superadmin"];
  if (normalized === "call_center") return ["call_center", "callcenter", "soporte"];
  if (normalized === "recepcionista") return ["recepcionista", "recepcionoista"];
  return [normalized];
};

const toSystemUserCreateRequest = (payload: CreateSystemUserPayload): Record<string, unknown> => {
  const requestData: Record<string, unknown> = {
    nombre: payload.nombre.trim(),
    email: payload.email.trim().toLowerCase(),
    role: normalizeRole(payload.role),
    activo: payload.activo ?? true,
  };

  const sedeId = payload.sede_id?.trim();
  if (sedeId) {
    requestData.sede_id = sedeId;
  }

  if (Array.isArray(payload.especialidades)) {
    requestData.especialidades = payload.especialidades
      .map((id) => id?.trim())
      .filter((id): id is string => Boolean(id));
  }

  const password = payload.password?.trim();
  if (password) {
    requestData.password = password;
  }

  return requestData;
};

const buildAuthRegisterForm = (payload: CreateSystemUserPayload, roleValue: string): URLSearchParams => {
  const form = new URLSearchParams();
  form.set("nombre", payload.nombre.trim());
  form.set("correo_electronico", payload.email.trim().toLowerCase());
  form.set("password", payload.password?.trim() || "");
  form.set("rol", roleValue);

  const sedeId = payload.sede_id?.trim();
  if (sedeId) {
    form.set("sede_id", sedeId);
  }

  return form;
};

const tryCreateWithAuthRegister = async (
  token: string,
  payload: CreateSystemUserPayload
): Promise<{ success: boolean; user: SystemUser } | null> => {
  const roleCandidates = getAuthPatchRoleCandidates(payload.role);
  let fallbackResponse: Response | null = null;

  for (const roleCandidate of roleCandidates) {
    const response = await fetch(`${API_BASE_URL}auth/register`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${token}`,
      },
      body: buildAuthRegisterForm(payload, roleCandidate).toString(),
    });

    if (response.ok) {
      const normalizedRole = toPublicRole(roleCandidate);
      return {
        success: true,
        user: {
          _id: "",
          nombre: payload.nombre.trim(),
          email: payload.email.trim().toLowerCase(),
          role: normalizedRole as SystemUser["role"],
          sede_id: payload.sede_id?.trim() || null,
          especialidades: payload.especialidades || [],
          activo: payload.activo ?? true,
          user_type: "system",
        },
      };
    }

    if (isFallbackCandidate(response)) {
      fallbackResponse = response;
      break;
    }

    const errorMessage = await parseErrorMessage(response);
    const isRoleIssue = /rol/i.test(errorMessage) || /role/i.test(errorMessage);
    if (!isRoleIssue) {
      throw new Error(errorMessage);
    }
  }

  if (fallbackResponse) return null;
  throw new Error("El backend rechazó el rol seleccionado para /auth/register.");
};

const tryPatchAuthUser = async (
  token: string,
  userId: string,
  payload: CreateSystemUserPayload
): Promise<{ success: boolean; user?: SystemUser } | null> => {
  let fallbackResponse: Response | null = null;

  for (const roleCandidate of getAuthPatchRoleCandidates(payload.role)) {
    const requestData: Record<string, unknown> = {
      nombre: payload.nombre.trim(),
      correo_electronico: payload.email.trim().toLowerCase(),
      rol: roleCandidate,
      sede_id: payload.sede_id?.trim() || null,
      activo: payload.activo ?? true,
    };

    const password = payload.password?.trim();
    if (password) {
      requestData.password = password;
    }

    const response = await fetch(`${API_BASE_URL}auth/users/${userId}`, {
      method: "PATCH",
      headers: {
        accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(requestData),
    });

    if (response.ok) {
      return await response.json();
    }

    if (isFallbackCandidate(response)) {
      fallbackResponse = response;
      break;
    }

    const errorMessage = await parseErrorMessage(response);
    const isRoleIssue = /rol/i.test(errorMessage) || /role/i.test(errorMessage);
    if (!isRoleIssue) {
      throw new Error(errorMessage);
    }
  }

  if (fallbackResponse) return null;
  throw new Error("El backend rechazó el rol seleccionado para /auth/users/{id}.");
};

export const systemUsersService = {
  async getSystemUsers(token: string): Promise<SystemUser[]> {
    const authResponse = await fetch(`${API_BASE_URL}auth/users`, {
      method: "GET",
      headers: {
        accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    if (authResponse.ok) {
      const data = await authResponse.json();
      if (!Array.isArray(data)) return [];
      return data.map(mapToSystemUser).filter(isSystemUser);
    }

    if (!isFallbackCandidate(authResponse)) {
      throw new Error(await parseErrorMessage(authResponse));
    }

    const legacyResponse = await fetch(`${API_BASE_URL}superadmin/system-users/`, {
      method: "GET",
      headers: {
        accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    if (!legacyResponse.ok) {
      throw new Error(await parseErrorMessage(legacyResponse));
    }

    const legacyData = await legacyResponse.json();
    if (!Array.isArray(legacyData)) return [];
    return legacyData.map(mapToSystemUser).filter(isSystemUser);
  },

  async createSystemUser(
    token: string,
    payload: CreateSystemUserPayload
  ): Promise<{ success: boolean; user: SystemUser }> {
    const authCreateResult = await tryCreateWithAuthRegister(token, payload);
    if (authCreateResult) return authCreateResult;

    const requestData = toSystemUserCreateRequest(payload);
    const response = await fetch(`${API_BASE_URL}superadmin/system-users/`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(requestData),
    });

    if (!response.ok) {
      throw new Error(await parseErrorMessage(response));
    }

    return await response.json();
  },

  async updateSystemUser(
    token: string,
    userId: string,
    payload: CreateSystemUserPayload
  ): Promise<{ success: boolean; user?: SystemUser }> {
    const authPatchResult = await tryPatchAuthUser(token, userId, payload);
    if (authPatchResult) return authPatchResult;

    const requestData = toSystemUserCreateRequest(payload);
    const response = await fetch(`${API_BASE_URL}superadmin/system-users/${userId}`, {
      method: "PATCH",
      headers: {
        accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(requestData),
    });

    if (!response.ok) {
      throw new Error(await parseErrorMessage(response));
    }

    return await response.json();
  },

  async deleteSystemUser(token: string, userId: string): Promise<{ success: boolean; softDeleted?: boolean }> {
    const endpoint = `${API_BASE_URL}superadmin/system-users/${userId}`;

    const response = await fetch(endpoint, {
      method: "DELETE",
      headers: {
        accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.ok) {
      return await response.json();
    }

    if (!isFallbackCandidate(response)) {
      throw new Error(await parseErrorMessage(response));
    }

    const legacyDeleteResponse = await fetch(`${API_BASE_URL}auth/users/${userId}`, {
      method: "DELETE",
      headers: {
        accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    if (legacyDeleteResponse.ok) {
      return await legacyDeleteResponse.json();
    }

    if (!isFallbackCandidate(legacyDeleteResponse)) {
      throw new Error(await parseErrorMessage(legacyDeleteResponse));
    }

    const softDeleteResponse = await fetch(`${API_BASE_URL}auth/users/${userId}`, {
      method: "PATCH",
      headers: {
        accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ activo: false }),
    });

    if (!softDeleteResponse.ok) {
      throw new Error(await parseErrorMessage(softDeleteResponse));
    }

    return { success: true, softDeleted: true };
  },
};
