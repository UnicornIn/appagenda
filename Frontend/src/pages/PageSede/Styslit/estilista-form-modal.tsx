"use client"

import { useState, useEffect } from "react"
import { X, Loader, ChevronDown, ChevronUp } from 'lucide-react'
import type { Estilista } from "../../../types/estilista"
import { sedeService, type Sede } from "../../PageSuperAdmin/Sedes/sedeService"
import { serviciosService } from "../Services/serviciosService"
import { useAuth } from "../../../components/Auth/AuthContext"
import { formatSedeNombre } from "../../../lib/sede"

// Definir el tipo Servicio que coincide con la respuesta del servicio
interface Servicio {
  id: string;
  servicio_id: string;
  nombre: string;
  duracion: number;
  precio: number;
  categoria: string;
  activo: boolean;
  // Campos opcionales para compatibilidad
  descripcion?: string;
  comision_porcentaje?: number;
  imagen?: string;
  requiere_producto?: boolean;
}

interface EstilistaFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (estilista: Partial<Estilista> & { password?: string }) => void
  estilista: Estilista | null
  isSaving?: boolean
}

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

  const [sedes, setSedes] = useState<Sede[]>([])
  const [servicios, setServicios] = useState<Servicio[]>([])
  const [isLoadingSedes, setIsLoadingSedes] = useState(false)
  const [isLoadingServicios, setIsLoadingServicios] = useState(false)
  const [isSedeDropdownOpen, setIsSedeDropdownOpen] = useState(false)
  const [isServiciosDropdownOpen, setIsServiciosDropdownOpen] = useState(false)
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
        
        // Transformar los servicios al tipo esperado
        const serviciosTransformados: Servicio[] = serviciosData.map(servicio => {
          // Validar que el servicio tenga un ID válido
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
        }).filter(Boolean) as Servicio[]; // Filtrar servicios nulos
        
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

  // Inicializar formData cuando se abre el modal
  useEffect(() => {
    if (estilista) {
      console.log('📝 Estilista para editar:', estilista)
      setFormData({
        nombre: estilista.nombre || "",
        email: estilista.email || "",
        sede_id: estilista.sede_id || "",
        comision: estilista.comision !== null && estilista.comision !== undefined ? estilista.comision.toString() : "",
        especialidades: estilista.especialidades || [],
        password: "", // No mostrar password en edición
        activo: estilista.activo !== undefined ? estilista.activo : true
      })
    } else {
      setFormData({
        nombre: "",
        email: "",
        sede_id: "",
        comision: "",
        especialidades: [],
        password: "",
        activo: true
      })
    }
  }, [estilista, isOpen])

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
    
    // ✅ Asegurar que especialidades siempre tenga un valor
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

    // ✅ PREPARAR DATOS CON VALIDACIÓN EXTRA - Asegurar que especialidades siempre esté definido
    const saveData: Partial<Estilista> & { password?: string } = {
      nombre: formData.nombre.trim(),
      email: formData.email.trim(),
      sede_id: formData.sede_id,
      especialidades: especialidadesValidas, // Esto siempre será un array (puede estar vacío)
      activo: formData.activo
    }

    // ✅ MANEJO SEGURO DE COMISION - SOLO ENVIAR SI ES VÁLIDO
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
    console.log('🎯 Especialidades:', saveData.especialidades);
    console.log('📋 Tipo de especialidades:', typeof saveData.especialidades);
    console.log('🔢 Cantidad de especialidades:', (saveData.especialidades || []).length); // ✅ Ahora es seguro porque siempre está definido

    // Solo incluir password si es un nuevo estilista y tiene valor
    if (!estilista && formData.password.trim()) {
      saveData.password = formData.password;
    }

    // Validaciones finales antes de enviar
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

    onSave(saveData)
  }

  const handleSelectSede = (sede: Sede) => {
    setFormData({ ...formData, sede_id: sede.sede_id })
    setIsSedeDropdownOpen(false)
  }

  const handleToggleServicio = (servicioId: string) => {
    console.log('🔄 Toggle servicio ID:', servicioId);
    
    // Validar que el servicioId sea válido
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
    // ✅ Permitir solo números y punto decimal
    const cleanedValue = value.replace(/[^\d.]/g, '');
    
    // ✅ Validar que solo tenga un punto decimal
    const parts = cleanedValue.split('.');
    if (parts.length > 2) {
      return; // No permitir múltiples puntos
    }
    
    // ✅ Limitar a 2 decimales
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-md p-6 max-h-[90vh] overflow-y-auto text-gray-900" onClick={stopPropagation}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">{estilista ? "Editar estilista" : "Añadir estilista"}</h2>
          <button 
            onClick={onClose} 
            className="text-gray-900 hover:text-black disabled:opacity-50"
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10 text-left flex justify-between items-center"
              disabled={isSaving || isLoadingSedes}
            >
              <span className={formData.sede_id ? "text-gray-900" : "text-gray-900"}>
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
                      formData.sede_id === sede.sede_id ? 'bg-gray-100 text-gray-900' : ''
                    }`}
                    >
                      <div className="font-medium">{formatSedeNombre(sede.nombre)}</div>
                      <div className="text-sm text-gray-900 truncate">{sede.direccion}</div>
                    </button>
                  ))}
                {sedes.length === 0 && (
                  <div className="px-3 py-2 text-sm text-gray-900 text-center">
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
              placeholder="Ej: 15.5 (opcional)"
              disabled={isSaving}
            />
            <p className="text-xs text-gray-900 mt-1">
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10 text-left flex justify-between items-center"
              disabled={isSaving || isLoadingServicios}
            >
              <span className={formData.especialidades.length > 0 ? "text-gray-900" : "text-gray-900"}>
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
                      className="h-4 w-4 text-gray-900 focus:ring-gray-900 rounded border-gray-300"
                      disabled={isSaving}
                    />
                    <span className="ml-2 flex-1">
                      <div className="font-medium">{servicio.nombre}</div>
                      <div className="text-sm text-gray-900">
                        ID: {servicio.servicio_id} • {servicio.duracion} min • ${Math.round(servicio.precio || 0).toLocaleString("es-CO", { maximumFractionDigits: 0 })}
                      </div>
                    </span>
                  </label>
                ))}
                {servicios.length === 0 && (
                  <div className="px-3 py-2 text-sm text-gray-900 text-center">
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
                    <div key={servicioId} className="text-sm text-gray-900 flex items-center justify-between">
                      <div className="flex items-center">
                        <span className="w-2 h-2 bg-gray-900 rounded-full mr-2"></span>
                        <span>
                          {servicio ? `${servicio.nombre} (${servicio.servicio_id})` : `ID: ${servicioId}`}
                        </span>
                      </div>
                      {servicio && (
                        <span className="text-xs text-gray-900">
                          {servicio.duracion}min
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Campo de contraseña solo para nuevos estilistas */}
          {!estilista && (
            <div>
              <label className="block text-sm font-medium mb-2">Contraseña *</label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                required={!estilista}
                placeholder="Ingresa una contraseña segura"
                disabled={isSaving}
                minLength={6}
              />
              <p className="text-xs text-gray-900 mt-1">
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
              className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
              disabled={isSaving}
            />
            <label htmlFor="activo" className="text-sm font-medium text-gray-900">
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
              className="flex-1 px-4 py-2 bg-black text-white border border-black rounded-lg hover:bg-gray-900 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              disabled={isSaving || !formData.sede_id || !formData.nombre.trim() || !formData.email.trim() || (!estilista && !formData.password.trim())}
            >
              {isSaving ? (
                <>
                  <Loader className="h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                estilista ? "Guardar cambios" : "Crear estilista"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
