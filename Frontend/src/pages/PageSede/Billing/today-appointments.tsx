// app/(protected)/admin-sede/ventas/today-appointments.tsx
"use client"

import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card"
import { Button } from "../../../components/ui/button"
import { useEffect, useState } from "react"
import { API_BASE_URL } from "../../../types/config"
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react"
import { formatDateDMY } from "../../../lib/dateFormat"

// Actualiza la interfaz para que coincida con los datos reales del API
interface Appointment {
  _id: string
  cliente: string
  cliente_nombre: string
  fecha: string
  hora_inicio: string
  hora_fin: string
  servicio: string
  servicio_nombre: string
  estilista?: string
  profesional_nombre: string
  estado: string
  sede_id: string
  valor_total?: number
  estado_pago?: string
  abono?: number
  saldo_pendiente?: number
}

interface ApiResponse {
  total: number
  sede_id: string
  citas: Appointment[]
}

interface TodayAppointmentsProps {
  onSelectAppointment: (appointment: Appointment) => void
  selectedAppointmentId?: string
}

export function TodayAppointments({ onSelectAppointment, selectedAppointmentId }: TodayAppointmentsProps) {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [allAppointments, setAllAppointments] = useState<Appointment[]>([])

  const formatAmountNoDecimals = (value: number | undefined) => {
    const safeValue = Number.isFinite(value) ? Number(value) : 0
    return Math.round(safeValue).toLocaleString("es-CO", { maximumFractionDigits: 0 })
  }

  // Función para formatear la fecha en español
  const formatFecha = (fecha: Date) => {
    return formatDateDMY(fecha)
  }

  // Función para formatear fecha en YYYY-MM-DD para el filtro
  const formatDateForFilter = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // Función para navegar a días anteriores/siguientes
  const navigateDay = (direction: 'prev' | 'next') => {
    const newDate = new Date(selectedDate)
    if (direction === 'prev') {
      newDate.setDate(newDate.getDate() - 1)
    } else {
      newDate.setDate(newDate.getDate() + 1)
    }
    setSelectedDate(newDate)
  }

  // Función para ir al día de hoy
  const goToToday = () => {
    setSelectedDate(new Date())
  }

  // Filtrar citas por la fecha seleccionada y estado "finalizado"
  const filterAppointmentsByDate = () => {
    const targetDate = formatDateForFilter(selectedDate)
    const citasFiltradas = allAppointments.filter(cita => {
      const citaFecha = cita.fecha.split('T')[0]
      
      // Filtrar por fecha
      if (citaFecha !== targetDate) {
        return false
      }
      
      // Filtrar solo citas con estado "finalizado"
      // Asegurarnos de que coincida exactamente con "finalizado" (minúsculas)
      return cita.estado.toLowerCase() === 'finalizado'
    })

    // Ordenar citas por hora
    citasFiltradas.sort((a, b) => {
      const toMinutes = (time: string) => {
        const [hours, minutes] = time.split(':').map(Number)
        return hours * 60 + minutes
      }
      return toMinutes(a.hora_inicio) - toMinutes(b.hora_inicio)
    })

    setAppointments(citasFiltradas)
  }

  const fetchCitas = async () => {
    try {
      setLoading(true)
      setError(null)

      const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token')

      if (!token) {
        setError('No se encontró token de autenticación')
        return
      }

      const url = `${API_BASE_URL}scheduling/quotes/citas-sede`
      console.log('URL del API:', url)

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`)
      }

      const data: ApiResponse = await response.json()

      console.log('Total citas obtenidas del API:', data.citas.length)
      
      // Mostrar distribución de estados para debug
      const estadosCount = data.citas.reduce((acc, cita) => {
        const estado = cita.estado.toLowerCase()
        acc[estado] = (acc[estado] || 0) + 1
        return acc
      }, {} as Record<string, number>)
      
      console.log('Distribución de estados:', estadosCount)
      console.log('Citas con estado "finalizado":', estadosCount['finalizado'] || 0)

      // Guardar todas las citas
      setAllAppointments(data.citas)

      // Filtrar por la fecha seleccionada
      filterAppointmentsByDate()

    } catch (err) {
      console.error('Error en fetchCitas:', err)
      setError(err instanceof Error ? err.message : 'Error al cargar citas')
    } finally {
      setLoading(false)
    }
  }

  // Efecto para cargar las citas al montar el componente
  useEffect(() => {
    fetchCitas()
  }, [])

  // Efecto para filtrar citas cuando cambia la fecha seleccionada
  useEffect(() => {
    if (allAppointments.length > 0) {
      filterAppointmentsByDate()
    }
  }, [selectedDate])

  const formatTimeRange = (horaInicio: string, horaFin: string) => {
    return `${horaInicio}–${horaFin}`
  }

  const handleSelectAppointment = (appointment: Appointment) => {
    onSelectAppointment(appointment)
  }

  // Verificar si la fecha seleccionada es hoy
  const isToday = () => {
    const today = new Date()
    return selectedDate.toDateString() === today.toDateString()
  }

  // Verificar si la fecha seleccionada es ayer
  const isYesterday = () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    return selectedDate.toDateString() === yesterday.toDateString()
  }

  // Verificar si la fecha seleccionada es mañana
  const isTomorrow = () => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    return selectedDate.toDateString() === tomorrow.toDateString()
  }

  const getDayLabel = () => {
    if (isToday()) return 'Hoy'
    if (isYesterday()) return 'Ayer'
    if (isTomorrow()) return 'Mañana'
    return null
  }

  // Función para obtener el color según el estado EXACTO como lo quieres
  const getEstadoColor = (estado: string) => {
    const estadoLower = estado.toLowerCase()
    
    // Primero verificar si es "finalizado" (estado que estamos filtrando)
    if (estadoLower === 'finalizado') {
      return {
        bg: 'bg-green-100',
        text: 'text-green-800',
        border: 'border-green-200',
        label: 'finalizado'
      }
    }
    
    // Para los otros estados (aunque no deberían aparecer porque estamos filtrando solo "finalizado")
    switch (estadoLower) {
      case 'confirmada':
        return {
          bg: 'bg-green-100',
          text: 'text-green-800',
          border: 'border-green-200',
          label: 'Confirmada'
        }
      case 'reservada':
        return {
          bg: 'bg-blue-100',
          text: 'text-blue-800',
          border: 'border-blue-200',
          label: 'Reservada'
        }
      case 'proceso':
        return {
          bg: 'bg-purple-100',
          text: 'text-purple-800',
          border: 'border-purple-200',
          label: 'Proceso'
        }
      case 'cancelada':
        return {
          bg: 'bg-red-100',
          text: 'text-red-800',
          border: 'border-red-200',
          label: 'Cancelada'
        }
      default:
        return {
          bg: 'bg-gray-100',
          text: 'text-gray-800',
          border: 'border-gray-200',
          label: estado
        }
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex flex-col space-y-1">
            <CardTitle className="text-xl flex items-center gap-2">
              Citas finalizados
            </CardTitle>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Calendar className="w-4 h-4" />
              <span>{formatFecha(selectedDate)}</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-gray-500">Cargando citas finalizados...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <div className="flex flex-col space-y-1">
            <CardTitle className="text-xl flex items-center gap-2">
              Citas finalizados
            </CardTitle>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Calendar className="w-4 h-4" />
              <span>{formatFecha(selectedDate)}</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-red-500">{error}</p>
            <Button
              onClick={fetchCitas}
              variant="outline"
              className="mt-4"
            >
              Reintentar
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col space-y-2">
          <CardTitle className="text-xl flex items-center gap-2">
            Citas finalizados
          </CardTitle>
          
          {/* Selector de fecha */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Calendar className="w-4 h-4" />
              <span className="font-medium">{formatFecha(selectedDate)}</span>
              {getDayLabel() && (
                <span className="px-2 py-1 text-xs font-semibold bg-blue-100 text-blue-800 rounded-full">
                  {getDayLabel()}
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={goToToday}
                className={isToday() ? "bg-gray-100" : ""}
              >
                Hoy
              </Button>
            </div>
          </div>

          {/* Controles de navegación */}
          <div className="flex items-center justify-between mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigateDay('prev')}
              className="flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              Anterior
            </Button>
            
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const input = document.createElement('input')
                  input.type = 'date'
                  input.value = formatDateForFilter(selectedDate)
                  input.onchange = (e) => {
                    const target = e.target as HTMLInputElement
                    if (target.value) {
                      setSelectedDate(new Date(target.value))
                    }
                  }
                  input.click()
                }}
                className="text-sm"
              >
                Cambiar fecha
              </Button>
              
              <span className="text-sm font-medium">
                {formatDateDMY(selectedDate)}
              </span>
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigateDay('next')}
              className="flex items-center gap-1"
            >
              Siguiente
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          
          {/* Estadísticas rápidas */}
          <div className="flex items-center gap-4 text-sm mt-2">
            <div className="text-gray-600">
            </div>
            <div className="text-gray-600">
            </div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {appointments.length === 0 ? (
          <div className="text-center py-8">
            <Calendar className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p className="text-gray-500">No hay citas finalizados para este día</p>
            <p className="text-sm text-gray-400 mt-2">
              Selecciona otra fecha para ver las citas finalizados
            </p>
            <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-700">
                💡 Solo se muestran citas con estado "finalizado"
              </p>
            </div>
          </div>
        ) : (
          appointments.map((appointment) => {
            const isSelected = appointment._id === selectedAppointmentId
            const nombreProfesional = appointment.profesional_nombre || appointment.estilista || "Profesional no asignado"
            const nombreServicio = appointment.servicio_nombre || appointment.servicio
            const nombreCliente = appointment.cliente_nombre || appointment.cliente

            // Obtener colores según el estado
            const estadoConfig = getEstadoColor(appointment.estado)

            return (
              <div
                key={appointment._id}
                className={`flex items-center justify-between rounded-lg border p-4 ${isSelected ? 'border-[oklch(0.55_0.25_280)] bg-[oklch(0.55_0.25_280)/0.1]' :
                  'border-gray-200 hover:border-gray-300'
                  }`}
              >
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-semibold">{nombreProfesional}</p>
                    <span className={`text-xs px-2 py-1 rounded-full border ${estadoConfig.bg} ${estadoConfig.text} ${estadoConfig.border}`}>
                      {estadoConfig.label}
                    </span>
                  </div>
                  
                  <p className="text-sm text-gray-600 mb-1">
                    {formatTimeRange(appointment.hora_inicio, appointment.hora_fin)}
                  </p>
                  
                  <p className="text-sm text-gray-500 mb-1">{nombreServicio}</p>
                  
                  {nombreCliente && (
                    <p className="text-xs text-gray-400 mb-1">Cliente: {nombreCliente}</p>
                  )}
                  
                  {/* Mostrar información adicional si está disponible */}
                  <div className="flex flex-wrap gap-3 text-xs text-gray-500 mt-2">
                    {appointment.valor_total !== undefined && (
                      <div className="flex items-center gap-1">
                        <span className="font-medium">Valor:</span>
                        <span className="font-semibold">${formatAmountNoDecimals(appointment.valor_total)}</span>
                      </div>
                    )}
                    
                    {appointment.estado_pago && (
                      <div className="flex items-center gap-1">
                        <span className="font-medium">Pago:</span>
                        <span className={`font-semibold ${
                          appointment.estado_pago.toLowerCase() === 'pagado' ? 'text-green-600' :
                          appointment.estado_pago.toLowerCase() === 'pendiente' ? 'text-yellow-600' :
                          'text-gray-600'
                        }`}>
                          {appointment.estado_pago}
                        </span>
                      </div>
                    )}
                    
                    {appointment.abono !== undefined && appointment.abono > 0 && (
                      <div className="flex items-center gap-1">
                        <span className="font-medium">Abono:</span>
                        <span>${formatAmountNoDecimals(appointment.abono)}</span>
                      </div>
                    )}
                    
                    {appointment.saldo_pendiente !== undefined && appointment.saldo_pendiente > 0 && (
                      <div className="flex items-center gap-1">
                        <span className="font-medium">Saldo:</span>
                        <span className="text-red-600 font-semibold">
                          ${formatAmountNoDecimals(appointment.saldo_pendiente)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-3">
                  <span className="text-sm font-medium bg-gray-100 px-2 py-1 rounded">
                    {appointment.hora_inicio}
                  </span>

                  <Button
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleSelectAppointment(appointment)}
                    className="min-w-[100px]"
                  >
                    {appointment.estado_pago?.toLowerCase() === 'pagado' ? 'Ver Detalle' : 'Facturar'}
                  </Button>
                </div>
              </div>
            )
          })
        )}
        
        {/* Información adicional */}
        <div className="text-xs text-gray-400 pt-2 border-t">
          <div className="flex justify-between items-center">
            <p>Mostrando citas finalizados del {formatFecha(selectedDate)}</p>
            {appointments.length > 0 && (
              <p className="text-green-600 font-medium">
                Total: {appointments.length} finalizado{appointments.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
          {!isToday() && (
            <p className="mt-1">
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs"
                onClick={goToToday}
              >
                ← Volver a citas de hoy
              </Button>
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
