import React, { useState, useCallback, useEffect } from "react";
import { createBloqueo } from "./bloqueosApi";
import { useAuth } from "../../components/Auth/AuthContext";
import { getSedes, type Sede } from "../Branch/sedesApi";
import { getEstilistas, type Estilista } from "../Professionales/estilistasApi";
import { formatSedeNombre } from "../../lib/sede";

interface BloqueosProps {
  onClose: () => void;
  estilistaId?: string;
  fecha?: string;
  horaInicio?: string;
}

const Bloqueos: React.FC<BloqueosProps> = ({ onClose, estilistaId, fecha, horaInicio }) => {
  const { user } = useAuth();
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [estilistas, setEstilistas] = useState<Estilista[]>([]);
  const [loadingSedes, setLoadingSedes] = useState(false);
  const [loadingEstilistas, setLoadingEstilistas] = useState(false);
  
  // Determinar si el usuario actual es un estilista
  const esEstilista = user?.role === 'estilista';
  
  const [formData, setFormData] = useState({
    profesional_id: estilistaId || "",
    sede_id: user?.sede_id || "",
    fecha: fecha || "",
    hora_inicio: horaInicio || "09:00",
    hora_fin: "10:00",
    motivo: "",
  });
  
  const [loading, setLoading] = useState(false);
  const [mensaje, setMensaje] = useState("");

  // Cargar sedes según el tipo de usuario y estilistaId
  const cargarSedes = useCallback(async () => {
    if (!user?.access_token) return;

    setLoadingSedes(true);
    try {
      const sedesData = await getSedes(user.access_token);
      
      let sedesFiltradas = sedesData;

      // CASO 1: Si el usuario es estilista
      if (esEstilista && user.sede_id) {
        // Estilista solo puede ver su propia sede
        const sedeUsuario = sedesData.find((s: Sede) => s.sede_id === user.sede_id);
        if (sedeUsuario) {
          sedesFiltradas = [sedeUsuario];
          setFormData(prev => ({ 
            ...prev, 
            sede_id: user.sede_id || prev.sede_id,
            // El estilista no puede seleccionar otro profesional, se establece cuando carguemos los estilistas
          }));
        } else {
          sedesFiltradas = [];
        }
      }
      // CASO 2: Si hay estilistaId pasado como prop
      else if (estilistaId) {
        try {
          const estilistasData = await getEstilistas(user.access_token);
          const estilista = estilistasData.find((e: Estilista) => e.profesional_id === estilistaId);
          
          if (estilista?.sede_id) {
            // Si encontramos el estilista y tiene sede, filtrar solo esa sede
            sedesFiltradas = sedesData.filter((s: Sede) => s.sede_id === estilista.sede_id);
            
            // Establecer automáticamente la sede del estilista
            setFormData(prev => ({ 
              ...prev, 
              sede_id: estilista.sede_id || prev.sede_id || user?.sede_id || "",
              profesional_id: estilistaId
            }));
          }
        } catch (err) {
          console.error("Error al buscar estilista:", err);
        }
      }
      // CASO 3: Si es admin sede, filtrar solo su sede
      else if (user.role === 'admin_sede' && user.sede_id) {
        const sedeUsuario = sedesData.find((s: Sede) => s.sede_id === user.sede_id);
        if (sedeUsuario) {
          sedesFiltradas = [sedeUsuario];
          setFormData(prev => ({ ...prev, sede_id: sedeUsuario.sede_id || "" }));
        } else {
          sedesFiltradas = [];
        }
      }
      // CASO 4: Super admin - mostrar todas las sedes (no filtrar)
      
      setSedes(sedesFiltradas);
    } catch (err) {
      console.error("Error cargando sedes:", err);
      setSedes([]);
    } finally {
      setLoadingSedes(false);
    }
  }, [user, estilistaId, esEstilista]);

  // Cargar estilistas según la sede seleccionada O según estilistaId
  const cargarEstilistas = useCallback(async () => {
    if (!user?.access_token) {
      setEstilistas([]);
      return;
    }

    setLoadingEstilistas(true);
    try {
      const estilistasData = await getEstilistas(user.access_token);
      
      if (!Array.isArray(estilistasData)) {
        setEstilistas([]);
        return;
      }

      let estilistasFiltrados = estilistasData;

      // IMPORTANTE: Cuando el usuario es estilista, necesitamos encontrar SU propio profesional_id
      if (esEstilista) {
        // Buscar el estilista por email para obtener su profesional_id
        const estilistaActual = estilistasData.find((e: Estilista) => 
          e.email === user.email
        );
        
        if (estilistaActual) {
          estilistasFiltrados = [estilistaActual];
          
          // Establecer automáticamente el estilista y sede
          setFormData(prev => ({ 
            ...prev, 
            profesional_id: estilistaActual.profesional_id || prev.profesional_id,
            sede_id: estilistaActual.sede_id || prev.sede_id || user?.sede_id || ""
          }));
        } else {
          // Si no encontramos al estilista por email, mostrar mensaje
          console.warn("No se encontró el perfil de estilista para el usuario:", user.email);
          setEstilistas([]);
          setMensaje("❌ No se encontró tu perfil de estilista. Contacta al administrador.");
        }
      }
      // Si hay un estilistaId específico, mostrarlo primero
      else if (estilistaId) {
        const estilistaEspecifico = estilistasData.find((e: Estilista) => 
          e.profesional_id === estilistaId
        );
        
        if (estilistaEspecifico) {
          // Filtrar solo estilistas de la misma sede que el estilista específico
          estilistasFiltrados = estilistasData.filter((est: Estilista) => 
            est.sede_id === estilistaEspecifico.sede_id
          );
          
          // Establecer automáticamente el estilista
          setFormData(prev => ({ 
            ...prev, 
            profesional_id: estilistaId,
            sede_id: estilistaEspecifico.sede_id || prev.sede_id || user?.sede_id || ""
          }));
        }
      }
      // Si es admin sede, filtrar solo estilistas de su sede
      else if (user.role === 'admin_sede' && user.sede_id) {
        estilistasFiltrados = estilistasData.filter((est: Estilista) => 
          est.sede_id === user.sede_id
        );
      }
      // Si se ha seleccionado una sede específica, filtrar por esa sede
      else if (formData.sede_id) {
        estilistasFiltrados = estilistasData.filter((est: Estilista) => 
          est.sede_id === formData.sede_id
        );
      }

      setEstilistas(estilistasFiltrados);

    } catch (err) {
      console.error("Error cargando estilistas:", err);
      setEstilistas([]);
    } finally {
      setLoadingEstilistas(false);
    }
  }, [user, formData.sede_id, estilistaId, esEstilista]);

  // Cargar sedes al montar el componente
  useEffect(() => {
    cargarSedes();
  }, [cargarSedes]);

  // Cargar estilistas cuando cambia la sede seleccionada
  useEffect(() => {
    if (formData.sede_id || estilistaId || esEstilista) {
      cargarEstilistas();
    } else {
      setEstilistas([]);
    }
  }, [formData.sede_id, cargarEstilistas, estilistaId, esEstilista]);

  const handleInputChange = useCallback((field: string, value: any) => {
    // Si hay estilistaId o el usuario es estilista, no permitir cambiar sede ni profesional
    if ((estilistaId || esEstilista) && (field === 'sede_id' || field === 'profesional_id')) {
      setMensaje("❌ No puedes cambiar la sede o estilista en este modo");
      return;
    }
    
    setFormData(prev => {
      const newData = { ...prev, [field]: value };
      
      // Si cambia la sede, limpiar el estilista seleccionado (solo si no es estilista ni hay estilistaId)
      if (field === 'sede_id' && !estilistaId && !esEstilista) {
        newData.profesional_id = "";
      }
      
      return newData;
    });
  }, [estilistaId, esEstilista]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.access_token) {
      setMensaje("❌ No hay token de autenticación");
      return;
    }

    // Validaciones básicas
    if (!formData.profesional_id.trim()) {
      setMensaje("❌ Debes seleccionar un estilista");
      return;
    }
    if (!formData.sede_id.trim()) {
      setMensaje("❌ La sede es requerida");
      return;
    }
    if (!formData.fecha.trim()) {
      setMensaje("❌ La fecha es requerida");
      return;
    }

    // Validar que hora_fin sea mayor que hora_inicio
    if (formData.hora_fin <= formData.hora_inicio) {
      setMensaje("❌ La hora de fin debe ser mayor a la hora de inicio");
      return;
    }

    try {
      setLoading(true);
      setMensaje("");
      
      const dataToSend = {
        profesional_id: formData.profesional_id.trim(),
        sede_id: formData.sede_id.trim(),
        fecha: formData.fecha,
        hora_inicio: formData.hora_inicio,
        hora_fin: formData.hora_fin,
        motivo: formData.motivo.trim() || "Bloqueo de agenda",
      };

      console.log("📤 Enviando bloqueo:", dataToSend);
      
      await createBloqueo(dataToSend, user.access_token);
      setMensaje("✅ Bloqueo creado exitosamente");

      // Cerrar después de éxito
      setTimeout(onClose, 1000);
    } catch (err: any) {
      console.error("Error al crear bloqueo:", err);
      setMensaje(`❌ ${err.message || "Error al guardar el bloqueo"}`);
    } finally {
      setLoading(false);
    }
  }, [formData, user, onClose]);

  // Calcular hora mínima para fin
  const minHoraFin = formData.hora_inicio;

  // Obtener el nombre de la sede actual para mostrar
  const nombreSedeActual = formatSedeNombre(
    sedes.find(s => s.sede_id === formData.sede_id)?.nombre,
    ""
  );

  // Obtener el nombre del estilista actual para mostrar
  const nombreEstilistaActual = estilistas.find(e => e.profesional_id === formData.profesional_id)?.nombre || "";

  // Determinar qué rol mostrar
  const getRolDisplay = () => {
    switch(user?.role) {
      case 'super_admin': return 'Super Admin';
      case 'admin_sede': return 'Admin Sede';
      case 'estilista': return 'Estilista';
      default: return user?.role || 'Usuario';
    }
  };

  return (
    <div className="">
      <h2 className="text-2xl font-bold mb-4 text-gray-900">Bloqueo de horario</h2>

      {/* Información del usuario */}
      <div className="mb-4 p-3 bg-gray-100 rounded-lg border border-gray-300">
        <p className="text-sm text-gray-800">
          <span className="font-semibold">Usuario:</span> {user?.email}
        </p>
        <p className="text-sm text-gray-800">
          <span className="font-semibold">Rol:</span> {getRolDisplay()}
        </p>
        
        {(estilistaId || esEstilista) && (
          <div className="mt-2 pt-2 border-t border-gray-300">
            <p className="text-xs text-gray-700">
              <span className="font-semibold">⚠️ Modo especial:</span> 
              {estilistaId ? " Creando bloqueo para estilista específico" : 
               esEstilista ? " Creando bloqueo para tu propio horario" : ""}
            </p>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Motivo */}
        <div>
          <label className="block text-sm font-medium text-gray-800 mb-1">
            Motivo del bloqueo
          </label>
          <input
            type="text"
            value={formData.motivo}
            onChange={(e) => handleInputChange('motivo', e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500 transition-colors"
            placeholder="Ej: Capacitación, Reunión, Descanso, Vacaciones"
            required
          />
        </div>

        {/* Sede - Solo editable para Super Admin Y cuando no hay restricciones */}
        <div>
          <label className="block text-sm font-medium text-gray-800 mb-1">
            Sede
          </label>
          {user?.role === 'admin_sede' || estilistaId || esEstilista ? (
            // Para Admin Sede, estilistaId o usuario estilista: solo mostrar (no editable)
            <div className="w-full p-3 border border-gray-300 rounded-lg bg-gray-50">
              <div className="flex items-center justify-between">
                <span className="text-gray-900 font-medium">
                  {nombreSedeActual || "Cargando sede..."}
                </span>
                <span className="text-xs text-gray-600">
                  {esEstilista ? "(Tu sede)" : 
                   estilistaId ? "(Sede del estilista)" : "(Tu sede)"}
                </span>
              </div>
              <input
                type="hidden"
                value={formData.sede_id}
                readOnly
              />
            </div>
          ) : (
            // Para Super Admin: selector editable solo si no hay restricciones
            <select
              value={formData.sede_id}
              onChange={(e) => handleInputChange('sede_id', e.target.value)}
              required
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500 transition-colors"
              disabled={loadingSedes || !!estilistaId || esEstilista}
              >
                <option value="">{loadingSedes ? "Cargando sedes..." : "Seleccionar sede"}</option>
                {sedes.map(sede => (
                  <option key={sede._id || sede.sede_id} value={sede.sede_id}>
                    {formatSedeNombre(sede.nombre)}
                  </option>
                ))}
              </select>
          )}
        </div>

        {/* Estilista - Si hay estilistaId o es estilista, mostrar como read-only */}
        <div>
          <label className="block text-sm font-medium text-gray-800 mb-1">
            Estilista
          </label>
          {estilistaId || esEstilista ? (
            // Mostrar como read-only si se pasó estilistaId o el usuario es estilista
            <div className="w-full p-3 border border-gray-300 rounded-lg bg-gray-50">
              <div className="flex items-center justify-between">
                <span className="text-gray-900 font-medium">
                  {nombreEstilistaActual || "Cargando estilista..."}
                </span>
                <span className="text-xs text-gray-600">
                  {esEstilista ? "(Tú)" : "(Pre-seleccionado)"}
                </span>
              </div>
              <input
                type="hidden"
                value={formData.profesional_id}
                readOnly
              />
            </div>
          ) : (
            // Selector normal si no hay restricciones
            <select
              value={formData.profesional_id}
              onChange={(e) => handleInputChange('profesional_id', e.target.value)}
              required
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500 transition-colors"
              disabled={!formData.sede_id || loadingEstilistas}
            >
              <option value="">
                {loadingEstilistas ? "Cargando estilistas..." : 
                 !formData.sede_id ? "Primero selecciona una sede" : 
                 "Seleccionar estilista"}
              </option>
              {estilistas.map(estilista => (
                <option key={estilista.profesional_id} value={estilista.profesional_id}>
                  {estilista.nombre}
                </option>
              ))}
            </select>
          )}
          {estilistas.length === 0 && formData.sede_id && !loadingEstilistas && !estilistaId && !esEstilista && (
            <p className="mt-1 text-sm text-gray-800">
              No hay estilistas disponibles en esta sede
            </p>
          )}
        </div>

        {/* Fecha */}
        <div>
          <label className="block text-sm font-medium text-gray-800 mb-1">
            Fecha
          </label>
          <input
            type="date"
            value={formData.fecha}
            onChange={(e) => handleInputChange('fecha', e.target.value)}
            required
            min={new Date().toISOString().split('T')[0]}
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500 transition-colors"
          />
        </div>

        {/* Horas */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">
              Hora inicio
            </label>
            <input
              type="time"
              value={formData.hora_inicio}
              onChange={(e) => handleInputChange('hora_inicio', e.target.value)}
              required
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">
              Hora fin
            </label>
            <input
              type="time"
              value={formData.hora_fin}
              onChange={(e) => handleInputChange('hora_fin', e.target.value)}
              required
              min={minHoraFin}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500 transition-colors"
            />
          </div>
        </div>

        {/* Mensaje */}
        {mensaje && (
          <div className={`p-3 rounded-lg text-center text-sm font-medium border ${
            mensaje.includes("✅") ? "bg-gray-100 text-gray-900 border-gray-300" : "bg-gray-100 text-gray-900 border-gray-300"
          }`}>
            {mensaje}
          </div>
        )}

        {/* Botones */}
        <div className="flex justify-end space-x-3 mt-6 pt-4 border-t border-gray-300">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 rounded-lg border border-gray-300 text-gray-800 font-medium hover:bg-gray-100 transition-colors"
            disabled={loading}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading || loadingSedes || loadingEstilistas}
            className="px-6 py-2.5 rounded-lg bg-black text-white font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Creando bloqueo..." : "Crear bloqueo"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default React.memo(Bloqueos);
