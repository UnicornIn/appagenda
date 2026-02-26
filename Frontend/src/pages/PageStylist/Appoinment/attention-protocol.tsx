// src/components/AttentionProtocol.tsx - VERSIÓN CORREGIDA CON ENDPOINT DE FICHAS
"use client";

import { useState, useEffect } from "react"
import { ChevronRight, Calendar, FileText, Package, Save, CheckCircle, ArrowLeft, Eye, Download, Camera, Clock, AlertCircle } from "lucide-react"
import { Button } from "../../../components/ui/button"
import { FichaDiagnosticoRizotipo } from './fichas/FichaDiagnosticoRizotipo'
import { FichaColor } from './fichas/FichaColor'
import { FichaAsesoriaCorte } from './fichas/FichaAsesoriaCorte'
import { FichaCuidadoPostColor } from './fichas/FichaCuidadoPostColor'
import { FichaValoracionPruebaColor } from './fichas/FichaValoracionPruebaColor'
import { API_BASE_URL } from '../../../types/config'
// Añadir al inicio del archivo, junto con los otros imports
import { Ban } from "lucide-react";  // <-- AÑADIR ESTE
import BloqueosModal from "../../../components/Quotes/Bloqueos";  // <-- AÑADIR ESTE (ajusta la ruta)
import { ProductManagementPanel } from "./ProductManagementPanel"
import { ZoomIn, X, ExternalLink } from "lucide-react";
import { ShoppingCart } from "lucide-react";
import { formatSedeNombre } from "../../../lib/sede";
import { formatDateDMY } from "../../../lib/dateFormat";

interface AttentionProtocolProps {
  citaSeleccionada?: any;
  onFechaSeleccionada?: (fecha: string) => void;
  onFinalizarServicio?: (citaId: string) => void;
  onVolver?: () => void;
  usuarioRol?: string; // <-- AÑADIR ESTA LÍNEA
  onCitaActualizada?: (citaActualizada: any) => void;
}

type TipoFicha =
  | "DIAGNOSTICO_RIZOTIPO"
  | "COLOR"
  | "ASESORIA_CORTE"
  | "CUIDADO_POST_COLOR"
  | "VALORACION_PRUEBA_COLOR";

type VistaPrincipal = "fichas" | "productos" | "calendario" | "menu-principal" | "ver-fichas";

// Interfaz para datos de fichas guardadas
interface FichaGuardada {
  tipo: TipoFicha;
  datos: any;
  fechaGuardado: string;
  citaId: string;
}

// Interfaz para fichas obtenidas del servidor
interface FichaServidor {
  id: string;
  cliente_id: string;
  nombre: string;
  apellido: string | null;
  telefono: string;
  cedula: string;
  servicio_id: string;
  profesional_id: string;
  sede_id: string;
  fecha_ficha: string;
  fecha_reserva: string;
  tipo_ficha: TipoFicha;
  precio: number;
  estado: string;
  estado_pago: string;
  contenido: any;
  servicio_nombre: string;
  profesional_nombre: string;
  sede_nombre: string;
}

export function AttentionProtocol({
  citaSeleccionada,
  onFechaSeleccionada,
  onFinalizarServicio,
  onVolver,
  usuarioRol = "estilista",
}: AttentionProtocolProps) {
  const [tipoFichaSeleccionada, setTipoFichaSeleccionada] = useState<TipoFicha | null>(null)
  const [vistaActual, setVistaActual] = useState<VistaPrincipal>("calendario")
  const [mesActual, setMesActual] = useState<Date>(new Date())
  const [fichasGuardadas, setFichasGuardadas] = useState<FichaGuardada[]>([])
  const [fichasCliente, setFichasCliente] = useState<FichaServidor[]>([])
  const [mostrarConfirmacionFinalizar, setMostrarConfirmacionFinalizar] = useState(false)
  const [loadingFichas, setLoadingFichas] = useState(false)
  const [loadingFinalizar, setLoadingFinalizar] = useState(false)
  const [detalleFicha, setDetalleFicha] = useState<FichaServidor | null>(null)
  const [mostrarModalBloqueos, setMostrarModalBloqueos] = useState(false);
  const [fechaSeleccionadaParaBloqueo, setFechaSeleccionadaParaBloqueo] = useState<string>("");
  const [totalProductos, setTotalProductos] = useState(0);
  const [, setCitaConProductos] = useState<any>(citaSeleccionada);
  const [, setProductosCita] = useState<any[]>([]);
  const [imagenAmpliada, setImagenAmpliada] = useState<{
    url: string;
    alt: string;
    tipo: 'antes' | 'despues';
    index: number;
    total: number;
  } | null>(null);

  // Cargar fichas guardadas del localStorage al inicializar  
  useEffect(() => {
    const fichasGuardadasStorage = localStorage.getItem('fichasPendientes')
    if (fichasGuardadasStorage) {
      setFichasGuardadas(JSON.parse(fichasGuardadasStorage))
    }
  }, [])

  // Cargar fichas del cliente cuando hay cita seleccionada
  useEffect(() => {
    if (citaSeleccionada) {
      setCitaConProductos(citaSeleccionada);

      // Extraer productos de la cita si existen
      const productosExistentes = citaSeleccionada.productos || [];
      setProductosCita(productosExistentes);

      // Calcular total de productos existentes
      const totalProductosExistentes = productosExistentes.reduce((sum: number, p: any) =>
        sum + (p.subtotal || (p.precio_unitario || 0) * (p.cantidad || 1)), 0
      );
      setTotalProductos(totalProductosExistentes);

      if (citaSeleccionada?.cliente?.cliente_id) {
        fetchFichasCliente(citaSeleccionada.cliente.cliente_id);
      }
    }
  }, [citaSeleccionada]);

  // Guardar fichas en localStorage cuando cambien
  useEffect(() => {
    localStorage.setItem('fichasPendientes', JSON.stringify(fichasGuardadas))
  }, [fichasGuardadas])



  // Función para obtener fichas del cliente - COMPLETA
  const fetchFichasCliente = async (clienteId: string) => {
    setLoadingFichas(true);
    try {
      const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');

      if (!token) {
        console.error('No hay token de autenticación');
        return;
      }

      console.log('🔍 Buscando fichas para cliente:', clienteId);
      console.log('🔗 Endpoint:', `${API_BASE_URL}clientes/fichas/${clienteId}`);

      const response = await fetch(`${API_BASE_URL}clientes/fichas/${clienteId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });

      console.log('📊 Response status:', response.status);

      if (!response.ok) {
        if (response.status === 404) {
          console.log(`ℹ️ No se encontraron fichas para el cliente ${clienteId}`);
          setFichasCliente([]);
          return;
        }
        const errorText = await response.text();
        console.error('❌ Error response:', errorText);
        throw new Error(`Error ${response.status}: ${errorText || response.statusText}`);
      }

      const fichas = await response.json();
      console.log(`✅ Fichas recibidas: ${fichas.length}`);

      // 🔥 Mapear las fichas al formato esperado por el componente
      const fichasMapeadas: FichaServidor[] = fichas.map((ficha: any) => {
        console.log('📊 Estructura de ficha recibida:', {
          id: ficha._id,
          servicio: ficha.servicio_nombre,
          tiene_fotos: !!ficha.fotos,
          fotos_antes: ficha.fotos?.antes?.length || 0,
          fotos_despues: ficha.fotos?.despues?.length || 0,
          contenido_keys: Object.keys(ficha).filter(key => key !== 'fotos')
        });

        // 🔥 FUNCIÓN PARA ARREGLAR URLs HTTPS A HTTP
        const fixS3Url = (url: string): string => {
          if (!url) return '';
          // Si es una URL de S3 de AWS, cambiar https por http para evitar problemas de certificado
          if (url.includes('s3.amazonaws.com') || url.includes('.s3.')) {
            return url.replace('https://', 'http://');
          }
          return url;
        };

        // 🔥 ARREGLAR URLs DE FOTOS
        const fotosArregladas = ficha.fotos ? {
          antes: ficha.fotos.antes?.map(fixS3Url) || [],
          despues: ficha.fotos.despues?.map(fixS3Url) || [],
          antes_urls: ficha.fotos.antes_urls?.map(fixS3Url) || [],
          despues_urls: ficha.fotos.despues_urls?.map(fixS3Url) || []
        } : undefined;

        return {
          id: ficha._id,
          cliente_id: ficha.cliente_id,
          nombre: ficha.nombre,
          apellido: ficha.apellido,
          telefono: ficha.telefono,
          cedula: ficha.cedula,
          servicio_id: ficha.servicio_id,
          profesional_id: ficha.profesional_id,
          sede_id: ficha.sede_id,
          fecha_ficha: ficha.fecha_ficha,
          fecha_reserva: ficha.fecha_reserva,
          tipo_ficha: ficha.tipo_ficha as TipoFicha,
          precio: ficha.precio || 0,
          estado: ficha.estado || 'completado',
          estado_pago: ficha.estado_pago || 'pagado',
          contenido: {
            datos_especificos: {
              ...ficha.datos_especificos,
              fotos: fotosArregladas,
              autorizacion_publicacion: ficha.autorizacion_publicacion,
              comentario_interno: ficha.comentario_interno || ficha.descripcion_servicio || ''
            },
            respuestas: ficha.respuestas || [],
            fotos: fotosArregladas, // 🔥 Asegurar que las fotos estén en el nivel superior también
            autorizacion_publicacion: ficha.autorizacion_publicacion,
            comentario_interno: ficha.comentario_interno || ficha.descripcion_servicio || ''
          },
          servicio_nombre: ficha.servicio_nombre || ficha.servicio || 'Servicio sin nombre',
          profesional_nombre: ficha.profesional_nombre || ficha.estilista || 'Estilista no asignado',
          sede_nombre: formatSedeNombre(ficha.sede_nombre || ficha.sede || ficha.local, 'Sede no especificada')
        };
      });

      console.log('📋 Fichas mapeadas:', fichasMapeadas.length);
      setFichasCliente(fichasMapeadas);

    } catch (error) {
      console.error('❌ Error fetching fichas:', error);
      alert(`Error al cargar fichas: ${error instanceof Error ? error.message : 'Error desconocido'}`);
      setFichasCliente([]);
    } finally {
      setLoadingFichas(false);
    }
  };
  // Función para formatear la fecha
  const formatFecha = (fechaString: string) => formatDateDMY(fechaString, fechaString)

  // Función para obtener el nombre del tipo de ficha
  const getNombreTipoFicha = (tipo: TipoFicha) => {
    switch (tipo) {
      case "DIAGNOSTICO_RIZOTIPO": return "Diagnóstico Rizotipo"
      case "COLOR": return "Ficha Color"
      case "ASESORIA_CORTE": return "Asesoría de Corte"
      case "CUIDADO_POST_COLOR": return "Cuidado Post Color"
      case "VALORACION_PRUEBA_COLOR": return "Valoración Prueba Color"
      default: return (tipo as string).replace(/_/g, ' ')
    }
  }

  // FUNCIÓN SIMPLIFICADA: SIEMPRE puede finalizar si está pendiente/confirmada
  const puedeMostrarFinalizar = (cita: any): boolean => {
    console.log('🔍 Verificando si puede mostrar botón finalizar para cita:', cita?.cita_id);

    // Verificar si la cita existe
    if (!cita || !cita.cita_id) {
      console.log('❌ No hay cita válida');
      return false;
    }

    // Obtener información del estado
    const estadoInfo = getEstadoCita(cita);
    const estadoNormalizado = estadoInfo.estado.toLowerCase();

    console.log(`📊 Estado de la cita: "${estadoInfo.estado}" (normalizado: "${estadoNormalizado}")`);

    // Estados que PERMITEN finalizar (pendiente o confirmada)
    const estadosPermitidos = [
      "pendiente",
      "confirmada",
      "confirmado",
      "reservada",
      "reservado",
      "en proceso",       // Agregado por si acaso
      "en_proceso",
      "en curso"
    ];

    // Verificar si el estado está permitido
    const puedeFinalizar = estadosPermitidos.some(estado =>
      estadoNormalizado.includes(estado.toLowerCase())
    );

    console.log(`✅ ¿Puede finalizar? ${puedeFinalizar} - Estado: ${estadoNormalizado}`);
    return puedeFinalizar;
  };

  // Función para obtener el color según el tipo de ficha
  const getColorPorTipoFicha = (tipo: TipoFicha) => {
    switch (tipo) {
      case "DIAGNOSTICO_RIZOTIPO": return "bg-purple-100 text-purple-800 border-purple-200";
      case "COLOR": return "bg-pink-100 text-pink-800 border-pink-200";
      case "ASESORIA_CORTE": return "bg-blue-100 text-blue-800 border-blue-200";
      case "CUIDADO_POST_COLOR": return "bg-orange-100 text-orange-800 border-orange-200";
      case "VALORACION_PRUEBA_COLOR": return "bg-green-100 text-green-800 border-green-200";
      default: return "bg-gray-100 text-gray-800 border-gray-200";
    }
  }

  // FUNCIÓN MEJORADA PARA FINALIZAR SERVICIO (ENDPOINT PUT)
  const finalizarServicioAPI = async (citaId: string) => {
    setLoadingFinalizar(true);
    try {
      const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');

      if (!token) {
        throw new Error('No hay token de autenticación');
      }

      console.log(`👤 Rol del usuario: ${usuarioRol}`);

      // Usar el endpoint PUT /scheduling/quotes/citas/{cita_id}/finalizar
      const response = await fetch(`${API_BASE_URL}scheduling/quotes/citas/${citaId}/finalizar`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      console.log('Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error response:', errorText);
        throw new Error(`Error ${response.status}: ${errorText || response.statusText}`);
      }

      const data = await response.json();
      console.log('✅ Servicio finalizado:', data);

      // Actualizar estado local de la cita
      if (citaSeleccionada) {
        citaSeleccionada.estado = "finalizado";
      }

      // Limpiar fichas guardadas de esta cita
      const fichasActualizadas = fichasGuardadas.filter(
        ficha => ficha.citaId !== citaId
      );
      setFichasGuardadas(fichasActualizadas);

      // Notificar al componente padre si existe
      if (onFinalizarServicio) {
        onFinalizarServicio(citaId);
      }

      // Resetear vista
      setMostrarConfirmacionFinalizar(false);
      setVistaActual("calendario");
      setTipoFichaSeleccionada(null);

      // Mostrar mensaje según rol
      const mensaje = usuarioRol === "estilista"
        ? "✅ Servicio finalizado como estilista. El admin puede proceder con la facturación."
        : "✅ Servicio finalizado por administración.";

      alert(mensaje);

      // Recargar después de 2 segundos
      setTimeout(() => {
        window.location.reload();
      }, 2000);

    } catch (error) {
      console.error('❌ Error al finalizar servicio:', error);
      alert(error instanceof Error ? error.message : 'Error al finalizar el servicio');
    } finally {
      setLoadingFinalizar(false);
    }
  };

  const getEstadoCita = (cita: any) => {
    console.log(`🔄 Calculando estado para cita ${cita.cita_id}:`, {
      estado: cita.estado,
      estado_pago: cita.estado_pago,
      fecha: cita.fecha,
      hora_inicio: cita.hora_inicio
    });

    // PRIMERO: Verificar estado de pago si existe
    if (cita.estado_pago) {
      const estadoPagoNormalizado = cita.estado_pago.toLowerCase().trim();
      console.log(`- Estado de pago: "${estadoPagoNormalizado}"`);

      if (estadoPagoNormalizado === "pagado" || estadoPagoNormalizado === "pagada") {
        return {
          estado: "Pagada",
          color: "bg-green-100 text-green-800 border-green-200",
          icon: <CheckCircle className="w-4 h-4" />
        };
      }
    }

    // SEGUNDO: Verificar el estado principal
    if (cita.estado) {
      const estadoNormalizado = cita.estado.toLowerCase().trim();
      console.log(`- Estado principal normalizado: "${estadoNormalizado}"`);

      const estadosMap: Record<string, any> = {
        "pendiente": {
          estado: "Pendiente",
          color: "bg-blue-100 text-blue-800 border-blue-200",
          icon: <Clock className="w-4 h-4" />
        },
        "reservada": {
          estado: "Pendiente",
          color: "bg-blue-100 text-blue-800 border-blue-200",
          icon: <Clock className="w-4 h-4" />
        },
        "confirmada": {
          estado: "Pendiente",
          color: "bg-blue-100 text-blue-800 border-blue-200",
          icon: <Clock className="w-4 h-4" />
        },
        "reservada/pendiente": {
          estado: "Pendiente",
          color: "bg-blue-100 text-blue-800 border-blue-200",
          icon: <Clock className="w-4 h-4" />
        },
        "en proceso": {
          estado: "En Proceso",
          color: "bg-yellow-100 text-yellow-800 border-yellow-200",
          icon: <Clock className="w-4 h-4 animate-pulse" />
        },
        "en_proceso": {
          estado: "En Proceso",
          color: "bg-yellow-100 text-yellow-800 border-yellow-200",
          icon: <Clock className="w-4 h-4 animate-pulse" />
        },
        "en curso": {
          estado: "En Proceso",
          color: "bg-yellow-100 text-yellow-800 border-yellow-200",
          icon: <Clock className="w-4 h-4 animate-pulse" />
        },
        "cancelada": {
          estado: "Cancelada",
          color: "bg-red-100 text-red-800 border-red-200",
          icon: <AlertCircle className="w-4 h-4" />
        },
        "cancelado": {
          estado: "Cancelada",
          color: "bg-red-100 text-red-800 border-red-200",
          icon: <AlertCircle className="w-4 h-4" />
        },
        "no asistio": {
          estado: "No Asistió",
          color: "bg-gray-100 text-gray-800 border-gray-200",
          icon: <AlertCircle className="w-4 h-4" />
        },
        "no asistió": {
          estado: "No Asistió",
          color: "bg-gray-100 text-gray-800 border-gray-200",
          icon: <AlertCircle className="w-4 h-4" />
        },
        "finalizada": {
          estado: "Finalizada",
          color: "bg-green-100 text-green-800 border-green-200",
          icon: <CheckCircle className="w-4 h-4" />
        },
        "finalizado": {
          estado: "Finalizada",
          color: "bg-green-100 text-green-800 border-green-200",
          icon: <CheckCircle className="w-4 h-4" />
        },
        "completada": {
          estado: "Finalizada",
          color: "bg-green-100 text-green-800 border-green-200",
          icon: <CheckCircle className="w-4 h-4" />
        },
        "completado": {
          estado: "Finalizada",
          color: "bg-green-100 text-green-800 border-green-200",
          icon: <CheckCircle className="w-4 h-4" />
        },
        "pagada": {
          estado: "Pagada",
          color: "bg-green-100 text-green-800 border-green-200",
          icon: <CheckCircle className="w-4 h-4" />
        },
        "pagado": {
          estado: "Pagada",
          color: "bg-green-100 text-green-800 border-green-200",
          icon: <CheckCircle className="w-4 h-4" />
        }
      };

      // Buscar coincidencia exacta o parcial
      for (const [key, value] of Object.entries(estadosMap)) {
        if (estadoNormalizado.includes(key.toLowerCase())) {
          console.log(`✓ Estado reconocido: "${key}" -> "${value.estado}"`);
          return value;
        }
      }

      console.log(`⚠️ Estado no reconocido en el mapa: "${estadoNormalizado}"`);
    }

    // TERCERO: Calcular por horario si no hay estado definido
    console.log(`- Calculando estado por horario...`);
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
        console.log(`✓ Cita futura -> Pendiente`);
        return {
          estado: "Pendiente",
          color: "bg-blue-100 text-blue-800 border-blue-200",
          icon: <Clock className="w-4 h-4" />
        };
      } else if (ahora >= inicioCita && ahora <= finCita) {
        console.log(`✓ Cita en horario -> En Proceso`);
        return {
          estado: "En Proceso",
          color: "bg-yellow-100 text-yellow-800 border-yellow-200",
          icon: <Clock className="w-4 h-4 animate-pulse" />
        };
      } else {
        console.log(`✓ Cita pasada -> Finalizada (por horario)`);
        return {
          estado: "Finalizada (por horario)",
          color: "bg-gray-100 text-gray-800 border-gray-200",
          icon: <Clock className="w-4 h-4" />
        };
      }
    } catch (error) {
      console.error(`❌ Error calculando horario:`, error);
      return {
        estado: "Pendiente",
        color: "bg-blue-100 text-blue-800 border-blue-200",
        icon: <Clock className="w-4 h-4" />
      };
    }
  };


  // Función para obtener información de cualquier mes
  const getMonthInfo = (fecha: Date) => {
    const year = fecha.getFullYear();
    const month = fecha.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const firstDayOfWeek = firstDay.getDay();
    const adjustedFirstDay = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

    const monthNames = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

    const now = new Date();
    const today = now.getDate();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    return {
      year,
      monthName: monthNames[month],
      monthNumber: month,
      today,
      currentMonth,
      currentYear,
      totalDays: lastDay.getDate(),
      firstDayOffset: adjustedFirstDay
    };
  };

  // Navegar al mes anterior
  const mesAnterior = () => {
    setMesActual(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(prev.getMonth() - 1);
      return newDate;
    });
  };

  // Navegar al mes siguiente
  const mesSiguiente = () => {
    setMesActual(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(prev.getMonth() + 1);
      return newDate;
    });
  };

  // Manejar clic en un día del calendario
  const handleDiaClick = (dia: number, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    const { year, monthNumber } = getMonthInfo(mesActual);
    const mesFormateado = (monthNumber + 1).toString().padStart(2, '0');
    const diaFormateado = dia.toString().padStart(2, '0');
    const fechaFormateada = `${year}-${mesFormateado}-${diaFormateado}`;

    // Verificar si el clic fue con la tecla Ctrl (o Cmd en Mac) para abrir bloqueos
    const isCtrlClick = event.ctrlKey || event.metaKey;

    if (isCtrlClick) {
      // Abrir modal de bloqueos para esta fecha
      setFechaSeleccionadaParaBloqueo(fechaFormateada);
      setMostrarModalBloqueos(true);
    } else {
      // Comportamiento normal: seleccionar fecha para ver citas
      if (onFechaSeleccionada) {
        onFechaSeleccionada(fechaFormateada);
      }
    }
  };
  // 🆕 AÑADIR ESTAS DOS FUNCIONES NUEVAS (después de handleDiaClick):

  // Función para abrir modal de bloqueos con opciones
  const abrirModalBloqueos = (fecha?: string) => {
    if (fecha) {
      setFechaSeleccionadaParaBloqueo(fecha);
    } else {
      // Usar la fecha actual si no se especifica
      const hoy = new Date();
      const fechaHoy = `${hoy.getFullYear()}-${(hoy.getMonth() + 1).toString().padStart(2, '0')}-${hoy.getDate().toString().padStart(2, '0')}`;
      setFechaSeleccionadaParaBloqueo(fechaHoy);
    }

    setMostrarModalBloqueos(true);
  };

  // Cerrar modal de bloqueos
  const cerrarModalBloqueos = () => {
    setMostrarModalBloqueos(false);
    setFechaSeleccionadaParaBloqueo("");
  };
  // Guardar ficha automáticamente
  const guardarFicha = (tipo: TipoFicha, datos: any) => {
    if (!citaSeleccionada) return;

    const nuevaFicha: FichaGuardada = {
      tipo,
      datos,
      fechaGuardado: new Date().toISOString(),
      citaId: citaSeleccionada.cita_id
    };

    const fichasActualizadas = fichasGuardadas.filter(
      ficha => !(ficha.citaId === citaSeleccionada.cita_id && ficha.tipo === tipo)
    );

    fichasActualizadas.push(nuevaFicha);
    setFichasGuardadas(fichasActualizadas);
  };

  // Cargar ficha guardada
  const cargarFichaGuardada = (tipo: TipoFicha) => {
    const fichaGuardada = fichasGuardadas.find(
      ficha => ficha.citaId === citaSeleccionada.cita_id && ficha.tipo === tipo
    );
    return fichaGuardada?.datos || null;
  };

  // Obtener fichas guardadas para la cita actual
  const getFichasGuardadasCitaActual = () => {
    if (!citaSeleccionada) return [];
    return fichasGuardadas.filter(ficha => ficha.citaId === citaSeleccionada.cita_id);
  };

  // Vista para ver fichas del cliente (detalle de una ficha) - COMPLETA CON IMÁGENES
  const renderDetalleFicha = () => {
    if (!detalleFicha) return null;

    console.log('🔍 DEBUG - Ficha seleccionada:', {
      id: detalleFicha.id,
      tiene_contenido: !!detalleFicha.contenido,
      tiene_datos_especificos: !!detalleFicha.contenido?.datos_especificos,
      tiene_fotos_contenido: !!detalleFicha.contenido?.fotos,
      tiene_fotos_datos: !!detalleFicha.contenido?.datos_especificos?.fotos
    });

    // 🔥 BUSCAR FOTOS EN LA ESTRUCTURA CORRECTA
    let fotos = null;
    let datosEspecificos = detalleFicha.contenido?.datos_especificos || detalleFicha.contenido;
    let autorizacionPublicacion = datosEspecificos?.autorizacion_publicacion;
    let comentarioInterno = datosEspecificos?.comentario_interno;

    // Buscar fotos en diferentes niveles
    fotos = detalleFicha.contenido?.fotos ||
      datosEspecificos?.fotos ||
      detalleFicha.contenido?.datos_especificos?.fotos;

    console.log('📸 Fotos encontradas:', fotos);

    // 🔥 FUNCIÓN PARA ARREGLAR URLs DE S3
    const fixS3Url = (url: string): string => {
      if (!url) return '';
      if (url.includes('s3.amazonaws.com') || url.includes('.s3.')) {
        return url.replace('https://', 'http://');
      }
      return url;
    };


    // 🔥 Obtener las URLs de las fotos
    let fotosAntes: string[] = [];
    let fotosDespues: string[] = [];

    if (fotos) {
      console.log('📸 Procesando estructura de fotos:', fotos);

      fotosAntes = fotos.antes || fotos.antes_urls || [];
      fotosDespues = fotos.despues || fotos.despues_urls || [];

      console.log('📸 Fotos Antes:', fotosAntes);
      console.log('📸 Fotos Después:', fotosDespues);
    }

    // Formatear el precio
    const precioFormateado = new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP'
    }).format(detalleFicha.precio);

    return (
      <div className="rounded-lg border bg-white p-4"> {/* REDUCIDO de p-6 */}
        {/* Botón de Volver */}
        <div className="mb-3"> {/* REDUCIDO de mb-4 */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDetalleFicha(null)}
            className="flex items-center gap-1 text-gray-600 hover:text-gray-900 text-xs"
          >
            <ArrowLeft className="w-3 h-3" /> {/* REDUCIDO de w-4 h-4 */}
            Volver a la lista
          </Button>
        </div>

        <div className="mb-4"> {/* REDUCIDO de mb-6 */}
          <div className="flex justify-between items-start mb-3"> {/* REDUCIDO de mb-4 */}
            <div>
              <h2 className="text-lg font-bold mb-1">{getNombreTipoFicha(detalleFicha.tipo_ficha)}</h2> {/* REDUCIDO de text-2xl */}
              <div className="flex items-center gap-2"> {/* REDUCIDO de gap-4 */}
                <p className="text-sm text-gray-600 font-medium"> {/* REDUCIDO texto */}
                  {detalleFicha.nombre} {detalleFicha.apellido || ''}
                </p>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getColorPorTipoFicha(detalleFicha.tipo_ficha)}`}>
                  {detalleFicha.estado}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1"> {/* REDUCIDO de text-sm */}
                {detalleFicha.servicio_nombre} • {formatFecha(detalleFicha.fecha_ficha)}
              </p>
            </div>
          </div>

          {/* Resumen destacado */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded p-3 mb-4"> {/* REDUCIDO de p-4 mb-6 */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3"> {/* REDUCIDO de gap-4 */}
              <div className="text-center">
                <div className="text-xs text-gray-600 mb-1">Servicio</div> {/* REDUCIDO de text-sm */}
                <div className="font-semibold text-sm">{detalleFicha.servicio_nombre}</div> {/* REDUCIDO de text-lg */}
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-600 mb-1">Fecha</div> {/* REDUCIDO de text-sm */}
                <div className="font-semibold text-sm">{formatFecha(detalleFicha.fecha_ficha)}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-600 mb-1">Profesional</div> {/* REDUCIDO de text-sm */}
                <div className="font-semibold text-sm">{detalleFicha.profesional_nombre}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-600 mb-1">Precio</div> {/* REDUCIDO de text-sm */}
                <div className="font-semibold text-sm text-green-600">{precioFormateado}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Información general */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4"> {/* REDUCIDO de gap-6 mb-6 */}
          <div className="bg-gray-50 p-3 rounded"> {/* REDUCIDO de p-4 */}
            <h3 className="font-semibold mb-2 text-sm">Información del Cliente</h3> {/* REDUCIDO de text-lg */}
            <div className="space-y-1"> {/* REDUCIDO de space-y-2 */}
              <p className="text-xs"><strong>Nombre:</strong> {detalleFicha.nombre} {detalleFicha.apellido || ''}</p> {/* REDUCIDO texto */}
              <p className="text-xs"><strong>Cédula:</strong> {detalleFicha.cedula}</p>
              <p className="text-xs"><strong>Teléfono:</strong> {detalleFicha.telefono}</p>
              <p className="text-xs"><strong>Sede:</strong> {formatSedeNombre(detalleFicha.sede_nombre, 'Sede no especificada')}</p>
            </div>
          </div>

          <div className="bg-gray-50 p-3 rounded"> {/* REDUCIDO de p-4 */}
            <h3 className="font-semibold mb-2 text-sm">Detalles del Servicio</h3> {/* REDUCIDO de text-lg */}
            <div className="space-y-1"> {/* REDUCIDO de space-y-2 */}
              <p className="text-xs"><strong>Estado de pago:</strong> {detalleFicha.estado_pago}</p>
              <p className="text-xs"><strong>Fecha reserva:</strong> {formatFecha(detalleFicha.fecha_reserva)}</p>
              {autorizacionPublicacion !== undefined && (
                <p className="text-xs">
                  <strong>Autorización publicación:</strong>{' '}
                  {autorizacionPublicacion ? (
                    <span className="text-green-600 font-medium">✅ Autorizado</span>
                  ) : (
                    <span className="text-red-600 font-medium">❌ No autorizado</span>
                  )}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* IMÁGENES ANTES Y DESPUÉS */}
        {(fotosAntes.length > 0 || fotosDespues.length > 0) && (
          <div className="mb-6">
            <h3 className="font-semibold text-base mb-4 border-b pb-1 flex items-center gap-2">
              <Camera className="w-4 h-4" /> {/* REDUCIDO de w-5 h-5 */}
              📸 Fotos del Servicio
            </h3>

            {/* Estado para el modal de imagen ampliada */}
            <div className="mb-4"> {/* REDUCIDO de mb-6 */}
              {/* Modal para imagen ampliada */}
              {imagenAmpliada && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-90">
                  <div className="relative w-full max-w-6xl bg-white rounded-2xl shadow-2xl overflow-hidden">
                    {/* Header del modal */}
                    <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-gray-50 to-white"> {/* REDUCIDO de p-6 */}
                      <div className="flex items-center gap-2">
                        <Camera className="h-5 w-5 text-blue-600" />
                        <div>
                          <h2 className="text-base font-bold text-gray-900">
                            {imagenAmpliada.tipo === 'antes' ? '📸 Imagen ANTES' : '✨ Imagen DESPUÉS'}
                          </h2>
                          <p className="text-xs text-gray-600">
                            {detalleFicha?.nombre} • {getNombreTipoFicha(detalleFicha?.tipo_ficha || 'COLOR')}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => setImagenAmpliada(null)}
                        className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                      >
                        <X className="h-5 w-5 text-gray-500" />
                      </button>
                    </div>


                    <div className="relative">
                      <div className="flex items-center justify-center min-h-[400px] max-h-[60vh] bg-gray-900"> {/* REDUCIDO alturas */}
                        <img
                          src={fixS3Url(imagenAmpliada.url)}
                          alt={imagenAmpliada.alt}
                          className="max-w-full max-h-full object-contain"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = imagenAmpliada.tipo === 'antes'
                              ? 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAwIiBoZWlnaHQ9IjYwMCIgdmlld0JveD0iMCAwIDgwMCA2MDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjgwMCIgaGVpZ2h0PSI2MDAiIGZpbGw9IiMzQjgyRjYiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0id2hpdGUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIzMiI+SU1BR0VOIEFOVEVTPC90ZXh0Pjwvc3ZnPg=='
                              : 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAwIiBoZWlnaHQ9IjYwMCIgdmlld0JveD0iMCAwIDgwMCA2MDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjgwMCIgaGVpZ2h0PSI2MDAiIGZpbGw9IiMxMEI5ODEiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0id2hpdGUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIzMiI+SU1BR0VOIERFU1BVw4lTPC90ZXh0Pjwvc3ZnPg==';
                          }}
                        />
                      </div>

                      <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2"> {/* REDUCIDO de bottom-6 gap-4 */}
                        <Button
                          variant="outline"
                          size="sm"
                          className="bg-white/90 backdrop-blur-sm text-xs"
                          onClick={() => window.open(fixS3Url(imagenAmpliada.url), '_blank')}
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          Abrir
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="bg-white/90 backdrop-blur-sm text-xs"
                          onClick={() => {
                            const link = document.createElement('a');
                            link.href = fixS3Url(imagenAmpliada.url);
                            link.download = `ficha-${detalleFicha?.id}-${imagenAmpliada.tipo}.jpg`;
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                          }}
                        >
                          <Download className="h-3 w-3 mr-1" /> {/* REDUCIDO de h-4 w-4 mr-2 */}
                          Descargar
                        </Button>
                      </div>
                    </div>

                    {/* Footer del modal */}
                    <div className="p-3 bg-gray-50 border-t"> {/* REDUCIDO de p-4 */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1"> {/* REDUCIDO de gap-2 */}
                          <div className={`px-2 py-0.5 rounded-full text-xs font-medium ${imagenAmpliada.tipo === 'antes' ? 'bg-blue-100 text-blue-800 border border-blue-200' : 'bg-green-100 text-green-800 border border-green-200'}`}>
                            {imagenAmpliada.tipo === 'antes' ? 'ANTES' : 'DESPUÉS'}
                          </div>
                          <span className="text-xs text-gray-600">
                            Foto {imagenAmpliada.index + 1} de {imagenAmpliada.total}
                          </span>
                        </div>
                        <span className="text-xs text-gray-500"> {/* REDUCIDO de text-sm */}
                          Haz clic fuera para cerrar
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Comparación si hay ambas - CON IMÁGENES MÁS GRANDES */}
              {fotosAntes.length > 0 && fotosDespues.length > 0 && (
                <div className="mb-6">
                  <h4 className="font-medium text-gray-700 mb-3 text-base flex items-center gap-1"> {/* REDUCIDO de mb-4 text-lg gap-2 */}
                  </h4>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6"> {/* REDUCIDO de gap-8 */}
                    {/* Columna ANTES */}
                    <div className="space-y-3"> {/* REDUCIDO de space-y-4 */}
                      <div className="flex items-center justify-between">
                        <h5 className="font-medium text-blue-700 text-base flex items-center gap-1"> {/* REDUCIDO de text-lg gap-2 */}
                          Estado Inicial (Antes)
                        </h5>
                      </div>

                      {/* Contenedor principal de la imagen ANTES */}
                      <div className="relative group">
                        <div
                          className="border-2 border-blue-300 rounded-lg overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer bg-gradient-to-br from-blue-50 to-white"
                          onClick={() => setImagenAmpliada({
                            url: fotosAntes[0],
                            alt: 'Estado inicial - ANTES',
                            tipo: 'antes',
                            index: 0,
                            total: fotosAntes.length
                          })}
                        >
                          <div className="relative overflow-hidden">
                            <img
                              src={fixS3Url(fotosAntes[0])}
                              alt="Estado inicial - ANTES"
                              className="w-full h-56 object-cover transition-transform duration-700 group-hover:scale-110"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAwIiBoZWlnaHQ9IjQwMCIgdmlld0JveD0iMCAwIDYwMCA0MDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjYwMCIgaGVpZ2h0PSI0MDAiIGZpbGw9IiMzQjgyRjYiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0id2hpdGUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIyNCI+QU5URVM8L3RleHQ+PC9zdmc+';
                              }}
                            />

                            <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                              <div className="bg-white/90 backdrop-blur-sm p-2 rounded-full shadow-lg transform -translate-y-2 group-hover:translate-y-0 transition-transform duration-300"> {/* REDUCIDO de p-4 -translate-y-4 */}
                                <ZoomIn className="h-6 w-6 text-blue-600" />
                              </div>
                            </div>

                            <div className="absolute top-2 left-2">
                              <span className="bg-blue-600 text-white px-2 py-1 rounded-full text-xs font-bold shadow">
                                ANTES
                              </span>
                            </div>

                            {/* Indicador si hay más fotos */}
                            {fotosAntes.length > 1 && (
                              <div className="absolute top-2 right-2"> {/* REDUCIDO de top-4 right-4 */}
                                <span className="bg-blue-800/90 text-white px-1.5 py-0.5 rounded-full text-xs font-semibold backdrop-blur-sm"> {/* REDUCIDO de px-3 py-1.5 */}
                                  +{fotosAntes.length - 1} más
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Información debajo de la imagen */}
                          <div className="p-3 bg-gradient-to-r from-blue-50 to-blue-100 border-t border-blue-200"> {/* REDUCIDO de p-5 */}
                            <p className="text-sm text-gray-800 font-medium text-center"> {/* REDUCIDO de text-base */}
                              Estado del cabello antes del servicio
                            </p>
                            <p className="text-xs text-gray-600 text-center mt-1 flex items-center justify-center gap-1"> {/* REDUCIDO de text-sm mt-2 gap-2 */}
                              <ZoomIn className="h-3 w-3" /> {/* REDUCIDO de h-4 w-4 */}
                              Haz clic para ver en tamaño completo
                            </p>
                          </div>
                        </div>

                        {/* Miniaturas si hay más fotos */}
                        {fotosAntes.length > 1 && (
                          <div className="flex gap-1 mt-2 overflow-x-auto pb-1"> {/* REDUCIDO de gap-2 mt-3 pb-2 */}
                            {fotosAntes.slice(1).map((url, idx) => (
                              <div
                                key={`antes-thumb-${idx}`}
                                className="flex-shrink-0 w-16 h-12 rounded overflow-hidden border border-blue-200 cursor-pointer hover:border-blue-400 transition-colors"
                                onClick={() => setImagenAmpliada({
                                  url,
                                  alt: `Antes ${idx + 2}`,
                                  tipo: 'antes',
                                  index: idx + 1,
                                  total: fotosAntes.length
                                })}
                              >
                                <img
                                  src={fixS3Url(url)}
                                  alt={`Antes ${idx + 2}`}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Columna DESPUÉS */}
                    <div className="space-y-3"> {/* REDUCIDO de space-y-4 */}
                      <div className="flex items-center justify-between">
                        <h5 className="font-medium text-green-700 text-base flex items-center gap-1"> {/* REDUCIDO de text-lg gap-2 */}
                          Resultado Final (Después)
                        </h5>

                      </div>

                      <div className="relative group">
                        <div
                          className="border-2 border-green-300 rounded-lg overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer bg-gradient-to-br from-green-50 to-white"
                          onClick={() => setImagenAmpliada({
                            url: fotosDespues[0],
                            alt: 'Resultado final - DESPUÉS',
                            tipo: 'despues',
                            index: 0,
                            total: fotosDespues.length
                          })}
                        >
                          {/* Imagen principal */}
                          <div className="relative overflow-hidden">
                            <img
                              src={fixS3Url(fotosDespues[0])}
                              alt="Resultado final - DESPUÉS"
                              className="w-full h-56 object-cover transition-transform duration-700 group-hover:scale-110"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAwIiBoZWlnaHQ9IjQwMCIgdmlld0JveD0iMCAwIDYwMCA0MDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjYwMCIgaGVpZ2h0PSI0MDAiIGZpbGw9IiMxMEI5ODEiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0id2hpdGUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIyNCI+REVTUFXDqVM8L3RleHQ+PC9zdmc+';
                              }}
                            />

                            <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                              <div className="bg-white/90 backdrop-blur-sm p-2 rounded-full shadow-lg transform -translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
                                <ZoomIn className="h-6 w-6 text-green-600" />
                              </div>
                            </div>

                            <div className="absolute top-2 left-2">
                              <span className="bg-green-600 text-white px-2 py-1 rounded-full text-xs font-bold shadow">
                                DESPUES
                              </span>
                            </div>

                            {fotosDespues.length > 1 && (
                              <div className="absolute top-2 right-2">
                                <span className="bg-green-800/90 text-white px-1.5 py-0.5 rounded-full text-xs font-semibold backdrop-blur-sm"> {/* REDUCIDO de px-3 py-1.5 */}
                                  +{fotosDespues.length - 1} más
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Información debajo de la imagen */}
                          <div className="p-3 bg-gradient-to-r from-green-50 to-green-100 border-t border-green-200"> {/* REDUCIDO de p-5 */}
                            <p className="text-sm text-gray-800 font-medium text-center"> {/* REDUCIDO de text-base */}
                              Resultado después del servicio
                            </p>
                            <p className="text-xs text-gray-600 text-center mt-1 flex items-center justify-center gap-1"> {/* REDUCIDO de text-sm mt-2 gap-2 */}
                              <ZoomIn className="h-3 w-3" /> {/* REDUCIDO de h-4 w-4 */}
                              Haz clic para ver en tamaño completo
                            </p>
                          </div>
                        </div>

                        {/* Miniaturas si hay más fotos */}
                        {fotosDespues.length > 1 && (
                          <div className="flex gap-1 mt-2 overflow-x-auto pb-1">
                            {fotosDespues.slice(1).map((url, idx) => (
                              <div
                                key={`despues-thumb-${idx}`}
                                className="flex-shrink-0 w-16 h-12 rounded overflow-hidden border border-green-200 cursor-pointer hover:border-green-400 transition-colors"
                                onClick={() => setImagenAmpliada({
                                  url,
                                  alt: `Después ${idx + 2}`,
                                  tipo: 'despues',
                                  index: idx + 1,
                                  total: fotosDespues.length
                                })}
                              >
                                <img
                                  src={fixS3Url(url)}
                                  alt={`Después ${idx + 2}`}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Datos específicos de la ficha (sin fotos) */}
        {datosEspecificos && Object.keys(datosEspecificos).filter(key =>
          key !== 'fotos' && key !== 'autorizacion_publicacion' && key !== 'comentario_interno'
        ).length > 0 && (
            <div className="mb-4"> {/* REDUCIDO de mb-6 */}
              <h3 className="font-semibold text-base mb-2 flex items-center gap-1"> {/* REDUCIDO de text-lg mb-3 gap-2 */}
                <span>📋</span> Datos de la Ficha
              </h3>
              <div className="bg-gray-50 p-3 rounded border"> {/* REDUCIDO de p-4 */}
                <div className="space-y-3"> {/* REDUCIDO de space-y-4 */}
                  {Object.entries(datosEspecificos).map(([key, value]: [string, any]) => {
                    // Saltar las fotos, autorización y comentario interno
                    if (['fotos', 'autorizacion_publicacion', 'comentario_interno'].includes(key)) return null;

                    return (
                      <div key={key} className="border-b pb-2 last:border-b-0"> {/* REDUCIDO de pb-3 */}
                        <h4 className="font-medium text-gray-700 capitalize mb-1 text-xs">{key.replace(/_/g, ' ')}:</h4> {/* REDUCIDO texto */}
                        {typeof value === 'object' && value !== null ? (
                          <pre className="mt-1 text-xs bg-white p-2 rounded border overflow-auto max-h-40"> {/* REDUCIDO de text-sm p-3 max-h-60 */}
                            {JSON.stringify(value, null, 2)}
                          </pre>
                        ) : (
                          <p className="mt-1 text-xs text-gray-600">{String(value)}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

        {/* Comentario interno (si existe) */}
        {comentarioInterno && (
          <div className="mb-4"> {/* REDUCIDO de mb-6 */}
            <h3 className="font-semibold text-base mb-2 flex items-center gap-1"> {/* REDUCIDO de text-lg mb-3 gap-2 */}
              <span>💬</span> Comentario Interno
            </h3>
            <div className="bg-yellow-50 border border-yellow-200 p-3 rounded"> {/* REDUCIDO de p-4 */}
              <p className="text-sm text-gray-700">{comentarioInterno}</p> {/* REDUCIDO de text-gray-700 */}
            </div>
          </div>
        )}
        {/* Botones de acción */}
        <div className="flex flex-wrap gap-2 justify-end pt-4 border-t"> {/* REDUCIDO de gap-3 pt-6 */}
        </div>
      </div>
    );
  };

  // Vista para ver fichas del cliente (lista)
  const renderVistaVerFichas = () => {
    if (detalleFicha) {
      return renderDetalleFicha();
    }

    return (
      <div className="rounded-lg border bg-white p-4">
        <div className="mb-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setVistaActual("menu-principal")}
            className="flex items-center gap-1 text-gray-600 hover:text-gray-900 text-xs"
          >
            <ArrowLeft className="w-3 h-3" />
            Volver a opciones
          </Button>
        </div>

        <div className="mb-4">
          <h2 className="text-lg font-bold mb-1">Fichas del Cliente</h2>
          <p className="text-sm text-gray-600">
            {citaSeleccionada?.cliente?.nombre} {citaSeleccionada?.cliente?.apellido || ''}
          </p>
          <p className="text-xs text-gray-500">
          </p>
        </div>

        {loadingFichas ? (
          <div className="text-center py-6"> {/* REDUCIDO de py-8 */}
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900 mx-auto"></div> {/* REDUCIDO de h-8 w-8 */}
            <p className="mt-2 text-sm text-gray-600">Cargando fichas...</p> {/* REDUCIDO de mt-3 */}
          </div>
        ) : fichasCliente.length === 0 ? (
          <div className="text-center py-6"> {/* REDUCIDO de py-8 */}
            <FileText className="h-10 w-10 mx-auto mb-3 text-gray-300" /> {/* REDUCIDO de h-12 w-12 mb-4 */}
            <p className="text-sm text-gray-600">No se encontraron fichas para este cliente</p>
            <p className="text-xs text-gray-500 mt-1"> {/* REDUCIDO de text-sm mt-2 */}
              Las fichas que crees usando las opciones anteriores aparecerán aquí
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 text-xs"
              onClick={() => setVistaActual("fichas")}
            >
              <FileText className="h-3 w-3 mr-1" />
              Crear primera ficha
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {fichasCliente.map((ficha) => {
              const datosEspecificos = ficha.contenido?.datos_especificos || ficha.contenido;
              const fotos = datosEspecificos?.fotos;
              let tieneFotos = false;

              if (fotos) {
                const fotosAntes = fotos.antes || fotos.antes_urls || [];
                const fotosDespues = fotos.despues || fotos.despues_urls || [];
                tieneFotos = fotosAntes.length > 0 || fotosDespues.length > 0;
              }

              return (
                <div
                  key={ficha.id}
                  className={`border rounded p-3 hover:shadow transition-shadow cursor-pointer ${getColorPorTipoFicha(ficha.tipo_ficha)}`}
                  onClick={() => setDetalleFicha(ficha)}
                >
                  <div className="flex justify-between items-start mb-1">
                    <div>
                      <h3 className="font-semibold text-sm">{ficha.servicio_nombre}</h3>
                      <p className="text-xs">
                        {getNombreTipoFicha(ficha.tipo_ficha)}
                      </p>
                    </div>
                    <span className={`px-1.5 py-0.5 rounded-full text-xs ${getColorPorTipoFicha(ficha.tipo_ficha)}`}> {/* REDUCIDO de px-2 py-1 */}
                      {ficha.estado}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-1 text-xs mb-2"> {/* REDUCIDO de gap-2 text-sm mb-3 */}
                    <div>
                      <span className="text-gray-600">Fecha:</span>
                      <span className="ml-1">{formatFecha(ficha.fecha_ficha)}</span> {/* REDUCIDO de ml-2 */}
                    </div>
                    <div>
                      <span className="text-gray-600">Profesional:</span>
                      <span className="ml-1">{ficha.profesional_nombre}</span> {/* REDUCIDO de ml-2 */}
                    </div>
                    <div>
                      <span className="text-gray-600">Sede:</span>
                      <span className="ml-1">{formatSedeNombre(ficha.sede_nombre, 'Sede no especificada')}</span> {/* REDUCIDO de ml-2 */}
                    </div>
                    <div>
                      <span className="text-gray-600">Precio:</span>
                      <span className="ml-1">${ficha.precio.toLocaleString()}</span> {/* REDUCIDO de ml-2 */}
                    </div>
                  </div>

                  {/* Indicador de fotos */}
                  {tieneFotos && (
                    <div className="mt-1 flex items-center gap-1"> {/* REDUCIDO de mt-2 gap-2 */}
                      <Camera className="w-3 h-3 text-gray-500" /> {/* REDUCIDO de w-4 h-4 */}
                      <span className="text-xs text-gray-600">Contiene fotos</span> {/* REDUCIDO de text-sm */}
                    </div>
                  )}

                  <div className="flex justify-end mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDetalleFicha(ficha);
                      }}
                      className="text-xs"
                    >
                      <Eye className="h-3 w-3 mr-1" /> {/* REDUCIDO de h-4 w-4 mr-2 */}
                      Ver Detalles
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // Vista de gestión de fichas
  const renderVistaFichas = () => {
    const fichasCitaActual = getFichasGuardadasCitaActual();

    return (
      <div className="rounded-lg border bg-white p-4">
        <div className="mb-3 flex justify-between items-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setVistaActual("menu-principal")}
            className="flex items-center gap-1 text-gray-600 hover:text-gray-900 text-xs"
          >
            <ArrowLeft className="w-3 h-3" />
            Volver a opciones
          </Button>
        </div>

        <div className="mb-4">
          <h2 className="text-lg font-bold mb-1">Fichas Técnicas</h2>
          <p className="text-sm text-gray-600">
            Selecciona una ficha para crear o continuar el diagnóstico
          </p>
        </div>

        {fichasCitaActual.length > 0 && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded"> {/* REDUCIDO de mb-6 p-4 rounded-lg */}
            <h4 className="font-semibold text-blue-800 mb-1 text-sm">Fichas en progreso ({fichasCitaActual.length})</h4> {/* REDUCIDO de mb-2 */}
            <div className="space-y-1"> {/* REDUCIDO de space-y-2 */}
              {fichasCitaActual.map((ficha, index) => (
                <div key={index} className="flex items-center justify-between p-2 bg-white rounded border"> {/* REDUCIDO de p-3 */}
                  <div className="flex items-center">
                    <FileText className="w-4 h-4 text-blue-600 mr-2" /> {/* REDUCIDO de w-5 h-5 mr-3 */}
                    <div>
                      <p className="font-medium text-sm">{getNombreTipoFicha(ficha.tipo)}</p> {/* REDUCIDO texto */}
                      <p className="text-xs text-gray-500"> {/* REDUCIDO de text-sm */}
                        Guardado: {new Date(ficha.fechaGuardado).toLocaleString('es-ES')}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTipoFichaSeleccionada(ficha.tipo)}
                    className="text-xs"
                  >
                    Continuar
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3"> {/* REDUCIDO de gap-4 */}
          {[
            {
              tipo: "DIAGNOSTICO_RIZOTIPO" as TipoFicha,
              titulo: "Diagnóstico Rizotipo",
              descripcion: "Análisis del tipo de cabello y diagnóstico completo",
              color: "bg-purple-50 border-purple-200 text-purple-800 hover:bg-purple-100"
            },
            {
              tipo: "COLOR" as TipoFicha,
              titulo: "Ficha Color",
              descripcion: "Registro de fórmulas y procesos de coloración",
              color: "bg-pink-50 border-pink-200 text-pink-800 hover:bg-pink-100"
            },
            {
              tipo: "ASESORIA_CORTE" as TipoFicha,
              titulo: "Asesoría de Corte",
              descripcion: "Recomendaciones y plan de corte personalizado",
              color: "bg-blue-50 border-blue-200 text-blue-800 hover:bg-blue-100"
            },
            {
              tipo: "CUIDADO_POST_COLOR" as TipoFicha,
              titulo: "Cuidado Post Color",
              descripcion: "Recomendaciones para mantenimiento después del color",
              color: "bg-orange-50 border-orange-200 text-orange-800 hover:bg-orange-100"
            },
            {
              tipo: "VALORACION_PRUEBA_COLOR" as TipoFicha,
              titulo: "Valoración Prueba Color",
              descripcion: "Evaluación de pruebas de color y resultados",
              color: "bg-green-50 border-green-200 text-green-800 hover:bg-green-100"
            }
          ].map((ficha) => (
            <button
              key={ficha.tipo}
              className={`p-4 rounded border-2 text-left transition-all hover:shadow ${ficha.color}`}
              onClick={() => setTipoFichaSeleccionada(ficha.tipo)}
            >
              <div className="flex items-center mb-2">
                <FileText className="w-6 h-6 mr-2" />
                <h4 className="font-semibold text-base">{ficha.titulo}</h4>
              </div>
              <p className="text-xs opacity-80">{ficha.descripcion}</p>
            </button>
          ))}
        </div>

        <div className="mt-6 pt-4 border-t">
          <p className="text-xs text-gray-500">
            <strong>Nota:</strong> Las fichas se guardan automáticamente en tu navegador hasta que finalices el servicio.
          </p>
        </div>
      </div>
    );
  };

  // Vista de gestión de productos
  const renderVistaProductos = () => {
    if (!citaSeleccionada) {
      return (
        <div className="rounded-lg border bg-white p-4">
          <div className="mb-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setVistaActual("menu-principal")}
              className="flex items-center gap-1 text-gray-600 hover:text-gray-900 text-xs"
            >
              <ArrowLeft className="w-3 h-3" />
              Volver a opciones
            </Button>
          </div>

          <div className="mb-4">
            <h2 className="text-lg font-bold mb-1">Gestión de Productos</h2>
            <p className="text-sm text-gray-600">
              Selecciona y gestiona los productos utilizados en este servicio
            </p>
          </div>

          <div className="text-center py-8">
            <Package className="h-16 w-16 mx-auto mb-4 text-gray-300" />
            <h3 className="text-base font-semibold text-gray-700 mb-1">
              No hay cita seleccionada
            </h3>
            <p className="text-sm text-gray-500 max-w-md mx-auto">
              Por favor, selecciona una cita para gestionar productos
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="rounded-lg border bg-white p-4">
        <div className="mb-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setVistaActual("menu-principal")}
            className="flex items-center gap-1 text-gray-600 hover:text-gray-900 text-xs"
          >
            <ArrowLeft className="w-3 h-3" />
            Volver a opciones
          </Button>
        </div>

        <div className="mb-4">
          <h2 className="text-lg font-bold mb-1">Gestión de Productos</h2>
          <p className="text-sm text-gray-600">
            Selecciona y gestiona los productos utilizados en este servicio
          </p>

          {/* Información de la cita */}
          <div className="mt-2 p-3 bg-gray-50 rounded border">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="font-medium text-gray-600">Cliente:</span>
                <p className="font-semibold">
                  {citaSeleccionada.cliente.nombre}
                </p>
              </div>
              <div>
                <span className="font-medium text-gray-600">Servicio:</span>
                <p className="font-semibold">
                  {citaSeleccionada.servicios?.map((s: any) => s.nombre).join(', ') || citaSeleccionada.servicio?.nombre || 'Sin servicio'}
                </p>
              </div>
              <div>
                <span className="font-medium text-gray-600">Fecha:</span>
                <p>{citaSeleccionada.fecha}</p>
              </div>
              <div>
                <span className="font-medium text-gray-600">Hora:</span>
                <p>{citaSeleccionada.hora_inicio} - {citaSeleccionada.hora_fin}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Integración del panel de productos */}
        <ProductManagementPanel
          citaId={citaSeleccionada.cita_id}
          onProductsUpdated={(total) => {
            console.log('Total productos actualizado:', total);
            setTotalProductos(total);
          }}
          moneda="USD"
          disabled={false}
        />

        {/* Información adicional */}
        <div className="mt-6 pt-4 border-t">
          <p className="text-xs text-gray-500">
            <strong>Nota:</strong> Los productos seleccionados se guardarán automáticamente
            en la cita y estarán disponibles para facturación.
          </p>
        </div>
      </div>
    );
  };

  // Vista del calendario (vista inicial)
  const renderVistaCalendario = () => {
    const monthInfo = getMonthInfo(mesActual);
    const diasSemana = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

    return (
      <div className="rounded-lg border bg-white p-4"> {/* REDUCIDO de p-6 */}
        <div className="mb-4"> {/* REDUCIDO de mb-6 */}
          <div className="flex justify-between items-center mb-3"> {/* REDUCIDO de mb-4 */}
            <div>
              <h2 className="text-lg font-bold">Calendario de Citas</h2> {/* REDUCIDO de text-2xl */}
            </div>
            <button
              onClick={() => abrirModalBloqueos()}
              className="flex items-center gap-1 px-3 py-1.5 bg-orange-100 text-orange-700 rounded hover:bg-orange-200 transition-colors text-xs"
              title="Crear bloqueo de horario"
            >
              <Ban className="w-3 h-3" /> {/* REDUCIDO de w-4 h-4 */}
              <span className="font-medium">Bloquear horario</span>
            </button>
          </div>
        </div>

        {/* Controles del calendario */}
        <div className="flex justify-between items-center mb-4">
          <button
            onClick={mesAnterior}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <ChevronRight className="w-4 h-4 rotate-180" />
          </button>
          <div className="text-center">
            <h3 className="text-base font-semibold">{monthInfo.monthName} {monthInfo.year}</h3> {/* REDUCIDO de text-xl */}
          </div>
          <button
            onClick={mesSiguiente}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Días de la semana */}
        <div className="grid grid-cols-7 gap-1 mb-1"> {/* REDUCIDO de mb-2 */}
          {diasSemana.map((dia) => (
            <div key={dia} className="text-center font-medium text-gray-500 py-1 text-xs"> {/* REDUCIDO de py-2, AÑADIDO text-xs */}
              {dia}
            </div>
          ))}
        </div>

        {/* Días del mes */}
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: monthInfo.firstDayOffset }).map((_, index) => (
            <div key={`empty-${index}`} className="h-10" />
          ))}

          {Array.from({ length: monthInfo.totalDays }).map((_, index) => {
            const dia = index + 1;
            const esHoy = dia === monthInfo.today &&
              monthInfo.monthNumber === monthInfo.currentMonth &&
              monthInfo.year === monthInfo.currentYear;

            return (
              <button
                key={dia}
                onClick={(e) => handleDiaClick(dia, e)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const { year, monthNumber } = getMonthInfo(mesActual);
                  const mesFormateado = (monthNumber + 1).toString().padStart(2, '0');
                  const diaFormateado = dia.toString().padStart(2, '0');
                  const fechaFormateada = `${year}-${mesFormateado}-${diaFormateado}`;
                  abrirModalBloqueos(fechaFormateada);
                }}
                className={`
        h-10 flex items-center justify-center rounded border text-xs
        ${esHoy
                    ? 'bg-blue-100 border-blue-300 text-blue-700'
                    : 'hover:bg-gray-100 border-gray-200'
                  }
      `}
                title={`Click normal: ver citas\nCtrl+Click: crear bloqueo\nClick derecho: opciones`}
              >
                <span className={esHoy ? 'font-bold' : ''}>{dia}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-6 pt-4 border-t"> {/* REDUCIDO de mt-8 pt-6 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Calendar className="w-4 h-4 mr-1 text-gray-400" /> {/* REDUCIDO de w-5 h-5 mr-2 */}
              <span className="text-xs text-gray-600"> {/* REDUCIDO de text-sm */}
                Selecciona un día para ver las citas programadas
              </span>
            </div>
            {onVolver && (
              <Button
                variant="outline"
                size="sm"
                onClick={onVolver}
                className="text-xs"
              >
                ← Volver al listado
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Vista del menú principal con opciones
  // Vista del menú principal con opciones - VERSIÓN COMPLETA CON PRODUCTOS
  const renderVistaMenuPrincipal = () => {
    const estadoInfo = getEstadoCita(citaSeleccionada);
    const fichasCitaActual = getFichasGuardadasCitaActual();

    // Extraer productos de la cita si existen
    const productosCita = citaSeleccionada?.productos || [];
    const tieneProductos = productosCita.length > 0;

    // Calcular total de productos
    const totalProductosCalculado = productosCita.reduce((sum: number, p: any) =>
      sum + (p.subtotal || (p.precio_unitario || 0) * (p.cantidad || 1)), 0
    );

    return (
      <div className="rounded-lg border bg-white p-4">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-lg font-bold">Protocolo de atención</h2>
            <p className="text-sm text-gray-600 mt-1">
              {citaSeleccionada.cliente.nombre} - {
                citaSeleccionada.servicios?.map((s: any) => s.nombre).join(', ') ||  citaSeleccionada.servicio?.nombre || 'Sin servicio'}
            </p>
            <p className="text-xs text-gray-500">
              {citaSeleccionada.fecha} • {citaSeleccionada.hora_inicio} - {citaSeleccionada.hora_fin}
            </p>
          </div>
          <div className={`${estadoInfo.color} text-xs px-2 py-1 rounded-full border flex items-center gap-1`}>
            {estadoInfo.icon}
            <span className="font-medium">{estadoInfo.estado}</span>
          </div>
        </div>

        {fichasCitaActual.length > 0 && (
          <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Save className="w-3 h-3 text-blue-600 mr-1" />
                <span className="text-xs font-medium text-blue-800">
                  Tienes {fichasCitaActual.length} ficha(s) pendiente(s)
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setVistaActual("fichas")}
                className="text-xs"
              >
                Continuar
              </Button>
            </div>
          </div>
        )}

        {/* Contador de fichas existentes */}
        {fichasCliente.length > 0 && (
          <div className="mb-3 p-2 bg-purple-50 border border-purple-200 rounded">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Eye className="w-3 h-3 text-purple-600 mr-1" />
                <span className="text-xs font-medium text-purple-800">
                  Tienes {fichasCliente.length} ficha(s) creada(s) para este cliente
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setVistaActual("ver-fichas")}
                className="text-xs"
              >
                Ver Fichas
              </Button>
            </div>
          </div>
        )}

        {/* Contador de productos existentes en la cita */}
        {tieneProductos && (
          <div className="mb-3 p-2 bg-green-50 border border-green-200 rounded">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <ShoppingCart className="w-3 h-3 text-green-600 mr-1" />
                <span className="text-xs font-medium text-green-800">
                  {productosCita.length} producto(s) en la cita - Total: ${totalProductosCalculado.toLocaleString()}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setVistaActual("productos")}
                className="text-xs"
              >
                <ShoppingCart className="h-3 w-3 mr-1" />
                Ver/Modificar
              </Button>
            </div>

            {/* Lista rápida de productos */}
            <div className="mt-2 space-y-1">
              {productosCita.slice(0, 3).map((producto: any, index: number) => (
                <div key={index} className="flex items-center justify-between text-xs">
                  <span className="truncate flex-1 mr-2">{producto.nombre}</span>
                  <span className="font-medium text-green-700 whitespace-nowrap">
                    {producto.cantidad || 1}x ${(producto.precio_unitario || 0).toLocaleString()}
                  </span>
                </div>
              ))}
              {productosCita.length > 3 && (
                <div className="text-xs text-gray-500 text-center">
                  +{productosCita.length - 3} más...
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mb-4">
          <h3 className="mb-3 font-semibold text-sm">¿Qué deseas hacer?</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <button
              className="p-4 rounded border-2 border-blue-200 bg-blue-50 text-left transition-all hover:shadow hover:border-blue-300"
              onClick={() => setVistaActual("fichas")}
            >
              <div className="flex items-center mb-2">
                <FileText className="w-6 h-6 text-blue-600 mr-2" />
                <h4 className="font-semibold text-blue-800 text-base">Gestionar Fichas</h4>
              </div>
              <p className="text-xs text-blue-600">
                Crear y gestionar fichas técnicas de diagnóstico y tratamiento
              </p>
            </button>

            <button
              className="p-4 rounded border-2 border-green-200 bg-green-50 text-left transition-all hover:shadow hover:border-green-300"
              onClick={() => setVistaActual("productos")}
            >
              <div className="flex items-center mb-2">
                <ShoppingCart className="w-6 h-6 text-green-600 mr-2" />
                <h4 className="font-semibold text-green-800 text-base">Gestionar Productos</h4>
              </div>
              <p className="text-xs text-green-600">
                Seleccionar productos y gestionar inventario del servicio
              </p>
              {tieneProductos && (
                <div className="mt-2 inline-flex items-center px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                  <ShoppingCart className="w-3 h-3 mr-1" />
                  {productosCita.length} producto(s) - ${totalProductosCalculado.toLocaleString()}
                </div>
              )}
              {!tieneProductos && totalProductos > 0 && (
                <div className="mt-2 inline-flex items-center px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                  <ShoppingCart className="w-3 h-3 mr-1" />
                  ${totalProductos.toLocaleString()} en productos
                </div>
              )}
            </button>

            <button
              className="p-4 rounded border-2 border-purple-200 bg-purple-50 text-left transition-all hover:shadow hover:border-purple-300"
              onClick={() => setVistaActual("ver-fichas")}
            >
              <div className="flex items-center mb-2">
                <Eye className="w-6 h-6 text-purple-600 mr-2" />
                <h4 className="font-semibold text-purple-800 text-base">Ver Fichas Existentes</h4>
              </div>
              <p className="text-xs text-purple-600">
                Consultar fichas técnicas creadas anteriormente para este cliente
              </p>
            </button>
          </div>
        </div>

        <div className="flex space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              window.location.reload();
            }}
            className="flex-1 text-xs"
          >
            <ArrowLeft className="w-3 h-3 mr-1" />
            Volver al calendario
          </Button>

          {citaSeleccionada && puedeMostrarFinalizar(citaSeleccionada) && (
            <Button
              size="sm"
              className={`
              flex-1 text-xs
              ${usuarioRol === "estilista"
                  ? "bg-amber-600 hover:bg-amber-700"
                  : "bg-green-600 hover:bg-green-700"
                }
              shadow
            `}
              onClick={() => setMostrarConfirmacionFinalizar(true)}
              disabled={loadingFinalizar}
            >
              {loadingFinalizar ? (
                <>
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1"></div>
                  {usuarioRol === "estilista" ? "Finalizando..." : "Procesando..."}
                </>
              ) : (
                <>
                  {usuarioRol === "estilista" ? (
                    <>
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Finalizar Servicio (Estilista)
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Finalizar y Facturar
                    </>
                  )}
                </>
              )}
            </Button>
          )}

          {/* INDICADOR SI YA ESTÁ FINALIZADA */}
          {citaSeleccionada && !puedeMostrarFinalizar(citaSeleccionada) && (
            <div className="flex-1 flex items-center justify-center p-1 bg-gray-100 text-gray-600 rounded border text-xs">
              <CheckCircle className="w-3 h-3 mr-1 text-green-600" />
              <span className="font-medium">
                Servicio {getEstadoCita(citaSeleccionada).estado.toLowerCase()}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Si hay cita seleccionada pero no se ha elegido una vista específica
  if (citaSeleccionada && vistaActual === "calendario") {
    return renderVistaMenuPrincipal();
  }

  if (citaSeleccionada && tipoFichaSeleccionada) {
    const datosGuardados = cargarFichaGuardada(tipoFichaSeleccionada);

    const fichaProps = {
      cita: citaSeleccionada,
      datosIniciales: datosGuardados,
      onGuardar: (datos: any) => guardarFicha(tipoFichaSeleccionada, datos),
      onSubmit: (_: any) => {
        const fichasActualizadas = fichasGuardadas.filter(
          ficha => !(ficha.citaId === citaSeleccionada.cita_id && ficha.tipo === tipoFichaSeleccionada)
        );
        setFichasGuardadas(fichasActualizadas);

        setTipoFichaSeleccionada(null);
        setVistaActual("fichas");
      },
      onCancelar: () => {
        setTipoFichaSeleccionada(null);
        setVistaActual("fichas");
      }
    };

    const renderFicha = () => {
      switch (tipoFichaSeleccionada) {
        case "DIAGNOSTICO_RIZOTIPO":
          return <FichaDiagnosticoRizotipo {...fichaProps} />;
        case "COLOR":
          return <FichaColor {...fichaProps} />;
        case "ASESORIA_CORTE":
          return <FichaAsesoriaCorte {...fichaProps} />;
        case "CUIDADO_POST_COLOR":
          return <FichaCuidadoPostColor {...fichaProps} />;
        case "VALORACION_PRUEBA_COLOR":
          return <FichaValoracionPruebaColor {...fichaProps} />;
        default:
          return null;
      }
    };

    return (
      <div>
        {/* SOLO EN FICHAS ESPECÍFICAS: BOTÓN PARA VOLVER AL SELECTOR DE FICHAS */}
        <div className="mb-3 flex items-center space-x-1"> {/* REDUCIDO de mb-4 space-x-2 */}
          <button
            onClick={() => {
              setTipoFichaSeleccionada(null);
              setVistaActual("fichas");
            }}
            className="text-[oklch(0.55_0.25_280)] hover:underline text-xs flex items-center gap-1"
          >
            <ArrowLeft className="w-3 h-3" /> {/* REDUCIDO de w-4 h-4 */}
            Volver al selector de fichas
          </button>
        </div>
        {renderFicha()}
      </div>
    );
  }


  // Modal de confirmación para finalizar servicio
  if (mostrarConfirmacionFinalizar) {
    const fichasCitaActual = getFichasGuardadasCitaActual();

    return (
      <div className="rounded-lg border bg-white p-4"> {/* REDUCIDO de p-6 */}
        <div className="text-center py-6"> {/* REDUCIDO de py-8 */}
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3"> {/* REDUCIDO de w-16 h-16 mb-4 */}
            <CheckCircle className="w-6 h-6 text-green-600" /> {/* REDUCIDO de w-8 h-8 */}
          </div>
          <h4 className="text-base font-semibold text-gray-900 mb-1">¿Finalizar servicio?</h4> {/* REDUCIDO de text-lg mb-2 */}
          <p className="text-sm text-gray-600 mb-3"> {/* REDUCIDO de mb-4 */}
            ¿Estás seguro de que deseas finalizar el servicio para <strong>{citaSeleccionada?.cliente.nombre}</strong>?
          </p>

          {fichasCitaActual.length > 0 && (
            <div className="mb-3 p-2 bg-yellow-50 border border-yellow-200 rounded"> {/* REDUCIDO de mb-4 p-3 rounded-lg */}
              <p className="text-yellow-700 text-xs"> {/* REDUCIDO de text-sm */}
                <strong>⚠️ Advertencia:</strong> Tienes {fichasCitaActual.length} ficha(s) pendiente(s) que se perderán.
              </p>
              <div className="mt-1 text-xs text-yellow-600"> {/* REDUCIDO de mt-2 */}
                {fichasCitaActual.map((ficha, index) => (
                  <div key={index}>• {ficha.tipo.replace(/_/g, ' ')}</div>
                ))}
              </div>
            </div>
          )}

          {/* Dentro del modal, busca los botones y reemplaza: */}
          <div className="flex space-x-2 justify-center"> {/* REDUCIDO de space-x-3 */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMostrarConfirmacionFinalizar(false)}
              disabled={loadingFinalizar}
              className="px-4 text-xs"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              className={`
      px-4 text-xs
      ${usuarioRol === "estilista"
                  ? "bg-amber-600 hover:bg-amber-700"
                  : "bg-green-600 hover:bg-green-700"
                }
    `}
              onClick={() => finalizarServicioAPI(citaSeleccionada.cita_id)}
              disabled={loadingFinalizar}
            >
              {loadingFinalizar ? (
                <>
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1"></div> {/* REDUCIDO de h-4 w-4 mr-2 */}
                  {usuarioRol === "estilista" ? "Finalizando..." : "Procesando..."}
                </>
              ) : usuarioRol === "estilista" ? (
                'Sí, Finalizar como Estilista'
              ) : (
                'Sí, Finalizar y Facturar'
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }
  // 🆕 AÑADIR ESTO ANTES DEL ÚLTIMO CIERRE DEL COMPONENTE:

  // Modal de bloqueos (al final del componente, antes del último return)
  if (mostrarModalBloqueos) {
    return (
      <>
        {/* Overlay */}
        <div className="fixed inset-0 z-[70] bg-black/50" onClick={cerrarModalBloqueos} />

        {/* Modal centrado */}
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-2 sm:p-4">
          <div className="relative w-full max-w-[24rem] overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-2xl max-h-[88vh] sm:max-w-md">
            <BloqueosModal
              onClose={cerrarModalBloqueos}
              fecha={fechaSeleccionadaParaBloqueo}
              compact
            />
          </div>
        </div>

        {/* Renderizar calendario en el fondo (opcional) */}
        {renderVistaCalendario()}
      </>
    );
  }

  // ... tu return final existente ...

  // Renderizar vistas según la selección
  switch (vistaActual) {
    case "fichas":
      return renderVistaFichas();
    case "productos":
      return renderVistaProductos();
    case "ver-fichas":
      return renderVistaVerFichas();
    case "menu-principal":
      return renderVistaMenuPrincipal();
    default:
      return renderVistaCalendario();
  }
}
