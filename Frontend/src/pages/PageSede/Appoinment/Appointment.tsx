import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Calendar, Plus, User, Clock, X, Loader2, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
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
import { deleteBloqueo, getBloqueosEstilista, type Bloqueo } from '../../../components/Quotes/bloqueosApi';
import { formatDateDMY } from '../../../lib/dateFormat';
import { extractAgendaAdditionalNotes } from '../../../lib/agenda';

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
  cliente_telefono?: string;
  notas_adicionales?: string;
  servicios_resumen?: string;
  servicios_detalle?: string;
  rawData?: any;
}

interface BloqueoCalendario extends Bloqueo {
  _id: string;
}

interface EstilistaCompleto extends Estilista {
  servicios_no_presta: string[];
  especialidades: boolean;
  unique_key: string;
}

// Reducir horas mostradas o mantener todas pero con menos espacio
const SLOT_INTERVAL_MINUTES = 60;
const START_HOUR = 5;
const END_HOUR = 19;
const TIME_COLUMN_WIDTH = 64;
const APPOINTMENT_VERTICAL_OFFSET = 2;
const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => {
  const hour = START_HOUR + i;
  return `${hour.toString().padStart(2, '0')}:00`;
});

// COLORS PARA CITAS (SE MANTIENEN)
const COLORS = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-amber-500', 'bg-indigo-500', 'bg-teal-500', 'bg-pink-500', 'bg-cyan-500'];

const CELL_HEIGHT = 48;
const CELL_WIDTH = 104;
const MAX_STYLIST_COLUMN_WIDTH = 240;
const MIN_APPOINTMENT_HEIGHT = 44;
const APPOINTMENT_BORDER_WIDTH = 4;
const CITA_TOOLTIP_WIDTH = 300;
const BLOQUEO_TOOLTIP_WIDTH = 320;
const TOOLTIP_MARGIN = 10;

const getTextValue = (value: unknown): string => {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value).trim();
  return '';
};

const getFirstNonEmptyText = (...values: unknown[]): string => {
  for (const value of values) {
    const normalized = getTextValue(value);
    if (normalized) return normalized;
  }
  return '';
};

const extractClientName = (cita: any): string => {
  const nestedNombre = getFirstNonEmptyText(cita?.cliente?.nombre, cita?.cliente?.name);
  const nestedApellido = getFirstNonEmptyText(cita?.cliente?.apellido, cita?.cliente?.lastName);
  const nestedFullName = [nestedNombre, nestedApellido].filter(Boolean).join(' ').trim();

  return getFirstNonEmptyText(
    cita?.cliente_nombre,
    cita?.clientName,
    cita?.nombre_cliente,
    cita?.clienteName,
    nestedFullName,
    nestedNombre
  ) || '(Sin nombre)';
};

const extractProfessionalName = (cita: any): string => {
  const nestedName = getFirstNonEmptyText(cita?.profesional?.nombre, cita?.estilista?.nombre);
  return getFirstNonEmptyText(
    cita?.profesional_nombre,
    cita?.estilista_nombre,
    cita?.professionalName,
    cita?.nombre_profesional,
    nestedName
  ) || '(Sin profesional)';
};

const extractClientPhone = (cita: any): string => {
  return getFirstNonEmptyText(
    cita?.cliente_telefono,
    cita?.telefono_cliente,
    cita?.cliente?.telefono,
    cita?.cliente?.phone,
    cita?.telefono
  );
};

const extractServicesInfo = (cita: any): { detalle: string; resumen: string } => {
  const servicesSet = new Set<string>();

  const directService = getFirstNonEmptyText(
    cita?.servicio_nombre,
    cita?.serviceName,
    cita?.nombre_servicio,
    cita?.tipo_servicio
  );
  if (directService) servicesSet.add(directService);

  const servicios = Array.isArray(cita?.servicios) ? cita.servicios : [];
  servicios.forEach((servicio: any) => {
    const nombreServicio = typeof servicio === 'string'
      ? getTextValue(servicio)
      : getFirstNonEmptyText(
        servicio?.nombre,
        servicio?.servicio_nombre,
        servicio?.name,
        servicio?.titulo
      );
    if (nombreServicio) {
      servicesSet.add(nombreServicio);
    }
  });

  const serviciosList = Array.from(servicesSet);
  if (serviciosList.length === 0) {
    return {
      detalle: '(Sin servicio)',
      resumen: '(Sin servicio)'
    };
  }

  return {
    detalle: serviciosList.join(', '),
    resumen: serviciosList.length > 1 ? `${serviciosList[0]} +${serviciosList.length - 1}` : serviciosList[0]
  };
};

const supportsHoverTooltips = (): boolean => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
};

const CalendarScheduler: React.FC = () => {
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedSede, setSelectedSede] = useState<Sede | null>(null);
  const [selectedEstilista, setSelectedEstilista] = useState<EstilistaCompleto | null>(null);
  const [estilistas, setEstilistas] = useState<EstilistaCompleto[]>([]);
  const [citas, setCitas] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [_, setShowOptions] = useState(false);
  const [showBloqueoModal, setShowBloqueoModal] = useState(false);
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{ estilista: EstilistaCompleto, hora: string } | null>(null);
  const [citaTooltip, setCitaTooltip] = useState({ visible: false, x: 0, y: 0, cita: null as Appointment | null });
  const [bloqueoTooltip, setBloqueoTooltip] = useState({
    visible: false,
    x: 0,
    y: 0,
    bloqueo: null as BloqueoCalendario | null,
    profesional: "",
  });
  // const [hoveredCell, setHoveredCell] = useState<{ estilista: EstilistaCompleto, hora: string } | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showAppointmentDetails, setShowAppointmentDetails] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [bloqueos, setBloqueos] = useState<BloqueoCalendario[]>([]);
  const [loadingBloqueos, setLoadingBloqueos] = useState(false);
  const [selectedBloqueo, setSelectedBloqueo] = useState<BloqueoCalendario | null>(null);
  const [deletingBloqueoId, setDeletingBloqueoId] = useState<string | null>(null);
  const [calendarViewportWidth, setCalendarViewportWidth] = useState(0);

  const optionsRef = useRef<HTMLDivElement>(null);
  const tooltipTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const calendarViewportRef = useRef<HTMLDivElement | null>(null);


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

  const handleCitaClick = useCallback((apt: Appointment) => {
    console.log('Cita clickeada:', apt);
    setSelectedAppointment(apt);
    setShowAppointmentDetails(true);
  }, []);

  // Paleta acordada: naranja = finalizada, gris = completada/facturada, rojo = cancelada, verde = agendada, amarillo = no show
  type EstadoCategoria = 'agendada' | 'finalizado' | 'facturado' | 'cancelado' | 'no_show' | 'default';

  const ESTADO_STYLE_MAP: Record<EstadoCategoria, {
    label: string;
    solidBg: string;
    selectedBg: string;
    hover: string;
    border: string;
    icon: string;
    chipBg: string;
    chipText: string;
    chipDot: string;
  }> = {
    agendada: {
      label: 'Agendada / Confirmada',
      solidBg: 'bg-green-500',
      selectedBg: 'bg-green-400',
      hover: 'hover:bg-green-600',
      border: 'border-green-600',
      icon: '✓',
      chipBg: 'bg-green-100',
      chipText: 'text-green-700',
      chipDot: 'bg-green-500',
    },
    // Finalizada -> naranja
    finalizado: {
      label: 'Finalizada',
      solidBg: 'bg-orange-500',
      selectedBg: 'bg-orange-400',
      hover: 'hover:bg-orange-600',
      border: 'border-orange-600',
      icon: '✓',
      chipBg: 'bg-orange-100',
      chipText: 'text-orange-800',
      chipDot: 'bg-orange-500',
    },
    // Completada / Facturada -> gris
    facturado: {
      label: 'Completada / Facturada',
      solidBg: 'bg-gray-500',
      selectedBg: 'bg-gray-400',
      hover: 'hover:bg-gray-600',
      border: 'border-gray-600',
      icon: '💵',
      chipBg: 'bg-gray-100',
      chipText: 'text-gray-700',
      chipDot: 'bg-gray-500',
    },
    cancelado: {
      label: 'Cancelado',
      solidBg: 'bg-red-500',
      selectedBg: 'bg-red-400',
      hover: 'hover:bg-red-600',
      border: 'border-red-600',
      icon: '✗',
      chipBg: 'bg-red-100',
      chipText: 'text-red-700',
      chipDot: 'bg-red-500',
    },
    no_show: {
      label: 'No asistió',
      solidBg: 'bg-yellow-500',
      selectedBg: 'bg-yellow-400',
      hover: 'hover:bg-yellow-600',
      border: 'border-yellow-600',
      icon: '⚠',
      chipBg: 'bg-yellow-100',
      chipText: 'text-yellow-800',
      chipDot: 'bg-yellow-500',
    },
    default: {
      label: 'Agendada',
      solidBg: 'bg-green-500',
      selectedBg: 'bg-green-400',
      hover: 'hover:bg-green-600',
      border: 'border-green-600',
      icon: '•',
      chipBg: 'bg-green-100',
      chipText: 'text-green-700',
      chipDot: 'bg-green-500',
    },
  };

  const resolveEstadoCategoria = (estado: string): EstadoCategoria => {
    const value = (estado || '').toLowerCase().trim();

    if (value.includes('cancel')) return 'cancelado';
    if (value.includes('factur')) return 'facturado';
    if (
      value.includes('no asist') ||
      value.includes('no_asist') ||
      value.includes('no-show') ||
      value.includes('no_show')
    ) return 'no_show';
    // Finalizada -> naranja
    if (['finalizado', 'finalizada', 'terminado', 'terminada', 'realizado', 'realizada'].some(flag => value.includes(flag))) {
      return 'finalizado';
    }
    // Completada -> gris (mismo estilo facturado)
    if (['completado', 'completada'].some(flag => value.includes(flag))) {
      return 'facturado';
    }
    if (['confirmada', 'confirmado', 'agendada', 'agendado', 'reservada', 'reservado', 'pendiente', 'en proceso', 'en_proceso', 'proceso'].some(flag => value.includes(flag))) {
      return 'agendada';
    }
    return 'default';
  };

  const getEstadoTokens = (estado: string) => {
    const key = resolveEstadoCategoria(estado);
    const palette = ESTADO_STYLE_MAP[key] || ESTADO_STYLE_MAP.default;
    return { key, ...palette };
  };

  const getCitaStyles = (estado: string, isSelected: boolean = false) => {
    const tokens = getEstadoTokens(estado);
    const baseBg = tokens.solidBg || 'bg-emerald-500';
    const selectedBg = tokens.selectedBg || baseBg;
    const baseBorder = tokens.border || 'border-emerald-600';
    return {
      bg: isSelected ? selectedBg : baseBg,
      hover: tokens.hover,
      border: isSelected ? 'border border-white' : baseBorder,
      text: 'text-white',
      icon: tokens.icon,
      shadow: isSelected ? 'shadow ring-1 ring-white ring-opacity-50' : 'shadow-sm',
      chipBg: tokens.chipBg,
      chipText: tokens.chipText,
      chipDot: tokens.chipDot,
      label: tokens.label,
    };
  };

  const cargarBloqueos = useCallback(async () => {
    if (!user?.access_token || !selectedSede || estilistas.length === 0) return;

    setLoadingBloqueos(true);
    try {
      let todosBloqueos: Bloqueo[] = [];

      console.log('🔍 CARGANDO BLOQUEOS PARA:', {
        sede: selectedSede.nombre,
        estilistasCount: estilistas.length,
        estilistaIds: estilistas.map(e => e.profesional_id)
      });

      if (estilistas.length > 0) {
        const bloqueosPromises = estilistas.map(async (estilista) => {
          try {
            console.log(`📡 Solicitando bloqueos para estilista: ${estilista.nombre} (${estilista.profesional_id})`);
            const bloqueosEstilista = await getBloqueosEstilista(estilista.profesional_id, user.access_token);
            console.log(`✅ Bloqueos recibidos para ${estilista.nombre}:`, bloqueosEstilista?.length || 0);
            return Array.isArray(bloqueosEstilista) ? bloqueosEstilista : [];
          } catch (error) {
            console.error(`❌ Error cargando bloqueos para ${estilista.nombre}:`, error);
            return [];
          }
        });

        const resultados = await Promise.all(bloqueosPromises);
        todosBloqueos = resultados.flat();
      }

      console.log('📊 TOTAL DE BLOQUEOS SIN FILTRAR:', todosBloqueos.length);

      const bloqueosFiltrados = todosBloqueos.filter(bloqueo => {
        try {
          let fechaBloqueo: string;

          if (bloqueo.fecha.includes('T')) {
            fechaBloqueo = bloqueo.fecha.split('T')[0];
          } else {
            fechaBloqueo = bloqueo.fecha;
          }

          const coincide = fechaBloqueo === selectedDateString;

          if (coincide) {
            console.log('✅ Bloqueo coincide con fecha:', {
              fechaBloqueo,
              selectedDateString,
              estilista: bloqueo.profesional_id,
              horario: `${bloqueo.hora_inicio}-${bloqueo.hora_fin}`,
              motivo: bloqueo.motivo
            });
          }

          return coincide;
        } catch (error) {
          console.error('Error procesando fecha del bloqueo:', error, bloqueo);
          return false;
        }
      });

      const bloqueosConId: BloqueoCalendario[] = bloqueosFiltrados.filter(
        (bloqueo): bloqueo is BloqueoCalendario =>
          typeof bloqueo._id === 'string' && bloqueo._id.trim().length > 0
      );

      console.log('🔒 BLOQUEOS CARGADOS Y FILTRADOS:', {
        total: todosBloqueos.length,
        filtrados: bloqueosConId.length,
        fecha: selectedDateString,
        sede: selectedSede.nombre,
        detalles: bloqueosConId.map(b => ({
          id: b._id,
          estilista: b.profesional_id,
          horario: `${b.hora_inicio} - ${b.hora_fin}`,
          motivo: b.motivo,
          fecha: b.fecha
        }))
      });

      setBloqueos(bloqueosConId);
    } catch (error) {
      console.error('Error general cargando bloqueos:', error);
      setBloqueos([]);
    } finally {
      setLoadingBloqueos(false);
    }
  }, [estilistas, user, selectedDateString, selectedSede]);

  useEffect(() => {
    if (estilistas.length > 0 && selectedSede) {
      cargarBloqueos();
    } else {
      setBloqueos([]);
    }
  }, [cargarBloqueos, estilistas, selectedSede]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (optionsRef.current && !optionsRef.current.contains(event.target as Node)) {
        setShowOptions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    return () => {
      if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
    };
  }, []);

  const cargarDatos = useCallback(async () => {
    if (!user?.access_token) return;

    setLoading(true);
    try {
      const [sedesData, citasData] = await Promise.all([
        getSedes(user.access_token),
        getCitas({}, user.access_token)
      ]);

      let citasFiltradas = citasData.citas || citasData || [];

      if (user.sede_id) {
        citasFiltradas = citasFiltradas.filter((cita: any) => {
          return cita.sede_id === user.sede_id;
        });
      }

      setCitas(citasFiltradas);

      if (sedesData.length > 0) {
        const sedeUsuario = sedesData.find(sede => sede.sede_id === user.sede_id);
        if (sedeUsuario) {
          setSelectedSede(sedeUsuario);
          console.log('✅ Sede del usuario establecida:', sedeUsuario.nombre);
        } else {
          setSelectedSede(sedesData[0]);
        }
      }
    } catch (error) {
      console.error('Error cargando datos:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const cargarEstilistas = useCallback(async () => {
    if (!user?.access_token) {
      setEstilistas([]);
      setSelectedEstilista(null);
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
          if (user.sede_id) {
            return est?.sede_id === user.sede_id;
          }
          return true;
        })
        .map(est => ({
          ...est,
          servicios_no_presta: est.servicios_no_presta || [],
          especialidades: est.especialidades || false,
          unique_key: `stylist-${est.profesional_id}`
        } as EstilistaCompleto));

      console.log('👨‍💼 ESTRUCTURA COMPLETA DE ESTILISTAS:', estilistasFiltrados.map(e => ({
        nombre: e.nombre,
        profesional_id: e.profesional_id,
        _id: e._id,
        sede_id: e.sede_id,
        esDeSedeUsuario: e.sede_id === user.sede_id
      })));

      console.log('🔍 FILTRO APLICADO:', {
        sedeUsuario: user.sede_id,
        totalEstilistas: estilistasData.length,
        estilistasFiltrados: estilistasFiltrados.length
      });

      setEstilistas(estilistasFiltrados);
    } catch (error) {
      console.error('Error cargando estilistas:', error);
      setEstilistas([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const cargarCitas = useCallback(async () => {
    if (!user?.access_token) return;

    setLoading(true);
    try {
      const params: any = { fecha: selectedDateString };

      if (user.sede_id) {
        params.sede_id = user.sede_id;
      }

      if (selectedEstilista) params.profesional_id = selectedEstilista.profesional_id;

      const response = await getCitas(params, user.access_token);
      let citasFiltradas = response.citas || response || [];

      if (user.sede_id) {
        citasFiltradas = citasFiltradas.filter((cita: any) => {
          return cita.sede_id === user.sede_id;
        });
      }

      setCitas(citasFiltradas);
    } catch (error) {
      console.error('Error al cargar citas:', error);
      setCitas([]);
    } finally {
      setLoading(false);
    }
  }, [selectedDateString, selectedEstilista, user]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  useEffect(() => {
    cargarEstilistas();
  }, [cargarEstilistas]);

  useEffect(() => {
    cargarCitas();
  }, [cargarCitas, refreshTrigger]);

  const profesionales = useMemo(() => {
    const result = estilistas.map(est => ({
      name: est.nombre,
      initials: est.nombre.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2),
      estilista: est
    }));

    console.log('👥 PROFESIONALES CALCULADOS:', {
      count: result.length,
      nombres: result.map(p => p.name),
      ids: result.map(p => p.estilista.profesional_id)
    });

    return result;
  }, [estilistas]);

  useEffect(() => {
    const element = calendarViewportRef.current;
    if (!element) return;

    const updateWidth = () => {
      setCalendarViewportWidth(element.clientWidth);
    };

    updateWidth();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => updateWidth());
      observer.observe(element);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, [profesionales.length]);

  const effectiveCellWidth = useMemo(() => {
    if (profesionales.length === 0) return CELL_WIDTH;
    const availableWidth = Math.max(calendarViewportWidth - TIME_COLUMN_WIDTH, 0);
    if (availableWidth <= 0) return CELL_WIDTH;
    const expandedWidth = Math.max(CELL_WIDTH, availableWidth / profesionales.length);
    return Math.min(expandedWidth, MAX_STYLIST_COLUMN_WIDTH);
  }, [calendarViewportWidth, profesionales.length]);

  const getTooltipLeft = useCallback((cursorX: number, tooltipWidth: number) => {
    if (typeof window === "undefined") return cursorX + TOOLTIP_MARGIN;
    const preferredRight = cursorX + TOOLTIP_MARGIN;
    const maxLeft = window.innerWidth - tooltipWidth - TOOLTIP_MARGIN;

    if (preferredRight <= maxLeft) return preferredRight;
    return Math.max(cursorX - tooltipWidth - TOOLTIP_MARGIN, TOOLTIP_MARGIN);
  }, []);

  const clearHoverTooltips = useCallback(() => {
    if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
    setCitaTooltip((prev) => (prev.visible ? { visible: false, x: 0, y: 0, cita: null } : prev));
    setBloqueoTooltip((prev) => (
      prev.visible
        ? { visible: false, x: 0, y: 0, bloqueo: null, profesional: "" }
        : prev
    ));
  }, []);

  const handleCalendarMouseMove = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!supportsHoverTooltips()) return;
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const hoveringAgendaModule = Boolean(
      target.closest('[data-hover-source="appointment"], [data-hover-source="bloqueo"]')
    );
    if (!hoveringAgendaModule) {
      clearHoverTooltips();
    }
  }, [clearHoverTooltips]);

  const handleCalendarMouseLeave = useCallback(() => {
    if (!supportsHoverTooltips()) return;
    clearHoverTooltips();
  }, [clearHoverTooltips]);

  const professionalsTrackWidth = useMemo(
    () => effectiveCellWidth * profesionales.length,
    [effectiveCellWidth, profesionales.length]
  );

  const calendarMinWidth = useMemo(
    () => Math.max(TIME_COLUMN_WIDTH + professionalsTrackWidth, calendarViewportWidth || 0),
    [calendarViewportWidth, professionalsTrackWidth]
  );

  const appointmentLayoutByProfessional = useMemo(() => {
    type AppointmentLayoutItem = {
      key: string;
      start: number;
      end: number;
    };
    type AppointmentLayoutInfo = {
      column: number;
      columns: number;
      start: number;
      end: number;
    };

    const groupedByProfessional = new Map<string, AppointmentLayoutItem[]>();
    const normalizedDate = (value: unknown): string => {
      const raw = String(value || "").trim();
      if (!raw) return "";
      if (raw.includes("T")) return raw.split("T")[0];
      if (raw.includes(" ")) return raw.split(" ")[0];
      return raw;
    };

    const parseMinutesFromStart = (timeValue: unknown): number | null => {
      const raw = String(timeValue || "").trim();
      if (!raw) return null;
      const [hours, minutes] = raw.split(":").map(Number);
      if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
      return (hours - START_HOUR) * 60 + minutes;
    };

    (citas || []).forEach((cita: any) => {
      const fecha = normalizedDate(cita?.fecha);
      if (fecha !== selectedDateString) return;

      const profesionalId = String(cita?.profesional_id || "").trim();
      if (!profesionalId) return;

      const start = parseMinutesFromStart(cita?.hora_inicio);
      const end = parseMinutesFromStart(cita?.hora_fin);
      if (start === null || end === null || end <= start) return;

      const citaId = String(cita?._id || "").trim();
      if (!citaId) return;

      const key = `${citaId}-${cita.hora_inicio}-${cita.hora_fin}-${profesionalId}`;
      const list = groupedByProfessional.get(profesionalId) || [];
      list.push({ key, start, end });
      groupedByProfessional.set(profesionalId, list);
    });

    const layoutByProfessional = new Map<string, Map<string, AppointmentLayoutInfo>>();

    groupedByProfessional.forEach((items, profesionalId) => {
      const sortedItems = [...items].sort((a, b) =>
        a.start - b.start || a.end - b.end || a.key.localeCompare(b.key)
      );

      const layoutMap = new Map<string, AppointmentLayoutInfo>();
      let group: AppointmentLayoutItem[] = [];
      let groupEnd = -Infinity;

      const commitGroup = () => {
        if (group.length === 0) return;

        const columnsEnd: number[] = [];
        const assignedColumns = new Map<string, number>();

        group.forEach((item) => {
          let columnIndex = columnsEnd.findIndex((columnEnd) => columnEnd <= item.start);
          if (columnIndex === -1) {
            columnIndex = columnsEnd.length;
            columnsEnd.push(item.end);
          } else {
            columnsEnd[columnIndex] = item.end;
          }

          assignedColumns.set(item.key, columnIndex);
        });

        const totalColumns = Math.max(columnsEnd.length, 1);
        group.forEach((item) => {
          layoutMap.set(item.key, {
            column: assignedColumns.get(item.key) ?? 0,
            columns: totalColumns,
            start: item.start,
            end: item.end,
          });
        });
      };

      sortedItems.forEach((item) => {
        if (group.length === 0) {
          group = [item];
          groupEnd = item.end;
          return;
        }

        if (item.start < groupEnd) {
          group.push(item);
          groupEnd = Math.max(groupEnd, item.end);
          return;
        }

        commitGroup();
        group = [item];
        groupEnd = item.end;
      });

      commitGroup();
      layoutByProfessional.set(profesionalId, layoutMap);
    });

    return layoutByProfessional;
  }, [citas, selectedDateString]);

  const getAppointmentPosition = useCallback((apt: Appointment) => {
    console.log(`\n📐 CALCULANDO POSICIÓN PARA: ${apt.cliente_nombre} (${apt.profesional})`);

    const citaProfesionalId = apt.profesional_id || apt.rawData?.profesional_id;
    const profIndex = profesionales.findIndex(p => {
      const estilistaId = p.estilista.profesional_id;
      return citaProfesionalId === estilistaId;
    });

    if (profIndex === -1) {
      console.log(`❌ PROFESIONAL NO ENCONTRADO PARA: ${apt.cliente_nombre}`);
      console.log(`ID en cita: ${apt.profesional_id || apt.rawData?.profesional_id}`);
      console.log(`📋 ESTILISTAS DISPONIBLES:`, profesionales.map(p => ({
        id: p.estilista.profesional_id,
        nombre: p.name
      })));
      return null;
    }

    console.log(`✅ ENCONTRADO: ${apt.profesional} en índice ${profIndex}`);

    const [startHour, startMin] = apt.start.split(':').map(Number);
    const [endHour, endMin] = apt.end.split(':').map(Number);

    const startMinutesFrom5AM = (startHour - START_HOUR) * 60 + startMin;
    const endMinutesFrom5AM = (endHour - START_HOUR) * 60 + endMin;

    const startBlock = startMinutesFrom5AM / SLOT_INTERVAL_MINUTES;
    const endBlock = endMinutesFrom5AM / SLOT_INTERVAL_MINUTES;
    const totalBlocks = endBlock - startBlock;

    const tieneBloqueoSolapado = bloqueos.some((bloqueo) => {
      if (bloqueo.profesional_id !== citaProfesionalId) return false;

      const [bloqueoStartHour, bloqueoStartMin] = bloqueo.hora_inicio.split(':').map(Number);
      const [bloqueoEndHour, bloqueoEndMin] = bloqueo.hora_fin.split(':').map(Number);
      if ([bloqueoStartHour, bloqueoStartMin, bloqueoEndHour, bloqueoEndMin].some(Number.isNaN)) return false;

      const bloqueoInicio = (bloqueoStartHour - START_HOUR) * 60 + bloqueoStartMin;
      const bloqueoFin = (bloqueoEndHour - START_HOUR) * 60 + bloqueoEndMin;

      return startMinutesFrom5AM < bloqueoFin && endMinutesFrom5AM > bloqueoInicio;
    });

    const eventHeight = Math.max(totalBlocks * CELL_HEIGHT - 4, MIN_APPOINTMENT_HEIGHT);

    const aptKey = `${apt.id}-${apt.start}-${apt.end}-${citaProfesionalId}`;
    const layoutInfo = appointmentLayoutByProfessional.get(citaProfesionalId)?.get(aptKey);
    const appointmentColumnIndex = layoutInfo?.column ?? 0;
    const appointmentColumns = Math.max(layoutInfo?.columns ?? 1, 1);

    const baseLeft = profIndex * effectiveCellWidth;
    const topPosition = (startBlock * CELL_HEIGHT) + APPOINTMENT_VERTICAL_OFFSET;
    const anchoTotalCelda = effectiveCellWidth - APPOINTMENT_BORDER_WIDTH;
    const totalColumns = appointmentColumns + (tieneBloqueoSolapado ? 1 : 0);
    const anchoCita = Math.max(anchoTotalCelda / totalColumns, 24);
    const leftPosition = baseLeft + (appointmentColumnIndex * anchoCita);

    const position = {
      left: leftPosition,
      top: topPosition,
      height: eventHeight,
      width: anchoCita,
    };

    console.log(`✅ POSICIÓN CALCULADA:`, {
      profesional: apt.profesional,
      index: profIndex,
      start: apt.start,
      end: apt.end,
      startBlock,
      endBlock,
      totalBlocks,
      minHeight: eventHeight,
      leftPosition,
      topPosition,
      tieneBloqueoSolapado,
      appointmentColumnIndex,
      appointmentColumns,
      columnaHoras: 64,
      cellWidth: effectiveCellWidth
    });

    return position;
  }, [profesionales, bloqueos, appointmentLayoutByProfessional, effectiveCellWidth]);

  const appointments = useMemo(() => {
    console.log('🔍 PROCESANDO CITAS CON DATOS COMPLETOS DEL BACKEND');

    if (!citas.length) {
      console.log('❌ No hay citas para procesar');
      return [];
    }

    const citasFiltradas = citas.filter(cita => {
      return cita.fecha === selectedDateString;
    });

    console.log('📋 CITAS FILTRADAS PARA FECHA:', citasFiltradas.length);
    console.log('📊 DETALLE DE CITAS:', citasFiltradas.map(cita => ({
      id: cita._id,
      cliente: cita.cliente_nombre,
      servicio: cita.servicio_nombre,
      estilista: cita.profesional_nombre,
      estilista_id: cita.profesional_id,
      sede_id: cita.sede_id,
      horario: `${cita.hora_inicio} - ${cita.hora_fin}`,
      rawData: cita
    })));

    const appointmentsResult = citasFiltradas.map((cita, index) => {
      const clienteNombre = extractClientName(cita);
      const profesionalNombre = extractProfessionalName(cita);
      const servicesInfo = extractServicesInfo(cita);
      const estado = getFirstNonEmptyText(cita?.estado, cita?.status, cita?.estado_cita) || 'pendiente';

      console.log(`📝 CITA ${index + 1}:`, {
        cliente: clienteNombre,
        servicio: servicesInfo.detalle,
        estilista: profesionalNombre,
        estilista_id: cita.profesional_id,
        sede_id: cita.sede_id,
        horario: `${cita.hora_inicio} - ${cita.hora_fin}`,
        rawData: cita
      });

      const estilistaIndex = estilistas.findIndex(e =>
        e.profesional_id === cita.profesional_id
      );

      console.log(`🎯 BUSCANDO ESTILISTA ID: ${cita.profesional_id}`);
      console.log(`✅ ÍNDICE ENCONTRADO: ${estilistaIndex}`);

      const colorIndex = estilistaIndex >= 0 ? estilistaIndex % COLORS.length : index % COLORS.length;
      const colorClass = COLORS[colorIndex];

      const parseTime = (time: string) => {
        const [hours, minutes] = time.split(':').map(Number);
        return (hours - START_HOUR) * 60 + minutes;
      };

      const startMinutes = parseTime(cita.hora_inicio);
      const endMinutes = parseTime(cita.hora_fin);
      const duracion = Math.max(0, endMinutes - startMinutes);

      const appointment = {
        id: cita._id,
        title: clienteNombre,
        profesional: profesionalNombre,
        start: cita.hora_inicio,
        end: cita.hora_fin,
        color: colorClass,
        tipo: servicesInfo.resumen,
        duracion: duracion,
        precio: 0,
        cliente_nombre: clienteNombre,
        servicio_nombre: servicesInfo.detalle,
        servicios_resumen: servicesInfo.resumen,
        servicios_detalle: servicesInfo.detalle,
        estilista_nombre: profesionalNombre,
        cliente_telefono: extractClientPhone(cita),
        estado,
        profesional_id: cita.profesional_id,
        notas_adicionales: extractAgendaAdditionalNotes(cita),
        rawData: cita
      };

      return appointment;
    });

    console.log('✅ APPOINTMENTS PROCESADOS:', appointmentsResult.length);

    return appointmentsResult;
  }, [citas, selectedDateString, estilistas]);

  const getBloqueoPosition = useCallback((bloqueo: BloqueoCalendario) => {
    const profIndex = profesionales.findIndex(
      (profesional) => profesional.estilista.profesional_id === bloqueo.profesional_id
    );

    if (profIndex === -1) return null;

    const [startHour, startMin] = bloqueo.hora_inicio.split(':').map(Number);
    const [endHour, endMin] = bloqueo.hora_fin.split(':').map(Number);
    if ([startHour, startMin, endHour, endMin].some(Number.isNaN)) return null;

    const startMinutesFrom5AM = (startHour - START_HOUR) * 60 + startMin;
    const endMinutesFrom5AM = (endHour - START_HOUR) * 60 + endMin;
    const startBlock = startMinutesFrom5AM / SLOT_INTERVAL_MINUTES;
    const endBlock = endMinutesFrom5AM / SLOT_INTERVAL_MINUTES;
    const totalBlocks = Math.max(endBlock - startBlock, 1);

    const layoutMap = appointmentLayoutByProfessional.get(bloqueo.profesional_id);
    let maxAppointmentColumns = 0;
    if (layoutMap) {
      layoutMap.forEach((layoutInfo) => {
        const overlaps =
          startMinutesFrom5AM < layoutInfo.end &&
          endMinutesFrom5AM > layoutInfo.start;
        if (overlaps) {
          maxAppointmentColumns = Math.max(maxAppointmentColumns, layoutInfo.columns);
        }
      });
    }

    const anchoTotalCelda = effectiveCellWidth - APPOINTMENT_BORDER_WIDTH;
    const totalColumns = maxAppointmentColumns > 0 ? maxAppointmentColumns + 1 : 1;
    const anchoBloqueo = Math.max(anchoTotalCelda / totalColumns, 24);
    const leftBase = profIndex * effectiveCellWidth;
    const leftPosition = maxAppointmentColumns > 0
      ? leftBase + anchoTotalCelda - anchoBloqueo
      : leftBase;

    return {
      left: leftPosition,
      top: (startBlock * CELL_HEIGHT) + APPOINTMENT_VERTICAL_OFFSET,
      height: Math.max(totalBlocks * CELL_HEIGHT - 4, 40),
      width: anchoBloqueo,
    };
  }, [profesionales, appointmentLayoutByProfessional, effectiveCellWidth]);

  const handleClose = useCallback(() => {
    if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
    setShowAppointmentModal(false);
    setShowBloqueoModal(false);
    setSelectedCell(null);
    setSelectedBloqueo(null);
    setShowOptions(false);
    setCitaTooltip({ visible: false, x: 0, y: 0, cita: null });
    setBloqueoTooltip({ visible: false, x: 0, y: 0, bloqueo: null, profesional: "" });
  }, []);

  const handleCitaCreada = useCallback(() => {
    console.log('🔄 Recargando citas después de crear nueva cita...');
    cargarCitas();
    cargarEstilistas();
    setRefreshTrigger(prev => prev + 1);
    handleClose();
  }, [cargarCitas, cargarEstilistas, handleClose]);

  const handleBloqueoCreado = useCallback(() => {
    cargarCitas();
    cargarEstilistas();
    cargarBloqueos();
    setRefreshTrigger(prev => prev + 1);
    handleClose();
  }, [cargarCitas, cargarEstilistas, cargarBloqueos, handleClose]);

  const handleEliminarBloqueo = useCallback(async (bloqueo: BloqueoCalendario) => {
    if (!bloqueo?._id) {
      alert('No se encontró el ID del bloqueo.');
      return;
    }

    if (!user?.access_token) {
      alert('No hay token de autenticación.');
      return;
    }

    const estilista = estilistas.find((item) => item.profesional_id === bloqueo.profesional_id);
    const nombreEstilista = estilista?.nombre || bloqueo.profesional_id;
    const confirmar = window.confirm(
      `¿Eliminar este bloqueo?\n\nEstilista: ${nombreEstilista}\nHorario: ${bloqueo.hora_inicio} - ${bloqueo.hora_fin}\nMotivo: ${bloqueo.motivo}`
    );

    if (!confirmar) return;

    setDeletingBloqueoId(bloqueo._id);

    try {
      await deleteBloqueo(bloqueo._id, user.access_token);

      setBloqueos((prev) => prev.filter((item) => item._id !== bloqueo._id));
      if (selectedBloqueo?._id === bloqueo._id) {
        setSelectedBloqueo(null);
      }

      await cargarBloqueos();
      setRefreshTrigger((prev) => prev + 1);
      alert('✅ Bloqueo eliminado correctamente');
    } catch (error) {
      console.error('Error eliminando bloqueo desde admin sede:', error);
      alert(`❌ ${error instanceof Error ? error.message : 'No se pudo eliminar el bloqueo'}`);
    } finally {
      setDeletingBloqueoId(null);
    }
  }, [user?.access_token, estilistas, selectedBloqueo, cargarBloqueos]);

  const overlapsSlot = useCallback((startMinutes: number, endMinutes: number, slotStartMinutes: number) => {
    const slotEndMinutes = slotStartMinutes + SLOT_INTERVAL_MINUTES;
    return startMinutes < slotEndMinutes && endMinutes > slotStartMinutes;
  }, []);

  const getBloqueosEnSlot = useCallback((profesionalId: string, hora: string): BloqueoCalendario[] => {
    const [blockHour, blockMin] = hora.split(':').map(Number);
    if (Number.isNaN(blockHour) || Number.isNaN(blockMin)) return [];

    const blockMinutesFrom5AM = (blockHour - START_HOUR) * 60 + blockMin;

    return bloqueos.filter((bloqueo) => {
      if (bloqueo.profesional_id !== profesionalId) return false;

      const [startHour, startMin] = bloqueo.hora_inicio.split(':').map(Number);
      const [endHour, endMin] = bloqueo.hora_fin.split(':').map(Number);

      if ([startHour, startMin, endHour, endMin].some(Number.isNaN)) return false;

      const startMinutesFrom5AM = (startHour - START_HOUR) * 60 + startMin;
      const endMinutesFrom5AM = (endHour - START_HOUR) * 60 + endMin;

      return overlapsSlot(startMinutesFrom5AM, endMinutesFrom5AM, blockMinutesFrom5AM);
    });
  }, [bloqueos, overlapsSlot]);

  const getCitaEnSlot = useCallback((profesionalId: string, hora: string): Appointment | null => {
    const [blockHour, blockMin] = hora.split(':').map(Number);
    if (Number.isNaN(blockHour) || Number.isNaN(blockMin)) return null;

    const blockMinutesFrom5AM = (blockHour - START_HOUR) * 60 + blockMin;

    return appointments.find((apt) => {
      const aptProfesionalId = apt.profesional_id || apt.rawData?.profesional_id;
      if (aptProfesionalId !== profesionalId) return false;

      const [startHour, startMin] = apt.start.split(':').map(Number);
      const [endHour, endMin] = apt.end.split(':').map(Number);
      if ([startHour, startMin, endHour, endMin].some(Number.isNaN)) return false;

      const startMinutesFrom5AM = (startHour - START_HOUR) * 60 + startMin;
      const endMinutesFrom5AM = (endHour - START_HOUR) * 60 + endMin;

      return overlapsSlot(startMinutesFrom5AM, endMinutesFrom5AM, blockMinutesFrom5AM);
    }) || null;
  }, [appointments, overlapsSlot]);

  // const handleCellHover = useCallback((estilista: EstilistaCompleto, hora: string) => {
  //   setHoveredCell({ estilista, hora });
  // }, []);

  // const handleCellHoverLeave = useCallback(() => {
  //   setHoveredCell(null);
  // }, []);

  const openAppointmentModal = useCallback((estilista: EstilistaCompleto, hora: string) => {
    setSelectedCell({ estilista, hora });
    setShowAppointmentModal(true);
    setShowOptions(false);
  }, []);

  const openBloqueoModal = useCallback((estilista: EstilistaCompleto, hora: string, bloqueo: BloqueoCalendario | null = null) => {
    setSelectedCell({ estilista, hora });
    setSelectedBloqueo(bloqueo);
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
      console.log('📅 Fecha seleccionada:', date);
      console.log('📅 Fecha formateada:', formatearFecha(date));
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
        console.log('🔄 Sincronizando currentMonth');
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
            if (isSelected) {
              console.log('✅ Día seleccionado encontrado:', {
                date: formatearFecha(date),
                selectedDate: formatearFecha(selectedDate),
                coincide: formatearFecha(date) === formatearFecha(selectedDate)
              });
            }

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
              console.log('⭐ Botón "Hoy" clickeado:', today);
              console.log('⭐ Fecha formateada:', formatearFecha(today));

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

  const CalendarCell = React.memo(({ prof, hour }: { prof: any; hour: string }) => {
    const [showButtons, setShowButtons] = useState(false);
    const cellRef = useRef<HTMLDivElement>(null);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const profesionalId = prof.estilista.profesional_id;

    const citaEnSlot = useMemo(
      () => getCitaEnSlot(profesionalId, hour),
      [getCitaEnSlot, profesionalId, hour]
    );
    const bloqueosEnSlot = useMemo(
      () => getBloqueosEnSlot(profesionalId, hour),
      [getBloqueosEnSlot, profesionalId, hour]
    );
    const tieneCitaEnEstaHora = Boolean(citaEnSlot);
    const tieneBloqueoEnEstaHora = bloqueosEnSlot.length > 0;
    const userEmail = user?.email?.toLowerCase().trim() || "";
    const userId = user?.id?.toLowerCase().trim() || "";
    const bloqueoEditable = useMemo(() => {
      if (!bloqueosEnSlot.length) return null;
      if (user?.role === "super_admin") return bloqueosEnSlot[0];

      const editablePorAutor = bloqueosEnSlot.find((bloqueo) => {
        const creadoPor = (bloqueo.creado_por || "").toLowerCase().trim();
        if (!creadoPor) return false;
        return creadoPor === userEmail || creadoPor === userId;
      });

      if (editablePorAutor) return editablePorAutor;

      // Compatibilidad con bloqueos antiguos sin trazabilidad de autor.
      const hayInfoDeAutor = bloqueosEnSlot.some((bloqueo) => Boolean((bloqueo.creado_por || "").trim()));
      return hayInfoDeAutor ? null : bloqueosEnSlot[0];
    }, [bloqueosEnSlot, user?.role, userEmail, userId]);

    // Limpiar timeout cuando el componente se desmonta
    useEffect(() => {
      return () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
      };
    }, []);

    const handleCellClick = useCallback((e: React.MouseEvent) => {
      e.stopPropagation();

      if (tieneCitaEnEstaHora && citaEnSlot) {
        handleCitaClick(citaEnSlot);
        setShowButtons(false);
        return;
      }

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setShowButtons(true);
    }, [tieneCitaEnEstaHora, citaEnSlot, handleCitaClick]);

    const handleReservarClick = useCallback((e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      console.log("CLICK reservar");
      openAppointmentModal(prof.estilista, hour);
      setShowButtons(false);
    }, [prof.estilista, hour, openAppointmentModal]);

    const handleBloquearClick = useCallback((e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      openBloqueoModal(prof.estilista, hour);
      setShowButtons(false);
    }, [prof.estilista, hour, openBloqueoModal]);

    const handleEditarBloqueoClick = useCallback((e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (!bloqueoEditable) return;
      openBloqueoModal(prof.estilista, hour, bloqueoEditable);
      setShowButtons(false);
    }, [bloqueoEditable, prof.estilista, hour, openBloqueoModal]);

    // Ocultar botones después de tiempo
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
      // Limpiar timeout de ocultar
      if (timeoutRef.current) clearTimeout(timeoutRef.current);

      // Mantener visible el detalle del bloqueo en hover; controles solo en celdas libres
      if (!tieneCitaEnEstaHora && !tieneBloqueoEnEstaHora) {
        setShowButtons(true);
      }
    }, [tieneCitaEnEstaHora, tieneBloqueoEnEstaHora]);

    const handleMouseLeave = useCallback(() => {
      // Ocultar inmediatamente cuando el mouse sale
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setShowButtons(false);
    }, []);

    const handleButtonContainerMouseEnter = useCallback(() => {
      // Cancelar timeout cuando el mouse está sobre los botones
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    }, []);

    const handleButtonContainerMouseLeave = useCallback(() => {
      // Ocultar botones cuando el mouse sale de ellos
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setShowButtons(false);
    }, []);

    return (
      <div
        ref={cellRef}
        onClick={handleCellClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`border-l border-gray-100 relative transition-all duration-150 ${tieneCitaEnEstaHora || tieneBloqueoEnEstaHora
          ? tieneBloqueoEnEstaHora && !tieneCitaEnEstaHora
            ? 'bg-red-50/30 hover:bg-red-50/50 border-red-100 cursor-pointer'
            : 'bg-white/30 hover:bg-gray-100/50 border-gray-200 cursor-pointer'
          : 'bg-white hover:bg-gray-50 hover:shadow-sm cursor-pointer'
          }`}
        style={{ width: `${effectiveCellWidth}px`, height: `${CELL_HEIGHT}px` }}
      >
        {/* BOTONES DE RESERVAR Y BLOQUEAR */}
        {!tieneCitaEnEstaHora && showButtons && (
          <div
            className="absolute inset-0 flex items-center justify-center z-[50]"
            onMouseEnter={handleButtonContainerMouseEnter}
            onMouseLeave={handleButtonContainerMouseLeave}
          >
            <div
              className="flex gap-0.5 bg-white/95 backdrop-blur-sm rounded-md p-0.5 shadow-lg border border-gray-300 animate-fadeIn"
              onClick={(e) => e.stopPropagation()}
            >
              {!tieneBloqueoEnEstaHora && (
                <button
                  onClick={handleReservarClick}
                  className="group flex items-center justify-center gap-0.5 bg-white text-gray-900 hover:bg-gray-900 hover:text-white active:bg-gray-800 active:text-white border border-gray-300 hover:border-gray-900 px-1.5 py-0.5 rounded text-[10px] font-medium min-w-[50px] transition-all duration-150 shadow-sm hover:shadow-md cursor-pointer focus:outline-none focus:ring-1 focus:ring-gray-900"
                >
                  <Plus className="w-2.5 h-2.5 transition-colors" />
                  Reservar
                </button>
              )}

              <button
                onClick={handleBloquearClick}
                className="group flex items-center justify-center gap-0.5 bg-white text-gray-900 hover:bg-gray-900 hover:text-white active:bg-gray-800 active:text-white border border-gray-300 hover:border-gray-900 px-1.5 py-0.5 rounded text-[10px] font-medium min-w-[50px] transition-all duration-150 shadow-sm hover:shadow-md cursor-pointer focus:outline-none focus:ring-1 focus:ring-gray-900"
              >
                <X className="w-2.5 h-2.5 transition-colors" />
                Bloquear
              </button>

              {tieneBloqueoEnEstaHora && bloqueoEditable && (
                <button
                  onClick={handleEditarBloqueoClick}
                  className="group flex items-center justify-center gap-0.5 bg-white text-gray-900 hover:bg-gray-900 hover:text-white active:bg-gray-800 active:text-white border border-gray-300 hover:border-gray-900 px-1.5 py-0.5 rounded text-[10px] font-medium min-w-[50px] transition-all duration-150 shadow-sm hover:shadow-md cursor-pointer focus:outline-none focus:ring-1 focus:ring-gray-900"
                >
                  Editar
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  });

  const CitaComponent = React.memo(({ apt }: { apt: Appointment }) => {
    const position = getAppointmentPosition(apt);
    const isSelected = selectedAppointment?.id === apt.id;
    const styles = getCitaStyles(apt.estado, isSelected);

    if (!position) {
      console.log(`❌ NO SE PUDO CALCULAR POSICIÓN PARA: ${apt.cliente_nombre}`);
      return null;
    }

    const clienteNombre = getTextValue(apt.cliente_nombre) || '(Sin nombre)';
    const serviciosResumen = getFirstNonEmptyText(apt.servicios_resumen, apt.servicio_nombre) || '(Sin servicio)';
    const profesionalNombre = getTextValue(apt.estilista_nombre) || '(Sin profesional)';
    const estadoCita = getTextValue(apt.estado) || 'pendiente';
    const showThirdLine = position.height >= 70;

    const handleEventMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
      if (!supportsHoverTooltips()) return;
      if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
      setBloqueoTooltip({ visible: false, x: 0, y: 0, bloqueo: null, profesional: "" });
      setCitaTooltip({
        visible: true,
        x: e.clientX,
        y: e.clientY,
        cita: apt
      });
    };

    const handleEventMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
      if (!supportsHoverTooltips()) return;
      setCitaTooltip((prev) => {
        if (!prev.visible || prev.cita?.id !== apt.id) return prev;
        if (prev.x === e.clientX && prev.y === e.clientY) return prev;
        return { ...prev, x: e.clientX, y: e.clientY };
      });
    };

    const handleEventMouseLeave = () => {
      if (!supportsHoverTooltips()) return;
      clearHoverTooltips();
    };

    const handleEventClick = () => {
      if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
      setCitaTooltip({ visible: false, x: 0, y: 0, cita: null });
      setBloqueoTooltip({ visible: false, x: 0, y: 0, bloqueo: null, profesional: "" });
      handleCitaClick(apt);
    };

    const renderCitaContent = () => (
      <div className="h-full w-full px-2 py-1.5 flex flex-col justify-start overflow-hidden">
        <div className="text-[11px] font-bold leading-4 text-white truncate whitespace-nowrap">
          {clienteNombre}
        </div>
        <div className="text-[10px] leading-4 text-white/90 truncate whitespace-nowrap">
          {`${serviciosResumen} · ${apt.duracion} min`}
        </div>
        {showThirdLine && (
          <div className="mt-auto text-[9px] leading-3.5 text-white/85 truncate whitespace-nowrap">
            {`${profesionalNombre} · ${styles.icon} ${estadoCita}`}
          </div>
        )}
      </div>
    );

    return (
      <div
        data-hover-source="appointment"
        className={`absolute rounded-md shadow-sm cursor-pointer overflow-hidden 
                 transition-all duration-150 z-20 ${styles.bg} bg-opacity-100 ${styles.hover} ${styles.shadow}
                 hover:shadow-md hover:z-30 border-l-[3px] ${styles.border}
                 ring-1 ring-black/10 group pointer-events-auto active:scale-[0.99] active:shadow-inner`}
        style={{ ...position, minHeight: MIN_APPOINTMENT_HEIGHT }}
        onClick={handleEventClick}
        onMouseEnter={handleEventMouseEnter}
        onMouseMove={handleEventMouseMove}
        onMouseLeave={handleEventMouseLeave}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-black/10 pointer-events-none"></div>

        {renderCitaContent()}

        <div className="absolute inset-0 opacity-0 group-hover:opacity-20 bg-white transition-opacity duration-150"></div>

        {isSelected && (
          <div className="absolute inset-0 border-1 border-white shadow-inner pointer-events-none"></div>
        )}
      </div>
    );
  });

  const BloqueoComponent = React.memo(({ bloqueo }: { bloqueo: BloqueoCalendario }) => {
    const position = getBloqueoPosition(bloqueo);
    if (!position) return null;

    const motivo = bloqueo.motivo?.trim() || "Bloqueo de agenda";
    const profesional = profesionales.find(
      (item) => item.estilista.profesional_id === bloqueo.profesional_id
    );
    const nombreProfesional = profesional?.name || bloqueo.profesional_id;

    const handleBloqueoClick = (event: React.MouseEvent<HTMLDivElement>) => {
      event.stopPropagation();
      if (!profesional?.estilista) return;
      if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
      setBloqueoTooltip({ visible: false, x: 0, y: 0, bloqueo: null, profesional: "" });
      openBloqueoModal(profesional.estilista, bloqueo.hora_inicio, bloqueo);
    };

    const handleBloqueoMouseEnter = (event: React.MouseEvent<HTMLDivElement>) => {
      if (!supportsHoverTooltips()) return;
      if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
      setCitaTooltip({ visible: false, x: 0, y: 0, cita: null });
      setBloqueoTooltip({
        visible: true,
        x: event.clientX,
        y: event.clientY,
        bloqueo,
        profesional: nombreProfesional,
      });
    };

    const handleBloqueoMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
      if (!supportsHoverTooltips()) return;
      setBloqueoTooltip((prev) => {
        if (!prev.visible || prev.bloqueo?._id !== bloqueo._id) return prev;
        if (prev.x === event.clientX && prev.y === event.clientY) return prev;
        return { ...prev, x: event.clientX, y: event.clientY };
      });
    };

    const handleBloqueoMouseLeave = () => {
      if (!supportsHoverTooltips()) return;
      clearHoverTooltips();
    };

    return (
      <div
        data-hover-source="bloqueo"
        className="absolute z-10 rounded-md border border-gray-300/70 bg-gradient-to-b from-gray-100 to-gray-50 shadow-sm overflow-hidden pointer-events-auto cursor-pointer"
        style={{ ...position, minHeight: 40 }}
        onClick={handleBloqueoClick}
        onMouseEnter={handleBloqueoMouseEnter}
        onMouseMove={handleBloqueoMouseMove}
        onMouseLeave={handleBloqueoMouseLeave}
      >
        <div className="h-full w-full px-2 py-1 flex flex-col overflow-hidden">
          <div className="text-[10px] font-bold uppercase tracking-wide text-gray-800 truncate">
            Bloq
          </div>
          <div className="text-[10px] leading-4 font-medium text-gray-700 truncate">
            {motivo}
          </div>
          <div className="mt-auto text-[9px] leading-3.5 text-gray-600 truncate">
            {`${bloqueo.hora_inicio}-${bloqueo.hora_fin} · ${nombreProfesional}`}
          </div>
        </div>
      </div>
    );
  });

  useEffect(() => {
    console.log('🎯 ESTADO ACTUAL DEL CALENDARIO:', {
      citasCount: citas.length,
      appointmentsCount: appointments.length,
      estilistasCount: estilistas.length,
      profesionalesCount: profesionales.length,
      sedeUsuario: user?.sede_id,
      sedeActual: selectedSede?.nombre,
      refreshTrigger: refreshTrigger,
    });
  }, [citas, appointments, estilistas, profesionales, refreshTrigger, user, selectedSede]);

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-white to-gray-50/30">
      <Sidebar />

      <div className="flex-1 lg:ml-0 flex flex-col overflow-hidden">
        {/* HEADER MÁS PEQUEÑO */}
        <div className="bg-white/80 backdrop-blur-lg border-b border-gray-200/60 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <PageHeader
              title="Agenda"
              subtitle={`${formatDateDMY(selectedDate)} • ${selectedSede?.nombre || "Tu sede"}${
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
          {/* SIDEBAR IZQUIERDA MÁS PEQUEÑA */}
          <div className="w-64 bg-gradient-to-b from-white to-gray-50 border-r border-gray-200 p-4 overflow-y-auto">
            <h2 className="text-lg font-bold text-gray-900 mb-3">Filtros</h2>

            {user?.sede_id && (
              <div className="mb-4">
                <label className="block text-xs font-semibold text-gray-700 mb-2">Sede</label>
                <div className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs bg-gray-50">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-900 font-medium">
                      {selectedSede?.nombre || "Tu sede"}
                    </span>
                    <span className="text-[10px] text-gray-500">(Tu sede)</span>
                  </div>
                </div>
              </div>
            )}

            <div className="mb-4">
              <MiniCalendar />
            </div>

            <div className="mb-4">
              {estilistas.length === 0 && user?.sede_id && (
                <div className="mt-1 text-[10px] text-gray-600 bg-gray-50 px-2 py-1.5 rounded-lg">
                  No hay estilistas en tu sede
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
                {['agendada', 'finalizado', 'facturado', 'cancelado', 'no_show'].map((estadoKey) => {
                  const tokens = getEstadoTokens(estadoKey);
                  return (
                    <div key={estadoKey} className="flex items-center gap-1.5">
                      <div className={`w-2.5 h-2.5 rounded-full ${tokens.chipDot}`}></div>
                      <span className="text-xs text-gray-700">{tokens.label}</span>
                    </div>
                  );
                })}
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
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[10px] font-medium text-gray-700 truncate">
                            🔒 {bloqueo.motivo}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleEliminarBloqueo(bloqueo)}
                            disabled={deletingBloqueoId === bloqueo._id}
                            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-red-300"
                            aria-label="Eliminar bloqueo"
                            title="Eliminar bloqueo"
                          >
                            {deletingBloqueoId === bloqueo._id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Trash2 className="h-3 w-3" />
                            )}
                          </button>
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

            {loading && <div className="mt-3 flex items-center justify-center gap-1 text-xs text-gray-600"><Loader2 className="w-3 h-3 animate-spin" />Cargando...</div>}
          </div>

          {/* CALENDARIO PRINCIPAL */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div
              ref={calendarViewportRef}
              className="flex-1 overflow-auto bg-white/60 backdrop-blur-sm"
              onMouseMove={handleCalendarMouseMove}
              onMouseLeave={handleCalendarMouseLeave}
            >
              <div className="min-w-max" style={{ minWidth: `${calendarMinWidth}px` }}>
                {/* ENCABEZADO DE ESTILISTAS MÁS COMPACTO */}
                <div className="flex bg-white/95 backdrop-blur-lg border-b border-gray-200/60 sticky top-0 z-20 shadow-sm">
                  <div className="w-16 flex-shrink-0" />
                  {profesionales.length > 0 ? (
                    <div className="flex" style={{ width: `${professionalsTrackWidth}px` }}>
                      {profesionales.map((prof) => (
                        <div
                          key={prof.estilista.unique_key}
                          className="flex-shrink-0 p-2 border-l border-gray-200/60 text-center bg-white/80"
                          style={{ width: `${effectiveCellWidth}px` }}
                        >
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 mx-auto mb-1 flex items-center justify-center text-xs font-bold text-white shadow-sm">{prof.initials}</div>
                          <div className="text-xs font-semibold text-gray-900 truncate px-1">{prof.name}</div>
                          <div className="text-[9px] text-gray-500 mt-0.5">{appointments.filter(apt => apt.profesional_id === prof.estilista.profesional_id).length} citas</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="w-full p-6 text-center">
                      <div className="text-gray-500 text-sm mb-1">
                        {user?.sede_id ? 'No hay estilistas en tu sede' : 'Selecciona una sede'}
                      </div>
                      <div className="text-xs text-gray-400">
                        {user?.sede_id ? 'Contacta al administrador' : 'Para ver los estilistas disponibles'}
                      </div>
                    </div>
                  )}
                </div>

                {profesionales.length > 0 && (
                  <div className="relative">
                    {(() => {
                      const now = new Date();
                      const currentHour = now.getHours();
                      const currentMinute = now.getMinutes();
                      const isTodaySelected = selectedDate.toDateString() === today.toDateString();
                      const currentMinutesFromStart = (currentHour - START_HOUR) * 60 + currentMinute;

                      return HOURS.map((hour, hourIndex) => {
                        const rowStart = hourIndex * SLOT_INTERVAL_MINUTES;
                        const rowEnd = rowStart + SLOT_INTERVAL_MINUTES;
                        const showCurrentTimeDot =
                          isTodaySelected &&
                          currentHour >= START_HOUR &&
                          currentHour <= END_HOUR &&
                          currentMinutesFromStart >= rowStart &&
                          currentMinutesFromStart < rowEnd;
                        const dotTop = ((currentMinutesFromStart - rowStart) / SLOT_INTERVAL_MINUTES) * CELL_HEIGHT;

                        return (
                          <div key={hour}
                            className={`flex border-b border-gray-100/80 group relative ${hourIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-gray-50/30 transition-colors`}>
                            <div className="w-16 flex-shrink-0 text-xs text-gray-600 p-2 text-right border-r border-gray-200/60 bg-white/95 backdrop-blur-sm sticky left-0 z-50 font-medium relative">
                              {hour}
                              {showCurrentTimeDot && (
                                <div
                                  className="pointer-events-none absolute right-2 z-40 h-2 w-2 -translate-y-1/2 rounded-full bg-gray-900 animate-pulse"
                                  style={{ top: `${dotTop}px` }}
                                />
                              )}
                            </div>
                            {profesionales.map((prof) => (
                              <CalendarCell key={`${hour}-${prof.estilista.unique_key}`} prof={prof} hour={hour} />
                            ))}
                          </div>
                        );
                      });
                    })()}

                    {/* BLOQUEOS */}
                    <div
                      className="absolute top-0 right-0 bottom-0 z-10 pointer-events-none"
                      style={{ left: `${TIME_COLUMN_WIDTH}px` }}
                    >
                      {bloqueos.map((bloqueo) => (
                        <BloqueoComponent key={`bloqueo-${bloqueo._id}`} bloqueo={bloqueo} />
                      ))}
                    </div>

                    {/* CITAS */}
                    <div
                      className="absolute top-0 right-0 bottom-0 z-0 pointer-events-none"
                      style={{ left: `${TIME_COLUMN_WIDTH}px` }}
                    >
                      {appointments.map((apt) => (
                        <CitaComponent key={`${apt.id}-${apt.start}-${apt.profesional_id}`} apt={apt} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MODALES */}
      {citaTooltip.visible && citaTooltip.cita && (
        <div
          className="pointer-events-none fixed z-50 bg-white/95 backdrop-blur-xl border border-white/20 rounded-xl shadow-lg p-2.5 max-w-[18rem] transform -translate-y-1/2 animate-in fade-in-0 zoom-in-95 duration-150"
          style={{
            left: `${getTooltipLeft(citaTooltip.x, CITA_TOOLTIP_WIDTH)}px`,
            top: `${citaTooltip.y}px`
          }}
        >
          <div className="flex items-center gap-1.5 mb-1.5">
            <div className="w-7 h-7 bg-gradient-to-br from-gray-700 to-gray-900 rounded-lg flex items-center justify-center shadow-sm">
              <User className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-gray-900 text-[13px] truncate">
                {getTextValue(citaTooltip.cita.cliente_nombre) || '(Sin nombre)'}
              </h3>
              <p className="text-xs text-gray-600 truncate">
                {getTextValue(citaTooltip.cita.cliente_telefono)
                  ? `📞 ${getTextValue(citaTooltip.cita.cliente_telefono)}`
                  : `${citaTooltip.cita.start} - ${citaTooltip.cita.end}`}
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs">
              <Clock className="w-3 h-3 text-gray-600" />
              <span className="font-medium text-gray-700">
                {citaTooltip.cita.start} - {citaTooltip.cita.end}
              </span>
              <span className="text-gray-500">({citaTooltip.cita.duracion}min)</span>
            </div>

            <div className="flex items-start gap-2 text-xs">
              <svg className="w-3 h-3 text-gray-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m-6-8h6M5 7h.01M5 11h.01M5 15h.01" />
              </svg>
              <span className="text-gray-700 break-words">
                <strong>Servicios:</strong> {getFirstNonEmptyText(citaTooltip.cita.servicios_detalle, citaTooltip.cita.servicio_nombre) || '(Sin servicio)'}
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <svg className="w-3 h-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="text-gray-700 truncate">
                <strong>Profesional:</strong> {getTextValue(citaTooltip.cita.estilista_nombre) || '(Sin profesional)'}
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

          <div className="mt-1.5 pt-1.5 border-t border-gray-100">
            {(() => {
              const estadoTokens = getEstadoTokens(getTextValue(citaTooltip.cita.estado));
              const estadoLabel = getTextValue(citaTooltip.cita.estado) || estadoTokens.label;
              return (
                <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium ${estadoTokens.chipBg} ${estadoTokens.chipText}`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${estadoTokens.chipDot}`}></div>
                  {estadoLabel}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {bloqueoTooltip.visible && bloqueoTooltip.bloqueo && (
        <div
          className="pointer-events-none fixed z-50 bg-white/95 backdrop-blur-xl border border-white/20 rounded-xl shadow-xl p-3 max-w-xs transform -translate-y-1/2 animate-in fade-in-0 zoom-in-95 duration-150"
          style={{
            left: `${getTooltipLeft(bloqueoTooltip.x, BLOQUEO_TOOLTIP_WIDTH)}px`,
            top: `${bloqueoTooltip.y}px`
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-gradient-to-br from-red-600 to-red-800 rounded-lg flex items-center justify-center shadow-sm">
              <X className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-gray-900 text-sm truncate">
                Bloqueo de horario
              </h3>
              <p className="text-xs text-gray-600 truncate">
                {bloqueoTooltip.bloqueo.hora_inicio} - {bloqueoTooltip.bloqueo.hora_fin}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <Clock className="w-3 h-3 text-gray-600" />
              <span className="font-medium text-gray-700">
                {bloqueoTooltip.bloqueo.hora_inicio} - {bloqueoTooltip.bloqueo.hora_fin}
              </span>
              <span className="text-gray-500">
                {(() => {
                  const [startHour, startMinute] = bloqueoTooltip.bloqueo!.hora_inicio.split(':').map(Number);
                  const [endHour, endMinute] = bloqueoTooltip.bloqueo!.hora_fin.split(':').map(Number);
                  if ([startHour, startMinute, endHour, endMinute].some(Number.isNaN)) return "";
                  const duration = Math.max(((endHour * 60 + endMinute) - (startHour * 60 + startMinute)), 0);
                  return `(${duration}min)`;
                })()}
              </span>
            </div>

            <div className="flex items-start gap-2 text-xs">
              <svg className="w-3 h-3 text-gray-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m-6-8h6M5 7h.01M5 11h.01M5 15h.01" />
              </svg>
              <span className="text-gray-700 break-words">
                <strong>Motivo:</strong> {bloqueoTooltip.bloqueo.motivo || "Bloqueo de agenda"}
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <svg className="w-3 h-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="text-gray-700 truncate">
                <strong>Profesional:</strong> {bloqueoTooltip.profesional || '(Sin profesional)'}
              </span>
            </div>
          </div>

          <div className="mt-2 pt-2 border-t border-gray-100">
            <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium bg-red-100 text-red-700">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
              bloqueado
            </div>
          </div>
        </div>
      )}

      {showBloqueoModal && (
        <Modal open={showBloqueoModal} onClose={handleClose} title={selectedBloqueo ? "Editar bloqueo" : "Bloqueo de horario"}>
          <Bloqueos
            onClose={handleBloqueoCreado}
            estilistaId={selectedCell?.estilista.profesional_id}
            fecha={selectedDateString}
            horaInicio={selectedCell?.hora}
            editingBloqueo={selectedBloqueo}
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
            cargarCitas();
            setRefreshTrigger(prev => prev + 1);
          }}
        />
      )}
    </div>
  );
};

export default React.memo(CalendarScheduler);
