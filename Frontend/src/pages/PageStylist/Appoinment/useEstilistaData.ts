"use client";

import { useState, useEffect, useCallback } from 'react';
import { Cita } from '../../../types/fichas';
import { API_BASE_URL } from '../../../types/config';

export function useEstilistaData() {
  const [citas, setCitas] = useState<Cita[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCitas = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
      
      if (!token) {
        throw new Error('No hay token de autenticación.');
      }

      const response = await fetch(`${API_BASE_URL}scheduling/quotes/citas/estilista`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`Error ${response.status}`);
      }
      
      const data = await response.json();
      
      if (Array.isArray(data)) {
        const citasFormateadas = data.map((cita: any) => ({
          cita_id: cita.cita_id || cita._id || "",
          cliente: {
            cliente_id: cita.cliente?.cliente_id || cita.cliente_id || "",
            nombre: cita.cliente?.nombre || cita.cliente_nombre || "",
            apellido: cita.cliente?.apellido || cita.cliente_apellido || "",
            telefono: cita.cliente?.telefono || cita.cliente_telefono || "",
            email: cita.cliente?.email || cita.cliente_email || "",
          },
          servicios: cita.servicios || [], // ✅ Array directo del backend
          precio_total: cita.precio_total || 0,
          cantidad_servicios: cita.cantidad_servicios || 0,
          tiene_precio_personalizado: cita.tiene_precio_personalizado || false,
          sede: cita.sede || { sede_id: cita.sede_id || "", nombre: cita.sede_nombre || "" },
          estilista_id: cita.estilista_id || cita.profesional_id || "",
          profesional_id: cita.profesional_id || cita.estilista_id || "",
          fecha: cita.fecha || "",
          hora_inicio: cita.hora_inicio || "",
          hora_fin: cita.hora_fin || "",
          estado: cita.estado || "",
          comentario: cita.comentario || cita.notas || "",
        }));
        
        console.log('✅ Citas cargadas:', citasFormateadas);
        setCitas(citasFormateadas);
        setError(null);
      }
    } catch (err) {
      console.error('❌ Error:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
      setCitas([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCitas();
  }, [fetchCitas]);

  const getCurrentToken = useCallback(() => {
    return localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
  }, []);

  const updateCitaStatus = useCallback(async (cita_id: string, action: string) => {
    try {
      const token = getCurrentToken();
      if (!token) throw new Error('No hay token');

      const response = await fetch(`${API_BASE_URL}scheduling/quotes/${cita_id}/${action}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) throw new Error(`Error ${response.status}`);
      
      const data = await response.json();
      
      if (data.success) {
        setCitas(prevCitas => 
          prevCitas.map(cita => 
            cita.cita_id === cita_id 
              ? { ...cita, estado: action === 'confirmar' ? 'Confirmado' : 
                                  action === 'cancelar' ? 'Cancelado' :
                                  action === 'completar' ? 'Completado' :
                                  action === 'no-asistio' ? 'No Asistió' : cita.estado }
              : cita
          )
        );
        return { success: true, data };
      }
      
      throw new Error(data.message || 'Error al actualizar');
    } catch (err) {
      console.error('❌ Error:', err);
      throw err;
    }
  }, [getCurrentToken]);

  const confirmarCita = useCallback((cita_id: string) => 
    updateCitaStatus(cita_id, 'confirmar'), [updateCitaStatus]);
  
  const cancelarCita = useCallback((cita_id: string) => 
    updateCitaStatus(cita_id, 'cancelar'), [updateCitaStatus]);
  
  const completarCita = useCallback((cita_id: string) => 
    updateCitaStatus(cita_id, 'completar'), [updateCitaStatus]);
  
  const marcarNoAsistio = useCallback((cita_id: string) => 
    updateCitaStatus(cita_id, 'no-asistio'), [updateCitaStatus]);

  // Estadísticas simples
  const citasHoy = citas.filter(cita => {
    try {
      const fechaCita = new Date(cita.fecha).toDateString();
      const hoy = new Date().toDateString();
      return fechaCita === hoy;
    } catch {
      return false;
    }
  }).length;

  const serviciosCompletadosHoy = citas.filter(cita => {
    try {
      const fechaCita = new Date(cita.fecha).toDateString();
      const hoy = new Date().toDateString();
      const estado = (cita.estado || '').toLowerCase();
      return fechaCita === hoy && ['completado', 'completada', 'finalizado', 'finalizada'].includes(estado);
    } catch {
      return false;
    }
  }).length;

  const totalVentasHoy = citas
    .filter(cita => {
      try {
        const fechaCita = new Date(cita.fecha).toDateString();
        const hoy = new Date().toDateString();
        const estado = (cita.estado || '').toLowerCase();
        return fechaCita === hoy && ['completado', 'completada', 'finalizado', 'finalizada'].includes(estado);
      } catch {
        return false;
      }
    })
    .reduce((total, cita) => total + (cita.precio_total || 0), 0);

  return {
    citas,
    citasHoy,
    serviciosCompletadosHoy,
    totalVentasHoy,
    loading,
    error,
    refetchCitas: fetchCitas,
    confirmarCita,
    cancelarCita,
    completarCita,
    marcarNoAsistio,
    getCurrentToken,
  };
}
