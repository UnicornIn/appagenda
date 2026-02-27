// src/api/facturas.ts
import { API_BASE_URL } from "../../../types/config";

export interface FacturaAPI {
  _id: string;
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
  items: ItemFactura[];
  historial_pagos: HistorialPago[];
  desglose_pagos: DesglosePagos;
  profesional_id: string;
  profesional_nombre: string;
  numero_comprobante: string;
  facturado_por: string;
}

export interface ItemFactura {
  tipo: string;
  servicio_id?: string;
  producto_id?: string;
  nombre: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  moneda: string;
  comision: number;
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
  total: number;
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

  // Obtener ventas/facturas de una sede específica
  async getVentasBySede(
    sede_id: string, 
    params?: {
      page?: number;
      limit?: number;
      fecha_desde?: string;
      fecha_hasta?: string;
      profesional_id?: string;
      search?: string;
    }
  ): Promise<FacturaConverted[]> {
    try {
      const queryParams = new URLSearchParams();
      
      // Agregar parámetros básicos con valores por defecto
      queryParams.append('page', (params?.page || 1).toString());
      queryParams.append('limit', (params?.limit || 100).toString());
      queryParams.append('sort_order', 'desc');
      
      if (params?.fecha_desde) queryParams.append('fecha_desde', params.fecha_desde);
      if (params?.fecha_hasta) queryParams.append('fecha_hasta', params.fecha_hasta);
      if (params?.profesional_id) queryParams.append('profesional_id', params.profesional_id);
      if (params?.search) queryParams.append('search', params.search);

      const url = `${API_BASE_URL}api/billing/sales/${sede_id}?${queryParams.toString()}`;
      
      console.log("📤 Solicitando facturas desde:", url);

      const response = await fetch(url, {
        method: "GET",
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        // Intentar obtener más detalles del error
        let errorMessage = `Error ${response.status}: ${response.statusText}`;
        try {
          const errorData = await response.json();
          console.error("Error detallado del backend:", errorData);
          errorMessage = errorData.detail || errorData.message || errorMessage;
        } catch (e) {
          // Si no se puede parsear como JSON, usar el texto plano
          const errorText = await response.text();
          console.error("Error texto del backend:", errorText);
          errorMessage = errorText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      const data: FacturaResponse = await response.json();
      console.log(`✅ Facturas obtenidas: ${data.ventas.length} registros`);
      
      // Convertir los datos de la API al formato que usa nuestra aplicación
      return data.ventas.map(factura => this.convertToAppFormat(factura));
      
    } catch (error) {
      console.error("Error obteniendo ventas de la sede:", error);
      throw error;
    }
  }

  // Obtener detalle de una venta específica
  async getDetalleVenta(sede_id: string, venta_id: string): Promise<FacturaConverted> {
    try {
      const url = `${API_BASE_URL}api/billing/sales/${sede_id}/${venta_id}`;
      console.log("📤 Solicitando detalle de venta:", url);

      const response = await fetch(url, {
        method: "GET",
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      const data: FacturaAPI = await response.json();
      return this.convertToAppFormat(data);
      
    } catch (error) {
      console.error("Error obteniendo detalle de la venta:", error);
      throw error;
    }
  }

  // Obtener facturas de un cliente específico
  async getFacturasCliente(cliente_id: string): Promise<FacturaConverted[]> {
    try {
      const url = `${API_BASE_URL}api/billing/invoices/${cliente_id}`;
      console.log("📤 Solicitando facturas del cliente:", url);

      const response = await fetch(url, {
        method: "GET",
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      const data: FacturaResponse = await response.json();
      return data.ventas.map(factura => this.convertToAppFormat(factura));
      
    } catch (error) {
      console.error("Error obteniendo facturas del cliente:", error);
      throw error;
    }
  }

  // Obtener todas las facturas del usuario autenticado
  async getVentasUsuario(): Promise<FacturaConverted[]> {
    try {
      // Obtener el sede_id del usuario desde sessionStorage
      const sede_id = sessionStorage.getItem("beaux-sede_id");
      
      if (!sede_id) {
        throw new Error("No se encontró sede_id en la sesión");
      }

      return await this.getVentasBySede(sede_id);
      
    } catch (error) {
      console.error("Error obteniendo ventas del usuario:", error);
      throw error;
    }
  }

  // Convertir datos de API al formato de la aplicación
  private convertToAppFormat(factura: FacturaAPI): FacturaConverted {
    // Determinar el método de pago principal (el que tenga mayor monto)
    const metodoPago = this.getMetodoPagoPrincipal(factura.historial_pagos);
    
    // Determinar el estado basado en el historial de pagos
    const estado = this.getEstadoFactura(factura.historial_pagos);
    
    // Obtener el total del desglose de pagos
    const total = factura.desglose_pagos?.total || 0;
    
    // Obtener fecha comprobante (usar la primera fecha del historial)
    const fechaComprobante = factura.historial_pagos.length > 0 
      ? factura.historial_pagos[0].fecha 
      : factura.fecha_pago;

    // Obtener el tipo de comprobante basado en el identificador
    const comprobanteDePago = this.getTipoComprobante(factura.identificador);

    return {
      identificador: factura.identificador,
      fecha_pago: factura.fecha_pago,
      local: factura.local,
      sede_id: factura.sede_id,
      moneda: factura.moneda,
      tipo_comision: factura.tipo_comision,
      cliente_id: factura.cliente_id,
      nombre_cliente: factura.nombre_cliente.trim(),
      cedula_cliente: factura.cedula_cliente,
      email_cliente: factura.email_cliente,
      telefono_cliente: factura.telefono_cliente,
      total: total,
      comprobante_de_pago: comprobanteDePago,
      numero_comprobante: factura.numero_comprobante,
      fecha_comprobante: fechaComprobante,
      monto: total,
      profesional_id: factura.profesional_id,
      profesional_nombre: factura.profesional_nombre,
      metodo_pago: metodoPago,
      facturado_por: factura.facturado_por,
      estado: estado,
      items: factura.items,
      historial_pagos: factura.historial_pagos
    };
  }

  private getMetodoPagoPrincipal(historial: HistorialPago[]): string {
    if (historial.length === 0) return "efectivo";
    
    // Contar montos totales por método de pago
    const montosPorMetodo: Record<string, number> = {};
    historial.forEach(pago => {
      montosPorMetodo[pago.metodo] = (montosPorMetodo[pago.metodo] || 0) + pago.monto;
    });
    
    // Devolver el método con mayor monto total
    return Object.entries(montosPorMetodo)
      .sort((a, b) => b[1] - a[1])[0][0] || "efectivo";
  }

  private getEstadoFactura(historial: HistorialPago[]): string {
    if (historial.length === 0) return "pendiente";
    
    // Verificar el último pago para determinar el estado
    const ultimoPago = historial[historial.length - 1];
    return ultimoPago.saldo_despues === 0 ? "pagado" : "pendiente";
  }

  private getTipoComprobante(identificador: string): string {
    // Determinar el tipo de comprobante basado en el identificador
    if (identificador.includes('FAC-')) return "Factura";
    if (identificador.includes('TIC-')) return "Ticket";
    if (identificador.includes('REC-')) return "Recibo";
    return "Comprobante";
  }

  // Buscar facturas con filtros avanzados
  async buscarFacturas(filtros: {
    sede_id?: string;
    searchTerm?: string;
    estado?: string;
    fecha_desde?: string;
    fecha_hasta?: string;
    profesional_id?: string;
    page?: number;
    limit?: number;
  }): Promise<FacturaConverted[]> {
    try {
      const sede_id = filtros.sede_id || sessionStorage.getItem("beaux-sede_id");
      
      if (!sede_id) {
        throw new Error("No se especificó sede_id para la búsqueda");
      }

      // Parámetros para la API
      const params = {
        page: filtros.page || 1,
        limit: filtros.limit || 100,
        fecha_desde: filtros.fecha_desde,
        fecha_hasta: filtros.fecha_hasta,
        profesional_id: filtros.profesional_id,
        search: filtros.searchTerm
      };

      // Obtener facturas del backend
      let facturas = await this.getVentasBySede(sede_id, params);
      
      // Aplicar filtros adicionales en el frontend si es necesario
      if (filtros.estado && filtros.estado !== "all") {
        facturas = facturas.filter(factura => 
          factura.estado === filtros.estado
        );
      }
      
      return facturas;
      
    } catch (error) {
      console.error("Error buscando facturas:", error);
      throw error;
    }
  }

  // Exportar facturas a CSV (helper para el frontend)
  exportarFacturasCSV(facturas: FacturaConverted[], nombreArchivo: string = 'facturas.csv'): void {
    try {
      if (facturas.length === 0) {
        console.warn("No hay facturas para exportar");
        return;
      }

      // Crear encabezados
      const headers = [
        "Fecha Pago",
        "Cliente",
        "Cédula",
        "Email",
        "Teléfono",
        "Local",
        "Profesional",
        "N° Comprobante",
        "Método Pago",
        "Moneda",
        "Total",
        "Estado",
        "Facturado Por"
      ];

      // Crear filas
      const rows = facturas.map(factura => [
        factura.fecha_pago,
        factura.nombre_cliente,
        factura.cedula_cliente || 'N/A',
        factura.email_cliente || 'N/A',
        factura.telefono_cliente || 'N/A',
        factura.local,
        factura.profesional_nombre,
        factura.numero_comprobante,
        factura.metodo_pago,
        factura.moneda,
        Math.round(factura.total).toString(),
        factura.estado,
        factura.facturado_por
      ]);

      // Crear contenido CSV
      const csvContent = [
        headers.join(","),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
      ].join("\n");

      // Crear y descargar archivo
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", nombreArchivo);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      console.log(`✅ Exportadas ${facturas.length} facturas a ${nombreArchivo}`);
      
    } catch (error) {
      console.error("Error exportando facturas a CSV:", error);
      throw error;
    }
  }
}

// Exportar una instancia única del servicio
export const facturaService = new FacturaService();
