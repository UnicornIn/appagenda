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

export const systemUsersService = {
  async getSystemUsers(token: string): Promise<SystemUser[]> {
    const response = await fetch(`${API_BASE_URL}superadmin/system-users/`, {
      method: "GET",
      headers: {
        accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(await parseErrorMessage(response));
    }

    const data = await response.json();
    return Array.isArray(data) ? data : [];
  },

  async createSystemUser(
    token: string,
    payload: CreateSystemUserPayload
  ): Promise<{ success: boolean; user: SystemUser }> {
    const requestData: Record<string, unknown> = {
      nombre: payload.nombre.trim(),
      email: payload.email.trim().toLowerCase(),
      role: payload.role,
      activo: payload.activo ?? true,
    };

    const sedeId = payload.sede_id?.trim();
    if (sedeId) {
      requestData.sede_id = sedeId;
    }

    if (Array.isArray(payload.especialidades)) {
      requestData.especialidades = payload.especialidades.filter((id) => Boolean(id?.trim()));
    }

    const password = payload.password?.trim();
    if (password) {
      requestData.password = password;
    }

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
};
