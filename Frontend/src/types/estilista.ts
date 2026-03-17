export interface Estilista {
  _id: string;
  nombre: string;
  email: string;
  especialidades: string[];
  activo: boolean;
  rol: string;
  profesional_id: string;
  sede_id: string;
  franquicia_id: string | null;
  created_by: string;
  comision: number | null;
  comisiones_por_categoria?: Record<string, number>;
  created_at: string;
  updated_at: string;
  especialidades_detalle: Array<{
    id: string;
    nombre: string;
  }>;
  updated_by?: string;
  deleted_at?: string;
  deleted_by?: string;
}

export type CreateEstilistaData = {
  nombre: string;
  email: string;
  sede_id: string;
  especialidades: string[];
  comision: number | null;
  telefono?: string;
  password: string;
  activo?: boolean;
};

export type UpdateEstilistaData = {
  nombre?: string;
  email?: string;
  sede_id?: string;
  especialidades?: string[];
  comision?: number | null;
  comisiones_por_categoria?: Record<string, number>;
  activo?: boolean;
};

export interface Estilista {
  _id: string;
  nombre: string;
  email: string;
  especialidades: string[]; // Array de nombres de especialidades
  servicios_no_presta: string[]; // 🔥 NUEVO: IDs de servicios que NO presta
  servicios_presta?: Array<{ // 🔥 NUEVO: Servicios que SÍ presta
    id: string;
    nombre: string;
  }>;
  activo: boolean;
  rol: string;
  profesional_id: string;
  sede_id: string;
  telefono?: string;
  sede_nombre?: string; // 🔥 NUEVO: Nombre de la sede
  franquicia_id: string | null;
  created_by: string;
  comision: number | null;
  created_at: string;
  updated_at: string;
  especialidades_detalle: Array<{
    id: string;
    nombre: string;
  }>;
  updated_by?: string;
  deleted_at?: string;
  deleted_by?: string;
}

