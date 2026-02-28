// components/Quotes/AppointmentDetailsModal.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  User, XCircle, UserX,
  Loader2, CheckCircle, Plus, Package,
  CreditCard,
  CreditCard as CardIcon, Wallet, CalendarDays,
  Tag, Users, X, Bug, Landmark, Wand2,
  Phone, Mail, DollarSign, AlertCircle,
  ShoppingBag, Trash2, Gift
} from 'lucide-react';
import Modal from '../../../components/ui/modal';
import { useAuth } from '../../../components/Auth/AuthContext';
import { updateCita, registrarPagoCita } from './citasApi';
import { formatDateDMY } from '../../../lib/dateFormat';
import { getServicios, type Servicio as ServicioCatalogo } from '../../../components/Quotes/serviciosApi';
import { getEstilistas, type Estilista } from '../../../components/Professionales/estilistasApi';
import { API_BASE_URL } from '../../../types/config';
import TimeInputWithPicker from '../../../components/ui/time-input-with-picker';
import { extractAgendaAdditionalNotes, formatAgendaTime, normalizeAgendaTimeValue } from '../../../lib/agenda';

interface AppointmentDetailsModalProps {
  open: boolean;
  onClose: () => void;
  appointment: any;
  onRefresh?: () => void;
}

interface PagoModalData {
  show: boolean;
  tipo: 'pago' | 'abono';
  monto: number;
  metodoPago: 'efectivo' | 'transferencia' | 'tarjeta' | 'tarjeta_credito' | 'tarjeta_debito' | 'addi' | 'giftcard';
  codigoGiftcard: string;
}

interface ProductoSeleccionado {
  producto_id: string;
  nombre: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  moneda?: string;
  comision_porcentaje?: number;
  comision_valor?: number;
  agregado_por_email?: string;
  agregado_por_rol?: string;
  fecha_agregado?: string;
  profesional_id?: string;
}

interface ServicioSeleccionado {
  servicio_id: string;
  nombre: string;
  precio_unitario: number;
  precio_unitario_input: string;
  precio_base: number;
  cantidad: number;
  duracion_minutos: number;
  subtotal: number;
  precio_personalizado: number | null;
  usa_precio_personalizado: boolean;
}

interface ServicioDisponible {
  servicio_id: string;
  nombre: string;
  precio: number;
  duracion_minutos: number;
}

interface ProductoDisponible {
  producto_id: string;
  nombre: string;
  precio: number;
  moneda: string;
}

interface ProfesionalDisponible {
  profesional_id: string;
  nombre: string;
}

const ESTADOS_NO_EDITABLES_SERVICIOS = new Set([
  'cancelada',
  'completada',
  'finalizada',
  'no asistio',
  'no_asistio'
]);

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundMoney = (value: number): number => {
  return Math.round(value * 100) / 100;
};

const extraerMensajeError = (error: any, fallback: string): string => {
  const rawMessage = error?.message ?? error;

  if (!rawMessage) return fallback;
  if (typeof rawMessage === 'string') return rawMessage;

  if (Array.isArray(rawMessage)) {
    const joined = rawMessage
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && typeof item.msg === 'string') return item.msg;
        return JSON.stringify(item);
      })
      .join(' | ');
    return joined || fallback;
  }

  if (typeof rawMessage === 'object') {
    if (typeof rawMessage.detail === 'string') return rawMessage.detail;
    const entries = Object.entries(rawMessage)
      .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
      .join(' | ');
    return entries || fallback;
  }

  return fallback;
};

const normalizarServiciosCita = (servicios: any[] | undefined): ServicioSeleccionado[] => {
  if (!Array.isArray(servicios)) return [];

  return servicios
    .filter((servicio) => servicio && servicio.servicio_id)
    .map((servicio) => {
      const precioUnitario = roundMoney(toNumber(servicio.precio));
      const cantidad = Math.max(1, Math.trunc(toNumber(servicio.cantidad) || 1));
      const usaPrecioPersonalizado = Boolean(servicio.precio_personalizado);
      const subtotalRaw = servicio.subtotal !== undefined
        ? toNumber(servicio.subtotal)
        : precioUnitario * cantidad;

      return {
        servicio_id: String(servicio.servicio_id),
        nombre: String(servicio.nombre || 'Servicio'),
        precio_unitario: precioUnitario,
        precio_unitario_input: String(precioUnitario),
        precio_base: precioUnitario,
        cantidad,
        duracion_minutos: Math.max(0, Math.trunc(toNumber(servicio.duracion_minutos || servicio.duracion) || 0)),
        subtotal: roundMoney(subtotalRaw),
        precio_personalizado: usaPrecioPersonalizado ? precioUnitario : null,
        usa_precio_personalizado: usaPrecioPersonalizado
      };
    });
};

const normalizarComparacionServicios = (servicios: ServicioSeleccionado[]) => {
  return [...servicios]
    .map((servicio) => ({
      servicio_id: servicio.servicio_id,
      cantidad: servicio.cantidad,
      precio_unitario: roundMoney(servicio.precio_unitario),
      usa_precio_personalizado: servicio.usa_precio_personalizado
    }))
    .sort((a, b) => a.servicio_id.localeCompare(b.servicio_id));
};

const normalizarProductosCita = (productos: any[] | undefined): ProductoSeleccionado[] => {
  if (!Array.isArray(productos)) return [];

  return productos
    .filter((producto) => producto && (producto.producto_id || producto.id || producto._id))
    .map((producto) => {
      const productoId = String(producto.producto_id || producto.id || producto._id);
      const cantidad = Math.max(1, Math.trunc(toNumber(producto.cantidad) || 1));
      const precioUnitario = roundMoney(
        toNumber(producto.precio_unitario ?? producto.precio ?? 0)
      );
      const subtotal = roundMoney(
        producto.subtotal !== undefined ? toNumber(producto.subtotal) : precioUnitario * cantidad
      );
      const comisionPorcentaje = roundMoney(toNumber(producto.comision_porcentaje ?? 0));

      return {
        producto_id: productoId,
        nombre: String(producto.nombre || 'Producto'),
        cantidad,
        precio_unitario: precioUnitario,
        subtotal,
        moneda: String(producto.moneda || ''),
        comision_porcentaje: comisionPorcentaje,
        comision_valor: roundMoney(
          producto.comision_valor !== undefined
            ? toNumber(producto.comision_valor)
            : (subtotal * comisionPorcentaje) / 100
        ),
        agregado_por_email: producto.agregado_por_email,
        agregado_por_rol: producto.agregado_por_rol,
        fecha_agregado: producto.fecha_agregado,
        profesional_id: producto.profesional_id
      };
    });
};

const normalizarComparacionProductos = (productos: ProductoSeleccionado[]) => {
  return [...productos]
    .map((producto) => ({
      producto_id: producto.producto_id,
      cantidad: producto.cantidad,
      precio_unitario: roundMoney(producto.precio_unitario)
    }))
    .sort((a, b) => a.producto_id.localeCompare(b.producto_id));
};

const AppointmentDetailsModal: React.FC<AppointmentDetailsModalProps> = ({
  open,
  onClose,
  appointment,
  onRefresh
}) => {
  const { user } = useAuth();
  const [updating, setUpdating] = useState(false);
  const [appointmentDetails, setAppointmentDetails] = useState<any>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [pagoModal, setPagoModal] = useState<PagoModalData>({
    show: false,
    tipo: 'pago',
    monto: 0,
    metodoPago: 'efectivo',
    codigoGiftcard: ''
  });
  const [registrandoPago, setRegistrandoPago] = useState(false);
  const [productos, setProductos] = useState<ProductoSeleccionado[]>([]);
  const [productosOriginales, setProductosOriginales] = useState<ProductoSeleccionado[]>([]);
  const [productosDisponibles, setProductosDisponibles] = useState<ProductoDisponible[]>([]);
  const [productosCatalogoCargado, setProductosCatalogoCargado] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [loadingProductosDisponibles, setLoadingProductosDisponibles] = useState(false);

  const [profesionalesDisponibles, setProfesionalesDisponibles] = useState<ProfesionalDisponible[]>([]);
  const [loadingProfesionales, setLoadingProfesionales] = useState(false);
  const [fechaEditada, setFechaEditada] = useState('');
  const [horaInicioEditada, setHoraInicioEditada] = useState('');
  const [horaFinEditada, setHoraFinEditada] = useState('');
  const [horaFinManual, setHoraFinManual] = useState(false);
  const [profesionalEditadoId, setProfesionalEditadoId] = useState('');
  const [horarioOriginal, setHorarioOriginal] = useState({
    fecha: '',
    hora_inicio: '',
    hora_fin: '',
    profesional_id: ''
  });

  const [serviciosDisponibles, setServiciosDisponibles] = useState<ServicioDisponible[]>([]);
  const [serviciosSeleccionados, setServiciosSeleccionados] = useState<ServicioSeleccionado[]>([]);
  const [serviciosOriginales, setServiciosOriginales] = useState<ServicioSeleccionado[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [loadingServiciosDisponibles, setLoadingServiciosDisponibles] = useState(false);
  const [savingServicios, setSavingServicios] = useState(false);
  const [serviceError, setServiceError] = useState<string | null>(null);

  const sessionCurrency = typeof window !== 'undefined' ? sessionStorage.getItem("beaux-moneda") : null;
  const userCurrency = String(user?.moneda || sessionCurrency || appointmentDetails?.rawData?.moneda || "USD").toUpperCase();
  const isCopCurrency = userCurrency === "COP";

  const sanitizeMetodoPago = (metodo: PagoModalData['metodoPago']): PagoModalData['metodoPago'] => {
    if (!isCopCurrency && metodo === 'addi') {
      return 'efectivo';
    }
    return metodo;
  };

  useEffect(() => {
    if (open && appointment) {
      setAppointmentDetails(appointment);
      setServiceError(null);
      setSelectedServiceId('');
      setSelectedProductId('');
      setProductosDisponibles([]);
      setProductosCatalogoCargado(false);

      const rawData = appointment.rawData || {};
      const productosIniciales = normalizarProductosCita(rawData.productos || appointment.productos || []);
      setProductos(productosIniciales);
      setProductosOriginales(productosIniciales);

      const fechaInicial = String(rawData.fecha || '').slice(0, 10);
      const horaInicioInicial = normalizeAgendaTimeValue(String(rawData.hora_inicio || appointment.start || ''))
        || String(rawData.hora_inicio || appointment.start || '');
      const horaFinInicial = normalizeAgendaTimeValue(String(rawData.hora_fin || appointment.end || ''))
        || String(rawData.hora_fin || appointment.end || '');
      const profesionalInicial = String(rawData.profesional_id || appointment.profesional_id || '');
      setFechaEditada(fechaInicial);
      setHoraInicioEditada(horaInicioInicial);
      setHoraFinEditada(horaFinInicial);
      setHoraFinManual(false);
      setProfesionalEditadoId(profesionalInicial);
      setHorarioOriginal({
        fecha: fechaInicial,
        hora_inicio: horaInicioInicial,
        hora_fin: horaFinInicial,
        profesional_id: profesionalInicial
      });

      // Extraer productos de la cita
      const serviciosIniciales = normalizarServiciosCita(
        appointment.rawData?.servicios || appointment.servicios || []
      );
      setServiciosSeleccionados(serviciosIniciales);
      setServiciosOriginales(serviciosIniciales);
    }
  }, [open, appointment]);

  useEffect(() => {
    if (!open || !user?.access_token || !appointment) return;

    const citaId = String(appointment.id || appointment.rawData?._id || appointment.rawData?.cita_id || '').trim();
    if (!citaId) return;

    let isCancelled = false;
    const cargarDetalleCita = async () => {
      const endpoints = [
        `${API_BASE_URL}scheduling/quotes/citas/${citaId}`,
        `${API_BASE_URL}scheduling/quotes/${citaId}`
      ];

      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint, {
            headers: {
              Authorization: `Bearer ${user.access_token}`,
              Accept: 'application/json'
            }
          });

          if (!response.ok) continue;

          const data = await response.json();
          const detalle = (data?.cita && typeof data.cita === 'object') ? data.cita : data;
          if (!detalle || typeof detalle !== 'object' || isCancelled) return;

          setAppointmentDetails((prev: any) => ({
            ...prev,
            ...detalle,
            rawData: {
              ...(prev?.rawData || {}),
              ...detalle
            }
          }));
          return;
        } catch {
          // Continuar con el siguiente endpoint de detalle disponible.
        }
      }
    };

    void cargarDetalleCita();
    return () => {
      isCancelled = true;
    };
  }, [open, appointment, user?.access_token]);

  useEffect(() => {
    if (!isCopCurrency && pagoModal.metodoPago === 'addi') {
      setPagoModal((prev) => ({ ...prev, metodoPago: 'efectivo' }));
    }
  }, [isCopCurrency, pagoModal.metodoPago]);

  useEffect(() => {
    if (!open || !user?.access_token) return;

    let isCancelled = false;
    const cargarServiciosDisponibles = async () => {
      setLoadingServiciosDisponibles(true);
      try {
        const catalogoServicios: ServicioCatalogo[] = await getServicios(user.access_token);

        if (isCancelled) return;

        const serviciosMapeados = catalogoServicios
          .filter((servicio) => servicio?.activo !== false)
          .map((servicio) => ({
            servicio_id: String(servicio.servicio_id || servicio._id),
            nombre: String(servicio.nombre || 'Servicio'),
            precio: roundMoney(
              servicio.precio_local !== undefined ? toNumber(servicio.precio_local) : toNumber(servicio.precio)
            ),
            duracion_minutos: Math.max(
              0,
              Math.trunc(toNumber(servicio.duracion_minutos ?? servicio.duracion) || 0)
            )
          }))
          .sort((a, b) => a.nombre.localeCompare(b.nombre));

        setServiciosDisponibles(serviciosMapeados);
      } catch (error: any) {
        if (isCancelled) return;
        setServiciosDisponibles([]);
        setServiceError(extraerMensajeError(error, 'No se pudieron cargar los servicios disponibles.'));
      } finally {
        if (!isCancelled) {
          setLoadingServiciosDisponibles(false);
        }
      }
    };

    cargarServiciosDisponibles();
    return () => {
      isCancelled = true;
    };
  }, [open, user?.access_token]);

  const cargarProductosDisponibles = useCallback(async (force = false) => {
    if (!open || !user?.access_token) return;
    if (!force && (productosCatalogoCargado || loadingProductosDisponibles)) return;

    setLoadingProductosDisponibles(true);
    setServiceError(null);
    try {
      const params = new URLSearchParams();
      if (userCurrency) {
        params.append('moneda', userCurrency);
      }
      const query = params.toString();
      const url = `${API_BASE_URL}inventary/product/productos/${query ? `?${query}` : ''}`;

      // Endpoint requerido: GET /inventary/product/productos/
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${user.access_token}`,
          Accept: 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const productosArray: any[] = Array.isArray(data)
        ? data
        : Array.isArray((data as any)?.productos)
          ? (data as any).productos
          : Array.isArray((data as any)?.items)
            ? (data as any).items
            : [];
      const productosMapeados: ProductoDisponible[] = productosArray
        .map((producto: any) => {
          const productoId = String(producto.id ?? producto._id ?? producto.producto_id ?? '').trim();
          const precio = roundMoney(toNumber(
            producto.precio_local ??
            producto.precio ??
            producto.precios?.[userCurrency] ??
            producto.precios?.COP ??
            0
          ));
          if (!productoId) return null;

          return {
            producto_id: productoId,
            nombre: String(producto.nombre || 'Producto'),
            precio,
            moneda: String(producto.moneda_local || userCurrency).toUpperCase()
          };
        })
        .filter((producto: ProductoDisponible | null): producto is ProductoDisponible => Boolean(producto))
        .sort((a: ProductoDisponible, b: ProductoDisponible) => a.nombre.localeCompare(b.nombre));

      setProductosDisponibles(productosMapeados);
      setProductosCatalogoCargado(true);
    } catch (error: any) {
      setProductosDisponibles([]);
      setProductosCatalogoCargado(false);
      setServiceError(extraerMensajeError(error, 'No se pudieron cargar los productos disponibles.'));
    } finally {
      setLoadingProductosDisponibles(false);
    }
  }, [
    open,
    user?.access_token,
    userCurrency,
    productosCatalogoCargado,
    loadingProductosDisponibles
  ]);

  useEffect(() => {
    if (!open || !user?.access_token) return;

    let isCancelled = false;
    const cargarProfesionales = async () => {
      setLoadingProfesionales(true);
      try {
        const sedeId = appointmentDetails?.rawData?.sede_id || user?.sede_id;
        const estilistas: Estilista[] = await getEstilistas(user.access_token, sedeId);
        const profesionales = (Array.isArray(estilistas) ? estilistas : [])
          .map((estilista) => ({
            profesional_id: String(estilista.profesional_id || estilista._id || '').trim(),
            nombre: String(estilista.nombre || 'Profesional')
          }))
          .filter((estilista) => estilista.profesional_id)
          .sort((a, b) => a.nombre.localeCompare(b.nombre));

        if (!isCancelled) {
          setProfesionalesDisponibles(profesionales);
        }
      } catch (error: any) {
        if (!isCancelled) {
          setProfesionalesDisponibles([]);
          setServiceError(extraerMensajeError(error, 'No se pudieron cargar los profesionales.'));
        }
      } finally {
        if (!isCancelled) {
          setLoadingProfesionales(false);
        }
      }
    };

    cargarProfesionales();
    return () => {
      isCancelled = true;
    };
  }, [open, user?.access_token, user?.sede_id, appointmentDetails?.rawData?.sede_id]);

  useEffect(() => {
    if (!serviciosDisponibles.length) return;

    setServiciosSeleccionados((prev) =>
      prev.map((servicio) => {
        if (servicio.duracion_minutos > 0 && servicio.precio_base > 0) return servicio;
        const servicioCatalogo = serviciosDisponibles.find((item) => item.servicio_id === servicio.servicio_id);
        if (!servicioCatalogo) return servicio;

        return {
          ...servicio,
          duracion_minutos: servicio.duracion_minutos > 0 ? servicio.duracion_minutos : servicioCatalogo.duracion_minutos,
          precio_base: servicio.precio_base > 0 ? servicio.precio_base : servicioCatalogo.precio
        };
      })
    );
  }, [serviciosDisponibles]);

  const estadoCitaActual = String(appointmentDetails?.estado || '').toLowerCase().trim();
  const isEstadoNoEditableServicios = ESTADOS_NO_EDITABLES_SERVICIOS.has(estadoCitaActual);

  const totalServicios = roundMoney(
    serviciosSeleccionados.reduce((total, servicio) => total + roundMoney(servicio.subtotal), 0)
  );
  const totalProductos = roundMoney(
    productos.reduce((total, producto) => total + toNumber(producto.subtotal), 0)
  );
  const totalCitaCalculado = roundMoney(totalServicios + totalProductos);

  const duracionTotalServicios = Math.max(
    0,
    serviciosSeleccionados.reduce(
      (total, servicio) => total + (Math.max(0, servicio.duracion_minutos || 0) * Math.max(1, servicio.cantidad || 1)),
      0
    )
  );

  const hasUnsavedServiceChanges = JSON.stringify(normalizarComparacionServicios(serviciosSeleccionados))
    !== JSON.stringify(normalizarComparacionServicios(serviciosOriginales));
  const hasUnsavedProductChanges = JSON.stringify(normalizarComparacionProductos(productos))
    !== JSON.stringify(normalizarComparacionProductos(productosOriginales));
  const hasUnsavedScheduleChanges = (
    fechaEditada !== horarioOriginal.fecha ||
    horaInicioEditada !== horarioOriginal.hora_inicio ||
    horaFinEditada !== horarioOriginal.hora_fin ||
    profesionalEditadoId !== horarioOriginal.profesional_id
  );
  const hasUnsavedChanges = hasUnsavedServiceChanges || hasUnsavedProductChanges || hasUnsavedScheduleChanges;

  const isServiceActionsDisabled = updating || savingServicios || isEstadoNoEditableServicios;
  const notasAdicionales = extractAgendaAdditionalNotes(appointmentDetails);
  const tieneNotasAdicionales = notasAdicionales.length > 0;

  useEffect(() => {
    if (!open || !user?.access_token || isServiceActionsDisabled) return;
    void cargarProductosDisponibles();
  }, [open, user?.access_token, isServiceActionsDisabled, cargarProductosDisponibles]);

  const sumarMinutosAHora = (hora: string, minutosAgregar: number) => {
    const [hours, minutes] = String(hora || '00:00').split(':').map((value) => Number(value) || 0);
    const totalMinutos = (hours * 60) + minutes + Math.max(0, minutosAgregar);
    const newHours = Math.floor(totalMinutos / 60);
    const newMinutes = totalMinutos % 60;
    return `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}`;
  };

  const convertirHoraAMinutos = (hora: string): number => {
    const [hours, minutes] = String(hora || '').split(':').map((value) => Number(value));
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return NaN;
    return (hours * 60) + minutes;
  };

  useEffect(() => {
    if (!horaInicioEditada || horaFinManual) return;

    const duracionParaCalculo = duracionTotalServicios > 0
      ? duracionTotalServicios
      : Math.max(0, toNumber(horaFinEditada.split(':')[0]) * 60 + toNumber(horaFinEditada.split(':')[1]) - toNumber(horaInicioEditada.split(':')[0]) * 60 - toNumber(horaInicioEditada.split(':')[1]));

    if (duracionParaCalculo <= 0) return;

    const horaFinCalculada = sumarMinutosAHora(horaInicioEditada, duracionParaCalculo);
    if (horaFinCalculada !== horaFinEditada) {
      setHoraFinEditada(horaFinCalculada);
    }
  }, [horaInicioEditada, duracionTotalServicios, horaFinEditada, horaFinManual]);

  const getPagosData = () => {
    if (!appointmentDetails?.rawData) {
      return {
        totalCita: 0,
        abonado: 0,
        saldoPendiente: 0,
        estadoPago: 'pendiente',
        tieneAbono: false,
        estaPagadoCompleto: false,
        pagos: []
      };
    }

    const rawData = appointmentDetails.rawData;
    const totalCita = parseFloat(rawData.valor_total) || 0;
    const abonado = parseFloat(rawData.abono) || 0;

    const saldoPendienteFromData = parseFloat(rawData.saldo_pendiente);
    let saldoPendiente = saldoPendienteFromData;

    if (isNaN(saldoPendiente) || saldoPendiente < 0) {
      saldoPendiente = Math.max(0, totalCita - abonado);
    }

    const estaPagadoCompleto = saldoPendiente <= 0;

    let estadoPago = rawData.estado_pago || 'pendiente';

    if (estaPagadoCompleto) {
      estadoPago = 'pagado';
    } else if (abonado > 0) {
      estadoPago = 'abonado';
    } else {
      estadoPago = 'pendiente';
    }

    const tieneAbono = abonado > 0;

    const pagos = [];

    if (abonado > 0) {
      pagos.push({
        fecha: formatDateDMY(rawData.fecha_creacion, formatDateDMY(new Date())),
        tipo: 'Abono',
        monto: abonado,
        metodo: rawData.metodo_pago || 'Efectivo',
        registradoPor: rawData.creada_por_rol === 'admin_sede' ? 'Administrador' : 'Sistema'
      });
    }

    return {
      totalCita,
      abonado,
      saldoPendiente,
      estadoPago,
      tieneAbono,
      estaPagadoCompleto,
      pagos
    };
  };

  const shouldDisableActions = () => {
    const pagosData = getPagosData();
    
    if (updating || savingServicios) return true;
    
    if (['cancelada', 'no asistio'].includes(appointmentDetails?.estado?.toLowerCase())) {
      return true;
    }

    if (pagosData?.estaPagadoCompleto) {
      return true;
    }

    if (appointmentDetails?.estado?.toLowerCase() === 'completada') {
      return true;
    }

    return false;
  };

  const handleUpdateStatus = async (nuevoEstado: string) => {
    if (!appointmentDetails?.id || !user?.access_token) {
      alert('No se puede actualizar: falta información de autenticación');
      return;
    }

    const mensajes = {
      'cancelada': '⚠️ ¿Cancelar esta cita?\n\nLa cita se marcará como cancelada.',
      'no asistio': '⚠️ ¿Marcar como "No Asistió"?\n\nEl cliente no se presentó a la cita.'
    };

    if (!confirm(mensajes[nuevoEstado as keyof typeof mensajes] || `¿Cambiar estado a "${nuevoEstado}"?`)) {
      return;
    }

    setUpdating(true);
    try {
      await updateCita(
        appointmentDetails.id,
        { estado: nuevoEstado },
        user.access_token
      );

      setAppointmentDetails({
        ...appointmentDetails,
        estado: nuevoEstado
      });

      alert(`✅ Estado cambiado a: ${nuevoEstado}`);

      if (onRefresh) {
        setTimeout(() => onRefresh(), 500);
      }

    } catch (error: any) {
      console.error('Error actualizando estado:', error);
      alert(`❌ Error: ${extraerMensajeError(error, 'No se pudo actualizar el estado')}`);
    } finally {
      setUpdating(false);
    }
  };

  const handleRegistrarPago = async () => {
    if (!appointmentDetails?.id || !user?.access_token) {
      alert('No se puede registrar pago: falta información de autenticación');
      return;
    }

    if (pagoModal.monto <= 0) {
      alert('El monto debe ser mayor a 0');
      return;
    }

    const pagosData = getPagosData();

    if (pagoModal.monto > pagosData.saldoPendiente) {
      alert(`El monto excede el saldo pendiente de $${pagosData.saldoPendiente}`);
      return;
    }

    const metodoPagoSeguro = sanitizeMetodoPago(pagoModal.metodoPago);
    const codigoGiftcard = pagoModal.codigoGiftcard.trim();
    if (metodoPagoSeguro === 'giftcard' && !codigoGiftcard) {
      alert('Debes ingresar el codigo de la Gift Card para registrar el pago.');
      return;
    }
    const confirmacion = confirm(
      `¿Registrar ${pagoModal.tipo === 'pago' ? 'pago' : 'abono'} de $${pagoModal.monto} por ${metodoPagoSeguro}?`
    );

    if (!confirmacion) return;

    setRegistrandoPago(true);
    try {
      const response = await registrarPagoCita(
        appointmentDetails.id,
        {
          monto: pagoModal.monto,
          metodo_pago: metodoPagoSeguro,
          ...(metodoPagoSeguro === 'giftcard' && codigoGiftcard ? { codigo_giftcard: codigoGiftcard } : {})
        },
        user.access_token
      );

      setAppointmentDetails((prev: any) => ({
        ...prev,
        rawData: {
          ...prev.rawData,
          abono: response.abono,
          saldo_pendiente: response.saldo_pendiente,
          estado_pago: response.estado_pago,
          metodo_pago: metodoPagoSeguro,
          ...(metodoPagoSeguro === 'giftcard' && codigoGiftcard ? { codigo_giftcard: codigoGiftcard } : {})
        }
      }));

      alert(`✅ ${pagoModal.tipo === 'pago' ? 'Pago' : 'Abono'} registrado exitosamente`);

      setPagoModal({
        show: false,
        tipo: 'pago',
        monto: 0,
        metodoPago: 'efectivo',
        codigoGiftcard: ''
      });

      if (onRefresh) {
        setTimeout(() => onRefresh(), 500);
      }

    } catch (error: any) {
      console.error('Error registrando pago:', error);
      alert(`❌ Error: ${extraerMensajeError(error, 'No se pudo registrar el pago')}`);
    } finally {
      setRegistrandoPago(false);
    }
  };

  const handleAgregarServicio = () => {
    if (!selectedServiceId) return;

    if (serviciosSeleccionados.some((servicio) => servicio.servicio_id === selectedServiceId)) {
      setServiceError('El servicio ya está agregado en la cita.');
      return;
    }

    const servicioCatalogo = serviciosDisponibles.find((servicio) => servicio.servicio_id === selectedServiceId);
    if (!servicioCatalogo) {
      setServiceError('No se encontró el servicio seleccionado.');
      return;
    }

    const nuevoServicio: ServicioSeleccionado = {
      servicio_id: servicioCatalogo.servicio_id,
      nombre: servicioCatalogo.nombre,
      precio_unitario: servicioCatalogo.precio,
      precio_unitario_input: String(servicioCatalogo.precio),
      precio_base: servicioCatalogo.precio,
      cantidad: 1,
      duracion_minutos: servicioCatalogo.duracion_minutos || 0,
      subtotal: roundMoney(servicioCatalogo.precio),
      precio_personalizado: null,
      usa_precio_personalizado: false
    };

    setServiciosSeleccionados((prev) => [...prev, nuevoServicio]);
    setSelectedServiceId('');
    setServiceError(null);
  };

  const handleEliminarServicio = (servicioId: string) => {
    setServiciosSeleccionados((prev) => prev.filter((servicio) => servicio.servicio_id !== servicioId));
    setServiceError(null);
  };

  const handleActualizarCantidad = (servicioId: string, cantidadInput: string) => {
    const cantidad = Math.max(1, Math.trunc(toNumber(cantidadInput) || 1));

    setServiciosSeleccionados((prev) =>
      prev.map((servicio) => {
        if (servicio.servicio_id !== servicioId) return servicio;
        const subtotal = roundMoney(servicio.precio_unitario * cantidad);
        return {
          ...servicio,
          cantidad,
          subtotal
        };
      })
    );
  };

  const handleActualizarPrecioServicio = (servicioId: string, precioInput: string) => {
    const normalizado = precioInput.replace(',', '.').trim();

    setServiciosSeleccionados((prev) =>
      prev.map((servicio) => {
        if (servicio.servicio_id !== servicioId) return servicio;
        if (normalizado === '') {
          return {
            ...servicio,
            precio_unitario_input: '',
            precio_unitario: 0,
            precio_personalizado: null,
            usa_precio_personalizado: false,
            subtotal: roundMoney(0 * servicio.cantidad)
          };
        }

        const precioNumerico = roundMoney(toNumber(normalizado));
        const usaPersonalizado = roundMoney(precioNumerico) !== roundMoney(servicio.precio_base);
        return {
          ...servicio,
          precio_unitario_input: normalizado,
          precio_unitario: precioNumerico,
          precio_personalizado: usaPersonalizado ? precioNumerico : null,
          usa_precio_personalizado: usaPersonalizado,
          subtotal: roundMoney(precioNumerico * servicio.cantidad)
        };
      })
    );
  };

  const handleAgregarProducto = async () => {
    if (!productosCatalogoCargado) {
      await cargarProductosDisponibles(true);
      return;
    }

    if (!selectedProductId) return;

    if (productos.some((producto) => producto.producto_id === selectedProductId)) {
      setServiceError('El producto ya está agregado en la cita.');
      return;
    }

    const productoCatalogo = productosDisponibles.find((producto) => producto.producto_id === selectedProductId);
    if (!productoCatalogo) {
      setServiceError('No se encontró el producto seleccionado.');
      return;
    }

    const nuevoProducto: ProductoSeleccionado = {
      producto_id: productoCatalogo.producto_id,
      nombre: productoCatalogo.nombre,
      cantidad: 1,
      precio_unitario: productoCatalogo.precio,
      subtotal: roundMoney(productoCatalogo.precio),
      moneda: productoCatalogo.moneda,
      comision_porcentaje: 0,
      comision_valor: 0,
      agregado_por_email: user?.email,
      agregado_por_rol: (user as any)?.rol || user?.role,
      fecha_agregado: new Date().toISOString(),
      profesional_id: profesionalEditadoId || appointmentDetails?.rawData?.profesional_id
    };

    setProductos((prev) => [...prev, nuevoProducto]);
    setSelectedProductId('');
    setServiceError(null);
  };

  const handleEliminarProducto = (productoId: string) => {
    setProductos((prev) => prev.filter((producto) => producto.producto_id !== productoId));
  };

  const handleActualizarCantidadProducto = (productoId: string, cantidadInput: string) => {
    const cantidad = Math.max(1, Math.trunc(toNumber(cantidadInput) || 1));
    setProductos((prev) =>
      prev.map((producto) => {
        if (producto.producto_id !== productoId) return producto;
        const subtotal = roundMoney(producto.precio_unitario * cantidad);
        const comisionPorcentaje = roundMoney(toNumber(producto.comision_porcentaje ?? 0));
        return {
          ...producto,
          cantidad,
          subtotal,
          comision_valor: roundMoney((subtotal * comisionPorcentaje) / 100)
        };
      })
    );
  };

  const handleActualizarPrecioProducto = (productoId: string, precioInput: string) => {
    const precio = Math.max(0, roundMoney(toNumber(precioInput)));
    setProductos((prev) =>
      prev.map((producto) => {
        if (producto.producto_id !== productoId) return producto;
        const precioUnitario = precio > 0 ? precio : producto.precio_unitario;
        const subtotal = roundMoney(precioUnitario * producto.cantidad);
        const comisionPorcentaje = roundMoney(toNumber(producto.comision_porcentaje ?? 0));
        return {
          ...producto,
          precio_unitario: precioUnitario,
          subtotal,
          comision_valor: roundMoney((subtotal * comisionPorcentaje) / 100)
        };
      })
    );
  };

  const handleOpenProductosSelector = async () => {
    if (!productosCatalogoCargado) {
      await cargarProductosDisponibles();
    }
  };

  const handleGuardarServicios = async () => {
    if (!appointmentDetails?.id || !user?.access_token) {
      alert('No se puede guardar: falta información de autenticación.');
      return;
    }

    if (isEstadoNoEditableServicios) {
      alert('No se pueden editar servicios en el estado actual de la cita.');
      return;
    }

    if (serviciosSeleccionados.length === 0) {
      setServiceError('Debes mantener al menos un servicio en la cita.');
      return;
    }

    if (!fechaEditada || !horaInicioEditada || !horaFinEditada || !profesionalEditadoId) {
      setServiceError('Debes completar fecha, hora de inicio, hora de fin y profesional.');
      return;
    }

    const horaInicioMinutos = convertirHoraAMinutos(horaInicioEditada);
    const horaFinMinutos = convertirHoraAMinutos(horaFinEditada);
    if (!Number.isFinite(horaInicioMinutos) || !Number.isFinite(horaFinMinutos) || horaFinMinutos <= horaInicioMinutos) {
      setServiceError('La hora de fin debe ser mayor que la hora de inicio.');
      return;
    }

    const servicioConPrecioInvalido = serviciosSeleccionados.find((servicio) => {
      const valorInput = String(servicio.precio_unitario_input ?? '').trim();
      return valorInput === '' || toNumber(valorInput) <= 0;
    });

    if (servicioConPrecioInvalido) {
      setServiceError(`El servicio "${servicioConPrecioInvalido.nombre}" tiene un precio inválido.`);
      return;
    }

    setSavingServicios(true);
    setServiceError(null);

    try {
      const serviciosPayload = serviciosSeleccionados.map((servicio) => ({
        servicio_id: servicio.servicio_id,
        precio: roundMoney(toNumber(servicio.precio_unitario_input)),
        cantidad: servicio.cantidad
      }));
      const productosPayload = productos.map((producto) => ({
        producto_id: producto.producto_id,
        precio: producto.precio_unitario,
        cantidad: producto.cantidad
      }));
      const notasActuales = extractAgendaAdditionalNotes(appointmentDetails);

      const response = await updateCita(
        appointmentDetails.id,
        {
          fecha: fechaEditada,
          hora_inicio: horaInicioEditada,
          hora_fin: horaFinEditada,
          profesional_id: profesionalEditadoId,
          servicios: serviciosPayload,
          productos: productosPayload,
          notas: notasActuales
        },
        user.access_token
      );

      const citaActualizada = response?.cita || {};
      const serviciosActualizados = normalizarServiciosCita(citaActualizada.servicios || []);
      const productosActualizados = normalizarProductosCita(citaActualizada.productos || []);

      setServiciosSeleccionados(serviciosActualizados);
      setServiciosOriginales(serviciosActualizados);
      setProductos(productosActualizados);
      setProductosOriginales(productosActualizados);

      const fechaNueva = String(citaActualizada.fecha || fechaEditada).slice(0, 10);
      const horaInicioNueva = normalizeAgendaTimeValue(String(citaActualizada.hora_inicio || horaInicioEditada))
        || horaInicioEditada;
      const horaFinNueva = normalizeAgendaTimeValue(String(citaActualizada.hora_fin || horaFinEditada))
        || horaFinEditada;
      const profesionalNuevo = String(citaActualizada.profesional_id || profesionalEditadoId);
      setFechaEditada(fechaNueva);
      setHoraInicioEditada(horaInicioNueva);
      setHoraFinEditada(horaFinNueva);
      setProfesionalEditadoId(profesionalNuevo);
      setHorarioOriginal({
        fecha: fechaNueva,
        hora_inicio: horaInicioNueva,
        hora_fin: horaFinNueva,
        profesional_id: profesionalNuevo
      });

      setAppointmentDetails((prev: any) => ({
        ...prev,
        start: citaActualizada.hora_inicio || prev?.start,
        end: citaActualizada.hora_fin || prev?.end,
        servicio_nombre: citaActualizada.servicio_nombre || prev?.servicio_nombre,
        estilista_nombre: citaActualizada.profesional_nombre || prev?.estilista_nombre,
        profesional_id: citaActualizada.profesional_id || prev?.profesional_id,
        rawData: {
          ...prev?.rawData,
          ...citaActualizada,
          servicios: citaActualizada.servicios || prev?.rawData?.servicios || [],
          productos: citaActualizada.productos || prev?.rawData?.productos || [],
          fecha: citaActualizada.fecha || prev?.rawData?.fecha,
          hora_inicio: citaActualizada.hora_inicio || prev?.rawData?.hora_inicio,
          hora_fin: citaActualizada.hora_fin || prev?.rawData?.hora_fin,
          profesional_id: citaActualizada.profesional_id || prev?.rawData?.profesional_id,
          profesional_nombre: citaActualizada.profesional_nombre || prev?.rawData?.profesional_nombre,
          valor_total: citaActualizada.valor_total ?? prev?.rawData?.valor_total,
          saldo_pendiente: citaActualizada.saldo_pendiente ?? prev?.rawData?.saldo_pendiente,
          estado_pago: citaActualizada.estado_pago ?? prev?.rawData?.estado_pago
        }
      }));

      alert('Cambios de la cita actualizados correctamente.');
      if (onRefresh) {
        setTimeout(() => onRefresh(), 400);
      }
    } catch (error: any) {
      const mensaje = extraerMensajeError(error, 'No se pudieron guardar los cambios de la cita.');
      setServiceError(mensaje);
      alert(`Error al guardar cambios: ${mensaje}`);
    } finally {
      setSavingServicios(false);
    }
  };

  const getStatusColor = (_: string) => {
    return 'bg-gray-100 text-gray-900 border border-gray-300';
  };

  const getEstadoPagoColor = (_: string) => {
    return 'bg-gray-100 text-gray-900 border border-gray-300';
  };

  const getEstadoPagoTexto = (estado: string, pagosData: any) => {
    if (!pagosData) return 'PENDIENTE';

    switch (estado?.toLowerCase()) {
      case 'pagado':
        return 'PAGADO';
      case 'abonado':
        return 'PAGO PARCIAL';
      case 'pendiente':
        return pagosData.tieneAbono ? 'PAGO PARCIAL' : 'SIN PAGO';
      default:
        return estado?.toUpperCase() || 'PENDIENTE';
    }
  };

  const formatFechaSegura = (fechaString: string) => {
    return formatDateDMY(fechaString, 'Fecha no especificada');
  };

  const getPrecio = () => {
    if (!appointmentDetails) return '0';

    const precioGuardado =
      appointmentDetails.valor_total ||
      appointmentDetails.rawData?.valor_total ||
      appointmentDetails.precio ||
      '0';

    const precioNumericoGuardado = toNumber(precioGuardado);
    const usarTotalCalculado = serviciosSeleccionados.length > 0 || productos.length > 0;
    const total = usarTotalCalculado ? totalCitaCalculado : precioNumericoGuardado;

    return roundMoney(total).toString();
  };

  const getTotalProductos = () => {
    if (productos.length === 0) return 0;
    return productos.reduce((total, producto) => total + toNumber(producto.subtotal), 0);
  };

  const getTotalComision = () => {
    if (productos.length === 0) return 0;
    return productos.reduce((total, producto) => total + toNumber(producto.comision_valor), 0);
  };

  const formatFechaHora = (fechaString: string) => {
    if (!fechaString) return 'Fecha no disponible';
    const fecha = new Date(fechaString);
    if (Number.isNaN(fecha.getTime())) {
      return formatDateDMY(fechaString, fechaString);
    }
    const horas = String(fecha.getHours()).padStart(2, '0');
    const minutos = String(fecha.getMinutes()).padStart(2, '0');
    return `${formatDateDMY(fecha)} ${horas}:${minutos}`;
  };

  const renderPagoModal = () => {
    if (!pagoModal.show) return null;

    const pagosData = getPagosData();
    const tipoTexto = pagoModal.tipo === 'pago' ? 'pago' : 'abono';
    const maxMonto = pagosData.saldoPendiente;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-20 flex items-center justify-center z-50 p-1">
        <div className="bg-white rounded w-full max-w-xs shadow-lg border border-gray-200">
          <div className="p-2">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-xs font-semibold text-gray-900">
                Registrar {tipoTexto}
              </h3>
              <button
                onClick={() => setPagoModal(prev => ({ ...prev, show: false }))}
                className="text-gray-500 hover:text-gray-700 p-0.5"
                disabled={registrandoPago}
              >
                <X className="w-3 h-3" />
              </button>
            </div>

            <div className="space-y-1.5">
              <div className="bg-gray-50 p-1.5 rounded text-[10px]">
                <div className="text-gray-600 mb-0.5">Cliente</div>
                <div className="font-medium text-gray-900">{appointmentDetails.cliente_nombre}</div>
                <div className="text-gray-600 mt-0.5">
                  Saldo: <span className="font-bold text-gray-900">${pagosData.saldoPendiente}</span>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-medium text-gray-700 mb-0.5">
                  Monto *
                </label>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-500 text-[10px]">$</span>
                  <input
                    type="number"
                    min="0"
                    max={maxMonto}
                    step="0.01"
                    value={pagoModal.monto || ''}
                    onChange={(e) => setPagoModal(prev => ({
                      ...prev,
                      monto: parseFloat(e.target.value) || 0
                    }))}
                    className="w-full pl-5 pr-1.5 py-1 text-xs border border-gray-300 rounded focus:ring-0 focus:border-black"
                    placeholder={`0.00 (máx: $${maxMonto})`}
                    disabled={registrandoPago}
                  />
                </div>
                <div className="text-[9px] text-gray-500 mt-0.5">
                  Saldo disponible: ${maxMonto}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-medium text-gray-700 mb-0.5">
                  Método de pago *
                </label>
                <div className={`grid grid-cols-2 sm:grid-cols-3 ${isCopCurrency ? 'lg:grid-cols-6' : 'lg:grid-cols-5'} gap-1`}>
                  <button
                    type="button"
                    onClick={() => setPagoModal(prev => ({ ...prev, metodoPago: 'efectivo' }))}
                    className={`p-1 rounded border flex flex-col items-center justify-center gap-0.5 text-[10px] ${
                      pagoModal.metodoPago === 'efectivo' ? 'border-black bg-gray-50' : 'border-gray-300 hover:border-gray-400'
                    }`}
                    disabled={registrandoPago}
                  >
                    <Wallet className="w-3 h-3 text-gray-700" />
                    <span className="font-medium">Efectivo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPagoModal(prev => ({ ...prev, metodoPago: 'transferencia' }))}
                    className={`p-1 rounded border flex flex-col items-center justify-center gap-0.5 text-[10px] ${
                      pagoModal.metodoPago === 'transferencia' ? 'border-black bg-gray-50' : 'border-gray-300 hover:border-gray-400'
                    }`}
                    disabled={registrandoPago}
                  >
                    <Landmark className="w-3 h-3 text-gray-700" />
                    <span className="font-medium">Transfer.</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPagoModal(prev => ({ ...prev, metodoPago: 'tarjeta_credito' }))}
                    className={`p-1 rounded border flex flex-col items-center justify-center gap-0.5 text-[10px] ${
                      pagoModal.metodoPago === 'tarjeta_credito' ? 'border-black bg-gray-50' : 'border-gray-300 hover:border-gray-400'
                    }`}
                    disabled={registrandoPago}
                  >
                    <CreditCard className="w-3 h-3 text-gray-700" />
                    <span className="font-medium">T. Crédito</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPagoModal(prev => ({ ...prev, metodoPago: 'tarjeta_debito' }))}
                    className={`p-1 rounded border flex flex-col items-center justify-center gap-0.5 text-[10px] ${
                      pagoModal.metodoPago === 'tarjeta_debito' ? 'border-black bg-gray-50' : 'border-gray-300 hover:border-gray-400'
                    }`}
                    disabled={registrandoPago}
                  >
                    <CreditCard className="w-3 h-3 text-gray-700" />
                    <span className="font-medium">T. Débito</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPagoModal(prev => ({ ...prev, metodoPago: 'giftcard' }))}
                    className={`p-1 rounded border flex flex-col items-center justify-center gap-0.5 text-[10px] ${
                      pagoModal.metodoPago === 'giftcard' ? 'border-black bg-gray-50' : 'border-gray-300 hover:border-gray-400'
                    }`}
                    disabled={registrandoPago}
                  >
                    <Gift className="w-3 h-3 text-gray-700" />
                    <span className="font-medium">Gift Card</span>
                  </button>
                  {isCopCurrency && (
                    <button
                      type="button"
                      onClick={() => setPagoModal(prev => ({ ...prev, metodoPago: 'addi' }))}
                      className={`p-1 rounded border flex flex-col items-center justify-center gap-0.5 text-[10px] ${
                        pagoModal.metodoPago === 'addi' ? 'border-black bg-gray-50' : 'border-gray-300 hover:border-gray-400'
                      }`}
                      disabled={registrandoPago}
                    >
                      <Wallet className="w-3 h-3 text-gray-700" />
                      <span className="font-medium">Addi</span>
                    </button>
                  )}
                </div>
              </div>

              {pagoModal.metodoPago === 'giftcard' && (
                <div>
                  <label className="block text-[10px] font-medium text-gray-700 mb-0.5">
                    Codigo Gift Card *
                  </label>
                  <input
                    type="text"
                    value={pagoModal.codigoGiftcard}
                    onChange={(e) => setPagoModal(prev => ({ ...prev, codigoGiftcard: e.target.value }))}
                    className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-0 focus:border-black"
                    placeholder="Ej: RFC-GCP-1234"
                    disabled={registrandoPago}
                  />
                </div>
              )}

              <div className="flex gap-1 pt-1">
                <button
                  type="button"
                  onClick={() => setPagoModal(prev => ({ ...prev, show: false }))}
                  className="flex-1 py-1 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 font-medium text-[10px]"
                  disabled={registrandoPago}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleRegistrarPago}
                  disabled={
                    registrandoPago ||
                    pagoModal.monto <= 0 ||
                    pagoModal.monto > maxMonto ||
                    (pagoModal.metodoPago === 'giftcard' && !pagoModal.codigoGiftcard.trim())
                  }
                  className="flex-1 py-1 bg-black text-white rounded hover:bg-gray-800 font-medium text-[10px] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {registrandoPago ? (
                    <>
                      <Loader2 className="w-2.5 h-2.5 animate-spin inline mr-0.5" />
                      Registrando...
                    </>
                  ) : (
                    `Registrar ${tipoTexto}`
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderProductos = () => {
    const productosDisponiblesParaAgregar = productosDisponibles.filter(
      (producto) => !productos.some((seleccionado) => seleccionado.producto_id === producto.producto_id)
    );

    return (
      <div className="space-y-1.5">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-1.5">
          <select
            value={selectedProductId}
            onChange={(e) => setSelectedProductId(e.target.value)}
            onFocus={() => { void handleOpenProductosSelector(); }}
            onClick={() => { void handleOpenProductosSelector(); }}
            disabled={isServiceActionsDisabled || loadingProductosDisponibles}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:ring-0 focus:border-black disabled:bg-gray-100"
          >
            <option value="">
              {loadingProductosDisponibles
                ? 'Cargando productos...'
                : productosCatalogoCargado
                  ? 'Seleccionar producto para agregar'
                  : 'Haz clic para cargar productos'}
            </option>
            {productosDisponiblesParaAgregar.map((producto) => (
              <option key={producto.producto_id} value={producto.producto_id}>
                {producto.nombre} - ${producto.precio}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleAgregarProducto}
            disabled={
              isServiceActionsDisabled ||
              loadingProductosDisponibles ||
              (productosCatalogoCargado && (
                !selectedProductId ||
                productosDisponiblesParaAgregar.length === 0
              ))
            }
            className="px-2 py-1 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 flex items-center justify-center gap-1 font-medium text-xs disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-3 h-3" />
            {productosCatalogoCargado ? 'Agregar producto' : 'Cargar productos'}
          </button>
        </div>

        <div className="bg-gray-50 p-1.5 rounded grid grid-cols-3 gap-1 text-xs">
          <div className="text-center">
            <div className="text-gray-600 font-medium">Total Productos</div>
            <div className="text-sm font-bold text-gray-900">${roundMoney(totalProductos)}</div>
          </div>
          <div className="text-center">
            <div className="text-gray-600 font-medium">Comisión Total</div>
            <div className="text-sm font-bold text-gray-900">
              ${roundMoney(productos.reduce((total, producto) => total + toNumber(producto.comision_valor ?? 0), 0))}
            </div>
          </div>
          <div className="text-center">
            <div className="text-gray-600 font-medium">Cantidad</div>
            <div className="text-sm font-bold text-gray-900">{productos.length}</div>
          </div>
        </div>

        {productos.length === 0 ? (
          <div className="text-center py-2 text-gray-400 text-xs border border-dashed border-gray-300 rounded">
            <Package className="w-5 h-5 mx-auto mb-1 text-gray-300" />
            <p>No hay productos registrados</p>
          </div>
        ) : (
          <div className="space-y-1">
            {productos.map((producto) => (
              <div key={producto.producto_id} className="p-1.5 border border-gray-200 rounded hover:bg-gray-50">
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <ShoppingBag className="w-3 h-3 text-gray-700 flex-shrink-0" />
                      <h4 className="text-xs font-bold text-gray-900 truncate">
                        {producto.nombre}
                      </h4>
                    </div>

                    <div className="grid grid-cols-2 gap-1 text-[10px] mb-1">
                      <div>
                        <label className="block text-gray-600 mb-0.5">Cantidad</label>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={producto.cantidad}
                          onChange={(e) => handleActualizarCantidadProducto(producto.producto_id, e.target.value)}
                          disabled={isServiceActionsDisabled}
                          className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:ring-0 focus:border-black disabled:bg-gray-100"
                        />
                      </div>
                      <div>
                        <label className="block text-gray-600 mb-0.5">Precio unitario</label>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={producto.precio_unitario}
                          onChange={(e) => handleActualizarPrecioProducto(producto.producto_id, e.target.value)}
                          disabled={isServiceActionsDisabled}
                          className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:ring-0 focus:border-black disabled:bg-gray-100"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-1 text-[10px]">
                      <div className="text-gray-600">
                        Subtotal: <span className="font-bold text-green-700">${producto.subtotal}</span>
                      </div>
                      <div className="text-gray-600">
                        Comisión: <span className="font-bold text-blue-700">${roundMoney(toNumber(producto.comision_valor ?? 0))}</span>
                        <span className="text-gray-500 ml-0.5">({roundMoney(toNumber(producto.comision_porcentaje ?? 0))}%)</span>
                      </div>
                    </div>

                    {producto.fecha_agregado && (
                      <div className="text-[9px] text-gray-500 flex items-center gap-1 mt-0.5">
                        <CalendarDays className="w-2 h-2" />
                        <span className="truncate">
                          {formatFechaHora(producto.fecha_agregado)}
                        </span>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleEliminarProducto(producto.producto_id)}
                    disabled={isServiceActionsDisabled}
                    className="p-1 text-gray-500 hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Eliminar producto"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderServiciosEditor = () => {
    const serviciosDisponiblesParaAgregar = serviciosDisponibles.filter(
      (servicio) => !serviciosSeleccionados.some((seleccionado) => seleccionado.servicio_id === servicio.servicio_id)
    );

    return (
      <div className="space-y-2">
        {serviceError && (
          <div className="p-2 border border-red-200 bg-red-50 rounded text-xs text-red-700">
            {serviceError}
          </div>
        )}

        {isEstadoNoEditableServicios && (
          <div className="p-2 border border-gray-300 bg-gray-50 rounded text-xs text-gray-700">
            Esta cita no permite edición de servicios por su estado actual.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-1.5">
          <select
            value={selectedServiceId}
            onChange={(e) => setSelectedServiceId(e.target.value)}
            disabled={isServiceActionsDisabled || loadingServiciosDisponibles}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:ring-0 focus:border-black disabled:bg-gray-100"
          >
            <option value="">
              {loadingServiciosDisponibles ? 'Cargando servicios...' : 'Seleccionar servicio para agregar'}
            </option>
            {serviciosDisponiblesParaAgregar.map((servicio) => (
              <option key={servicio.servicio_id} value={servicio.servicio_id}>
                {servicio.nombre} - ${servicio.precio}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleAgregarServicio}
            disabled={
              isServiceActionsDisabled ||
              loadingServiciosDisponibles ||
              !selectedServiceId ||
              serviciosDisponiblesParaAgregar.length === 0
            }
            className="px-2 py-1 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 flex items-center justify-center gap-1 font-medium text-xs disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-3 h-3" />
            Agregar servicio
          </button>
        </div>

        {serviciosSeleccionados.length === 0 ? (
          <div className="text-center py-3 text-gray-400 text-xs border border-dashed border-gray-300 rounded">
            No hay servicios seleccionados en esta cita.
          </div>
        ) : (
          <div className="space-y-1">
            {serviciosSeleccionados.map((servicio) => (
              <div key={servicio.servicio_id} className="p-2 border border-gray-200 rounded">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-900 truncate">{servicio.nombre}</p>
                    <p className="text-[10px] text-gray-600">
                      Precio unitario: ${servicio.precio_unitario}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleEliminarServicio(servicio.servicio_id)}
                    disabled={isServiceActionsDisabled}
                    className="p-1 text-gray-500 hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Eliminar servicio"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-1.5">
                  <div>
                    <label className="block text-[10px] text-gray-600 mb-0.5">Precio unitario</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      pattern="[0-9]*[.,]?[0-9]*"
                      value={servicio.precio_unitario_input}
                      onChange={(e) => handleActualizarPrecioServicio(servicio.servicio_id, e.target.value)}
                      disabled={isServiceActionsDisabled}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:ring-0 focus:border-black disabled:bg-gray-100"
                      placeholder="0"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-gray-600 mb-0.5">Cantidad</label>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={servicio.cantidad}
                      onChange={(e) => handleActualizarCantidad(servicio.servicio_id, e.target.value)}
                      disabled={isServiceActionsDisabled}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:ring-0 focus:border-black disabled:bg-gray-100"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-1.5">
                  <div>
                    <label className="block text-[10px] text-gray-600 mb-0.5">Subtotal</label>
                    <div className="border border-gray-200 rounded px-2 py-1 text-xs font-semibold text-gray-900 bg-gray-50">
                      ${servicio.subtotal}
                    </div>
                  </div>
                  <div className="text-[10px] text-gray-500 flex items-end">
                    {servicio.usa_precio_personalizado ? 'Precio personalizado' : 'Precio base'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="bg-gray-50 p-2 rounded grid grid-cols-2 gap-1 text-xs">
          <div className="text-gray-700">
            Total servicios: <span className="font-bold text-gray-900">${totalServicios}</span>
          </div>
          <div className="text-gray-700 text-right">
            Total estimado cita: <span className="font-bold text-gray-900">${totalCitaCalculado}</span>
          </div>
        </div>

        <div className="flex justify-end items-center gap-2">
          {hasUnsavedServiceChanges && !hasUnsavedProductChanges && !hasUnsavedScheduleChanges && (
            <span className="text-[10px] text-gray-600">Hay cambios sin guardar</span>
          )}
        </div>
      </div>
    );
  };

  if (!appointmentDetails) return null;

  const pagosData = getPagosData();

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title=""
        className="w-full max-w-[95vw] lg:max-w-[85vw] xl:max-w-[75vw]"
      >
        <div className="overflow-y-auto max-h-[90vh] md:max-h-[85vh]">
          {updating ? (
            <div className="flex flex-col items-center justify-center py-4">
              <Loader2 className="w-5 h-5 text-gray-900 animate-spin mb-1" />
              <p className="text-xs text-gray-600">Actualizando estado...</p>
            </div>
          ) : (
            <div className="space-y-2 p-2">
              {/* Panel de Debug */}
              {showDebug && (
                <div className="bg-black text-white p-1.5 rounded mb-1.5 max-h-60 overflow-y-auto text-[9px]">
                  <div className="flex justify-between items-center mb-1">
                    <h3 className="text-xs font-bold flex items-center gap-0.5">
                      <Bug className="w-2.5 h-2.5" />
                      Debug Data
                    </h3>
                    <button
                      onClick={() => setShowDebug(false)}
                      className="text-gray-300 hover:text-white p-0.5"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>

                  <div className="space-y-1">
                    <div>
                      <h4 className="text-xs font-semibold text-gray-300 mb-0.5">💰 Cálculos de Pagos:</h4>
                      <div className="space-y-0.5">
                        <div><span className="text-gray-400">Total Cita:</span> <span className="text-white">${pagosData.totalCita}</span></div>
                        <div><span className="text-gray-400">Abonado:</span> <span className="text-white">${pagosData.abonado}</span></div>
                        <div><span className="text-gray-400">Saldo Pendiente:</span> <span className="text-white">${pagosData.saldoPendiente}</span></div>
                        <div><span className="text-gray-400">Estado Pago:</span> <span className="text-white">{pagosData.estadoPago}</span></div>
                        <div><span className="text-gray-400">Total Productos:</span> <span className="text-white">${getTotalProductos()}</span></div>
                        <div><span className="text-gray-400">Comisión Total:</span> <span className="text-white">${getTotalComision()}</span></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Header Superior */}
              <div className="flex justify-between items-center mb-1">
                <h2 className="text-sm font-semibold text-gray-900">Detalles de cita</h2>
                <button
                  onClick={onClose}
                  className="text-gray-500 hover:text-gray-700 hover:bg-gray-100 p-0.5 rounded"
                >
                </button>
              </div>

              {/* Header Principal */}
              <div className="border-b border-gray-200 pb-2">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-1">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className="w-6 h-6 bg-gray-100 rounded flex items-center justify-center flex-shrink-0">
                        <User className="w-3 h-3 text-gray-700" />
                      </div>
                      <div className="min-w-0">
                        <h1 className="text-base font-bold text-gray-900 truncate">
                          {appointmentDetails.cliente_nombre || 'Cliente'}
                        </h1>
                        <p className="text-xs text-gray-700 truncate">
                          {appointmentDetails.servicio_nombre || 'Servicio'}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1 mt-1.5">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className={`px-1.5 py-0.5 rounded font-medium text-[10px] border border-gray-300 ${getStatusColor(appointmentDetails.estado)}`}>
                          {appointmentDetails.estado?.toUpperCase() || 'PENDIENTE'}
                        </span>

                        {pagosData.tieneAbono && !pagosData.estaPagadoCompleto && (
                          <div className="flex items-center gap-0.5 bg-gray-100 px-1.5 py-0.5 rounded text-[10px]">
                            <Tag className="w-2.5 h-2.5 text-gray-800" />
                            <div className="font-bold text-gray-800">Abono parcial</div>
                          </div>
                        )}

                        <span className={`px-1.5 py-0.5 rounded font-medium text-[10px] border border-gray-300 ${getEstadoPagoColor(pagosData.estadoPago)}`}>
                          {getEstadoPagoTexto(pagosData.estadoPago, pagosData)}
                        </span>
                      </div>

                      <div className="text-sm font-bold text-gray-900 border-l border-gray-300 pl-1.5">
                        Total: <span className="text-black">${getPrecio()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Contenido Principal */}
              <div className="space-y-2">
                {/* Información del Cliente */}
                <div className="bg-white border border-gray-200 rounded p-2">
                  <div className="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-gray-200">
                    <User className="w-3 h-3 text-gray-700 flex-shrink-0" />
                    <h3 className="text-sm font-bold text-gray-900 truncate">Información del Cliente</h3>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <Users className="w-3.5 h-3.5 text-gray-700" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-gray-900 truncate">
                          {appointmentDetails.cliente_nombre}
                        </p>
                        {appointmentDetails.rawData?.cliente_telefono && (
                          <div className="flex items-center gap-1 text-xs text-gray-600 mt-0.5">
                            <Phone className="w-2.5 h-2.5" />
                            <span className="truncate">{appointmentDetails.rawData.cliente_telefono}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {appointmentDetails.rawData?.cliente_email && (
                      <div>
                        <div className="text-xs text-gray-500 font-medium mb-0.5">Email</div>
                        <div className="flex items-center gap-1">
                          <Mail className="w-2.5 h-2.5 text-gray-500 flex-shrink-0" />
                          <p className="text-sm font-medium text-gray-900 truncate">{appointmentDetails.rawData.cliente_email}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Horario y Sede */}
                <div className="bg-white border border-gray-200 rounded p-2">
                  <div className="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-gray-200">
                    <CalendarDays className="w-3 h-3 text-gray-700 flex-shrink-0" />
                    <h3 className="text-sm font-bold text-gray-900 truncate">Horario y Sede</h3>
                  </div>

                  <div className="space-y-1.5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-500 font-medium mb-0.5 block">Fecha</label>
                        <input
                          type="date"
                          value={fechaEditada}
                          onChange={(e) => setFechaEditada(e.target.value)}
                          disabled={isServiceActionsDisabled}
                          className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:ring-0 focus:border-black disabled:bg-gray-100"
                        />
                      </div>

                      <div>
                        <label className="text-xs text-gray-500 font-medium mb-0.5 block">Profesional</label>
                        <select
                          value={profesionalEditadoId}
                          onChange={(e) => setProfesionalEditadoId(e.target.value)}
                          disabled={isServiceActionsDisabled || loadingProfesionales}
                          className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:ring-0 focus:border-black disabled:bg-gray-100"
                        >
                          <option value="">
                            {loadingProfesionales ? 'Cargando profesionales...' : 'Seleccionar profesional'}
                          </option>
                          {profesionalesDisponibles.map((profesional) => (
                            <option key={profesional.profesional_id} value={profesional.profesional_id}>
                              {profesional.nombre}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-500 font-medium mb-0.5 block">Hora inicio</label>
                        <TimeInputWithPicker
                          value={horaInicioEditada}
                          onChange={(e) => {
                            setHoraInicioEditada(e.target.value);
                          }}
                          disabled={isServiceActionsDisabled}
                          inputClassName="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:ring-0 focus:border-black disabled:bg-gray-100"
                          buttonClassName="h-5 w-5"
                        />
                      </div>

                      <div>
                        <div className="mb-0.5 flex items-center justify-between gap-2">
                          <label className="text-xs text-gray-500 font-medium block">Hora fin</label>
                          <button
                            type="button"
                            onClick={() => {
                              if (!horaInicioEditada) return;

                              const duracionActual = convertirHoraAMinutos(horaFinEditada) - convertirHoraAMinutos(horaInicioEditada);
                              const duracionParaAuto = duracionTotalServicios > 0
                                ? duracionTotalServicios
                                : (Number.isFinite(duracionActual) && duracionActual > 0 ? duracionActual : 30);
                              setHoraFinEditada(sumarMinutosAHora(horaInicioEditada, duracionParaAuto));
                              setHoraFinManual(false);
                            }}
                            disabled={isServiceActionsDisabled || !horaInicioEditada}
                            className="inline-flex items-center gap-1 rounded border border-gray-300 bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-700 transition-colors hover:bg-gray-200 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Wand2 className="h-3 w-3" />
                            Auto
                          </button>
                        </div>
                        <TimeInputWithPicker
                          value={horaFinEditada}
                          onChange={(e) => {
                            setHoraFinEditada(e.target.value);
                            setHoraFinManual(true);
                          }}
                          disabled={isServiceActionsDisabled}
                          inputClassName="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:ring-0 focus:border-black disabled:bg-gray-100"
                          buttonClassName="h-5 w-5"
                        />
                      </div>
                    </div>

                    <div className="text-[10px] text-gray-600">
                      Duración total estimada: <span className="font-semibold">{duracionTotalServicios} min</span>
                    </div>
                    <div className="text-[10px] text-gray-500">
                      Horario actual: {formatAgendaTime(horaInicioEditada)} - {formatAgendaTime(horaFinEditada)} ({horaFinManual ? 'manual' : 'automática'})
                    </div>
                    <div className="text-[10px] text-gray-500">
                      Fecha actual guardada: {formatFechaSegura(appointmentDetails.rawData?.fecha) || 'No definida'}
                    </div>
                  </div>
                </div>

                {/* Servicios de la cita */}
                <div className="bg-white border border-gray-200 rounded p-2">
                  <div className="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-gray-200">
                    <Tag className="w-3 h-3 text-gray-700 flex-shrink-0" />
                    <h3 className="text-sm font-bold text-gray-900 truncate">
                      Servicios de la cita {serviciosSeleccionados.length > 0 && `(${serviciosSeleccionados.length})`}
                    </h3>
                  </div>
                  {renderServiciosEditor()}
                </div>

                {/* Productos y Extras - MODIFICADO */}
                <div className="bg-white border border-gray-200 rounded p-2">
                  <div className="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-gray-200">
                    <Package className="w-3 h-3 text-gray-700 flex-shrink-0" />
                    <h3 className="text-sm font-bold text-gray-900 truncate">
                      Productos y extras {productos.length > 0 && `(${productos.length})`}
                    </h3>
                  </div>

                  {renderProductos()}
                </div>

                {/* Pagos y Abonos */}
                <div className="bg-white border border-gray-200 rounded p-2">
                  <div className="flex items-center justify-between gap-1.5 mb-2 pb-1.5 border-b border-gray-200">
                    <div className="flex items-center gap-1.5">
                      <Tag className="w-3 h-3 text-gray-700 flex-shrink-0" />
                      <h3 className="text-sm font-bold text-gray-900 truncate">Pagos y Abonos</h3>
                    </div>
                    
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        onClick={() => setPagoModal({
                          show: true,
                          tipo: 'pago',
                          monto: pagosData.saldoPendiente,
                          metodoPago: 'efectivo',
                          codigoGiftcard: ''
                        })}
                        disabled={pagosData.estaPagadoCompleto || registrandoPago || hasUnsavedChanges}
                        className="px-2 py-1 bg-black text-white rounded hover:bg-gray-800 flex items-center justify-center gap-1 font-medium text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <DollarSign className="w-2.5 h-2.5" />  
                        <span>Registrar Pago</span>
                      </button>
                      <button
                        onClick={() => setPagoModal({
                          show: true,
                          tipo: 'abono',
                          monto: 0,
                          metodoPago: 'efectivo',
                          codigoGiftcard: ''
                        })}
                        disabled={pagosData.estaPagadoCompleto || registrandoPago || hasUnsavedChanges}
                        className="px-2 py-1 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 flex items-center justify-center gap-1 font-medium text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Plus className="w-2.5 h-2.5" />
                        <span>Agregar Abono</span>
                      </button>
                    </div>
                  </div>

                  {hasUnsavedChanges && (
                    <div className="mb-2 p-1.5 text-[10px] text-gray-700 bg-gray-50 border border-gray-200 rounded">
                      Guarda los cambios pendientes antes de registrar pagos o abonos.
                    </div>
                  )}

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 mb-3">
                    <div className="bg-gray-50 p-1.5 rounded text-center">
                      <div className="text-xs text-gray-600 font-medium">Total</div>
                      <div className="text-sm font-bold text-gray-900">
                        ${hasUnsavedChanges ? totalCitaCalculado : pagosData.totalCita}
                      </div>
                    </div>

                    <div className={`p-1.5 rounded text-center ${pagosData.tieneAbono ? 'bg-gray-100' : 'bg-gray-50'}`}>
                      <div className={`text-xs font-medium ${pagosData.tieneAbono ? 'text-gray-900' : 'text-gray-600'}`}>
                        {pagosData.tieneAbono ? 'Abonado' : 'Sin abono'}
                      </div>
                      <div className={`text-sm font-bold ${pagosData.tieneAbono ? 'text-black' : 'text-gray-700'}`}>
                        ${pagosData.abonado}
                      </div>
                    </div>

                    <div className={`p-1.5 rounded text-center ${pagosData.saldoPendiente > 0 ? 'bg-gray-100' : 'bg-gray-50'}`}>
                      <div className={`text-xs font-medium ${pagosData.saldoPendiente > 0 ? 'text-gray-900' : 'text-gray-600'}`}>
                        Saldo
                      </div>
                      <div className={`text-sm font-bold ${pagosData.saldoPendiente > 0 ? 'text-black' : 'text-gray-700'}`}>
                        ${pagosData.saldoPendiente}
                      </div>
                    </div>

                    <div className={`p-1.5 rounded text-center ${pagosData.estaPagadoCompleto ? 'bg-gray-100' : 'bg-gray-50'}`}>
                      <div className={`text-xs font-medium ${pagosData.estaPagadoCompleto ? 'text-gray-900' : 'text-gray-600'}`}>
                        {pagosData.estaPagadoCompleto ? 'Pagado' : 'Falta'}
                      </div>
                      <div className={`text-sm font-bold ${pagosData.estaPagadoCompleto ? 'text-black' : 'text-gray-700'}`}>
                        ${pagosData.estaPagadoCompleto ? 0 : pagosData.saldoPendiente}
                      </div>
                    </div>
                  </div>

                  {/* Historial de Pagos */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <h4 className="text-xs font-bold text-gray-900">Historial de pagos</h4>
                    </div>

                    <div className="space-y-1">
                      {pagosData.pagos.length > 0 ? (
                        pagosData.pagos.map((pago, index) => (
                          <div key={index} className="p-1.5 border border-gray-200 rounded text-xs">
                            <div className="flex justify-between items-start">
                              <div className="flex items-start gap-2 min-w-0 flex-1">
                                <div className={`w-6 h-6 rounded flex items-center justify-center flex-shrink-0 ${pago.metodo === 'Efectivo' ? 'bg-gray-100' : 'bg-gray-100'}`}>
                                  {pago.metodo === 'Efectivo' ?
                                    <Wallet className="w-3 h-3 text-gray-700" /> :
                                    <CardIcon className="w-3 h-3 text-gray-700" />
                                  }
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="font-semibold text-gray-900 truncate">
                                    {pago.tipo} · ${pago.monto}
                                  </div>
                                  <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1 truncate">
                                    <CalendarDays className="w-2.5 h-2.5 flex-shrink-0" />
                                    <span className="truncate">{pago.fecha} • {pago.metodo}</span>
                                  </div>
                                  <div className="text-xs text-gray-400 truncate">
                                    Registrado por: {pago.registradoPor}
                                  </div>
                                </div>
                              </div>
                              <CheckCircle className="w-3 h-3 text-gray-700 flex-shrink-0 mt-0.5" />
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-2 text-gray-400 text-xs">
                          <Wallet className="w-4 h-4 mx-auto mb-1 text-gray-300" />
                          <p>No hay pagos registrados</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Notas Adicionales */}
                <div className="bg-white border border-gray-200 rounded p-2">
                  <div className="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-gray-200">
                    <AlertCircle className="w-3 h-3 text-gray-700 flex-shrink-0" />
                    <h3 className="text-sm font-bold text-gray-900 truncate">Notas adicionales</h3>
                  </div>

                  {tieneNotasAdicionales ? (
                    <div className="py-1 px-0.5 text-xs text-gray-700 whitespace-pre-wrap break-words">
                      {notasAdicionales}
                    </div>
                  ) : (
                    <div className="text-center py-2 text-gray-400 text-xs">
                      <AlertCircle className="w-4 h-4 mx-auto mb-1 text-gray-300" />
                      <p>No hay notas adicionales</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Acciones Finales */}
              <div className="flex flex-col sm:flex-row justify-between gap-1.5 pt-2 border-t border-gray-200">
                <div className="flex gap-1.5">
                  <button
                    onClick={handleGuardarServicios}
                    disabled={isServiceActionsDisabled || !hasUnsavedChanges || serviciosSeleccionados.length === 0}
                    className="flex-1 sm:flex-none px-2 py-1 bg-black text-white rounded hover:bg-gray-800 font-medium flex items-center justify-center gap-1 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {savingServicios ? (
                      <>
                        <Loader2 className="w-2.5 h-2.5 animate-spin" />
                        Guardando...
                      </>
                    ) : (
                      'Guardar cambios'
                    )}
                  </button>

                  <button
                    onClick={() => handleUpdateStatus('cancelada')}
                    disabled={shouldDisableActions()}
                    className="flex-1 sm:flex-none px-2 py-1 bg-black text-white rounded hover:bg-gray-800 font-medium flex items-center justify-center gap-1 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <XCircle className="w-2.5 h-2.5" />
                    Cancelar Cita
                  </button>

                  <button
                    onClick={() => handleUpdateStatus('no asistio')}
                    disabled={shouldDisableActions()}
                    className="flex-1 sm:flex-none px-2 py-1 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 font-medium flex items-center justify-center gap-1 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <UserX className="w-2.5 h-2.5" />
                    No Asistió
                  </button>
                </div>

                <button
                  onClick={onClose}
                  className="px-2 py-1 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 font-medium text-xs mt-1 sm:mt-0"
                  disabled={updating || savingServicios}
                >
                  Cerrar
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Modal para registrar pago/abono */}
      {renderPagoModal()}
    </>
  );
};

export default AppointmentDetailsModal;
