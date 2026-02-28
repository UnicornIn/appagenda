// src/components/EstilistaDashboard.tsx - VERSIÓN ACTUALIZADA
"use client";

import { useState, useEffect } from "react";
import { useEstilistaData } from './useEstilistaData';
import { AppointmentsList } from './appointments-list';
import { StylistStats } from './stylist-stats';
import { AttentionProtocol } from './attention-protocol';
import { Sidebar } from '../../../components/Layout/Sidebar';
import { getBloqueosProfesional, Bloqueo } from '../../../components/Quotes/bloqueosApi';
import { formatDateDMY } from "../../../lib/dateFormat";

// ⭐ HELPER: Calcular precio total de una cita con múltiples servicios
const calcularPrecioTotalCita = (cita: any): number => {
  // Si tiene array de servicios (nuevo formato)
  if (cita.servicios && Array.isArray(cita.servicios) && cita.servicios.length > 0) {
    return cita.servicios.reduce((total: number, servicio: any) => {
      return total + (servicio.precio || 0);
    }, 0);
  }
  
  // Si tiene servicio único (formato antiguo - compatibilidad)
  if (cita.servicio?.precio) {
    return cita.servicio.precio;
  }
  
  // Si tiene precio_total directo
  if (cita.precio_total) {
    return cita.precio_total;
  }
  
  return 0;
};

// ⭐ HELPER: Obtener nombres de servicios concatenados
const obtenerNombresServicios = (cita: any): string => {
  if (cita.servicios && Array.isArray(cita.servicios) && cita.servicios.length > 0) {
    return cita.servicios.map((s: any) => s.nombre).join(', ');
  }
  
  if (cita.servicio?.nombre) {
    return cita.servicio.nombre;
  }
  
  return 'Sin servicio';
};

export default function VistaEstilistaPage() {
  const { 
    citas, 
    loading, 
    error 
  } = useEstilistaData();

  const [citaSeleccionada, setCitaSeleccionada] = useState<any>(null);
  const [fechaFiltro, setFechaFiltro] = useState<string>("");
  const [bloqueos, setBloqueos] = useState<Bloqueo[]>([]);
  const [profesionalId, setProfesionalId] = useState<string>("");
  const [refrescarBloqueos, setRefrescarBloqueos] = useState(0);

  // Función para obtener token de autenticación
  const getAuthToken = () => {
    return localStorage.getItem('access_token') || 
           sessionStorage.getItem('access_token') || 
           '';
  };

  useEffect(() => {
    // 🔥 AUTO-SELECCIONAR FECHA DE LA PRIMERA CITA (solo para desarrollo)
    if (citas.length > 0 && !fechaFiltro) {
      const primeraFecha = citas[0].fecha.split('T')[0];
      setFechaFiltro(primeraFecha);
    }
  }, [citas]);

  // Obtener ID del profesional desde las citas
  useEffect(() => {
    const obtenerProfesionalIdDeCitas = () => {
      if (citas && citas.length > 0) {
        const primeraCitaConId = citas.find(cita => cita.profesional_id);
        if (primeraCitaConId?.profesional_id) {
          return primeraCitaConId.profesional_id;
        }
      }
      
      try {
        const userDataLS = localStorage.getItem('user');
        const userDataSS = sessionStorage.getItem('user');
        
        if (userDataLS || userDataSS) {
          const user = JSON.parse(userDataLS || userDataSS || '{}');
          if (user.profesional_id) {
            return user.profesional_id;
          }
        }
        
        const profesionalIdLS = localStorage.getItem('beaux-profesional_id');
        const profesionalIdSS = sessionStorage.getItem('beaux-profesional_id');
        
        if (profesionalIdLS || profesionalIdSS) {
          return profesionalIdLS || profesionalIdSS || "";
        }
        
        console.warn("⚠️ No se encontró profesional_id");
        return "";
      } catch (error) {
        console.error('Error obteniendo profesional_id:', error);
        return "";
      }
    };
    
    const id = obtenerProfesionalIdDeCitas();
    setProfesionalId(id);
  }, [citas]);

  // Cargar bloqueos
  useEffect(() => {
    const cargarBloqueos = async () => {
      if (!profesionalId) return;
      
      try {
        const token = getAuthToken();
        if (!token) {
          setBloqueos([]);
          return;
        }

        const bloqueosData = await getBloqueosProfesional(profesionalId, token);
        
        if (Array.isArray(bloqueosData)) {
          setBloqueos(bloqueosData);
        } else {
          setBloqueos([]);
        }
      } catch (error) {
        console.error('❌ Error cargando bloqueos:', error);
        setBloqueos([]);
      }
    };
    
    if (profesionalId && profesionalId.trim() !== "") {
      cargarBloqueos();
    }
  }, [profesionalId, refrescarBloqueos]);

  // Función para normalizar estados
  const estaCompletada = (cita: any): boolean => {
    if (!cita.estado) return false;
    
    const estado = cita.estado.toLowerCase().trim();
    
    const estadosCompletados = [
      'completado', 'completada', 'finalizado', 'finalizada',
      'terminado', 'terminada', 'realizado', 'realizada',
      'concluido', 'concluida'
    ];
    
    return estadosCompletados.some(estadoCompletado => 
      estado.includes(estadoCompletado)
    );
  };

  // Filtrar citas por fecha
  const citasFiltradas = fechaFiltro 
    ? citas.filter(cita => {
        if (!cita.fecha) return false;
        const fechaCita = cita.fecha.split('T')[0];
        return fechaCita === fechaFiltro;
      })
    : citas.filter(cita => {
        if (!cita.fecha) return false;
        const hoy = new Date().toISOString().split('T')[0];
        const fechaCita = cita.fecha.split('T')[0];
        return fechaCita === hoy;
      });

  // Filtrar bloqueos por fecha
  const bloqueosFiltrados = fechaFiltro 
    ? bloqueos.filter(bloqueo => {
        if (!bloqueo.fecha) return false;
        const fechaBloqueo = bloqueo.fecha.split('T')[0];
        return fechaBloqueo === fechaFiltro;
      })
    : bloqueos;

  // ⭐ CALCULAR ESTADÍSTICAS CON NUEVA LÓGICA
  const citasFiltradasCount = citasFiltradas.length;
  const serviciosCompletadosFiltrados = citasFiltradas.filter(cita => 
    estaCompletada(cita)
  ).length;
  
  // ⭐ NUEVO: Calcular ventas usando helper que suma múltiples servicios
  const totalVentasFiltradas = citasFiltradas
    .filter(cita => estaCompletada(cita))
    .reduce((total, cita) => {
      return total + calcularPrecioTotalCita(cita);
    }, 0);

  // Manejar selección de fecha
  const handleFechaSeleccionada = (fecha: string) => {
    if (fecha) {
      setFechaFiltro(fecha);
      setCitaSeleccionada(null);
    }
  };

  // Limpiar filtro
  const limpiarFiltro = () => {
    setFechaFiltro("");
    setCitaSeleccionada(null);
  };

  // Función para refrescar bloqueos
  const refrescarListaBloqueos = () => {
    setRefrescarBloqueos(prev => prev + 1);
  };

  if (loading) return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-800 mx-auto"></div>
          <p className="mt-3 text-sm text-gray-600">Cargando citas...</p>
        </div>
      </div>
    </div>
  );
  
  if (error) return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="text-gray-800 text-base mb-2 font-medium">Error</div>
          <p className="text-gray-600 text-sm">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-gray-800 text-white text-sm rounded hover:bg-gray-900 transition-colors"
          >
            Reintentar
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      
      {/* CONTENIDO PRINCIPAL */}
      <div className="flex-1 p-4 md:p-5 lg:p-6">
        
        {/* VERSIÓN MOBILE */}
        <div className="block lg:hidden">
          <div className="mb-4">
            <h1 className="text-lg font-bold text-gray-900">Dashboard</h1>
          </div>
          
          {/* Stats Cards Compactas */}
          <div className="mb-5 grid grid-cols-4 gap-2">
            <div className="rounded border bg-white p-2.5">
              <p className="mb-1 text-xs text-gray-500">Citas</p>
              <p className="text-base font-bold text-gray-800">{citasFiltradasCount}</p>
            </div>
            <div className="rounded border bg-white p-2.5">
              <p className="mb-1 text-xs text-gray-500">Completadas</p>
              <p className="text-base font-bold text-gray-800">{serviciosCompletadosFiltrados}</p>
            </div>
            <div className="rounded border bg-white p-2.5">
              <p className="mb-1 text-xs text-gray-500">Ventas</p>
              <p className="text-base font-bold text-gray-800">${totalVentasFiltradas.toLocaleString()}</p>
            </div>
            <div className="rounded border bg-white p-2.5">
              <p className="mb-1 text-xs text-gray-500">Bloqueos</p>
              <p className="text-base font-bold text-gray-800">{bloqueosFiltrados.length}</p>
            </div>
          </div>

          {/* Resto del código mobile igual... */}
          <div className="mb-4 bg-white border rounded p-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-gray-900">
                  {fechaFiltro 
                    ? `Citas del ${formatDateDMY(fechaFiltro)}`
                    : "Citas de hoy"
                  }
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {citasFiltradasCount} citas • {bloqueosFiltrados.length} bloqueos
                </p>
              </div>
              {fechaFiltro && (
                <button 
                  onClick={limpiarFiltro}
                  className="text-xs text-gray-600 hover:text-gray-900 px-2 py-1 border border-gray-300 rounded hover:border-gray-400 transition-colors"
                >
                  Hoy
                </button>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="bg-white border rounded p-3">
              <h3 className="font-medium text-sm mb-2 text-gray-900">Citas y Bloqueos</h3>
              <AppointmentsList 
                appointments={citasFiltradas} 
                bloqueos={bloqueosFiltrados}
                onCitaSelect={setCitaSeleccionada}
                citaSeleccionada={citaSeleccionada}
                fechaFiltro={fechaFiltro}
                onBloqueoEliminado={refrescarListaBloqueos}
              />
            </div>

            <div className="bg-white border rounded p-3">
              <h3 className="font-medium text-sm mb-1.5 text-gray-900">Seleccionar fecha</h3>
              <p className="text-xs text-gray-500 mb-2">Elige un día para ver citas</p>
              <div className="p-2.5 bg-gray-50 rounded border">
                <AttentionProtocol 
                  citaSeleccionada={citaSeleccionada}
                  onFechaSeleccionada={handleFechaSeleccionada}
                />
              </div>
            </div>

            <div className="bg-white border rounded p-3">
              <h3 className="font-medium text-sm mb-2 text-gray-900">Resumen de Ventas</h3>
              <StylistStats 
                citasHoy={citasFiltradasCount}
                serviciosCompletadosHoy={serviciosCompletadosFiltrados}
                totalVentasHoy={totalVentasFiltradas}
                bloqueosHoy={bloqueosFiltrados.length}
              />
            </div>
          </div>
        </div>

        {/* VERSIÓN DESKTOP - Igual que mobile pero con layout diferente */}
        <div className="hidden lg:block">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-sm text-gray-600 mt-1">
              {fechaFiltro 
                ? `Citas del ${formatDateDMY(fechaFiltro)}` 
                : "Citas de hoy"
              }
            </p>
          </div>

          <div className="mb-6 grid grid-cols-5 gap-4">
            <div className="rounded border bg-white p-4">
              <h3 className="text-sm font-medium mb-1.5 text-gray-900">
                {fechaFiltro ? `Citas del día` : "Citas de hoy"}
              </h3>
              {fechaFiltro && (
                <button 
                  onClick={limpiarFiltro}
                  className="text-xs text-gray-600 hover:text-gray-900 hover:underline"
                >
                  ← Ver citas de hoy
                </button>
              )}
            </div>
            <div className="rounded border bg-white p-4">
              <p className="mb-1 text-xs text-gray-500">Citas</p>
              <p className="text-2xl font-bold text-gray-800">{citasFiltradasCount}</p>
            </div>
            <div className="rounded border bg-white p-4">
              <p className="mb-1 text-xs text-gray-500">Completadas</p>
              <p className="text-2xl font-bold text-gray-800">{serviciosCompletadosFiltrados}</p>
            </div>
            <div className="rounded border bg-white p-4">
              <p className="mb-1 text-xs text-gray-500">Ventas</p>
              <p className="text-2xl font-bold text-gray-800">${totalVentasFiltradas.toLocaleString()}</p>
            </div>
            <div className="rounded border bg-white p-4">
              <p className="mb-1 text-xs text-gray-500">Bloqueos</p>
              <p className="text-2xl font-bold text-gray-800">{bloqueosFiltrados.length}</p>
            </div>
          </div>

          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-3">
              <div className="rounded border bg-white p-3">
                <h3 className="font-medium text-sm mb-3 text-gray-900">Citas y Bloqueos</h3>
                <AppointmentsList 
                  appointments={citasFiltradas} 
                  bloqueos={bloqueosFiltrados}
                  onCitaSelect={setCitaSeleccionada}
                  citaSeleccionada={citaSeleccionada}
                  fechaFiltro={fechaFiltro}
                  onBloqueoEliminado={refrescarListaBloqueos}
                />
              </div>
            </div>

            <div className="col-span-6">
              <div className="rounded border bg-white p-3">
                <AttentionProtocol 
                  citaSeleccionada={citaSeleccionada}
                  onFechaSeleccionada={handleFechaSeleccionada}
                />
              </div>
            </div>

            <div className="col-span-3">
              <div className="rounded border bg-white p-3">
                <h3 className="font-medium text-sm mb-3 text-gray-900">Ventas</h3>
                <StylistStats 
                  citasHoy={citasFiltradasCount}
                  serviciosCompletadosHoy={serviciosCompletadosFiltrados}
                  totalVentasHoy={totalVentasFiltradas}
                  bloqueosHoy={bloqueosFiltrados.length}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ⭐ EXPORTAR HELPERS PARA USAR EN OTROS COMPONENTES
export { calcularPrecioTotalCita, obtenerNombresServicios };
