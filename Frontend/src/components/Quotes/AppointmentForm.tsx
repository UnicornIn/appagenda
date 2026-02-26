import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Clock, Calendar as CalendarIcon, ChevronLeft, ChevronRight, X, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../components/Auth/AuthContext';
import { getEstilistas, getEstilistaCompleto, Estilista } from '../../components/Professionales/estilistasApi';
import { getServicios, Servicio } from '../../components/Quotes/serviciosApi';
import { Cliente } from './clientsService';
import { ClientSearch } from '../../pages/PageSuperAdmin/Appoinment/Clients/ClientSearch';
import { PaymentModal } from '../../pages/PageSede/Appoinment/PaymentMethods/PaymentMethods'; // 🔥 IMPORTAR EL MODAL DE PAGO

interface Service {
    id: string;
    profesional_id: string;
    name: string;
    duration: number;
    price: number;
}

interface EstilistaCompleto extends Estilista {
    servicios_no_presta: string[];
    especialidades: boolean;
}

interface AppointmentSchedulerProps {
    onClose: () => void;
    sedeId: string;
    estilistaId?: string;
    fecha: string;
    horaSeleccionada?: string;
    estilistas?: EstilistaCompleto[];
}

interface CitaParaPago {
    cliente: string;
    servicio: string;
    profesional: string;
    fecha: string;
    hora_inicio: string;
    hora_fin: string;
    duracion: string;
    monto_total: number;
    cliente_id: string;
    profesional_id: string;
    
    // ⭐ CAMBIO: En lugar de servicio_id singular, ahora es servicios (array)
    servicios: Array<{
        servicio_id: string;
        precio_personalizado: number | null;  // null si usa precio de BD
    }>;
    
    sede_id: string;
    notas: string;
}

const AppointmentScheduler: React.FC<AppointmentSchedulerProps> = ({
    onClose,
    sedeId,
    estilistaId,
    fecha,
    horaSeleccionada,
    estilistas: estilistasFromProps
}) => {
    const { user } = useAuth();
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [selectedTime, setSelectedTime] = useState(horaSeleccionada || '10:00');
    const [selectedEndTime, setSelectedEndTime] = useState('10:30');
    const [isEndTimeManual, setIsEndTimeManual] = useState(false);
    const [showTimeSelector, setShowTimeSelector] = useState(false);
    const [showMiniCalendar, setShowMiniCalendar] = useState(false);
    const [loading, ] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [serviciosSeleccionados, setServiciosSeleccionados] = useState<Array<{
    servicio_id: string;
    nombre: string;
    duracion: number;
    precio_base: number;
    precio_personalizado: number | null;
    precio_final: number;
    }>>([]);
    const [selectedStylist, setSelectedStylist] = useState<EstilistaCompleto | null>(null);
    const [selectedClient, setSelectedClient] = useState<Cliente | null>(null);
    const [notes, setNotes] = useState('');
    const [servicioActual, setServicioActual] = useState<Service | null>(null);
    const [precioPersonalizado, setPrecioPersonalizado] = useState<string>('');
    const [usarPrecioCustom, setUsarPrecioCustom] = useState(false);

    // 🔥 NUEVO ESTADO PARA EL MODAL DE PAGO
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [preparedCitaData, setPreparedCitaData] = useState<CitaParaPago | null>(null);

    const [estilistas, setEstilistas] = useState<EstilistaCompleto[]>([]);
    const [servicios, setServicios] = useState<Servicio[]>([]);

    const [loadingEstilistas, setLoadingEstilistas] = useState(false);
    const [loadingServicios, setLoadingServicios] = useState(false);

    const parseDateSafely = useCallback((dateString: string): Date => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
            const [year, month, day] = dateString.split('-').map(Number);
            return new Date(year, month - 1, day);
        }
        return new Date(dateString);
    }, []);

    useEffect(() => {
        if (fecha) {
            const parsedDate = parseDateSafely(fecha);
            setSelectedDate(parsedDate);
            setCurrentMonth(new Date(parsedDate.getFullYear(), parsedDate.getMonth(), 1));
        } else {
            const today = new Date();
            setSelectedDate(today);
            setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
        }

        if (horaSeleccionada) {
            setSelectedTime(horaSeleccionada);
            setSelectedEndTime(horaSeleccionada);
            setIsEndTimeManual(false);
        }
    }, [fecha, horaSeleccionada, parseDateSafely]);

    const formatFechaBonita = useCallback((fecha: Date, hora: string) => {
        const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

        const dayName = days[fecha.getDay()];
        const day = fecha.getDate();
        const month = months[fecha.getMonth()];

        const [hours, minutes] = hora.split(':').map(Number);
        const period = hours >= 12 ? 'p.m.' : 'a.m.';
        const formattedHours = hours % 12 || 12;
        const formattedTime = `${formattedHours}:${minutes.toString().padStart(2, '0')} ${period}`;

        return `${dayName}, ${day} de ${month}, ${formattedTime}`;
    }, []);

    const calcularDuracionTexto = useCallback((duracionMinutos: number) => {
        const horas = Math.floor(duracionMinutos / 60);
        const minutos = duracionMinutos % 60;

        if (horas === 0) {
            return `${minutos} min`;
        } else if (minutos === 0) {
            return `${horas} h`;
        } else {
            return `${horas} h ${minutos} min`;
        }
    }, []);

    const eliminarDuplicados = useCallback((estilistasList: EstilistaCompleto[]) => {
        const estilistasUnicos = Array.from(
            new Map(
                estilistasList.map(e => [e.profesional_id || e._id, e])
            ).values()
        );
        return estilistasUnicos;
    }, []);

    useEffect(() => {
        const cargarEstilistas = async () => {
            if (!user?.access_token || !sedeId) return;

            setLoadingEstilistas(true);
            try {
                let estilistasData: EstilistaCompleto[] = [];

                if (estilistasFromProps && estilistasFromProps.length > 0) {
                    estilistasData = eliminarDuplicados(estilistasFromProps);
                } else {
                    const estilistasApi = await getEstilistas(user.access_token, sedeId);

                    if (estilistasApi.length > 0) {
                        const estilistasConDetalles = await Promise.all(
                            estilistasApi.map(async (estilista) => {
                                try {
                                    const estilistaCompleto = await getEstilistaCompleto(user.access_token, estilista.profesional_id || estilista._id);
                                    return {
                                        ...estilista,
                                        servicios_no_presta: estilistaCompleto.servicios_no_presta || [],
                                        especialidades: estilistaCompleto.especialidades || false
                                    };
                                } catch (error) {
                                    return {
                                        ...estilista,
                                        servicios_no_presta: [],
                                        especialidades: false
                                    };
                                }
                            })
                        );

                        estilistasData = estilistasConDetalles;
                    } else {
                        estilistasData = [];
                    }

                    estilistasData = eliminarDuplicados(estilistasData);
                }

                setEstilistas(estilistasData);

                let estilistaSeleccionado: EstilistaCompleto | null = null;

                if (estilistaId && estilistasData.length > 0) {
                    estilistaSeleccionado = estilistasData.find(e =>
                        (e.profesional_id === estilistaId) || (e._id === estilistaId)
                    ) || null;
                }

                if (!estilistaSeleccionado && estilistasData.length > 0) {
                    estilistaSeleccionado = estilistasData[0];
                }

                setSelectedStylist(estilistaSeleccionado);

            } catch (error) {
                setError("Error al cargar los estilistas");
                setEstilistas([]);
            }
            finally {
                setLoadingEstilistas(false);
            }
        };

        cargarEstilistas();
    }, [sedeId, estilistaId, user?.access_token, estilistasFromProps, eliminarDuplicados]);

    useEffect(() => {
        const cargarServicios = async () => {
            if (!user?.access_token) {
                setServicios([]);
                return;
            }

            setLoadingServicios(true);
            try {
                const serviciosData = await getServicios(user.access_token);
                setServicios(serviciosData);
            } catch (error) {
                setError("Error al cargar los servicios");
                setServicios([]);
            }
            finally {
                setLoadingServicios(false);
            }
        };

        cargarServicios();
    }, [user?.access_token]);

    const handleAgregarServicio = useCallback(() => {
    if (!servicioActual) return;

    // Verificar si ya está agregado
    if (serviciosSeleccionados.some(s => s.servicio_id === servicioActual.id)) {
        setError('⚠️ Este servicio ya está agregado');
        return;
    }

    const nuevoServicio = {
        servicio_id: servicioActual.id,
        nombre: servicioActual.name,
        duracion: servicioActual.duration,
        precio_base: servicioActual.price,
        precio_personalizado: usarPrecioCustom && precioPersonalizado 
            ? parseFloat(precioPersonalizado) 
            : null,
        precio_final: usarPrecioCustom && precioPersonalizado 
            ? parseFloat(precioPersonalizado) 
            : servicioActual.price
    };

    setServiciosSeleccionados([...serviciosSeleccionados, nuevoServicio]);
    
    // Resetear campos
    setServicioActual(null);
    setPrecioPersonalizado('');
    setUsarPrecioCustom(false);
    setError(null);
    }, [servicioActual, precioPersonalizado, usarPrecioCustom, serviciosSeleccionados]);

    // =================================================
// 🔥 PASO 3: FUNCIÓN PARA ELIMINAR SERVICIO
// =================================================

const handleEliminarServicio = useCallback((servicioId: string) => {
    setServiciosSeleccionados(serviciosSeleccionados.filter(s => s.servicio_id !== servicioId));
}, [serviciosSeleccionados]);

// =================================================
// 🔥 PASO 4: FUNCIÓN PARA EDITAR PRECIO
// =================================================

    const handleEditarPrecio = useCallback((servicioId: string, nuevoPrecio: string) => {
    setServiciosSeleccionados(serviciosSeleccionados.map(s => {
        if (s.servicio_id === servicioId) {
            const precioNum = nuevoPrecio ? parseFloat(nuevoPrecio) : null;
            return {
                ...s,
                precio_personalizado: precioNum,
                precio_final: precioNum || s.precio_base
            };
        }
        return s;
    }));
}, [serviciosSeleccionados]);

// =================================================
// 🔥 PASO 5: CALCULAR TOTALES
// =================================================

const calcularTotales = useCallback(() => {
    const total = serviciosSeleccionados.reduce((sum, s) => sum + s.precio_final, 0);
    const duracion = serviciosSeleccionados.reduce((sum, s) => sum + s.duracion, 0);
    return { total, duracion };
}, [serviciosSeleccionados]);

const { total: montoTotal, duracion: duracionTotal } = calcularTotales();

const convertirHoraAMinutos = useCallback((hora: string): number => {
    const [hours, minutes] = String(hora || '').split(':').map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return NaN;
    return (hours * 60) + minutes;
}, []);

// =================================================
// 🔥 PASO 6: ACTUALIZAR handleContinuar
// =================================================

const handleContinuar = async () => {
    if (!selectedClient) {
        setError('Por favor selecciona o crea un cliente');
        return;
    }

    if (serviciosSeleccionados.length === 0) {
        setError('Por favor agrega al menos un servicio');
        return;
    }

    if (!selectedStylist || !selectedStylist.profesional_id) {
        setError('Por favor selecciona un estilista');
        return;
    }

    if (!selectedDate) {
        setError('Por favor selecciona una fecha');
        return;
    }

    if (!sedeId) {
        setError('No se ha especificado la sede');
        return;
    }

    if (!selectedEndTime) {
        setError('Por favor selecciona la hora de fin');
        return;
    }

    const inicioMinutos = convertirHoraAMinutos(selectedTime);
    const finMinutos = convertirHoraAMinutos(selectedEndTime);
    if (!Number.isFinite(inicioMinutos) || !Number.isFinite(finMinutos) || finMinutos <= inicioMinutos) {
        setError('La hora de fin debe ser mayor que la hora de inicio');
        return;
    }

    const duracionBloqueMinutos = finMinutos - inicioMinutos;

    setError(null);

    try {
        // ⭐ PREPARAR ARRAY DE SERVICIOS PARA BACKEND
        const serviciosParaBackend = serviciosSeleccionados.map(s => ({
            servicio_id: s.servicio_id,
            precio_personalizado: s.precio_personalizado
        }));

        // Crear resumen de nombres de servicios
        const nombresServicios = serviciosSeleccionados.map(s => s.nombre).join(', ');

        const citaParaPago: CitaParaPago = {
            cliente: selectedClient.nombre,
            servicio: nombresServicios,  // Para mostrar en UI
            profesional: selectedStylist.nombre,
            fecha: formatFechaBonita(selectedDate, selectedTime),
            hora_inicio: selectedTime,
            hora_fin: selectedEndTime,
            duracion: calcularDuracionTexto(duracionBloqueMinutos),
            monto_total: montoTotal,
            cliente_id: selectedClient.cliente_id,
            profesional_id: selectedStylist.profesional_id,
            
            // ⭐ ENVIAR ARRAY DE SERVICIOS
            servicios: serviciosParaBackend,
            
            sede_id: sedeId,
            notas: notes
        };

        setPreparedCitaData(citaParaPago);
        setShowPaymentModal(true);

    } catch (error: any) {
        setError("Error al preparar los datos para el pago");
    }
  };
    

    

    const handleStylistChange = useCallback((estilistaId: string) => {
        const estilista = estilistas.find(e =>
            (e.profesional_id === estilistaId) || (e._id === estilistaId)
        );

        if (estilista) {
            setSelectedStylist(estilista);
            setServiciosSeleccionados([]);
        }
    }, [estilistas]);

    const filtrarServiciosPorEstilista = useCallback((serviciosList: Servicio[], estilista: EstilistaCompleto) => {
        if (!estilista || !serviciosList.length) {
            return [];
        }

        const serviciosDisponibles = serviciosList.filter(servicio => {
            const servicioId = servicio.servicio_id || servicio._id;
            const estaBloqueado = estilista.servicios_no_presta.includes(servicioId);
            return !estaBloqueado;
        });

        return serviciosDisponibles;
    }, []);

    const serviciosFiltrados = useMemo(() => {
        if (!selectedStylist || servicios.length === 0) {
            return [];
        }
        return filtrarServiciosPorEstilista(servicios, selectedStylist);
    }, [selectedStylist, servicios, filtrarServiciosPorEstilista]);

    const serviciosAMostrar = useMemo(() =>
        serviciosFiltrados.map(s => ({
            id: s.servicio_id || s._id,
            profesional_id: s.servicio_id || s._id,
            name: s.nombre,
            duration: Number(s.duracion_minutos) || s.duracion || 30,
            price: s.precio_local !== undefined ? s.precio_local : s.precio ?? 0,
            moneda: s.moneda_local || 'USD'
        })),
        [serviciosFiltrados]
    );

    const handleClientSelect = useCallback((cliente: Cliente) => {
        setSelectedClient(cliente);
    }, []);

    const handleClientClear = useCallback(() => {
        setSelectedClient(null);
    }, []);

    const generateTimeSlots = useCallback(() => {
        const slots = [];
        for (let hour = 5; hour <= 19; hour++) {
            for (let min = 0; min < 60; min += 30) {
                if (hour === 19 && min > 30) break;
                slots.push(`${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`);
            }
        }
        return slots;
    }, []);

    const generateCalendarDays = useCallback(() => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const firstDayOfWeek = firstDay.getDay();
        const daysInMonth = lastDay.getDate();
        const prevMonthLastDay = new Date(year, month, 0).getDate();
        const days = [];

        for (let i = 0; i < firstDayOfWeek; i++) {
            const day = prevMonthLastDay - firstDayOfWeek + i + 1;
            const date = new Date(year, month - 1, day);
            days.push({
                date,
                isCurrentMonth: false,
                isToday: false,
                isSelected: selectedDate?.toDateString() === date.toDateString()
            });
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            days.push({
                date,
                isCurrentMonth: true,
                isToday: date.toDateString() === new Date().toDateString(),
                isSelected: selectedDate?.toDateString() === date.toDateString()
            });
        }

        const totalCells = 42;
        const remainingDays = totalCells - days.length;
        for (let day = 1; day <= remainingDays; day++) {
            const date = new Date(year, month + 1, day);
            days.push({
                date,
                isCurrentMonth: false,
                isToday: false,
                isSelected: false
            });
        }

        return days;
    }, [currentMonth, selectedDate]);

    const formatDateHeader = useCallback((date: Date) => {
        const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        
        return {
            day: days[date.getDay()],
            date: date.getDate(),
            month: months[date.getMonth()],
            fullMonth: months[date.getMonth()],
            year: date.getFullYear()
        };
    }, []);

    const navigateMonth = useCallback((direction: 'prev' | 'next') => {
        setCurrentMonth(prev => {
            const newDate = new Date(prev);
            if (direction === 'prev') {
                newDate.setMonth(prev.getMonth() - 1);
            } else {
                newDate.setMonth(prev.getMonth() + 1);
            }
            return newDate;
        });
    }, []);

    const calculateEndTime = useCallback((startTime: string, duration: number) => {
        const [hours, minutes] = startTime.split(':').map(Number);
        const totalMinutes = hours * 60 + minutes + duration;
        const endHours = Math.floor(totalMinutes / 60);
        const endMinutes = totalMinutes % 60;
        return `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
    }, []);

    useEffect(() => {
        if (!selectedTime || isEndTimeManual) return;

        const duracionAuto = duracionTotal > 0 ? duracionTotal : 30;
        setSelectedEndTime(calculateEndTime(selectedTime, duracionAuto));
    }, [selectedTime, duracionTotal, isEndTimeManual, calculateEndTime]);

    const handleDateButtonClick = useCallback(() => {
        setShowMiniCalendar(!showMiniCalendar);
    }, [showMiniCalendar]);

    const handleDateSelect = useCallback((date: Date) => {
        setSelectedDate(date);
        setShowMiniCalendar(false);
    }, []);

    const handleTimeSelect = useCallback((time: string) => {
        setSelectedTime(time);
        setShowTimeSelector(false);
    }, []);

    const handleCloseSelectors = useCallback(() => {
        setShowTimeSelector(false);
        setShowMiniCalendar(false);
    }, []);

        // 🔥 FUNCIÓN PARA MANEJAR ÉXITO DEL PAGO
    const handlePaymentSuccess = () => {
        // Cerrar ambos modales
        setShowPaymentModal(false);
        onClose();
        
        // Puedes agregar aquí algún callback de éxito si necesitas
        // Por ejemplo: mostrar un toast, actualizar la lista de citas, etc.
    };

    // 🔥 FUNCIÓN PARA VOLVER A EDITAR DESDE EL MODAL DE PAGO
    const handleBackToEdit = () => {
        // Cerrar modal de pago, mantener abierto el de edición
        setShowPaymentModal(false);
        // El usuario permanece en el modal de edición
    };

    // 🔥 AGREGAR ESTOS useMemo QUE FALTAN (después de handleBackToEdit)
    const calendarDays = useMemo(() => generateCalendarDays(), [generateCalendarDays]);
    const allTimeSlots = useMemo(() => generateTimeSlots(), [generateTimeSlots]);
    const dayHeaders = useMemo(() => ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'], []);


    const getCurrencySymbol = useCallback(() => {
        const paisUsuario = user?.pais;
        if (paisUsuario === 'Colombia') return 'COP';
        if (paisUsuario === 'México' || paisUsuario === 'Mexico') return 'MXN';
        return 'USD';
    }, [user?.pais]);

    const currencySymbol = getCurrencySymbol();

    // MiniCalendar compacto
    const MiniCalendar = useCallback(() => {
        return (
            <div className="absolute z-[9999] mt-1 w-56 bg-white border border-gray-300 rounded shadow-lg p-2">
                <div className="flex items-center justify-between mb-1">
                    <button
                        onClick={() => navigateMonth('prev')}
                        className="p-1 hover:bg-gray-100 rounded"
                    >
                        <ChevronLeft className="w-3 h-3" />
                    </button>
                    <div className="text-xs font-semibold text-gray-900">
                        {formatDateHeader(currentMonth).fullMonth.substring(0, 3)} {currentMonth.getFullYear()}
                    </div>
                    <button
                        onClick={() => navigateMonth('next')}
                        className="p-1 hover:bg-gray-100 rounded"
                    >
                        <ChevronRight className="w-3 h-3" />
                    </button>
                </div>

                <div className="grid grid-cols-7 gap-0.5 mb-1">
                    {dayHeaders.map((day, i) => (
                        <div key={`day-header-${i}`} className="text-[9px] font-medium text-gray-500 text-center">
                            {day}
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-7 gap-0.5">
                    {calendarDays.map(({ date, isCurrentMonth, isToday, isSelected }, i) => (
                        <button
                            key={`calendar-day-${date.toISOString()}-${i}`}
                            onClick={() => isCurrentMonth && handleDateSelect(date)}
                            disabled={!isCurrentMonth}
                            className={`h-5 w-5 text-[9px] flex items-center justify-center rounded transition-all
                                ${!isCurrentMonth ? 'text-gray-300 cursor-default' : ''}
                                ${isSelected ? 'bg-gray-900 text-white' : ''}
                                ${isToday && !isSelected ? 'bg-gray-100 text-gray-900 border border-gray-300' : ''}
                                ${isCurrentMonth && !isSelected && !isToday ? 'hover:bg-gray-100 text-gray-700' : ''}`}
                        >
                            {date.getDate()}
                        </button>
                    ))}
                </div>

                <div className="mt-1 pt-1 border-t border-gray-200">
                    <button
                        onClick={() => {
                            const today = new Date();
                            setCurrentMonth(new Date());
                            handleDateSelect(today);
                        }}
                        className="w-full text-[10px] text-gray-900 hover:bg-gray-100 font-medium py-1 rounded"
                    >
                        Hoy
                    </button>
                </div>
            </div>
        );
    }, [currentMonth, calendarDays, dayHeaders, formatDateHeader, navigateMonth, handleDateSelect]);

    return (
        <>
            <div className="relative">
                {/* Header fijo */}

                <div className="max-h-[calc(70vh-50px)] overflow-y-auto px-1">
                    {error && (
                        <div className="mb-3 p-2 bg-gray-100 border border-gray-300 rounded text-xs text-gray-700">
                            <div className="font-semibold mb-1">Error</div>
                            {error}
                            <button
                                onClick={() => setError(null)}
                                className="float-right text-gray-600 hover:text-gray-900"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </div>
                    )}

                    <div className="space-y-3">
                        <div className="space-y-1">
                            <ClientSearch
                                sedeId={sedeId}
                                selectedClient={selectedClient}
                                onClientSelect={handleClientSelect}
                                onClientClear={handleClientClear}
                                required={true}
                            />
                        </div>

                        {/* ESTILISTA */}
                        <div className="space-y-1">
                            <label className="block text-xs font-semibold text-gray-700">
                                Estilista *
                            </label>
                            <select
                                value={selectedStylist?.profesional_id || selectedStylist?._id || ''}
                                disabled={loadingEstilistas || estilistas.length === 0}
                                onChange={(e) => handleStylistChange(e.target.value)}
                                className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-gray-900 focus:border-gray-900 outline-none bg-white disabled:bg-gray-100"
                            >
                                <option value="">
                                    {loadingEstilistas
                                        ? '🔄 Cargando...'
                                        : estilistas.length === 0
                                            ? '❌ No hay estilistas'
                                            : '👨‍💼 Seleccionar...'
                                    }
                                </option>
                                {estilistas.map(stylist => (
                                    <option
                                        key={`stylist-${stylist.profesional_id || stylist._id}`}
                                        value={stylist.profesional_id || stylist._id}
                                    >
                                        {stylist.nombre}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* SERVICIO - VERSIÓN NUEVA CON MÚLTIPLES SERVICIOS */}
                        <div className="space-y-1">
                            <label className="block text-xs font-semibold text-gray-700">
                                Servicios *
                            </label>

                            {!selectedStylist ? (
                                <div className="p-2 bg-gray-100 rounded text-xs text-gray-600 text-center">
                                    👆 Selecciona un estilista primero
                                </div>
                            ) : (
                                <>
                                    {/* Selector de servicio */}
                                    <select
                                        value={servicioActual?.profesional_id || ''}
                                        disabled={loadingServicios || serviciosAMostrar.length === 0}
                                        onChange={(e) => setServicioActual(serviciosAMostrar.find(s => s.profesional_id === e.target.value) || null)}
                                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-gray-900 focus:border-gray-900 outline-none bg-white disabled:bg-gray-100"
                                    >
                                        <option value="">
                                            {loadingServicios
                                                ? '🔄 Cargando...'
                                                : serviciosAMostrar.length === 0
                                                    ? '❌ No hay servicios'
                                                    : '💇‍♀️ Seleccionar servicio...'
                                            }
                                        </option>
                                        {serviciosAMostrar.map(service => (
                                            <option key={`service-${service.profesional_id}`} value={service.profesional_id}>
                                                {service.name} - {service.duration}min - {currencySymbol} {service.price}
                                            </option>
                                        ))}
                                    </select>

                                    {/* Checkbox precio personalizado */}
                                    {servicioActual && (
                                        <div className="mt-2">
                                            <label className="flex items-center gap-2 text-xs">
                                                <input
                                                    type="checkbox"
                                                    checked={usarPrecioCustom}
                                                    onChange={(e) => {
                                                        setUsarPrecioCustom(e.target.checked);
                                                        if (!e.target.checked) setPrecioPersonalizado('');
                                                    }}
                                                    className="rounded border-gray-300"
                                                />
                                                <span className="text-gray-700">Usar precio personalizado</span>
                                            </label>
                                        </div>
                                    )}

                                    {/* Input precio personalizado */}
                                    {usarPrecioCustom && servicioActual && (
                                        <div className="mt-2">
                                            <input
                                                type="number"
                                                value={precioPersonalizado}
                                                onChange={(e) => setPrecioPersonalizado(e.target.value)}
                                                placeholder={`Precio (base: ${currencySymbol} ${servicioActual.price})`}
                                                className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-gray-900 focus:border-gray-900 outline-none"
                                            />
                                        </div>
                                    )}

                                    {/* Botón agregar servicio */}
                                    {servicioActual && (
                                        <button
                                            onClick={handleAgregarServicio}
                                            className="w-full mt-2 bg-gray-900 text-white py-1.5 rounded text-xs font-semibold hover:bg-gray-800 flex items-center justify-center gap-1"
                                        >
                                            <Plus className="w-3 h-3" />
                                            Agregar servicio
                                        </button>
                                    )}

                                    {/* Lista de servicios agregados */}
                                    {serviciosSeleccionados.length > 0 && (
                                        <div className="mt-2 space-y-2">
                                            <div className="text-xs font-semibold text-gray-700">
                                                Servicios agregados ({serviciosSeleccionados.length})
                                            </div>
                                            {serviciosSeleccionados.map((servicio, index) => (
                                                <div
                                                    key={`selected-${servicio.servicio_id}-${index}`}
                                                    className="p-2 border border-gray-300 rounded bg-gray-50"
                                                >
                                                    <div className="flex items-start justify-between mb-1">
                                                        <div className="flex-1">
                                                            <div className="text-xs font-semibold text-gray-900">
                                                                {servicio.nombre}
                                                            </div>
                                                            <div className="flex items-center gap-2 text-[10px] text-gray-600 mt-0.5">
                                                                <span>{servicio.duracion}min</span>
                                                                {servicio.precio_personalizado !== null && (
                                                                    <span className="text-orange-600 font-medium">⚡ Custom</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={() => handleEliminarServicio(servicio.servicio_id)}
                                                            className="p-1 hover:bg-red-50 rounded text-red-600"
                                                            title="Eliminar"
                                                        >
                                                            <Trash2 className="w-3 h-3" />
                                                        </button>
                                                    </div>

                                                    <div className="flex items-center justify-between">
                                                        {servicio.precio_personalizado !== null ? (
                                                            <>
                                                                <span className="text-[10px] text-gray-500 line-through">
                                                                    {currencySymbol} {servicio.precio_base}
                                                                </span>
                                                                <span className="text-xs font-bold text-orange-600">
                                                                    {currencySymbol} {servicio.precio_final}
                                                                </span>
                                                            </>
                                                        ) : (
                                                            <span className="text-xs font-bold text-gray-900">
                                                                {currencySymbol} {servicio.precio_final}
                                                            </span>
                                                        )}
                                                    </div>
                                                {/* Input para editar precio */}
                                                <input
                                                type="number"
                                                value={servicio.precio_personalizado || ''}
                                                onChange={(e) => handleEditarPrecio(servicio.servicio_id, e.target.value)}
                                                placeholder={`Editar precio (base: ${servicio.precio_base})`}
                                                className="w-full border border-gray-300 rounded px-2 py-1 text-[10px] focus:ring-1 focus:ring-gray-900 focus:border-gray-900 outline-none"
                                                />
                                            </div>
                                        ))}

                                            {/* Resumen total */}
                                            <div className="p-2 border-2 border-gray-900 rounded bg-gray-50">
                                                <div className="flex justify-between items-center">
                                                    <div className="text-xs text-gray-700">
                                                        Total ({duracionTotal} min)
                                                    </div>
                                                    <div className="text-sm font-bold text-gray-900">
                                                        {currencySymbol} {montoTotal}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                        {/* FECHA Y HORA */}
                        <div className="space-y-1">
                            <label className="block text-xs font-semibold text-gray-700">
                                Fecha y Hora *
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="relative">
                                    <button
                                        onClick={handleDateButtonClick}
                                        className="w-full flex items-center justify-between border border-gray-300 rounded px-2 py-1.5 hover:border-gray-900 bg-white text-xs"
                                    >
                                        <span className="flex items-center gap-1">
                                            <CalendarIcon className="w-3 h-3" />
                                            {selectedDate
                                                ? `${formatDateHeader(selectedDate).date} ${formatDateHeader(selectedDate).month.substring(0, 3)}`
                                                : '📅 Fecha'
                                            }
                                        </span>
                                    </button>
                                    {showMiniCalendar && <MiniCalendar />}
                                </div>

                                <div className="relative">
                                    <button
                                        onClick={() => setShowTimeSelector(!showTimeSelector)}
                                        className="w-full flex items-center justify-between border border-gray-300 rounded px-2 py-1.5 hover:border-gray-900 bg-white text-xs"
                                    >
                                        <span className="flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            {selectedTime}
                                        </span>
                                    </button>

                                    {showTimeSelector && (
                                        <div className="absolute z-[9999] mt-1 w-full bg-white border border-gray-300 rounded shadow max-h-40 overflow-y-auto text-xs">
                                            {allTimeSlots.map((time, i) => (
                                                <button
                                                    key={`time-slot-${time}-${i}`}
                                                    onClick={() => handleTimeSelect(time)}
                                                    className={`w-full text-left px-2 py-1.5 hover:bg-gray-100 border-b border-gray-100 last:border-b-0
                                                        ${selectedTime === time ? 'bg-gray-900 text-white font-semibold' : 'text-gray-700'}`}
                                                >
                                                    <div className="flex items-center gap-1">
                                                        <Clock className="w-3 h-3" />
                                                        {time}
                                                        {selectedTime === time && (
                                                            <span className="ml-auto">✓</span>
                                                        )}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="mt-2">
                                <div className="mb-1 flex items-center justify-between">
                                    <label className="block text-xs font-semibold text-gray-700">
                                        Hora fin *
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const duracionAuto = duracionTotal > 0 ? duracionTotal : 30;
                                            setSelectedEndTime(calculateEndTime(selectedTime, duracionAuto));
                                            setIsEndTimeManual(false);
                                        }}
                                        className="text-[10px] text-gray-600 hover:text-gray-900"
                                    >
                                        Auto
                                    </button>
                                </div>
                                <input
                                    type="time"
                                    value={selectedEndTime}
                                    onChange={(e) => {
                                        setSelectedEndTime(e.target.value);
                                        setIsEndTimeManual(true);
                                    }}
                                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-gray-900 focus:border-gray-900 outline-none bg-white"
                                />
                                <p className="mt-1 text-[10px] text-gray-500">
                                    Hora fin actual: {isEndTimeManual ? 'manual' : 'automática según servicios'}
                                </p>
                            </div>
                        </div>

                        {/* NOTAS */}
                        <div className="space-y-1">
                            <label className="block text-xs font-semibold text-gray-700">
                                Notas <span className="text-gray-500 font-normal">(opcional)</span>
                            </label>
                            <textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Notas..."
                                className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-gray-900 focus:border-gray-900 outline-none resize-none"
                                rows={2}
                            />
                        </div>

                        {/* BOTÓN - CAMBIADO A handleContinuar */}
                        <button
                            onClick={handleContinuar}
                            disabled={!selectedClient || serviciosSeleccionados.length === 0 || !selectedStylist || !selectedDate || !selectedEndTime || loading}
                            className="w-full bg-gray-900 text-white py-2 rounded text-xs font-semibold hover:bg-gray-800 active:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                        >
                            Continuar
                        </button>
                    </div>
                </div>

                {/* Overlay para cerrar selectores */}
                {(showTimeSelector || showMiniCalendar) && (
                    <div
                        className="fixed inset-0 z-[9998]"
                        onClick={handleCloseSelectors}
                    />
                )}
            </div>

            {/* 🔥 MODAL DE PAGO */}
            {showPaymentModal && preparedCitaData && (
                <PaymentModal
                    isOpen={showPaymentModal}
                    onClose={() => setShowPaymentModal(false)}
                    citaData={preparedCitaData}
                    onSuccess={handlePaymentSuccess}
                    onBackToEdit={handleBackToEdit}
                />
            )}
        </>
    );
};

export default React.memo(AppointmentScheduler);
