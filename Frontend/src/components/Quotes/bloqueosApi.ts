// src/pages/Quotes/bloqueosApi.ts
import { API_BASE_URL } from "../../types/config";

export interface Bloqueo {
  _id?: string;
  profesional_id: string;
  sede_id: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  motivo: string;
  recurrente?: boolean;
  serie_id?: string | null;
  dias_semana?: number[];
  fecha_inicio_regla?: string | null;
  fecha_fin_regla?: string | null;
  creado_por?: string;
  fecha_creacion?: string;
}

export interface BloqueoCreatePayload {
  profesional_id: string;
  sede_id: string;
  hora_inicio: string;
  hora_fin: string;
  motivo: string;
  fecha?: string;
  recurrente?: boolean;
  dias_semana?: number[];
  fecha_inicio?: string;
  fecha_fin?: string;
}

export interface BloqueoUpdatePayload {
  hora_inicio?: string;
  hora_fin?: string;
  motivo?: string;
  fecha_fin_regla?: string;
  editar_serie?: boolean;
}

// Obtener bloqueos de un profesional específico - CAMBIÉ EL NOMBRE DEL PARÁMETRO
export async function getBloqueosProfesional(profesional_id: string, token: string) {
  const res = await fetch(`${API_BASE_URL}scheduling/block/${profesional_id}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error("Error al cargar bloqueos del profesional");
  return res.json();
}

// Mantén esta función por compatibilidad (pero internamente usa la nueva)
export async function getBloqueosEstilista(profesional_id: string, token: string) {
  return getBloqueosProfesional(profesional_id, token);
}

// Función para obtener TODOS los bloqueos de varios profesionales
export async function getBloqueosMultiplesProfesionales(profesional_ids: string[], token: string) {
  try {
    const promises = profesional_ids.map(id => 
      getBloqueosProfesional(id, token).catch(error => {
        console.error(`Error cargando bloqueos para profesional ${id}:`, error);
        return [];
      })
    );
    
    const resultados = await Promise.all(promises);
    return resultados.flat();
  } catch (error) {
    console.error('Error en getBloqueosMultiplesProfesionales:', error);
    return [];
  }
}

// Otras funciones se mantienen igual...
export async function getBloqueos(filtros: {
  profesional_id?: string;
  sede_id?: string;
  fecha?: string;
}, token: string) {
  try {
    if (filtros.profesional_id && !filtros.fecha) {
      return await getBloqueosProfesional(filtros.profesional_id, token);
    }
    
    const queryParams = new URLSearchParams();
    
    if (filtros.profesional_id) queryParams.append('profesional_id', filtros.profesional_id);
    if (filtros.sede_id) queryParams.append('sede_id', filtros.sede_id);
    if (filtros.fecha) queryParams.append('fecha', filtros.fecha);
    
    const queryString = queryParams.toString();
    const url = `${API_BASE_URL}scheduling/block${queryString ? `?${queryString}` : ''}`;
    
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    
    if (!res.ok) {
      throw new Error(`Endpoint no disponible: ${res.status} ${res.statusText}`);
    }
    
    return res.json();
  } catch (error) {
    console.error('Error en getBloqueos:', error);
    throw error;
  }
}

export async function createBloqueo(data: BloqueoCreatePayload, token: string) {
  const res = await fetch(`${API_BASE_URL}scheduling/block/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.detail || "Error al crear bloqueo");
  }
  return res.json();
}

export async function updateBloqueo(id: string, data: BloqueoUpdatePayload, token: string) {
  const url = `${API_BASE_URL}scheduling/block/${id}`;
  const buildRequest = (method: "PATCH" | "PUT") => ({
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(data),
  });

  let res = await fetch(url, buildRequest("PATCH"));

  // Compatibilidad: algunos entornos aún exponen actualización con PUT.
  if (res.status === 405) {
    res = await fetch(url, buildRequest("PUT"));
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || "Error al actualizar bloqueo");
  }

  const raw = await res.text();
  if (!raw) return {};
  return JSON.parse(raw);
}

export async function deleteBloqueo(id: string, token: string) {
  const res = await fetch(`${API_BASE_URL}scheduling/block/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error("Error al eliminar bloqueo");
  return res.json();
}
