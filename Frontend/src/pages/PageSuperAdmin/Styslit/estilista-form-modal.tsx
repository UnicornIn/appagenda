"use client"

import { useState, useEffect } from "react"
import { X, Loader, ChevronDown, ChevronUp, Clock } from 'lucide-react'
import type { Estilista } from "../../../types/estilista"
import { sedeService, type Sede } from "../Sedes/sedeService"
import { serviciosService } from "../Services/serviciosService"
import { estilistaService } from "./estilistaService"
import { useAuth } from "../../../components/Auth/AuthContext"
import { formatSedeNombre } from "../../../lib/sede"

// Definir el tipo Servicio
interface Servicio {
  id: string;
  servicio_id: string;
  nombre: string;
  duracion: number;
  precio: number;
  categoria: string;
  activo: boolean;
  descripcion?: string;
  comision_porcentaje?: number;
  imagen?: string;
  requiere_producto?: boolean;
}

// Tipo para disponibilidad de horario
interface Disponibilidad {
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
  activo: boolean;
}

// Tipo para datos del horario
interface HorarioData {
  profesional_id: string;
  sede_id: string;
  disponibilidad: Disponibilidad[];
}

// Tipo extendido para el modal
interface EstilistaFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (estilista: Partial<Estilista> & { password?: string; horario?: HorarioData }) => void
  estilista: Estilista | null
  isSaving?: boolean
}

// Días de la semana
const DIAS_SEMANA = [
  { id: 1, nombre: "Lunes" },
  { id: 2, nombre: "Martes" },
  { id: 3, nombre: "Miércoles" },
  { id: 4, nombre: "Jueves" },
  { id: 5, nombre: "Viernes" },
  { id: 6, nombre: "Sábado" },
  { id: 7, nombre: "Domingo" }
]

// Horarios predefinidos
const HORARIOS_PREDEFINIDOS = [
  { label: "Turno Mañana (8:00 - 12:00)", inicio: "08:00", fin: "12:00" },
  { label: "Turno Tarde (13:00 - 17:00)", inicio: "13:00", fin: "17:00" },
  { label: "Turno Completo (8:00 - 17:00)", inicio: "08:00", fin: "17:00" },
  { label: "Medio Turno (8:00 - 14:00)", inicio: "08:00", fin: "14:00" },
  { label: "Horario Extendido (7:00 - 19:00)", inicio: "07:00", fin: "19:00" }
]

export function EstilistaFormModal({ isOpen, onClose, onSave, estilista, isSaving = false }: EstilistaFormModalProps) {
  const [formData, setFormData] = useState({
    nombre: "",
    email: "",
    sede_id: "",
    comision: "",
    especialidades: [] as string[],
    password: "",
    activo: true
  })

  // Estado para el horario
  const [horario, setHorario] = useState<HorarioData>({
    profesional_id: "",
    sede_id: "",
    disponibilidad: DIAS_SEMANA.map(dia => ({
      dia_semana: dia.id,
      hora_inicio: "08:00",
      hora_fin: "17:00",
      activo: true
    }))
  })

  const [sedes, setSedes] = useState<Sede[]>([])
  const [servicios, setServicios] = useState<Servicio[]>([])
  const [isLoadingSedes, setIsLoadingSedes] = useState(false)
  const [isLoadingServicios, setIsLoadingServicios] = useState(false)
  const [isSedeDropdownOpen, setIsSedeDropdownOpen] = useState(false)
  const [isServiciosDropdownOpen, setIsServiciosDropdownOpen] = useState(false)
  const [showHorarioConfig, setShowHorarioConfig] = useState(false)
  const [horarioPredefinido, setHorarioPredefinido] = useState<string>("")
  const [horarioId, setHorarioId] = useState<string>("") // Para guardar el ID del horario cuando se edita
  const [isLoadingHorario, setIsLoadingHorario] = useState(false)
  const { user } = useAuth()

  // Cargar sedes y servicios disponibles
  useEffect(() => {
    const loadData = async () => {
      if (!user?.access_token) return

      try {
        setIsLoadingSedes(true)
        setIsLoadingServicios(true)

        const [sedesData, serviciosData] = await Promise.all([
          sedeService.getSedes(user.access_token),
          serviciosService.getServicios(user.access_token)
        ])

        console.log('📥 Servicios cargados:', serviciosData)
        setSedes(sedesData)
        
        const serviciosTransformados: Servicio[] = serviciosData.map(servicio => {
          const servicioId = servicio.servicio_id || servicio.id;
          if (!servicioId) {
            console.warn('⚠️ Servicio sin ID válido:', servicio);
            return null;
          }
          
          return {
            id: servicioId,
            servicio_id: servicioId,
            nombre: servicio.nombre,
            duracion: servicio.duracion,
            precio: servicio.precio,
            categoria: servicio.categoria || 'General',
            activo: servicio.activo,
            descripcion: servicio.descripcion,
            comision_porcentaje: servicio.comision_porcentaje,
            imagen: servicio.imagen,
            requiere_producto: servicio.requiere_producto
          }
        }).filter(Boolean) as Servicio[];
        
        console.log('🔍 === SERVICIOS CARGADOS ===');
        serviciosTransformados.forEach((servicio, index) => {
          console.log(`Servicio ${index + 1}:`, {
            id: servicio.id,
            servicio_id: servicio.servicio_id,
            nombre: servicio.nombre,
            tieneServicioId: !!servicio.servicio_id,
            tieneId: !!servicio.id
          });
        });
        
        setServicios(serviciosTransformados)
      } catch (error) {
        console.error('Error cargando datos:', error)
      } finally {
        setIsLoadingSedes(false)
        setIsLoadingServicios(false)
      }
    }

    if (isOpen) {
      loadData()
    }
  }, [isOpen, user?.access_token])

  // Cargar datos del estilista y su horario cuando se edita
  useEffect(() => {
    const loadEstilistaData = async () => {
      if (estilista && user?.access_token) {
        console.log('📝 Cargando datos del estilista para editar:', estilista)
        
        // Cargar datos básicos del estilista
        setFormData({
          nombre: estilista.nombre || "",
          email: estilista.email || "",
          sede_id: estilista.sede_id || "",
          comision: estilista.comision !== null && estilista.comision !== undefined ? estilista.comision.toString() : "",
          especialidades: estilista.especialidades || [],
          password: "",
          activo: estilista.activo !== undefined ? estilista.activo : true
        })

        // Cargar horario del estilista
        setIsLoadingHorario(true)
        try {
          const horarioExistente = await estilistaService.getHorarioByProfesional(
            user.access_token, 
            estilista.profesional_id
          )
          
          if (horarioExistente) {
            console.log('📅 Horario existente encontrado:', horarioExistente)
            setHorarioId(horarioExistente._id)
            setHorario({
              profesional_id: estilista.profesional_id,
              sede_id: estilista.sede_id,
              disponibilidad: horarioExistente.disponibilidad || DIAS_SEMANA.map(dia => ({
                dia_semana: dia.id,
                hora_inicio: "08:00",
                hora_fin: "17:00",
                activo: true
              }))
            })
            setShowHorarioConfig(true)
          } else {
            console.log('ℹ️ No se encontró horario para este estilista')
            // Inicializar horario vacío
            setHorario({
              profesional_id: estilista.profesional_id,
              sede_id: estilista.sede_id,
              disponibilidad: DIAS_SEMANA.map(dia => ({
                dia_semana: dia.id,
                hora_inicio: "08:00",
                hora_fin: "17:00",
                activo: true
              }))
            })
          }
        } catch (error) {
          console.error('❌ Error cargando horario:', error)
        } finally {
          setIsLoadingHorario(false)
        }
      } else if (!estilista) {
        // Nuevo estilista
        setFormData({
          nombre: "",
          email: "",
          sede_id: "",
          comision: "",
          especialidades: [],
          password: "",
          activo: true
        })
        setHorario({
          profesional_id: "",
          sede_id: "",
          disponibilidad: DIAS_SEMANA.map(dia => ({
            dia_semana: dia.id,
            hora_inicio: "08:00",
            hora_fin: "17:00",
            activo: true
          }))
        })
        setHorarioId("")
        setShowHorarioConfig(true)
      }
    }

    if (isOpen) {
      loadEstilistaData()
    }
  }, [estilista, isOpen, user?.access_token])

  // Actualizar sede_id en horario cuando se selecciona una sede
  useEffect(() => {
    if (formData.sede_id) {
      setHorario(prev => ({
        ...prev,
        sede_id: formData.sede_id
      }))
    }
  }, [formData.sede_id])

  // Aplicar horario predefinido
  const aplicarHorarioPredefinido = (horarioSeleccionado: string) => {
    if (!horarioSeleccionado) return
    
    const horarioEncontrado = HORARIOS_PREDEFINIDOS.find(h => h.label === horarioSeleccionado)
    if (horarioEncontrado) {
      const nuevaDisponibilidad = horario.disponibilidad.map(dia => ({
        ...dia,
        hora_inicio: horarioEncontrado.inicio,
        hora_fin: horarioEncontrado.fin
      }))
      
      setHorario(prev => ({
        ...prev,
        disponibilidad: nuevaDisponibilidad
      }))
    }
  }

  // Actualizar horario de un día específico
  const actualizarHorarioDia = (diaSemana: number, campo: 'hora_inicio' | 'hora_fin' | 'activo', valor: string | boolean) => {
    const nuevaDisponibilidad = horario.disponibilidad.map(dia => 
      dia.dia_semana === diaSemana ? { ...dia, [campo]: valor } : dia
    )
    
    setHorario(prev => ({
      ...prev,
      disponibilidad: nuevaDisponibilidad
    }))
  }

  // Cerrar dropdowns cuando se hace clic fuera
  useEffect(() => {
    const handleClickOutside = () => {
      setIsSedeDropdownOpen(false)
      setIsServiciosDropdownOpen(false)
    }

    if (isOpen) {
      document.addEventListener('click', handleClickOutside)
    }

    return () => {
      document.removeEventListener('click', handleClickOutside)
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    const especialidadesValidas = (formData.especialidades || [])
      .filter(esp => {
        const isValid = esp !== null && esp !== undefined && esp !== "" && typeof esp === 'string';
        if (!isValid) {
          console.warn('⚠️ Especialidad inválida filtrada:', esp);
        }
        return isValid;
      })
      .map(esp => String(esp).trim());

    console.log('🎯 Especialidades válidas a guardar:', especialidadesValidas);

    const saveData: Partial<Estilista> & { 
      password?: string; 
      horario?: HorarioData;
      horarioId?: string; // Incluir ID del horario para actualización
    } = {
      nombre: formData.nombre.trim(),
      email: formData.email.trim(),
      sede_id: formData.sede_id,
      especialidades: especialidadesValidas,
      activo: formData.activo
    }

    // Manejo de comisión
    if (formData.comision.trim() !== "") {
      const comisionNum = Number(formData.comision);
      if (!isNaN(comisionNum) && comisionNum > 0) {
        saveData.comision = comisionNum;
      } else {
        saveData.comision = null;
      }
    } else {
      saveData.comision = null;
    }

    console.log('🔍 === DATOS PARA GUARDAR ===');
    console.log('📤 saveData:', saveData);

    // Solo incluir password si es un nuevo estilista y tiene valor
    if (!estilista && formData.password.trim()) {
      saveData.password = formData.password;
    }

    // Incluir datos del horario si está configurado
    if (showHorarioConfig && formData.sede_id) {
      const horarioCompleto = {
        ...horario,
        profesional_id: estilista ? estilista.profesional_id : "", // Se completará después para nuevos
        sede_id: formData.sede_id
      };
      
      saveData.horario = horarioCompleto;
      
      // Si estamos editando y ya existe un horario, incluir el ID
      if (estilista && horarioId) {
        saveData.horarioId = horarioId;
      }
    }

    // Validaciones
    if (!saveData.sede_id) {
      alert('Por favor selecciona una sede');
      return;
    }

    if (!saveData.nombre?.trim()) {
      alert('Por favor ingresa un nombre');
      return;
    }

    if (!saveData.email?.trim()) {
      alert('Por favor ingresa un email');
      return;
    }

    if (!estilista && !saveData.password) {
      alert('Por favor ingresa una contraseña');
      return;
    }

    // Validar horarios si está activo
    if (showHorarioConfig) {
      const horariosInvalidos = horario.disponibilidad.filter(dia => 
        dia.activo && (dia.hora_inicio >= dia.hora_fin)
      );
      
      if (horariosInvalidos.length > 0) {
        const diaInvalidos = horariosInvalidos.map(dia => {
          const diaInfo = DIAS_SEMANA.find(d => d.id === dia.dia_semana);
          return diaInfo?.nombre || `Día ${dia.dia_semana}`;
        }).join(', ');
        
        alert(`Los siguientes días tienen horarios inválidos (hora inicio >= hora fin): ${diaInvalidos}`);
        return;
      }
    }

    onSave(saveData)
  }

  const handleSelectSede = (sede: Sede) => {
    setFormData({ ...formData, sede_id: sede.sede_id })
    setIsSedeDropdownOpen(false)
  }

  const handleToggleServicio = (servicioId: string) => {
    console.log('🔄 Toggle servicio ID:', servicioId);
    
    if (!servicioId || servicioId === 'undefined') {
      console.error('❌ ID de servicio inválido:', servicioId);
      return;
    }

    const nuevasEspecialidades = formData.especialidades.includes(servicioId)
      ? formData.especialidades.filter(id => id !== servicioId)
      : [...formData.especialidades, servicioId];
    
    console.log('🎯 Nuevas especialidades (IDs):', nuevasEspecialidades);
    setFormData({ ...formData, especialidades: nuevasEspecialidades });
  }

  const handleComisionChange = (value: string) => {
    const cleanedValue = value.replace(/[^\d.]/g, '');
    const parts = cleanedValue.split('.');
    
    if (parts.length > 2) {
      return;
    }
    
    if (parts[1] && parts[1].length > 2) {
      return;
    }
    
    setFormData({ ...formData, comision: cleanedValue });
  }

  const getSedeNombre = () => {
    const sedeSeleccionada = sedes.find(s => s.sede_id === formData.sede_id)
    return sedeSeleccionada ? formatSedeNombre(sedeSeleccionada.nombre, "Seleccionar sede") : "Seleccionar sede"
  }

  const stopPropagation = (e: React.MouseEvent) => {
    e.stopPropagation()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-auto py-4">
      <div className="bg-white rounded-lg w-full max-w-md p-6 max-h-[90vh] overflow-y-auto my-auto" onClick={stopPropagation}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">{estilista ? "Editar estilista" : "Añadir estilista"}</h2>
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
              onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
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
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-[oklch(0.65_0.25_280)] focus:outline-none focus:ring-2 focus:ring-[oklch(0.65_0.25_280)]/20"
              required
              disabled={isSaving}
              placeholder="ejemplo@correo.com"
            />
          </div>

          {/* Selector de Sede */}
          <div className="relative">
            <label className="block text-sm font-medium mb-2">Sede *</label>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setIsSedeDropdownOpen(!isSedeDropdownOpen)
                setIsServiciosDropdownOpen(false)
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
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto" onClick={stopPropagation}>
                {sedes.map((sede) => (
                  <button
                    key={sede.sede_id}
                    type="button"
                    onClick={() => handleSelectSede(sede)}
                    className={`w-full text-left px-3 py-2 hover:bg-gray-100 ${
                      formData.sede_id === sede.sede_id ? 'bg-blue-50 text-blue-600' : ''
                    }`}
                    >
                      <div className="font-medium">{formatSedeNombre(sede.nombre)}</div>
                      <div className="text-sm text-gray-500 truncate">{sede.direccion}</div>
                    </button>
                  ))}
                {sedes.length === 0 && (
                  <div className="px-3 py-2 text-sm text-gray-500 text-center">
                    No hay sedes disponibles
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Comisión (%)</label>
            <input
              type="text"
              value={formData.comision}
              onChange={(e) => handleComisionChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-[oklch(0.65_0.25_280)] focus:outline-none focus:ring-2 focus:ring-[oklch(0.65_0.25_280)]/20"
              placeholder="Ej: 15.5 (opcional)"
              disabled={isSaving}
            />
            <p className="text-xs text-gray-500 mt-1">
              Dejar vacío si no aplica comisión. Máximo 2 decimales.
            </p>
          </div>

          {/* Selector de Servicios (Especialidades) */}
          <div className="relative">
            <label className="block text-sm font-medium mb-2">Especialidades (Servicios)</label>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setIsServiciosDropdownOpen(!isServiciosDropdownOpen)
                setIsSedeDropdownOpen(false)
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-[oklch(0.65_0.25_280)] focus:outline-none focus:ring-2 focus:ring-[oklch(0.65_0.25_280)]/20 text-left flex justify-between items-center"
              disabled={isSaving || isLoadingServicios}
            >
              <span className={formData.especialidades.length > 0 ? "text-gray-900" : "text-gray-500"}>
                {isLoadingServicios 
                  ? "Cargando servicios..." 
                  : formData.especialidades.length === 0 
                    ? "Seleccionar servicios" 
                    : `${formData.especialidades.length} servicio(s) seleccionado(s)`
                }
              </span>
              {isLoadingServicios ? (
                <Loader className="h-4 w-4 animate-spin text-gray-400" />
              ) : (
                isServiciosDropdownOpen ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />
              )}
            </button>

            {isServiciosDropdownOpen && !isLoadingServicios && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto" onClick={stopPropagation}>
                {servicios.map((servicio) => (
                  <label
                    key={servicio.servicio_id}
                    className="flex items-center px-3 py-2 hover:bg-gray-100 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={formData.especialidades.includes(servicio.servicio_id)}
                      onChange={() => handleToggleServicio(servicio.servicio_id)}
                      className="h-4 w-4 text-[oklch(0.65_0.25_280)] focus:ring-[oklch(0.65_0.25_280)] rounded border-gray-300"
                      disabled={isSaving}
                    />
                    <span className="ml-2 flex-1">
                      <div className="font-medium">{servicio.nombre}</div>
                      <div className="text-sm text-gray-500">
                        ID: {servicio.servicio_id} • {servicio.duracion} min • ${Math.round(servicio.precio || 0).toLocaleString("es-CO", { maximumFractionDigits: 0 })}
                      </div>
                    </span>
                  </label>
                ))}
                {servicios.length === 0 && (
                  <div className="px-3 py-2 text-sm text-gray-500 text-center">
                    No hay servicios disponibles
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Servicios seleccionados */}
          {formData.especialidades.length > 0 && (
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-sm font-medium mb-2">Servicios seleccionados (IDs):</p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {formData.especialidades.map(servicioId => {
                  const servicio = servicios.find(s => s.servicio_id === servicioId);
                  if (!servicio) {
                    console.warn('❌ Servicio no encontrado para ID:', servicioId);
                  }
                  return (
                    <div key={servicioId} className="text-sm text-gray-700 flex items-center justify-between">
                      <div className="flex items-center">
                        <span className="w-2 h-2 bg-[oklch(0.65_0.25_280)] rounded-full mr-2"></span>
                        <span>
                          {servicio ? `${servicio.nombre} (${servicio.servicio_id})` : `ID: ${servicioId}`}
                        </span>
                      </div>
                      {servicio && (
                        <span className="text-xs text-gray-500">
                          {servicio.duracion}min
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Configuración de Horario */}
          <div className="border border-gray-300 rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-gray-600" />
                <h3 className="text-sm font-medium">
                  Configuración de Horario {estilista ? '(Edición)' : '(Nuevo)'}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                {isLoadingHorario && (
                  <Loader className="h-4 w-4 animate-spin text-gray-400" />
                )}
                <button
                  type="button"
                  onClick={() => setShowHorarioConfig(!showHorarioConfig)}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  {showHorarioConfig ? "Ocultar" : "Mostrar"}
                </button>
              </div>
            </div>
            
            {showHorarioConfig && (
              <>
                {estilista && horarioId && (
                  <div className="text-xs text-green-600 bg-green-50 p-2 rounded">
                    <p>✅ Este estilista ya tiene un horario configurado (ID: {horarioId})</p>
                  </div>
                )}
                
                <div>
                  <label className="block text-sm font-medium mb-2">Horario Predefinido</label>
                  <select
                    value={horarioPredefinido}
                    onChange={(e) => {
                      setHorarioPredefinido(e.target.value);
                      aplicarHorarioPredefinido(e.target.value);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-[oklch(0.65_0.25_280)] focus:outline-none focus:ring-2 focus:ring-[oklch(0.65_0.25_280)]/20"
                    disabled={isSaving || isLoadingHorario}
                  >
                    <option value="">Seleccionar horario predefinido</option>
                    {HORARIOS_PREDEFINIDOS.map((horario) => (
                      <option key={horario.label} value={horario.label}>
                        {horario.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Selecciona un horario predefinido o configura manualmente abajo
                  </p>
                </div>

                <div className="space-y-3 max-h-60 overflow-y-auto p-2 border border-gray-200 rounded-lg">
                  <p className="text-sm font-medium">Configuración por día:</p>
                  {horario.disponibilidad.map((dia) => {
                    const diaInfo = DIAS_SEMANA.find(d => d.id === dia.dia_semana);
                    return (
                      <div key={dia.dia_semana} className="border-b pb-3 last:border-0">
                        <div className="flex items-center justify-between mb-2">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={dia.activo}
                              onChange={(e) => actualizarHorarioDia(dia.dia_semana, 'activo', e.target.checked)}
                              className="h-4 w-4 text-[oklch(0.65_0.25_280)] focus:ring-[oklch(0.65_0.25_280)] rounded border-gray-300"
                              disabled={isSaving || isLoadingHorario}
                            />
                            <span className="font-medium">{diaInfo?.nombre || `Día ${dia.dia_semana}`}</span>
                          </label>
                          <span className={`text-xs px-2 py-1 rounded ${dia.activo ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                            {dia.activo ? 'Activo' : 'Inactivo'}
                          </span>
                        </div>
                        
                        {dia.activo && (
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">Hora Inicio</label>
                              <input
                                type="time"
                                value={dia.hora_inicio}
                                onChange={(e) => actualizarHorarioDia(dia.dia_semana, 'hora_inicio', e.target.value)}
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:border-[oklch(0.65_0.25_280)] focus:outline-none focus:ring-1 focus:ring-[oklch(0.65_0.25_280)]/20"
                                disabled={isSaving || isLoadingHorario}
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">Hora Fin</label>
                              <input
                                type="time"
                                value={dia.hora_fin}
                                onChange={(e) => actualizarHorarioDia(dia.dia_semana, 'hora_fin', e.target.value)}
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:border-[oklch(0.65_0.25_280)] focus:outline-none focus:ring-1 focus:ring-[oklch(0.65_0.25_280)]/20"
                                disabled={isSaving || isLoadingHorario}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="text-xs text-gray-500 bg-blue-50 p-2 rounded">
                  <p>💡 {estilista ? 
                    'Los cambios en el horario se aplicarán al guardar.' : 
                    'El horario se creará automáticamente para el estilista con la configuración establecida.'}
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Campo de contraseña solo para nuevos estilistas */}
          {!estilista && (
            <div>
              <label className="block text-sm font-medium mb-2">Contraseña *</label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-[oklch(0.65_0.25_280)] focus:outline-none focus:ring-2 focus:ring-[oklch(0.65_0.25_280)]/20"
                required={!estilista}
                placeholder="Ingresa una contraseña segura"
                disabled={isSaving}
                minLength={6}
              />
              <p className="text-xs text-gray-500 mt-1">
                Mínimo 6 caracteres
              </p>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="activo"
              checked={formData.activo}
              onChange={(e) => setFormData({ ...formData, activo: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-[oklch(0.65_0.25_280)] focus:ring-[oklch(0.65_0.25_280)]"
              disabled={isSaving}
            />
            <label htmlFor="activo" className="text-sm font-medium text-gray-700">
              Estilista activo
            </label>
          </div>

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
              disabled={isSaving || !formData.sede_id || !formData.nombre.trim() || !formData.email.trim() || (!estilista && !formData.password.trim())}
            >
              {isSaving ? (
                <>
                  <Loader className="h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                estilista ? "Guardar cambios" : "Crear estilista con horario"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
