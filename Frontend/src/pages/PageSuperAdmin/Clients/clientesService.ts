import { API_BASE_URL } from "../../../types/config";
import { Cliente } from "../../../types/cliente";
import { calcularDiasSinVenir } from "../../../lib/clientMetrics";

export interface CreateClienteData {
  nombre: string;
  correo?: string;
  telefono?: string;
  notas?: string;
  sede_id?: string;
  cedula?: string;
  ciudad?: string;
  fecha_de_nacimiento?: string;
}

export interface UpdateClienteData {
  cliente_id?: string;
  nombre?: string;
  correo?: string;
  telefono?: string;
  cedula?: string;
  ciudad?: string;
  fecha_de_nacimiento?: string;
  sede_id?: string;
  notas?: string;
}

export interface ClienteResponse {
  _id: string;
  cliente_id: string;
  nombre: string;
  correo?: string;
  telefono?: string;
  sede_id: string;
  fecha_creacion: string;
  creado_por: string;
  notas_historial?: Array<{
    contenido: string;
    fecha: string;
    autor: string;
  }>;
  dias_sin_visitar?: number;
  total_gastado?: number;
  ticket_promedio?: number;
}

// 🔥 INTERFAZ ACTUALIZADA PARA LAS FICHAS DEL CLIENTE
export interface FichaCliente {
  _id: string;
  cliente_id: string;
  sede_id: string;
  cliente_id_antiguo?: string;
  servicio_id: string;
  servicio_nombre: string;
  profesional_id: string;
  profesional_nombre: string;
  sede_nombre: string;
  fecha_ficha: string;
  fecha_reserva: string;
  email: string | null;
  nombre: string;
  apellido: string | null;
  cedula: string;
  telefono: string;

  // 🔥 IMÁGENES EN NUEVA ESTRUCTURA
  fotos?: {
    antes: string[];
    despues: string[];
    antes_urls: string[];
    despues_urls: string[];
  };

  // 🔥 CAMPOS PARA COMPATIBILIDAD
  antes_url?: string;
  despues_url?: string;

  precio: string | number;
  estado: string;
  estado_pago: string;
  local: string;
  notas_cliente: string; // 🔥 CAMBIADO: Ahora es obligatorio
  comentario_interno: string;

  // 🔥 RESPUESTAS EN NUEVA ESTRUCTURA
  respuestas?: Array<{
    pregunta: string;
    respuesta: boolean;
    observaciones: string;
  }>;

  // 🔥 PARA COMPATIBILIDAD
  respuesta_1?: string;
  respuesta_2?: string;
  respuesta_3?: string;
  respuesta_4?: string;
  respuesta_5?: string;
  respuesta_6?: string;
  respuesta_7?: string;
  respuesta_8?: string;
  respuesta_9?: string;
  respuesta_10?: string;

  tipo_ficha?: string;
  datos_especificos?: any;
  descripcion_servicio?: string;
  autorizacion_publicacion?: boolean;
  created_at?: string;
  created_by?: string;
  user_id?: string;
  procesado_imagenes?: boolean;
  origen?: string;
  source_file?: string;
  migrated_at?: string;
  imagenes_actualizadas_at?: string;

  // 🔥 NUEVOS CAMPOS CON NOMBRES
  servicio: string;
  sede: string;
  estilista: string;
  sede_estilista: string;
}

// Helper functions fuera del objeto para evitar problemas con 'this'
const obtenerRizotipoAleatorio = (): string => {
  const rizotipos = ['1A', '1B', '1C', '2A', '2B', '2C', '3A', '3B', '3C', '4A', '4B', '4C'];
  return rizotipos[Math.floor(Math.random() * rizotipos.length)];
};

const transformarHistorialCabello = (historialCitas: any[]): any[] => {
  return historialCitas.map(cita => ({
    tipo: cita.servicio,
    fecha: cita.fecha
  }));
};

// 🔥 FUNCIÓN PARA ARREGLAR URLs DE S3 HTTPS A HTTP
const fixS3Url = (url: string): string => {
  if (!url) return '';

  // Si es una URL de S3 de AWS, cambiar https por http para evitar problemas de certificado
  if (url.includes('s3.amazonaws.com') || url.includes('.s3.')) {
    return url.replace('https://', 'http://');
  }

  return url;
};

export const clientesService = {
  async getClientes(
    token: string,
    sedeId?: string,
    options?: { filtro?: string; limite?: number }
  ): Promise<Cliente[]> {
    const limite = options?.limite ?? 100;
    const filtro = options?.filtro?.trim();

    let baseUrl = `${API_BASE_URL}clientes/`;
    // Si se especifica una sede, usar el endpoint de filtrado
    if (sedeId && sedeId !== "all") {
      baseUrl = `${API_BASE_URL}clientes/filtrar/${sedeId}`;
    }

    const url = new URL(baseUrl);
    if (limite) {
      url.searchParams.set("limite", String(limite));
    }
    if (filtro) {
      url.searchParams.set("filtro", filtro);
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      let message = errorText || response.statusText || "Error desconocido";
      try {
        const parsed = errorText ? JSON.parse(errorText) : null;
        if (parsed?.detail) {
          message = parsed.detail;
        } else if (parsed?.message) {
          message = parsed.message;
        }
      } catch {
        // mantener mensaje original
      }
      throw new Error(`Error al obtener clientes: ${message}`);
    }

    const data: ClienteResponse[] = await response.json();

    // Transformar la respuesta del backend al formato del frontend
    return data.map(cliente => ({
      id: cliente.cliente_id,
      nombre: cliente.nombre,
      telefono: cliente.telefono || 'No disponible',
      email: cliente.correo || 'No disponible',
      diasSinVenir: calcularDiasSinVenir(cliente),
      diasSinComprar: cliente.dias_sin_visitar || 0,
      ltv: cliente.total_gastado || 0,
      ticketPromedio: cliente.ticket_promedio || 0,
      rizotipo: obtenerRizotipoAleatorio(),
      nota: cliente.notas_historial?.[0]?.contenido || '',
      sede_id: cliente.sede_id,
      historialCitas: [],
      historialCabello: [],
      historialProductos: []
    }));
  },

  async getAllClientes(token: string): Promise<Cliente[]> {
    const response = await fetch(`${API_BASE_URL}clientes/todos`, {
      method: 'GET',
      headers: {
        'accept': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error(`Error al obtener todos los clientes: ${response.statusText}`);
    }

    const data: ClienteResponse[] = await response.json();

    return data.map(cliente => ({
      id: cliente.cliente_id,
      nombre: cliente.nombre,
      telefono: cliente.telefono || 'No disponible',
      email: cliente.correo || 'No disponible',
      diasSinVenir: calcularDiasSinVenir(cliente),
      diasSinComprar: cliente.dias_sin_visitar || 0,
      ltv: cliente.total_gastado || 0,
      ticketPromedio: cliente.ticket_promedio || 0,
      rizotipo: obtenerRizotipoAleatorio(),
      nota: cliente.notas_historial?.[0]?.contenido || '',
      sede_id: cliente.sede_id,
      historialCitas: [],
      historialCabello: [],
      historialProductos: []
    }));
  },

  async getClienteById(token: string, clienteId: string): Promise<Cliente> {
    const response = await fetch(`${API_BASE_URL}clientes/${clienteId}`, {
      method: 'GET',
      headers: {
        'accept': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error(`Error al obtener cliente: ${response.statusText}`);
    }

    const cliente: ClienteResponse = await response.json();

    // Obtener historial adicional
    const [historialCitas, historialProductos, fichas] = await Promise.all([
      this.getHistorialCitas(token, clienteId),
      this.getHistorialProductos(token, clienteId),
      this.getFichasCliente(token, clienteId)
    ]);

    return {
      id: cliente.cliente_id,
      nombre: cliente.nombre,
      telefono: cliente.telefono || 'No disponible',
      email: cliente.correo || 'No disponible',
      diasSinVenir: calcularDiasSinVenir(cliente),
      diasSinComprar: cliente.dias_sin_visitar || 0,
      ltv: cliente.total_gastado || 0,
      ticketPromedio: cliente.ticket_promedio || 0,
      rizotipo: obtenerRizotipoAleatorio(),
      nota: cliente.notas_historial?.[0]?.contenido || '',
      sede_id: cliente.sede_id,
      historialCitas,
      historialCabello: transformarHistorialCabello(historialCitas),
      historialProductos,
      fichas
    };
  },

  // 🔥 NUEVO MÉTODO: OBTENER FICHAS DEL CLIENTE - CORREGIDO
  // 🔥 NUEVO MÉTODO: OBTENER FICHAS DEL CLIENTE - CORREGIDO
  async getFichasCliente(token: string, clienteId: string): Promise<FichaCliente[]> {
    try {
      console.log(`🔍 Obteniendo fichas para cliente: ${clienteId}`);

      const response = await fetch(`${API_BASE_URL}clientes/fichas/${clienteId}`, {
        method: 'GET',
        headers: {
          'accept': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        if (response.status === 404) {
          console.log(`ℹ️ No se encontraron fichas para el cliente ${clienteId}`);
          return [];
        }
        console.error(`❌ Error ${response.status} obteniendo fichas:`, response.statusText);
        return [];
      }

      const fichas: FichaCliente[] = await response.json();

      console.log(`✅ Se obtuvieron ${fichas.length} fichas para el cliente ${clienteId}`);

      // 🔥 TRANSFORMAR LOS DATOS PARA COMPATIBILIDAD
      return fichas.map(ficha => {
        console.log('📊 Estructura de ficha recibida:', ficha);

        // 🔥 FUNCIÓN PARA ARREGLAR URLs DE S3
        const fixAllUrls = (urls: string[] | undefined): string[] => {
          if (!urls || !Array.isArray(urls)) return [];
          return urls.map(fixS3Url);
        };

        // 🔥 EXTRAER PRIMERA IMAGEN DE "ANTES" Y "DESPUÉS" - ARREGLANDO URLs
        const primeraImagenAntes = fixS3Url(ficha.fotos?.antes?.[0] || '');
        const primeraImagenDespues = fixS3Url(ficha.fotos?.despues?.[0] || '');

        // 🔥 ARREGLAR TODAS LAS URLs DE FOTOS
        const fotosArregladas = ficha.fotos ? {
          ...ficha.fotos,
          antes: fixAllUrls(ficha.fotos.antes),
          despues: fixAllUrls(ficha.fotos.despues),
          antes_urls: fixAllUrls(ficha.fotos.antes_urls),
          despues_urls: fixAllUrls(ficha.fotos.despues_urls)
        } : undefined;

        // 🔥 EXTRAER INFORMACIÓN DE DATOS_ESPECIFICOS SI EXISTE
        let notasDeDiagnostico = '';
        let recomendaciones = '';

        if (ficha.datos_especificos) {
          // 🔥 CONSTRUIR NOTAS A PARTIR DE DATOS_ESPECIFICOS
          const datos = ficha.datos_especificos;

          const respuestasTextuales = ficha.respuestas?.map(r =>
            `${r.pregunta}: ${r.respuesta}${r.observaciones ? ` - ${r.observaciones}` : ''}`
          ).join('\n') || '';

          notasDeDiagnostico = `🧪 DIAGNÓSTICO DE RIZOTIPO:
${respuestasTextuales}

📋 RECOMENDACIONES PERSONALIZADAS:
${datos.recomendaciones_personalizadas || 'Sin recomendaciones'}

✂️ FRECUENCIA DE CORTE:
${datos.frecuencia_corte || 'No especificada'}

💆 TÉCNICAS DE ESTILIZADO:
${datos.tecnicas_estilizado || 'No especificadas'}

🧴 PRODUCTOS SUGERIDOS:
${datos.productos_sugeridos || 'No especificados'}

📝 OBSERVACIONES GENERALES:
${datos.observaciones_generales || 'Ninguna'}`;

          recomendaciones = datos.recomendaciones_personalizadas || '';
        }

        // 🔥 DETERMINAR NOTAS DEL CLIENTE (PRIORIDAD)
        const notasClienteAseguradas =
          ficha.notas_cliente?.trim() ||
          notasDeDiagnostico ||
          ficha.descripcion_servicio ||
          'Sin notas';

        // 🔥 DETERMINAR COMENTARIO INTERNO
        const comentarioInternoAsegurado =
          ficha.comentario_interno?.trim() ||
          recomendaciones ||
          ficha.descripcion_servicio ||
          'Sin comentarios';

        return {
          ...ficha,
          // 🔥 AGREGAR CAMPOS DE COMPATIBILIDAD CON VALORES ASEGURADOS
          fotos: fotosArregladas,
          antes_url: primeraImagenAntes,
          despues_url: primeraImagenDespues,
          notas_cliente: notasClienteAseguradas,
          comentario_interno: comentarioInternoAsegurado,

          // 🔥 VALORES POR DEFECTO
          precio: ficha.precio || '0',
          estado: ficha.estado || 'completado',
          estado_pago: ficha.estado_pago || 'pagado',
          local: ficha.local || ficha.sede || '',

          // 🔥 Asegurar que los campos de nombres estén completos
          servicio: ficha.servicio || ficha.servicio_nombre || 'Servicio sin nombre',
          servicio_nombre: ficha.servicio_nombre || ficha.servicio || 'Servicio sin nombre',
          sede: ficha.sede || ficha.sede_nombre || 'Sede no especificada',
          sede_nombre: ficha.sede_nombre || ficha.sede || 'Sede no especificada',
          estilista: ficha.estilista || ficha.profesional_nombre || 'Estilista no asignado',
          profesional_nombre: ficha.profesional_nombre || ficha.estilista || 'Estilista no asignado',
          sede_estilista: ficha.sede_estilista || ficha.sede || ficha.sede_nombre || 'Sede no especificada',

          // 🔥 Asegurar campos obligatorios
          email: ficha.email || '',
          apellido: ficha.apellido || '',
          nombre: ficha.nombre || '',
          cedula: ficha.cedula || '',
          telefono: ficha.telefono || '',

          // 🔥 Agregar fecha formateada
          fecha_ficha_formatted: ficha.fecha_ficha,

          // 🔥 Preservar datos específicos
          datos_especificos: ficha.datos_especificos,
          respuestas: ficha.respuestas || []
        };
      });

    } catch (error) {
      console.error('❌ Error obteniendo fichas del cliente:', error);
      return [];
    }
  },

  async createCliente(token: string, cliente: CreateClienteData): Promise<ClienteResponse> {
    const nombre = cliente.nombre?.trim();
    if (!nombre) {
      throw new Error('El nombre del cliente es requerido');
    }

    const requestData: Record<string, string> = { nombre };
    const addIfPresent = (key: string, value?: string) => {
      const normalized = value?.trim();
      if (normalized) requestData[key] = normalized;
    };

    addIfPresent('correo', cliente.correo);
    addIfPresent('telefono', cliente.telefono);
    addIfPresent('notas', cliente.notas);
    addIfPresent('sede_id', cliente.sede_id);
    addIfPresent('cedula', cliente.cedula);
    addIfPresent('ciudad', cliente.ciudad);
    addIfPresent('fecha_de_nacimiento', cliente.fecha_de_nacimiento);

    console.log('📤 Creando cliente con datos:', requestData);

    const response = await fetch(`${API_BASE_URL}clientes/`, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(requestData)
    });

    if (!response.ok) {
      let errorMessage = `Error ${response.status}: ${response.statusText}`;

      try {
        const errorData = await response.json();
        console.error('❌ Error del backend:', errorData);

        if (errorData.detail) {
          errorMessage = errorData.detail;
        }
      } catch (parseError) {
        console.error('Error parseando respuesta:', parseError);
      }

      throw new Error(errorMessage);
    }

    return await response.json();
  },

  // services/clientesService.ts - Solo un método updateCliente
  async updateCliente(token: string, clienteId: string, cliente: UpdateClienteData): Promise<any> {
    // Preparar los datos completos del cliente
    const requestData: any = {
      cliente_id: clienteId, // Mantener el mismo ID
      nombre: cliente.nombre?.trim(),
      correo: cliente.correo?.trim(),
      telefono: cliente.telefono?.trim(),
      cedula: cliente.cedula?.trim(),
      ciudad: cliente.ciudad?.trim(),
      fecha_de_nacimiento: cliente.fecha_de_nacimiento?.trim(),
      sede_id: cliente.sede_id?.trim(),
      notas: cliente.notas?.trim()
    };

    // Eliminar campos vacíos o undefined (excepto algunos que pueden ser opcionales)
    Object.keys(requestData).forEach(key => {
      if (requestData[key] === undefined || requestData[key] === '') {
        // No eliminamos los campos que son parte del schema pero pueden estar vacíos
        // según el API
        if (key !== 'correo' && key !== 'telefono' && key !== 'cedula' &&
          key !== 'ciudad' && key !== 'fecha_de_nacimiento' && key !== 'notas') {
          delete requestData[key];
        }
      }
    });

    console.log('📤 Actualizando cliente con datos:', {
      clienteId,
      requestData
    });

    const response = await fetch(`${API_BASE_URL}clientes/${clienteId}`, {
      method: 'PUT',
      headers: {
        'accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(requestData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const errorMessage = errorData?.detail || `Error ${response.status}: ${response.statusText}`;
      throw new Error(errorMessage);
    }

    return await response.json();
  },

  async agregarNota(token: string, clienteId: string, nota: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}clientes/${clienteId}/notas`, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ contenido: nota })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(errorData?.detail || `Error al agregar nota: ${response.statusText}`);
    }
  },

  async getHistorialCitas(token: string, clienteId: string): Promise<any[]> {
    try {
      console.log(`🔍 Obteniendo historial de citas para cliente: ${clienteId}`);

      const response = await fetch(`${API_BASE_URL}clientes/${clienteId}/historial`, {
        method: 'GET',
        headers: {
          'accept': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        console.log(`ℹ️ No se encontró historial de citas para el cliente ${clienteId}`);
        return [];
      }

      const citas = await response.json();

      console.log(`✅ Se obtuvieron ${citas.length} citas del historial`);

      // 🔥 DEBUG: Mostrar estructura de la primera cita
      if (citas.length > 0) {
        console.log('📊 ESTRUCTURA DE LA PRIMERA CITA:', {
          _id: citas[0]._id,
          fecha: citas[0].fecha, // Aquí debería ser '2025-12-19'
          servicio_nombre: citas[0].servicio_nombre,
          profesional_nombre: citas[0].profesional_nombre,
          estado: citas[0].estado,
          estado_pago: citas[0].estado_pago,
          valor_total: citas[0].valor_total,
          metodo_pago: citas[0].metodo_pago,
          notas: citas[0].notas
        });
      }

      // 🔥 TRANSFORMAR LAS CITAS CORRECTAMENTE
      return citas.map((cita: any) => {
        // Obtener estilista - YA VIENE EN profesional_nombre
        const estilista = cita.profesional_nombre || 'Estilista no especificado';

        // 🔥 NO FORMATAR LA FECHA AQUÍ - DEJARLA COMO VIENE DEL SERVIDOR
        const fechaOriginal = cita.fecha; // Esto debería ser '2025-12-19'
        console.log(`📅 Fecha original del servidor para cita ${cita._id}: ${fechaOriginal}`);

        // Obtener servicio
        const servicio = cita.servicio_nombre || 'Servicio no especificado';

        // Obtener notas (si existen)
        const notas = cita.notas || '';

        // Obtener método de pago
        const metodoPago = cita.metodo_pago || 'No especificado';

        // Obtener estado de pago
        const estadoPago = cita.estado_pago || 'pendiente';

        // Obtener valor total
        const valorTotal = cita.valor_total || 0;

        // Obtener moneda
        const moneda = cita.moneda || 'USD';

        // Formatear valor
        const valorFormateado = moneda === 'COP'
          ? `$${valorTotal.toLocaleString('es-CO')} COP`
          : moneda === 'USD'
            ? `$${valorTotal.toFixed(2)} USD`
            : `$${valorTotal} ${moneda}`;

        return {
          fecha: fechaOriginal, // 🔥 DEVOLVER FECHA ORIGINAL '2025-12-19'
          servicio: servicio,
          estilista: estilista,
          notas: notas,
          metodo_pago: metodoPago,
          estado_pago: estadoPago,
          valor_total: valorFormateado,
          moneda: moneda,
          hora_inicio: cita.hora_inicio || '',
          hora_fin: cita.hora_fin || '',
          estado: cita.estado || 'confirmada',
          // 🔥 GUARDAR DATOS COMPLETOS PARA USO FUTURO
          datos_completos: {
            ...cita,
            // Incluir todos los datos originales
            _id: cita._id,
            sede_id: cita.sede_id,
            cliente_id: cita.cliente_id,
            profesional_id: cita.profesional_id,
            servicio_id: cita.servicio_id,
            cliente_nombre: cita.cliente_nombre,
            cliente_email: cita.cliente_email,
            cliente_telefono: cita.cliente_telefono,
            profesional_email: cita.profesional_email,
            sede_nombre: cita.sede_nombre,
            creada_por: cita.creada_por,
            fecha_creacion: cita.fecha_creacion
          }
        };
      });
    } catch (error) {
      console.error('❌ Error obteniendo historial de citas:', error);
      return [];
    }
  },

  // 🔥 NUEVO MÉTODO: OBTENER HISTORIAL DE PRODUCTOS - CORREGIDO
  async getHistorialProductos(token: string, clienteId: string): Promise<any[]> {
    try {
      console.log(`🛍️ Obteniendo historial de productos para cliente: ${clienteId}`);

      // Primero obtenemos el historial de citas
      const historialCitas = await this.getHistorialCitas(token, clienteId);

      if (historialCitas.length === 0) {
        console.log(`ℹ️ No hay historial de citas para el cliente ${clienteId}`);
        return [];
      }

      console.log(`📊 Transformando ${historialCitas.length} citas a productos`);

      // 🔥 TRANSFORMAR LAS CITAS EN "PRODUCTOS" PARA MOSTRAR
      return historialCitas.map(cita => {
        console.log(`📅 Fecha de cita a convertir a producto: ${cita.fecha}`);

        return {
          producto: cita.servicio, // Usamos el nombre del servicio como producto
          fecha: cita.fecha, // 🔥 FECHA ORIGINAL '2025-12-19' (no formateada)
          precio: cita.valor_total,
          estilista: cita.estilista,
          estado_pago: cita.estado_pago,
          metodo_pago: cita.metodo_pago,
          // 🔥 Agregar datos adicionales si los necesitas
          servicio_id: cita.datos_completos?.servicio_id,
          cita_id: cita.datos_completos?._id,
          estado_cita: cita.estado
        };
      });

    } catch (error) {
      console.error('❌ Error obteniendo historial de productos:', error);
      return [];
    }
  },

};
