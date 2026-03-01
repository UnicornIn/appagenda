import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Calendar, Plus, User, Clock, X, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Sidebar } from '../../../components/Layout/Sidebar';
import { PageHeader } from '../../../components/Layout/PageHeader';
import Bloqueos from "../../../components/Quotes/Bloqueos";
import AppointmentScheduler from "../../../components/Quotes/AppointmentForm";
import Modal from "../../../components/ui/modal";
import { getCitas } from '../../../components/Quotes/citasApi';
import { getSedes, type Sede } from '../../../components/Branch/sedesApi';
import { getEstilistas, type Estilista } from '../../../components/Professionales/estilistasApi';
import AppointmentDetailsModal from './AppointmentDetailsModal';
import { useAuth } from '../../../components/Auth/AuthContext';
import { getBloqueosMultiplesProfesionales, type Bloqueo } from '../../../components/Quotes/bloqueosApi';
import { formatSedeNombre } from "../../../lib/sede";
import { formatDateDMY } from "../../../lib/dateFormat";
import { extractAgendaAdditionalNotes } from "../../../lib/agenda";

interface Appointment {
  id: string;
  title: string;
  profesional: string;
  start: string;
  end: string;
  color: string;
  tipo: string;
  duracion: number;
  precio: number;
  cliente_nombre: string;
  servicio_nombre: string;
  estilista_nombre: string;
  estado: string;
  profesional_id?: string;
  notas_adicionales?: string;
  rawData?: any;
}

interface EstilistaCompleto extends Estilista {
  servicios_no_presta: string[];
  especialidades: boolean;
  unique_key: string;
}

interface BloqueoCalendario extends Bloqueo {
  _id: string;
}

// MISMAS CONSTANTES QUE EL CALENDARIO DE SEDE
const HOURS = Array.from({ length: 29 }, (_, i) => {
  const hour = Math.floor(i / 2) + 5;
  return `${hour.toString().padStart(2, '0')}:${i % 2 === 0 ? '00' : '30'}`;
});

const COLORS = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-amber-500', 'bg-indigo-500', 'bg-teal-500', 'bg-pink-500', 'bg-cyan-500'];
const CELL_HEIGHT = 32;
const CELL_WIDTH = 96;
const HEADER_HEIGHT = 40;

const CalendarScheduler: React.FC = () => {
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedSede, setSelectedSede] = useState<Sede | null>(null);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [estilistas, setEstilistas] = useState<EstilistaCompleto[]>([]);
  const [citas, setCitas] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [, setShowOptions] = useState(false);
  const [showBloqueoModal, setShowBloqueoModal] = useState(false);
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{ estilista: EstilistaCompleto, hora: string } | null>(null);
  const [citaTooltip, setCitaTooltip] = useState({ visible: false, x: 0, y: 0, cita: null as Appointment | null });
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showAppointmentDetails, setShowAppointmentDetails] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [bloqueos, setBloqueos] = useState<BloqueoCalendario[]>([]);
  const [loadingBloqueos, setLoadingBloqueos] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  const optionsRef = useRef<HTMLDivElement>(null);
  const tooltipTimeoutRef = useRef<NodeJS.Timeout>();
  const dataCacheRef = useRef<Map<string, any>>(new Map());

  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  const selectedDateString = useMemo(() => {
    const year = selectedDate.getFullYear();
    const month = (selectedDate.getMonth() + 1).toString().padStart(2, '0');
    const day = selectedDate.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, [selectedDate]);

  const sedeIdActual = useMemo(() => {
    return selectedSede?.sede_id || '';
  }, [selectedSede]);

  // OPTIMIZADO: Cargar sedes y seleccionar RF SURAMERICANA por defecto
  useEffect(() => {
    const cargarSedesInicial = async () => {
      if (!user?.access_token) return;
      
      try {
        const cacheKey = `sedes_${user.access_token.substring(0, 10)}`;
        let sedesData: Sede[];
        
        // Usar caché si está disponible
        if (dataCacheRef.current.has(cacheKey)) {
          sedesData = dataCacheRef.current.get(cacheKey);
        } else {
          sedesData = await getSedes(user.access_token);
          dataCacheRef.current.set(cacheKey, sedesData);
        }
        
        setSedes(sedesData);
        
        // Buscar RF SURAMERICANA específicamente (case insensitive)
        const suramericana = sedesData.find(sede => 
          sede.nombre.toLowerCase().includes('suramericana') || 
          sede.nombre.toLowerCase().includes('sur americana') ||
          sede.nombre.toLowerCase().includes('rf suramericana') ||
          sede.nombre.toLowerCase().includes('rf sur americana')
        );
        
        // Si encontramos RF SURAMERICANA, la seleccionamos
        if (suramericana) {
          console.log('✅ Sede RF SURAMERICANA encontrada:', suramericana.nombre);
          setSelectedSede(suramericana);
        } else if (sedesData.length > 0) {
          // Si no encontramos RF SURAMERICANA, tomar la primera
          console.log('⚠️ RF SURAMERICANA no encontrada, usando:', sedesData[0].nombre);
          setSelectedSede(sedesData[0]);
        }
      } catch (error) {
        console.error('Error cargando sedes:', error);
      } finally {
        setIsInitialLoad(false);
      }
    };
    
    cargarSedesInicial();
  }, [user]);

  const handleCitaClick = useCallback((apt: Appointment) => {
    console.log('Cita clickeada:', apt);
    setSelectedAppointment(apt);
    setShowAppointmentDetails(true);
  }, []);

  // MISMA FUNCIÓN DE ESTILOS QUE EN SEDE
  const getCitaStyles = (estado: string, isSelected: boolean = false) => {
    const estadoLower = estado?.toLowerCase() || 'pendiente';

    let baseStyles;

    switch (estadoLower) {
      case 'confirmada':
      case 'confirmado':
        baseStyles = {
          bg: 'bg-green-500',
          hover: 'hover:bg-green-600',
          border: 'border-green-600',
          text: 'text-white',
          badge: 'bg-green-700',
          icon: '✓',
          shadow: 'shadow-sm'
        };
        break;

      case 'reservada':
      case 'reservado':
      case 'pendiente':
        baseStyles = {
          bg: 'bg-blue-500',
          hover: 'hover:bg-blue-600',
          border: 'border-blue-600',
          text: 'text-white',
          badge: 'bg-blue-700',
          icon: '⏱️',
          shadow: 'shadow-sm'
        };
        break;

      case 'en proceso':
      case 'en_proceso':
      case 'proceso':
        baseStyles = {
          bg: 'bg-purple-500',
          hover: 'hover:bg-purple-600',
          border: 'border-purple-600',
          text: 'text-white',
          badge: 'bg-purple-700',
          icon: '⚡',
          shadow: 'shadow-sm'
        };
        break;

      case 'cancelada':
      case 'cancelado':
        baseStyles = {
          bg: 'bg-red-500',
          hover: 'hover:bg-red-600',
          border: 'border-red-600',
          text: 'text-white',
          badge: 'bg-red-700',
          icon: '✗',
          shadow: 'shadow-sm'
        };
        break;

      case 'finalizada':
      case 'completada':
      case 'completado':
        baseStyles = {
          bg: 'bg-gray-500',
          hover: 'hover:bg-gray-600',
          border: 'border-gray-600',
          text: 'text-white',
          badge: 'bg-gray-700',
          icon: '✓',
          shadow: 'shadow-sm'
        };
        break;

      default:
        baseStyles = {
          bg: 'bg-amber-500',
          hover: 'hover:bg-amber-600',
          border: 'border-amber-600',
          text: 'text-white',
          badge: 'bg-amber-700',
          icon: '?',
          shadow: 'shadow-sm'
        };
    }

    if (isSelected) {
      return {
        ...baseStyles,
        bg: baseStyles.bg.replace('500', '400'),
        border: 'border-1 border-white',
        shadow: 'shadow ring-1 ring-white ring-opacity-50'
      };
    }

    return baseStyles;
  };

  // OPTIMIZADO: Cargar bloqueos con caché
  const cargarBloqueos = useCallback(async () => {
    if (!user?.access_token || !selectedSede || estilistas.length === 0) return;

    const cacheKey = `bloqueos_${selectedSede.sede_id}_${selectedDateString}`;
    
    // Verificar caché
    if (dataCacheRef.current.has(cacheKey)) {
      setBloqueos(dataCacheRef.current.get(cacheKey));
      return;
    }

    setLoadingBloqueos(true);
    try {
      const profesionalIds = estilistas.map(e => e.profesional_id);
      const todosBloqueos = await getBloqueosMultiplesProfesionales(profesionalIds, user.access_token);

      const bloqueosFiltrados = todosBloqueos.filter(bloqueo => {
        if (!bloqueo || !bloqueo.fecha) return false;

        let fechaBloqueo: string;
        if (bloqueo.fecha.includes('T')) {
          fechaBloqueo = bloqueo.fecha.split('T')[0];
        } else if (bloqueo.fecha.includes(' ')) {
          fechaBloqueo = bloqueo.fecha.split(' ')[0];
        } else {
          fechaBloqueo = bloqueo.fecha;
        }

        return fechaBloqueo === selectedDateString;
      });

      // Guardar en caché
      dataCacheRef.current.set(cacheKey, bloqueosFiltrados);
      setBloqueos(bloqueosFiltrados);
    } catch (error) {
      console.error('Error cargando bloqueos:', error);
      setBloqueos([]);
    } finally {
      setLoadingBloqueos(false);
    }
  }, [estilistas, user, selectedDateString, selectedSede]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (optionsRef.current && !optionsRef.current.contains(event.target as Node)) {
        setShowOptions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // OPTIMIZADO: Cargar estilistas con caché
  const cargarEstilistas = useCallback(async () => {
    if (!sedeIdActual || !user?.access_token) {
      setEstilistas([]);
      return;
    }

    const cacheKey = `estilistas_${sedeIdActual}`;
    
    // Verificar caché
    if (dataCacheRef.current.has(cacheKey)) {
      setEstilistas(dataCacheRef.current.get(cacheKey));
      return;
    }

    setLoading(true);
    try {
      const estilistasData = await getEstilistas(user.access_token);

      if (!Array.isArray(estilistasData)) {
        setEstilistas([]);
        return;
      }

      const estilistasFiltrados = estilistasData
        .filter((est): est is Estilista => {
          return est?.sede_id === sedeIdActual;
        })
        .map(est => ({
          ...est,
          servicios_no_presta: est.servicios_no_presta || [],
          especialidades: est.especialidades || false,
          unique_key: `stylist-${est.profesional_id}`
        } as EstilistaCompleto));

      console.log(`👨‍💼 Estilistas cargados para sede ${selectedSede?.nombre}:`, estilistasFiltrados.length);
      
      // Guardar en caché
      dataCacheRef.current.set(cacheKey, estilistasFiltrados);
      setEstilistas(estilistasFiltrados);
    } catch (error) {
      console.error('Error cargando estilistas:', error);
      setEstilistas([]);
    } finally {
      setLoading(false);
    }
  }, [sedeIdActual, user, selectedSede]);

  // OPTIMIZADO: Cargar citas con caché y optimizaciones
  const cargarCitas = useCallback(async () => {
    if (!user?.access_token || !selectedSede) return;

    const cacheKey = `citas_${selectedSede.sede_id}_${selectedDateString}`;
    
    // Verificar caché
    if (dataCacheRef.current.has(cacheKey)) {
      setCitas(dataCacheRef.current.get(cacheKey));
      return;
    }

    setLoading(true);
    try {
      // OPTIMIZACIÓN: Solo pedir citas del día específico y sede específica
      const params: any = { 
        fecha: selectedDateString,
        sede_id: selectedSede.sede_id,
        limit: 100 // Limitar resultados para evitar carga pesada
      };

      const response = await getCitas(params, user.access_token);
      const citasData = response.citas || response || [];
      
      // Guardar en caché
      dataCacheRef.current.set(cacheKey, citasData);
      setCitas(citasData);
    } catch (error) {
      console.error('Error al cargar citas:', error);
      setCitas([]);
    } finally {
      setLoading(false);
    }
  }, [selectedDateString, selectedSede, user]);

  // OPTIMIZADO: Cargar datos de forma eficiente
  useEffect(() => {
    if (!selectedSede) return;

    // Limpiar caché de datos de sede anterior
    dataCacheRef.current.forEach((_, key) => {
      if (key.startsWith('citas_') || key.startsWith('bloqueos_')) {
        dataCacheRef.current.delete(key);
      }
    });

    // Cargar datos en secuencia para mejor performance
    const cargarDatosSede = async () => {
      try {
        await cargarEstilistas();
        // Esperar un momento antes de cargar citas para no saturar
        setTimeout(() => cargarCitas(), 100);
      } catch (error) {
        console.error('Error cargando datos de sede:', error);
      }
    };

    cargarDatosSede();
  }, [selectedSede, cargarEstilistas, cargarCitas]);

  // Cargar bloqueos cuando hay estilistas (con retraso para no saturar)
  useEffect(() => {
    if (estilistas.length > 0 && selectedSede) {
      setTimeout(() => cargarBloqueos(), 200);
    }
  }, [estilistas, selectedSede, cargarBloqueos]);

  // Invalidar caché cuando cambia la fecha
  useEffect(() => {
    dataCacheRef.current.forEach((_, key) => {
      if (key.includes('citas_') && !key.includes(selectedDateString)) {
        dataCacheRef.current.delete(key);
      }
      if (key.includes('bloqueos_') && !key.includes(selectedDateString)) {
        dataCacheRef.current.delete(key);
      }
    });
  }, [selectedDateString]);

  const profesionales = useMemo(() => {
    return estilistas.map(est => ({
      name: est.nombre,
      initials: est.nombre.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2),
      estilista: est
    }));
  }, [estilistas]);

  const getAppointmentPosition = useCallback((apt: Appointment) => {
    const profIndex = profesionales.findIndex(p => {
      const citaProfesionalId = apt.profesional_id || apt.rawData?.profesional_id;
      const estilistaId = p.estilista.profesional_id;
      return citaProfesionalId === estilistaId;
    });

    if (profIndex === -1) {
      return null;
    }

    const [startHour, startMin] = apt.start.split(':').map(Number);
    const [endHour, endMin] = apt.end.split(':').map(Number);

    const startMinutesFrom5AM = (startHour - 5) * 60 + startMin;
    const endMinutesFrom5AM = (endHour - 4.9) * 60 + endMin;

    const startBlock = Math.floor(startMinutesFrom5AM / 30);
    const endBlock = Math.ceil(endMinutesFrom5AM / 30);
    const totalBlocks = endBlock - startBlock;

    const minHeight = Math.max(totalBlocks * CELL_HEIGHT - 4, 20);

    const leftPosition = 64 + (profIndex * CELL_WIDTH);
    const topPosition = HEADER_HEIGHT + (startBlock * CELL_HEIGHT) + -33;

    return {
      left: leftPosition,
      top: topPosition,
      height: minHeight,
      width: CELL_WIDTH - 1,
    };
  }, [profesionales]);

  const appointments = useMemo(() => {
    if (!citas.length) {
      return [];
    }

    const citasFiltradas = citas.filter(cita => {
      return cita.fecha === selectedDateString;
    });

    return citasFiltradas.map((cita, index) => {
      const estilistaIndex = estilistas.findIndex(e =>
        e.profesional_id === cita.profesional_id
      );

      const colorIndex = estilistaIndex >= 0 ? estilistaIndex % COLORS.length : index % COLORS.length;
      const colorClass = COLORS[colorIndex];

      const parseTime = (time: string) => {
        const [hours, minutes] = time.split(':').map(Number);
        return (hours - 5) * 60 + minutes;
      };

      const startMinutes = parseTime(cita.hora_inicio);
      const endMinutes = parseTime(cita.hora_fin);
      const duracion = Math.max(0, endMinutes - startMinutes);

      return {
        id: cita._id,
        title: cita.cliente_nombre || `Cliente ${cita.cliente_id}`,
        profesional: cita.profesional_nombre,
        start: cita.hora_inicio,
        end: cita.hora_fin,
        color: colorClass,
        tipo: cita.servicio_nombre,
        duracion: duracion,
        precio: 0,
        cliente_nombre: cita.cliente_nombre || `Cliente ${cita.cliente_id}`,
        servicio_nombre: cita.servicio_nombre,
        estilista_nombre: cita.profesional_nombre,
        estado: cita.estado || 'pendiente',
        profesional_id: cita.profesional_id,
        notas_adicionales: extractAgendaAdditionalNotes(cita),
        rawData: cita
      };
    });
  }, [citas, selectedDateString, estilistas]);

  const handleClose = useCallback(() => {
    setShowAppointmentModal(false);
    setShowBloqueoModal(false);
    setSelectedCell(null);
    setShowOptions(false);
  }, []);

  const handleCitaCreada = useCallback(() => {
    // Invalidar caché de citas para esta sede y fecha
    if (selectedSede) {
      const cacheKey = `citas_${selectedSede.sede_id}_${selectedDateString}`;
      dataCacheRef.current.delete(cacheKey);
    }
    
    cargarCitas();
    cargarEstilistas();
    setRefreshTrigger(prev => prev + 1);
    handleClose();
  }, [cargarCitas, cargarEstilistas, handleClose, selectedSede, selectedDateString]);

  const handleBloqueoCreado = useCallback(() => {
    // Invalidar caché de bloqueos para esta sede y fecha
    if (selectedSede) {
      const cacheKey = `bloqueos_${selectedSede.sede_id}_${selectedDateString}`;
      dataCacheRef.current.delete(cacheKey);
    }
    
    cargarCitas();
    cargarEstilistas();
    cargarBloqueos();
    setRefreshTrigger(prev => prev + 1);
    handleClose();
  }, [cargarCitas, cargarEstilistas, cargarBloqueos, handleClose, selectedSede, selectedDateString]);

  const tieneCitaOBloqueo = useCallback((estilistaNombre: string, hora: string) => {
    const [blockHour, blockMin] = hora.split(':').map(Number);
    const blockMinutesFrom5AM = (blockHour - 5) * 60 + blockMin;

    const tieneCitaActual = appointments.some(apt => {
      const estilista = profesionales.find(p => p.name === estilistaNombre);
      if (!estilista) return false;

      const aptProfesionalId = apt.profesional_id || apt.rawData?.profesional_id;
      const estilistaId = estilista.estilista.profesional_id;

      if (aptProfesionalId !== estilistaId) return false;

      const [startHour, startMin] = apt.start.split(':').map(Number);
      const startMinutesFrom5AM = (startHour - 5) * 60 + startMin;

      const [endHour, endMin] = apt.end.split(':').map(Number);
      const endMinutesFrom5AM = (endHour - 5) * 60 + endMin;

      return blockMinutesFrom5AM >= startMinutesFrom5AM && blockMinutesFrom5AM < endMinutesFrom5AM;
    });

    if (tieneCitaActual) return true;

    const tieneBloqueo = bloqueos.some(bloqueo => {
      const estilista = profesionales.find(p => p.name === estilistaNombre);
      if (!estilista) return false;

      if (bloqueo.profesional_id !== estilista.estilista.profesional_id) return false;

      const [startHour, startMin] = bloqueo.hora_inicio.split(':').map(Number);
      const startMinutesFrom5AM = (startHour - 5) * 60 + startMin;

      const [endHour, endMin] = bloqueo.hora_fin.split(':').map(Number);
      const endMinutesFrom5AM = (endHour - 5) * 60 + endMin;

      return blockMinutesFrom5AM >= startMinutesFrom5AM && blockMinutesFrom5AM < endMinutesFrom5AM;
    });

    return tieneBloqueo;
  }, [appointments, profesionales, bloqueos]);

  const openAppointmentModal = useCallback((estilista: EstilistaCompleto, hora: string) => {
    setSelectedCell({ estilista, hora });
    setShowAppointmentModal(true);
    setShowOptions(false);
  }, []);

  const openBloqueoModal = useCallback((estilista: EstilistaCompleto, hora: string) => {
    setSelectedCell({ estilista, hora });
    setShowBloqueoModal(true);
    setShowOptions(false);
  }, []);

  const formatearFecha = useCallback((fecha: string | Date) => {
    const date = new Date(fecha);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  // COMPONENTE MINICALENDAR - EXACTAMENTE IGUAL AL DE SEDE
  const MiniCalendar = useCallback(() => {
    const [currentMonth, setCurrentMonth] = useState<Date>(() => {
      const date = new Date(selectedDate);
      return new Date(date.getFullYear(), date.getMonth(), 1);
    });

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
        const dateFormatted = formatearFecha(date);
        const selectedDateFormatted = formatearFecha(selectedDate);
        const todayFormatted = formatearFecha(new Date());

        days.push({
          date,
          isCurrentMonth: false,
          isToday: dateFormatted === todayFormatted,
          isSelected: dateFormatted === selectedDateFormatted
        });
      }

      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const dateFormatted = formatearFecha(date);
        const selectedDateFormatted = formatearFecha(selectedDate);
        const todayFormatted = formatearFecha(new Date());

        days.push({
          date,
          isCurrentMonth: true,
          isToday: dateFormatted === todayFormatted,
          isSelected: dateFormatted === selectedDateFormatted
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
    }, [currentMonth, selectedDate, formatearFecha]);

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

    const handleDateSelect = useCallback((date: Date) => {
      setSelectedDate(date);
      setCurrentMonth(new Date(date.getFullYear(), date.getMonth(), 1));
      setRefreshTrigger(prev => prev + 1);
    }, [formatearFecha]);

    const calendarDays = useMemo(() => generateCalendarDays(), [generateCalendarDays]);
    const dayHeaders = useMemo(() => ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'], []);

    const formatMonthYear = useCallback((date: Date) => {
      const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      return `${months[date.getMonth()]} ${date.getFullYear()}`;
    }, []);

    useEffect(() => {
      const selectedYear = selectedDate.getFullYear();
      const selectedMonth = selectedDate.getMonth();
      const currentYear = currentMonth.getFullYear();
      const currentMonthIndex = currentMonth.getMonth();

      if (selectedYear !== currentYear || selectedMonth !== currentMonthIndex) {
        setCurrentMonth(new Date(selectedYear, selectedMonth, 1));
      }
    }, [selectedDate]);

    return (
      <div className="bg-white rounded-xl p-3 border border-gray-200 shadow-sm">
        <h3 className="font-semibold text-gray-900 mb-2 text-sm">Calendario</h3>

        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => navigateMonth('prev')}
            className="p-0.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5 text-gray-600" />
          </button>
          <div className="font-semibold text-xs text-gray-900">
            {formatMonthYear(currentMonth)}
          </div>
          <button
            onClick={() => navigateMonth('next')}
            className="p-0.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronRight className="w-3.5 h-3.5 text-gray-600" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-0.5 mb-1.5">
          {dayHeaders.map((day, i) => (
            <div key={`day-header-${i}`} className="text-[10px] font-semibold text-gray-500 text-center py-0.5">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-0.5">
          {calendarDays.map(({ date, isCurrentMonth, isToday, isSelected }, i) => {
            return (
              <button
                key={`calendar-day-${date.toISOString()}-${i}`}
                onClick={() => isCurrentMonth && handleDateSelect(date)}
                disabled={!isCurrentMonth}
                className={`h-6 w-6 text-[10px] flex items-center justify-center rounded-lg transition-all relative
                ${!isCurrentMonth ? 'text-gray-300 cursor-default' : ''}
                ${isSelected ? 'bg-gray-900 text-white shadow scale-105' : ''}
                ${isToday && !isSelected ? 'bg-gray-100 text-gray-900 border border-gray-300' : ''}
                ${isCurrentMonth && !isSelected && !isToday ? 'hover:bg-gray-100 text-gray-700 hover:scale-105' : ''}`}
              >
                {date.getDate()}
                {isSelected && (
                  <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-gray-900 rounded-full animate-pulse" />
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-2 pt-2 border-t border-gray-200">
          <button
            onClick={() => {
              const today = new Date();
              setSelectedDate(today);
              setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
              setRefreshTrigger(prev => prev + 1);
            }}
            className="w-full text-[10px] text-gray-900 hover:text-white hover:bg-gray-900 font-medium py-1.5 rounded-lg transition-colors"
          >
            ⭐ Hoy
          </button>
        </div>
      </div>
    );
  }, [selectedDate, formatearFecha, refreshTrigger]);

  // COMPONENTE CELDA DE CALENDARIO - EXACTAMENTE IGUAL
  const CalendarCell = React.memo(({ prof, hour }: { prof: any; hour: string }) => {
    const [showButtons, setShowButtons] = useState(false);
    const cellRef = useRef<HTMLDivElement>(null);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    const tieneCitaOBloqueoEnEstaHora = tieneCitaOBloqueo(prof.name, hour);

    const esBloqueo = useMemo(() => {
      const [blockHour, blockMin] = hour.split(':').map(Number);
      const blockMinutesFrom5AM = (blockHour - 5) * 60 + blockMin;

      return bloqueos.some(bloqueo => {
        const estilistaId = prof.estilista.profesional_id;
        if (bloqueo.profesional_id !== estilistaId) return false;

        const [startHour, startMin] = bloqueo.hora_inicio.split(':').map(Number);
        const startMinutesFrom5AM = (startHour - 5) * 60 + startMin;

        const [endHour, endMin] = bloqueo.hora_fin.split(':').map(Number);
        const endMinutesFrom5AM = (endHour - 5) * 60 + endMin;

        return blockMinutesFrom5AM >= startMinutesFrom5AM && blockMinutesFrom5AM < endMinutesFrom5AM;
      });
    }, [bloqueos, hour, prof.estilista.profesional_id]);

    useEffect(() => {
      return () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
      };
    }, []);

    const handleCellClick = useCallback((e: React.MouseEvent) => {
      e.stopPropagation();

      if (tieneCitaOBloqueoEnEstaHora) {
        if (!esBloqueo) {
          const citaEnHora = appointments.find(apt => {
            const aptProfesionalId = apt.profesional_id || apt.rawData?.profesional_id;
            if (aptProfesionalId !== prof.estilista.profesional_id) return false;

            const [startHour, startMin] = apt.start.split(':').map(Number);
            const [blockHour, blockMin] = hour.split(':').map(Number);

            const startMinutesFrom5AM = (startHour - 5) * 60 + startMin;
            const endMinutesFrom5AM = (parseInt(apt.end.split(':')[0]) - 5) * 60 + parseInt(apt.end.split(':')[1]);
            const blockMinutesFrom5AM = (blockHour - 5) * 60 + blockMin;

            return blockMinutesFrom5AM >= startMinutesFrom5AM && blockMinutesFrom5AM < endMinutesFrom5AM;
          });

          if (citaEnHora) {
            handleCitaClick(citaEnHora);
          }
        }
      } else {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setShowButtons(true);
      }
    }, [tieneCitaOBloqueoEnEstaHora, esBloqueo, appointments, prof.estilista.profesional_id, hour, handleCitaClick]);

    const handleReservarClick = useCallback((e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      openAppointmentModal(prof.estilista, hour);
      setShowButtons(false);
    }, [prof.estilista, hour, openAppointmentModal]);

    const handleBloquearClick = useCallback((e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      openBloqueoModal(prof.estilista, hour);
      setShowButtons(false);
    }, [prof.estilista, hour, openBloqueoModal]);

    useEffect(() => {
      if (showButtons) {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          setShowButtons(false);
        }, 2000);
      }

      return () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
      };
    }, [showButtons]);

    const handleMouseEnter = useCallback(() => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (!tieneCitaOBloqueoEnEstaHora) {
        setShowButtons(true);
      }
    }, [tieneCitaOBloqueoEnEstaHora]);

    const handleMouseLeave = useCallback(() => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setShowButtons(false);
    }, []);

    const handleButtonContainerMouseEnter = useCallback(() => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    }, []);

    const handleButtonContainerMouseLeave = useCallback(() => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setShowButtons(false);
    }, []);

    return (
      <div
        ref={cellRef}
        onClick={handleCellClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`w-24 h-8 border-l border-gray-100 relative transition-all duration-150 ${tieneCitaOBloqueoEnEstaHora
          ? esBloqueo
            ? 'bg-gray-100/40 hover:bg-gray-200/50 border-gray-300 cursor-default'
            : 'bg-white/30 hover:bg-gray-100/50 border-gray-200 cursor-pointer'
          : 'bg-white hover:bg-gray-50 hover:shadow-sm cursor-pointer'
          }`}
      >
        {tieneCitaOBloqueoEnEstaHora && (
          <div className={`absolute inset-0.5 rounded-md border flex items-center justify-center ${esBloqueo
            ? 'bg-gradient-to-r from-gray-100/50 to-gray-200/40 border-gray-300/60'
            : 'bg-white/40 border-gray-200/60'
            }`}>
            <div className={`text-[10px] font-semibold ${esBloqueo ? 'text-gray-700 opacity-70' : 'text-gray-600 opacity-70'
              }`}>
              {esBloqueo ? '🔒' : '●'}
            </div>
          </div>
        )}

        {!tieneCitaOBloqueoEnEstaHora && showButtons && (
          <div
            className="absolute inset-0 flex items-center justify-center z-[50]"
            onMouseEnter={handleButtonContainerMouseEnter}
            onMouseLeave={handleButtonContainerMouseLeave}
          >
            <div
              className="flex gap-0.5 bg-white/95 backdrop-blur-sm rounded-md p-0.5 shadow-lg border border-gray-300 animate-fadeIn"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={handleReservarClick}
                className="group flex items-center justify-center gap-0.5 bg-white text-gray-900 hover:bg-gray-900 hover:text-white active:bg-gray-800 active:text-white border border-gray-300 hover:border-gray-900 px-1.5 py-0.5 rounded text-[10px] font-medium min-w-[50px] transition-all duration-150 shadow-sm hover:shadow-md cursor-pointer focus:outline-none focus:ring-1 focus:ring-gray-900"
              >
                <Plus className="w-2.5 h-2.5 transition-colors" />
                Reservar
              </button>

              <button
                onClick={handleBloquearClick}
                className="group flex items-center justify-center gap-0.5 bg-white text-gray-900 hover:bg-gray-900 hover:text-white active:bg-gray-800 active:text-white border border-gray-300 hover:border-gray-900 px-1.5 py-0.5 rounded text-[10px] font-medium min-w-[50px] transition-all duration-150 shadow-sm hover:shadow-md cursor-pointer focus:outline-none focus:ring-1 focus:ring-gray-900"
              >
                <X className="w-2.5 h-2.5 transition-colors" />
                Bloquear
              </button>
            </div>
          </div>
        )}
      </div>
    );
  });

  // COMPONENTE DE CITA - EXACTAMENTE IGUAL
  const CitaComponent = React.memo(({ apt }: { apt: Appointment }) => {
    const position = getAppointmentPosition(apt);
    const isSelected = selectedAppointment?.id === apt.id;
    const styles = getCitaStyles(apt.estado, isSelected);

    if (!position) {
      return null;
    }

    const citasContiguas = useMemo(() => {
      if (!apt.rawData?.cliente_id) return [apt];

      const mismasCitas = appointments.filter(otherApt =>
        otherApt.rawData?.cliente_id === apt.rawData?.cliente_id &&
        otherApt.profesional_id === apt.profesional_id
      );

      return mismasCitas.sort((a, b) => a.start.localeCompare(b.start));
    }, [apt, appointments]);

    const renderCitaContent = () => {
      const alturaDisponible = position.height;

      if (citasContiguas.length > 1) {
        const totalDuracion = citasContiguas.reduce((sum, cita) => sum + cita.duracion, 0);
        const servicios = [...new Set(citasContiguas.map(c => c.servicio_nombre))].join(' + ');

        return (
          <div className="p-1.5 h-full flex flex-col">
            <div className="text-[9px] font-bold text-white truncate mb-0.5">
              {apt.cliente_nombre}
            </div>
            <div className="text-[8px] text-white/80 truncate mb-0.5">
              {servicios}
            </div>
            <div className="mt-auto text-[8px] text-white/90 flex justify-between">
              <span>{citasContiguas.length} servicios</span>
              <span>{totalDuracion}min</span>
            </div>
          </div>
        );
      }

      if (alturaDisponible <= 30) {
        return (
          <div className="p-1 h-full">
            <div className="flex items-center justify-between h-full">
              <div className="text-[8px] font-semibold text-white truncate pr-0.5">
                {apt.cliente_nombre.split(' ')[0]}
              </div>
              <div className="text-[7px] text-white/70 bg-black/30 px-0.5 py-0.25 rounded">
                {apt.start.split(':')[0]}:{apt.start.split(':')[1]}
              </div>
            </div>
          </div>
        );
      }

      if (alturaDisponible <= 60) {
        return (
          <div className="p-1.5 h-full flex flex-col">
            <div className="text-[10px] font-bold text-white truncate mb-0.5">
              {apt.cliente_nombre}
            </div>

            <div className="grid grid-cols-2 gap-0.5 mt-auto">
              <div className="text-[8px] text-white/80 truncate">
                {apt.servicio_nombre.split(' ')[0]}
              </div>
              <div className="text-[8px] text-white font-medium text-right">
                {apt.duracion}min
              </div>
              <div className="text-[7px] text-white/70">
                {apt.estilista_nombre.split(' ')[0]}
              </div>
              <div className="text-[7px] text-white/90 text-right">
                {styles.icon}
              </div>
            </div>
          </div>
        );
      }

      return (
        <div className="p-2 h-full">
          <div className="mb-2">
            <div className="text-xs font-bold text-white truncate">
              {apt.cliente_nombre}
            </div>
            <div className="text-[10px] text-white/80 mt-0.5">
              {apt.servicio_nombre}
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center">
                <span className="text-[10px]">💇</span>
              </div>
              <div className="text-[10px] text-white/90 truncate">
                {apt.estilista_nombre}
              </div>
            </div>

            <div className="bg-white/10 rounded p-1">
              <div className="flex justify-between items-center">
                <div className="text-[10px] text-white">
                  {apt.start} - {apt.end}
                </div>
                <div className="text-[10px] font-bold text-white">
                  {apt.duracion} min
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center">
              <div className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${styles.badge} text-white`}>
                {styles.icon} {apt.estado}
              </div>
            </div>
          </div>
        </div>
      );
    };

    return (
      <div
        className={`absolute rounded-md shadow-sm cursor-pointer overflow-hidden 
                 transition-all duration-150 z-30 ${styles.bg} ${styles.hover} ${styles.shadow}
                 hover:shadow hover:scale-[1.01] hover:z-40 border-l-3 ${styles.border}
                 group pointer-events-auto active:scale-95 active:shadow-inner`}
        style={position}
        onClick={() => handleCitaClick(apt)}
        onMouseEnter={(e) => {
          if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
          setCitaTooltip({
            visible: true,
            x: e.clientX,
            y: e.clientY,
            cita: apt
          });
        }}
        onMouseLeave={() => {
          if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
          tooltipTimeoutRef.current = setTimeout(() => {
            setCitaTooltip({ visible: false, x: 0, y: 0, cita: null });
          }, 300);
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-black/10 pointer-events-none"></div>

        <div className={`absolute top-1 right-1 w-2 h-2 rounded-full ${styles.badge} 
                      border-1 border-white shadow-sm`}></div>

        {renderCitaContent()}

        <div className="absolute inset-0 opacity-0 group-hover:opacity-20 bg-white transition-opacity duration-150"></div>

        {isSelected && (
          <div className="absolute inset-0 border-1 border-white shadow-inner pointer-events-none"></div>
        )}
      </div>
    );
  });

  return (
    <div className="flex h-screen bg-gradient-to-br from-white to-gray-50/30">
      <Sidebar />

      <div className="flex-1 lg:ml-0 flex flex-col overflow-hidden">
        {/* HEADER - SIN SELECTOR DE SEDE (ahora está en la sidebar) */}
        <div className="bg-white/80 backdrop-blur-lg border-b border-gray-200/60 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <PageHeader
              title="Agenda"
              subtitle={`${formatDateDMY(selectedDate)} • ${selectedSede?.nombre || "Selecciona una sede"}${
                loading ? " · Actualizando..." : ""
              }${loadingBloqueos ? " · Bloqueos..." : ""}`}
              className="mb-0"
            />

            <div className="flex items-center gap-2">
              <button onClick={() => setSelectedDate(today)} disabled={loading} className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg text-xs hover:bg-gray-50 transition-colors flex items-center gap-1">
                <Calendar className="w-3 h-3" />Hoy
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* SIDEBAR IZQUIERDA - CON SELECTOR DE SEDE */}
          <div className="w-64 bg-gradient-to-b from-white to-gray-50 border-r border-gray-200 p-4 overflow-y-auto">
            <h2 className="text-lg font-bold text-gray-900 mb-3">Filtros</h2>

            {/* SELECTOR DE SEDE EN LA SIDEBAR */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-700 mb-2">Sede</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs bg-white shadow-sm focus:ring-1 focus:ring-gray-900 focus:border-gray-900 transition-all"
                value={selectedSede?._id || ''}
                onChange={(e) => {
                  const sede = sedes.find(s => s._id === e.target.value);
                  setSelectedSede(sede || null);
                }}
              >
                  <option value="">Selecciona una sede</option>
                  {sedes.map(sede => (
                    <option key={sede._id} value={sede._id}>
                      {formatSedeNombre(sede.nombre)}
                    </option>
                  ))}
                </select>
            </div>

            <div className="mb-4">
              <MiniCalendar />
            </div>

            <div className="mb-4">
              {estilistas.length === 0 && selectedSede && (
                <div className="mt-1 text-[10px] text-gray-600 bg-gray-50 px-2 py-1.5 rounded-lg">
                  No hay estilistas en esta sede
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl p-3 border border-gray-200 shadow-sm mb-3">
              <h3 className="font-semibold text-gray-900 mb-2 text-sm">Resumen del día</h3>
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs"><span className="text-gray-600">Citas:</span><span className="font-semibold text-gray-900">{appointments.length}</span></div>
                <div className="flex justify-between text-xs"><span className="text-gray-600">Estilistas:</span><span className="font-semibold text-gray-900">{estilistas.length}</span></div>
                <div className="flex justify-between text-xs"><span className="text-gray-600">Horas:</span><span className="font-semibold text-gray-900">{Math.round(appointments.reduce((acc, apt) => acc + apt.duracion, 0) / 60)}h</span></div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-3 border border-gray-200 shadow-sm mb-3">
              <h3 className="font-semibold text-gray-900 mb-2 text-sm">Estados</h3>
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
                  <span className="text-xs text-gray-700">Confirmada</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div>
                  <span className="text-xs text-gray-700">Reservada</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-purple-500"></div>
                  <span className="text-xs text-gray-700">Proceso</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>
                  <span className="text-xs text-gray-700">Cancelada</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-3 border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-gray-900 text-sm">Bloqueos</h3>
                <span className="text-[10px] text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded-full">
                  {bloqueos.length}
                </span>
              </div>
              {bloqueos.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-1.5">
                  No hay bloqueos
                </p>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {bloqueos.map((bloqueo) => {
                    const estilista = estilistas.find(e => e.profesional_id === bloqueo.profesional_id);
                    return (
                      <div key={bloqueo._id} className="p-1.5 bg-gray-50 border border-gray-100 rounded-lg">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-medium text-gray-700 truncate">
                            🔒 {bloqueo.motivo}
                          </span>
                        </div>
                        <div className="text-[10px] text-gray-600 mt-0.5">
                          <div className="flex justify-between">
                            <span className="truncate max-w-[70px]">{estilista?.nombre || bloqueo.profesional_id}</span>
                            <span>{bloqueo.hora_inicio}-{bloqueo.hora_fin}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {isInitialLoad && (
              <div className="mt-3 flex items-center justify-center gap-1 text-xs text-gray-600">
                <Loader2 className="w-3 h-3 animate-spin" />
                Cargando datos iniciales...
              </div>
            )}
            {loading && !isInitialLoad && (
              <div className="mt-3 flex items-center justify-center gap-1 text-xs text-gray-600">
                <Loader2 className="w-3 h-3 animate-spin" />
                Cargando...
              </div>
            )}
          </div>

          {/* CALENDARIO PRINCIPAL - EXACTAMENTE IGUAL */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-auto bg-white/60 backdrop-blur-sm">
              <div className="min-w-max">
                {/* ENCABEZADO DE ESTILISTAS */}
                <div className="flex bg-white/95 backdrop-blur-lg border-b border-gray-200/60 sticky top-0 z-20 shadow-sm">
                  <div className="w-16 flex-shrink-0" />
                  {profesionales.length > 0 ? (
                    <div className="flex">
                      {profesionales.map((prof) => (
                        <div key={prof.estilista.unique_key} className="w-24 flex-shrink-0 p-2 border-l border-gray-200/60 text-center bg-white/80">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 mx-auto mb-1 flex items-center justify-center text-xs font-bold text-white shadow-sm">{prof.initials}</div>
                          <div className="text-xs font-semibold text-gray-900 truncate px-1">{prof.name}</div>
                          <div className="text-[9px] text-gray-500 mt-0.5">{appointments.filter(apt => apt.profesional_id === prof.estilista.profesional_id).length} citas</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="w-full p-6 text-center">
                      {selectedSede ? (
                        <>
                          <div className="text-gray-500 text-sm mb-1">
                            No hay estilistas en esta sede
                          </div>
                          <div className="text-xs text-gray-400">
                            Agrega estilistas para comenzar a programar
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-gray-500 text-sm mb-1">
                            Selecciona una sede
                          </div>
                          <div className="text-xs text-gray-400">
                            Para ver los estilistas disponibles
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {profesionales.length > 0 && (
                  <div className="relative">
                    {HOURS.map((hour) => (
                      <div key={hour}
                        className={`flex border-b border-gray-100/80 group z-0 relative  ${HOURS.indexOf(hour) % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-gray-50/30 transition-colors`}>
                        <div className="w-16 flex-shrink-0 text-xs text-gray-600 p-2 text-right border-r border-gray-200/60 bg-white/95 backdrop-blur-sm sticky left-0 z-10 font-medium">{hour}</div>
                        {profesionales.map((prof) => (
                          <CalendarCell key={`${hour}-${prof.estilista.unique_key}`} prof={prof} hour={hour} />
                        ))}
                      </div>
                    ))}

                    {/* LÍNEA DE TIEMPO ACTUAL */}
                    {(() => {
                      const now = new Date();
                      const currentHour = now.getHours();
                      const currentMinute = now.getMinutes();
                      if (currentHour >= 5 && currentHour <= 19 && selectedDate.toDateString() === today.toDateString()) {
                        const minutesFrom5AM = (currentHour - 5) * 60 + currentMinute;
                        const top = (minutesFrom5AM / 30) * CELL_HEIGHT + HEADER_HEIGHT;
                        return (
                          <div className="absolute left-0 right-0 z-30 pointer-events-none" style={{ top: `${top}px` }}>
                            <div className="flex">
                              <div className="w-16 flex-shrink-0 flex items-center justify-end pr-2"><div className="w-2 h-2 bg-gray-900 rounded-full animate-pulse" /></div>
                              <div className="flex-1 border-t-1 border-gray-900 border-dashed" />
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}

                    {/* CITAS */}
                    <div className="absolute top-0 left-0 right-0 bottom-0 z-0 pointer-events-none">
                      {appointments.map((apt) => (
                        <CitaComponent 
                          key={`${apt.id}-${apt.start}-${apt.profesional_id}`} 
                          apt={apt}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* TOOLTIP DE CITA - EXACTAMENTE IGUAL */}
      {citaTooltip.visible && citaTooltip.cita && (
        <div
          className="fixed z-50 bg-white/95 backdrop-blur-xl border border-white/20 rounded-xl shadow-xl p-3 max-w-xs transform -translate-y-1/2 animate-in fade-in-0 zoom-in-95 duration-150"
          style={{
            left: `${Math.min(citaTooltip.x + 10, window.innerWidth - 320)}px`,
            top: `${citaTooltip.y}px`
          }}
          onMouseEnter={() => tooltipTimeoutRef.current && clearTimeout(tooltipTimeoutRef.current)}
          onMouseLeave={() => {
            if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
            setCitaTooltip({ visible: false, x: 0, y: 0, cita: null });
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-gradient-to-br from-gray-700 to-gray-900 rounded-lg flex items-center justify-center shadow-sm">
              <User className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-gray-900 text-sm truncate">
                {citaTooltip.cita.cliente_nombre}
              </h3>
              <p className="text-xs text-gray-600 truncate">
                {citaTooltip.cita.servicio_nombre}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <Clock className="w-3 h-3 text-gray-600" />
              <span className="font-medium text-gray-700">
                {citaTooltip.cita.start} - {citaTooltip.cita.end}
              </span>
              <span className="text-gray-500">({citaTooltip.cita.duracion}min)</span>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <svg className="w-3 h-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="text-gray-700 truncate">
                <strong>Estilista:</strong> {citaTooltip.cita.estilista_nombre}
              </span>
            </div>

            {citaTooltip.cita.notas_adicionales && (
              <div className="flex items-start gap-2 text-xs">
                <svg className="w-3 h-3 text-gray-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="text-gray-700 break-words">
                  <strong>Notas:</strong> {citaTooltip.cita.notas_adicionales}
                </span>
              </div>
            )}
          </div>

          <div className="mt-2 pt-2 border-t border-gray-100">
            <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium ${citaTooltip.cita.estado.toLowerCase() === 'confirmada' ? 'bg-green-100 text-green-700' :
              citaTooltip.cita.estado.toLowerCase() === 'reservada' ? 'bg-blue-100 text-blue-700' :
                citaTooltip.cita.estado.toLowerCase() === 'en proceso' ? 'bg-purple-100 text-purple-700' :
                  citaTooltip.cita.estado.toLowerCase() === 'cancelada' ? 'bg-red-100 text-red-700' :
                    'bg-gray-100 text-gray-700'
              }`}>
              <div className={`w-1.5 h-1.5 rounded-full ${citaTooltip.cita.estado.toLowerCase() === 'confirmada' ? 'bg-green-500' :
                citaTooltip.cita.estado.toLowerCase() === 'reservada' ? 'bg-blue-500' :
                  citaTooltip.cita.estado.toLowerCase() === 'en proceso' ? 'bg-purple-500' :
                    citaTooltip.cita.estado.toLowerCase() === 'cancelada' ? 'bg-red-500' :
                      'bg-gray-500'
                }`}></div>
              {citaTooltip.cita.estado}
            </div>
          </div>
        </div>
      )}

      {/* MODALES - EXACTAMENTE IGUAL */}
      {showBloqueoModal && (
        <Modal open={showBloqueoModal} onClose={handleClose} title="Bloqueo de horario">
          <Bloqueos
            onClose={handleBloqueoCreado}
            estilistaId={selectedCell?.estilista.profesional_id}
            fecha={selectedDateString}
            horaInicio={selectedCell?.hora}
          />
        </Modal>
      )}

      {showAppointmentModal && (
        <Modal open={showAppointmentModal} onClose={handleClose} title="Nueva Reserva" className="w-full max-w-[70vw] max-h-[85vh]">
          <div className="">
            <AppointmentScheduler
              sedeId={sedeIdActual}
              estilistaId={selectedCell?.estilista.profesional_id}
              fecha={selectedDateString}
              horaSeleccionada={selectedCell?.hora}
              estilistas={estilistas}
              onClose={handleCitaCreada}
            />
          </div>
        </Modal>
      )}

      {showAppointmentDetails && (
        <AppointmentDetailsModal
          open={showAppointmentDetails}
          onClose={() => {
            setShowAppointmentDetails(false);
            setSelectedAppointment(null);
          }}
          appointment={selectedAppointment}
          onRefresh={() => {
            // Invalidar caché de citas
            if (selectedSede) {
              const cacheKey = `citas_${selectedSede.sede_id}_${selectedDateString}`;
              dataCacheRef.current.delete(cacheKey);
            }
            cargarCitas();
            setRefreshTrigger(prev => prev + 1);
          }}
        />
      )}
    </div>
  );
};

export default React.memo(CalendarScheduler);
