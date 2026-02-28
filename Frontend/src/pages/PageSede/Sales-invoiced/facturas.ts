// src/api/facturas.ts
import { API_BASE_URL } from "../../../types/config";

export interface FacturaAPI {
  _id: string;
  identificador: string;
  fecha_pago: string;
  local: string;
  sede_id: string;
  moneda: string;
  tipo_comision?: string;
  cliente_id: string;
  nombre_cliente: string;
  cedula_cliente: string;
  email_cliente: string;
  telefono_cliente: string;
  items: ItemFactura[];
  historial_pagos?: HistorialPago[];
  desglose_pagos: DesglosePagos;
  profesional_id?: string;
  profesional_nombre?: string;
  numero_comprobante: string;
  facturado_por?: string;
}

export interface ItemFactura {
  tipo: string;
  servicio_id?: string;
  producto_id?: string;
  nombre: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  moneda?: string;
  comision?: number;
  descuento?: string;
  profesional_nombre?: string;
  profesional_id?: string;
  duracion_minutos?: number;
  reserva_marca?: string;
}

export interface HistorialPago {
  fecha: string;
  monto: number;
  metodo: string;
  tipo: string;
  registrado_por: string;
  saldo_despues: number;
  notas: string;
}

export interface DesglosePagos {
  efectivo: number;
  total: number;
  tarjeta?: number;
  transferencia?: number;
  tarjeta_credito?: number;
  tarjeta_debito?: number;
  addi?: number;
}

export interface FacturaResponse {
  success: boolean;
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
    showing: number;
    from: number;
    to: number;
  };
  filters_applied: {
    sede_id: string;
    fecha_desde: string | null;
    fecha_hasta: string | null;
    profesional_id: string | null;
    search: string | null;
  };
  ventas: FacturaAPI[];
}

export interface FacturaConverted {
  identificador: string;
  fecha_pago: string;
  local: string;
  sede_id: string;
  moneda: string;
  tipo_comision: string;
  cliente_id: string;
  nombre_cliente: string;
  cedula_cliente: string;
  email_cliente: string;
  telefono_cliente: string;
  total: number;
  comprobante_de_pago: string;
  numero_comprobante: string;
  fecha_comprobante: string;
  monto: number;
  profesional_id: string;
  profesional_nombre: string;
  metodo_pago: string;
  facturado_por: string;
  estado: string;
  items?: ItemFactura[];
  historial_pagos?: HistorialPago[];
  desglose_pagos?: DesglosePagos;
}

export class FacturaService {
  private getAuthToken(): string | null {
    return (
      sessionStorage.getItem("access_token") ||
      localStorage.getItem("access_token")
    );
  }

  private getHeaders() {
    const token = this.getAuthToken();
    const headers: HeadersInit = {
      "accept": "application/json",
      "Content-Type": "application/json",
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    return headers;
  }

  // Obtener ventas/facturas de una sede específica con filtros
  async getVentasBySede(
    sede_id: string, 
    page: number = 1, 
    limit: number = 50,
    fecha_desde?: string,
    fecha_hasta?: string,
    search?: string
  ): Promise<FacturaConverted[]> {
    try {
      // Construir URL con parámetros
      let url = `${API_BASE_URL}api/billing/sales/${sede_id}?page=${page}&limit=${limit}&sort_order=desc`;
      
      // Agregar filtros si existen
      if (fecha_desde) {
        url += `&fecha_desde=${fecha_desde}`;
      }
      
      if (fecha_hasta) {
        url += `&fecha_hasta=${fecha_hasta}`;
      }
      
      if (search) {
        url += `&search=${encodeURIComponent(search)}`;
      }

      const response = await fetch(url, {
        method: "GET",
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      const data: FacturaResponse = await response.json();
      
      // Validar que data.ventas existe y es un array
      if (!data.ventas || !Array.isArray(data.ventas)) {
        console.warn("La respuesta no contiene un array válido de ventas");
        return [];
      }
      
      // Convertir los datos de la API al formato que usa nuestra aplicación
      return data.ventas
        .filter(factura => factura != null)
        .map(factura => this.convertToAppFormat(factura));
      
    } catch (error) {
      console.error("Error obteniendo ventas de la sede:", error);
      throw error;
    }
  }

  // Obtener todas las facturas del usuario autenticado con filtros
  async getVentasUsuario(
    page: number = 1, 
    limit: number = 50,
    fecha_desde?: string,
    fecha_hasta?: string,
    search?: string
  ): Promise<FacturaConverted[]> {
    try {
      // Obtener el sede_id del usuario desde sessionStorage
      const sede_id = sessionStorage.getItem("beaux-sede_id");
      
      if (!sede_id) {
        console.warn("No se encontró sede_id en la sesión");
        return [];
      }

      return await this.getVentasBySede(sede_id, page, limit, fecha_desde, fecha_hasta, search);
      
    } catch (error) {
      console.error("Error obteniendo ventas del usuario:", error);
      return [];
    }
  }

  // Convertir datos de API al formato de la aplicación
  private convertToAppFormat(factura: FacturaAPI): FacturaConverted {
    // Asegurar que historial_pagos existe y es un array
    const historial = factura.historial_pagos || [];
    
    // Determinar el método de pago principal basado en desglose_pagos
    const metodoPago = this.getMetodoPagoPrincipal(factura.desglose_pagos);
    
    // Determinar el estado (si no hay historial, asumimos pagado completo)
    const estado = historial.length > 0 ? this.getEstadoFactura(historial) : "pagado";
    
    // Obtener el total del desglose de pagos
    const total = factura.desglose_pagos?.total || 0;
    
    // Obtener fecha comprobante (usar fecha_pago si no hay historial)
    const fechaComprobante = factura.fecha_pago;
    
    // Obtener profesional_id y nombre de los items si no están en la factura
    let profesionalId = factura.profesional_id || '';
    let profesionalNombre = factura.profesional_nombre || '';
    
    // Si no hay profesional en la factura, buscarlo en los items
    if (!profesionalId && factura.items && factura.items.length > 0) {
      const primerItem = factura.items[0];
      profesionalId = primerItem.profesional_id || '';
      profesionalNombre = primerItem.profesional_nombre || '';
    }

    return {
      identificador: factura.identificador || '',
      fecha_pago: factura.fecha_pago || '',
      local: factura.local || '',
      sede_id: factura.sede_id || '',
      moneda: factura.moneda || 'COP',
      tipo_comision: factura.tipo_comision || 'porcentaje',
      cliente_id: factura.cliente_id || '',
      nombre_cliente: factura.nombre_cliente?.trim() || '',
      cedula_cliente: factura.cedula_cliente || '',
      email_cliente: factura.email_cliente || '',
      telefono_cliente: factura.telefono_cliente || '',
      total: total,
      comprobante_de_pago: "Factura",
      numero_comprobante: factura.numero_comprobante || '',
      fecha_comprobante: fechaComprobante,
      monto: total,
      profesional_id: profesionalId,
      profesional_nombre: profesionalNombre,
      metodo_pago: metodoPago,
      facturado_por: factura.facturado_por || 'Sistema',
      estado: estado,
      items: factura.items || [],
      historial_pagos: historial,
      desglose_pagos: factura.desglose_pagos
    };
  }

  // Determinar método de pago principal basado en desglose_pagos
  private getMetodoPagoPrincipal(desglose: DesglosePagos): string {
    if (!desglose) return "efectivo";
    
    // Crear array de métodos con sus montos
    const metodos = [
      { metodo: 'efectivo', monto: desglose.efectivo || 0 },
      { metodo: 'tarjeta_credito', monto: desglose.tarjeta_credito || 0 },
      { metodo: 'tarjeta_debito', monto: desglose.tarjeta_debito || 0 },
      { metodo: 'addi', monto: desglose.addi || 0 },
      { metodo: 'tarjeta', monto: desglose.tarjeta || 0 }, // compatibilidad con histórico
      { metodo: 'transferencia', monto: desglose.transferencia || 0 }
    ];
    
    // Encontrar el método con mayor monto
    const metodoPrincipal = metodos.reduce((prev, current) => 
      prev.monto > current.monto ? prev : current
    );
    
    // Si no hay montos mayores a 0, devolver efectivo por defecto
    return metodoPrincipal.monto > 0 ? metodoPrincipal.metodo : "efectivo";
  }

  private getEstadoFactura(historial: HistorialPago[]): string {
    // Verificar que historial sea válido
    if (!historial || historial.length === 0) return "pagado";
    
    try {
      // Verificar si todos los pagos están completados
      const ultimoPago = historial[historial.length - 1];
      
      // Verificar que ultimoPago existe y tiene saldo_despues
      if (!ultimoPago || typeof ultimoPago.saldo_despues !== 'number') {
        return "pagado";
      }
      
      return ultimoPago.saldo_despues === 0 ? "pagado" : "pendiente";
      
    } catch (error) {
      console.error("Error al obtener estado de factura:", error);
      return "pagado";
    }
  }

  // Buscar facturas con filtros (método mejorado)
  async buscarFacturas(filtros: {
    searchTerm?: string;
    fecha_desde?: string;
    fecha_hasta?: string;
    page?: number;
    limit?: number;
  }): Promise<{ facturas: FacturaConverted[]; pagination?: any; filters_applied?: any }> {
    try {
      // Obtener el sede_id del usuario
      const sede_id = sessionStorage.getItem("beaux-sede_id");
      
      if (!sede_id) {
        console.warn("No se encontró sede_id");
        return { facturas: [], pagination: null, filters_applied: null };
      }

      // Construir URL con filtros
      let url = `${API_BASE_URL}api/billing/sales/${sede_id}`;
      const params = new URLSearchParams();
      
      params.append('page', (filtros.page || 1).toString());
      params.append('limit', (filtros.limit || 50).toString());
      params.append('sort_order', 'desc');
      
      if (filtros.searchTerm) {
        params.append('search', filtros.searchTerm);
      }
      
      if (filtros.fecha_desde) {
        params.append('fecha_desde', filtros.fecha_desde);
      }
      
      if (filtros.fecha_hasta) {
        params.append('fecha_hasta', filtros.fecha_hasta);
      }
      
      url += `?${params.toString()}`;
      
      const response = await fetch(url, {
        method: "GET",
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      const data: FacturaResponse = await response.json();
      
      // Validar y convertir datos
      const facturas = data.ventas
        ? data.ventas
            .filter(factura => factura != null)
            .map(factura => this.convertToAppFormat(factura))
        : [];
      
      return {
        facturas: facturas,
        pagination: data.pagination,
        filters_applied: data.filters_applied
      };
      
    } catch (error) {
      console.error("Error buscando facturas:", error);
      throw error;
    }
  }
}

// Exportar una instancia única del servicio
export const facturaService = new FacturaService();
