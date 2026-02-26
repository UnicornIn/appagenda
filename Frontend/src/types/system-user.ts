export type SystemUserRole = "superadmin" | "admin_sede";

export interface SystemUser {
  _id: string;
  nombre: string;
  email: string;
  role: SystemUserRole;
  sede_id?: string | null;
  sede_nombre?: string | null;
  especialidades?: string[];
  activo: boolean;
  user_type: "system" | "staff" | string;
  fecha_creacion?: string;
  creado_por?: string;
}

export interface CreateSystemUserPayload {
  nombre: string;
  email: string;
  role: SystemUserRole;
  sede_id?: string | null;
  especialidades?: string[];
  password?: string;
  activo?: boolean;
}
