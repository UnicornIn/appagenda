"use client";

import { Clock, PlayCircle, Ban, Trash2, X, UserX, CheckCircle, Tag, Pencil } from "lucide-react";
import { Cita } from '../../../types/fichas';
import { Bloqueo, deleteBloqueo } from '../../../components/Quotes/bloqueosApi';
import { useState } from "react";
import BloqueosModal from "../../../components/Quotes/Bloqueos";
import BottomSheet from "../../../components/ui/bottom-sheet";

interface AppointmentsListProps {
  appointments: Cita[];
  bloqueos: Bloqueo[];
  onCitaSelect: (cita: Cita) => void;
  citaSeleccionada: Cita | null;
  fechaFiltro?: string;
  citasValidacion?: Cita[];
  onBloqueoEliminado?: (bloqueoId?: string) => void;
  onBloqueoActualizado?: (bloqueo: Bloqueo) => void;
}

// 🔥 HELPER: Obtener nombres de servicios
const obtenerNombresServicios = (cita: any): string => {
  // Si tiene array de servicios (NUEVO FORMATO)
  if (cita.servicios && Array.isArray(cita.servicios) && cita.servicios.length > 0) {
    return cita.servicios.map((s: any) => s.nombre).join(', ');
  }
  
  // Si tiene servicio único (FORMATO ANTIGUO)
  if (cita.servicio?.nombre) {
    return cita.servicio.nombre;
  }
  
  return 'Sin servicio';
};

// 🔥 HELPER: Calcular precio total
const calcularPrecioTotal = (cita: any): number => {
  // Si tiene precio_total directo del backend
  if (cita.precio_total) {
    return cita.precio_total;
  }
  
  // Si tiene array de servicios
  if (cita.servicios && Array.isArray(cita.servicios) && cita.servicios.length > 0) {
    return cita.servicios.reduce((total: number, servicio: any) => {
      return total + (servicio.precio || 0);
    }, 0);
  }
  
  // Si tiene servicio único
  if (cita.servicio?.precio) {
    return cita.servicio.precio;
  }
  
  return 0;
};

export function AppointmentsList({ 
  appointments, 
  bloqueos, 
  onCitaSelect, 
  citaSeleccionada, 
  fechaFiltro,
  citasValidacion = [],
  onBloqueoEliminado,
  onBloqueoActualizado,
}: AppointmentsListProps) {
  const [bloqueoAEliminar, setBloqueoAEliminar] = useState<Bloqueo | null>(null);
  const [bloqueoEditando, setBloqueoEditando] = useState<Bloqueo | null>(null);
  const [mostrarModalEdicion, setMostrarModalEdicion] = useState(false);
  const [eliminando, setEliminando] = useState(false);

  const getAuthToken = () => {
    return localStorage.getItem('access_token') || 
           sessionStorage.getItem('access_token') || 
           '';
  };

  const handleEditBloqueo = (bloqueo: Bloqueo) => {
    if (!bloqueo._id) {
      alert("No se puede editar: bloqueo sin ID");
      return;
    }
    setBloqueoEditando(bloqueo);
    setMostrarModalEdicion(true);
  };

  const handleCloseEditModal = () => {
    setMostrarModalEdicion(false);
    setBloqueoEditando(null);
  };

  const handleBloqueoGuardado = (bloqueoActualizado: Bloqueo) => {
    onBloqueoActualizado?.(bloqueoActualizado);
  };

  const handleEliminarBloqueo = async (bloqueo: Bloqueo) => {
    if (!bloqueo._id) {
      console.error("No se puede eliminar: bloqueo sin ID");
      return;
    }

    const confirmar = window.confirm(
      `¿Eliminar bloqueo de ${bloqueo.hora_inicio} a ${bloqueo.hora_fin}?\nMotivo: ${bloqueo.motivo}`
    );

    if (!confirmar) return;

    try {
      setEliminando(true);
      setBloqueoAEliminar(bloqueo);
      const token = getAuthToken();
      
      if (!token) {
        alert("No hay token de autenticación");
        return;
      }

      await deleteBloqueo(bloqueo._id, token);
      
      if (onBloqueoEliminado) {
        onBloqueoEliminado(bloqueo._id);
      }

      alert("Bloqueo eliminado");
      
    } catch (error) {
      console.error("Error eliminando bloqueo:", error);
      alert(`Error: ${error instanceof Error ? error.message : "Error desconocido"}`);
    } finally {
      setEliminando(false);
      setBloqueoAEliminar(null);
    }
  };

  const getEstadoCita = (cita: Cita) => {
    if (cita.estado) {
      const estadoNormalizado = cita.estado.toLowerCase().trim();
      
      switch (estadoNormalizado) {
        case "pendiente":
        case "reservada":
        case "reservada/pendiente":
        case "confirmada":
          return { 
            estado: cita.estado,
            color: "text-gray-700", 
            icon: Clock,
            borderColor: "border-gray-300"
          };
        
        case "en proceso":
        case "en_proceso":
        case "en curso":
          return { 
            estado: "En Proceso", 
            color: "text-gray-800", 
            icon: PlayCircle,
            borderColor: "border-gray-400"
          };
        
        case "cancelada":
        case "cancelado":
          return { 
            estado: "Cancelada", 
            color: "text-gray-500", 
            icon: X,
            borderColor: "border-gray-300"
          };
        
        case "no asistio":
        case "no_asistio":
        case "no asistió":
          return { 
            estado: "No Asistió", 
            color: "text-gray-500", 
            icon: UserX,
            borderColor: "border-gray-300"
          };
        
        case "finalizada":
        case "finalizado":
        case "completada":
        case "completado":
          return { 
            estado: "Finalizada", 
            color: "text-gray-700", 
            icon: CheckCircle,
            borderColor: "border-gray-400"
          };
      }
    }
    
    try {
      const ahora = new Date();
      const fechaCita = new Date(cita.fecha);
      
      const [horaInicio, minutoInicio] = cita.hora_inicio.split(':').map(Number);
      const [horaFin, minutoFin] = cita.hora_fin.split(':').map(Number);
      
      const inicioCita = new Date(fechaCita);
      inicioCita.setHours(horaInicio, minutoInicio, 0, 0);
      
      const finCita = new Date(fechaCita);
      finCita.setHours(horaFin, minutoFin, 0, 0);
      
      if (ahora < inicioCita) {
        return { 
          estado: "Pendiente", 
          color: "text-gray-700", 
          icon: Clock,
          borderColor: "border-gray-300"
        };
      } else if (ahora >= inicioCita && ahora <= finCita) {
        return { 
          estado: "En Proceso", 
          color: "text-gray-800", 
          icon: PlayCircle,
          borderColor: "border-gray-400"
        };
      } else {
        return { 
          estado: "Finalizada", 
          color: "text-gray-700", 
          icon: CheckCircle,
          borderColor: "border-gray-400"
        };
      }
    } catch (error) {
      return { 
        estado: "Pendiente", 
        color: "text-gray-700", 
        icon: Clock,
        borderColor: "border-gray-300"
      };
    }
  };

  const elementosCombinados = [
    ...appointments.map(cita => ({ 
      type: 'cita', 
      data: cita,
      horaInicio: cita.hora_inicio || "00:00",
      id: cita.cita_id 
    })),
    ...bloqueos.map(bloqueo => ({ 
      type: 'bloqueo', 
      data: bloqueo,
      horaInicio: bloqueo.hora_inicio || "00:00",
      id: bloqueo._id || `bloqueo-${bloqueo.hora_inicio}`
    }))
  ].sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));

  if (elementosCombinados.length === 0) {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 text-center">
          <div className="text-gray-300 mb-2">
            <svg className="w-10 h-10 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="font-medium text-gray-700 mb-1 text-sm">
            {fechaFiltro 
              ? `No hay citas ni bloqueos para esta fecha`
              : "No hay citas ni bloqueos programados"
            }
          </h3>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="space-y-3">
      {bloqueos.length > 0 && (
        <div className="flex items-center gap-1 rounded-xl bg-gray-100 px-3 py-2 text-xs text-gray-600">
          <Ban className="h-3 w-3" />
          <span className="ml-1">{bloqueos.length} bloqueo(s) configurado(s)</span>
        </div>
      )}

      {elementosCombinados.map((elemento) => {
        if (elemento.type === 'cita') {
          const appointment = elemento.data as Cita;
          const estadoInfo = getEstadoCita(appointment);
          const IconComponent = estadoInfo.icon;
          const nombreCliente = appointment.cliente?.nombre || "Cliente";
          const apellidoCliente = appointment.cliente?.apellido || "";
          
          // 🔥 CAMBIO CRÍTICO: Usar helper para obtener TODOS los servicios
          const nombresServicios = obtenerNombresServicios(appointment);
          const precioTotal = calcularPrecioTotal(appointment);
          
          // 🔥 Contar cantidad de servicios
          const cantidadServicios = appointment.servicios?.length || 1;

          return (
            <div
              key={appointment.cita_id}
              className={`cursor-pointer overflow-hidden rounded-2xl border bg-white p-4 transition-transform active:scale-[0.99] ${
                citaSeleccionada?.cita_id === appointment.cita_id
                  ? "border-gray-900"
                  : "border-gray-200"
              }`}
              onClick={() => onCitaSelect(appointment)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="mb-1 flex items-start justify-between gap-2">
                    {/* 🔥 MOSTRAR SERVICIOS CON BADGE SI HAY MÚLTIPLES */}
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <h3 className="line-clamp-2 text-sm font-semibold text-gray-900">
                        {nombresServicios}
                      </h3>
                      {cantidadServicios > 1 && (
                        <span className="shrink-0 rounded-full bg-blue-100 px-2 py-1 text-[10px] font-semibold text-blue-700">
                          {cantidadServicios}
                        </span>
                      )}
                    </div>
                    
                    {precioTotal > 0 && (
                      <div className="ml-2 flex shrink-0 items-center gap-1 text-xs font-medium text-gray-700">
                        <Tag className="h-3 w-3" />
                        <span>${precioTotal.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="mb-2 truncate text-xs font-medium text-gray-700">
                    {nombreCliente} {apellidoCliente}
                  </div>
                  
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Clock className="h-3 w-3" />
                      <span>{appointment.hora_inicio} - {appointment.hora_fin}</span>
                    </div>
                    
                    <div className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${estadoInfo.borderColor} ${estadoInfo.color}`}>
                      <IconComponent className="h-3 w-3" />
                      <span className="truncate max-w-[110px]">{estadoInfo.estado}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        } else {
          // BLOQUEO
          const bloqueo = elemento.data as Bloqueo;
          
          return (
            <div
              key={bloqueo._id}
              className="overflow-hidden rounded-2xl border border-gray-300 bg-white p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex items-start gap-2">
                  <Ban className="h-3.5 w-3.5 text-gray-500" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-800">
                        {bloqueo.hora_inicio} - {bloqueo.hora_fin}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 break-words text-xs text-gray-600">{bloqueo.motivo}</p>
                  </div>
                </div>
                
                <div className="ml-2 flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleEditBloqueo(bloqueo)}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-gray-300 text-gray-700 active:scale-[0.98]"
                    aria-label="Editar bloqueo"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEliminarBloqueo(bloqueo)}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-gray-300 text-gray-700 active:scale-[0.98]"
                    aria-label="Eliminar bloqueo"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              
              {eliminando && bloqueoAEliminar?._id === bloqueo._id && (
                <div className="mt-1 text-xs text-gray-600 flex items-center gap-1">
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-600"></div>
                  Eliminando...
                </div>
              )}
            </div>
          );
        }
      })}
    </div>

    <BottomSheet
      open={mostrarModalEdicion}
      onClose={handleCloseEditModal}
      title="Editar bloqueo"
    >
      {bloqueoEditando && (
        <BloqueosModal
          onClose={handleCloseEditModal}
          compact
          estilistaId={bloqueoEditando.profesional_id}
          fecha={bloqueoEditando.fecha?.split("T")[0]}
          horaInicio={bloqueoEditando.hora_inicio}
          editingBloqueo={bloqueoEditando}
          citasExistentes={citasValidacion}
          onBloqueoGuardado={(bloqueo, action) => {
            if (action === "update") {
              handleBloqueoGuardado(bloqueo);
            }
          }}
        />
      )}
    </BottomSheet>
    </>
  );
}
