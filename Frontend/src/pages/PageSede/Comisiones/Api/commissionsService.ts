// src/services/commissionsService.ts
import { apiClient } from './apiClient';
import { 
  Commission, 
  CommissionDetail, 
  CommissionFilters,
  CommissionSummary,
  ServiceCommission,
  ProductCommission,
  CommissionTotals,
  PendientesResumen,
} from '../../../../types/commissions';
import { getStoredCurrency, normalizeCurrencyCode } from '../../../../lib/currency';

export class CommissionsService {
  // Generar un requestKey único basado en filtros
  private generateRequestKey(endpoint: string, filters: any): string {
    const filterString = JSON.stringify(filters);
    return `${endpoint}_${filterString}`;
  }

  // ✅ Método para obtener resumen de comisiones pendientes (NUEVO)
  async getPendientesResumen(): Promise<PendientesResumen> {
    const response = await apiClient.get<PendientesResumen>('api/commissions/pendientes/resumen');
    
    if (response.error && response.error !== 'Request aborted') {
      console.error('Error obteniendo resumen pendientes:', response.error);
      throw new Error(response.error);
    }
    
    // Si fue abortado, retornar objeto vacío
    if (response.error === 'Request aborted') {
      return {
        total_comisiones_pendientes: 0,
        monto_total_pendiente: 0,
        total_comisiones_servicios: 0,
        total_comisiones_productos: 0,
        moneda: getStoredCurrency('USD'),
        por_profesional: []
      };
    }
    
    return response.data || {
      total_comisiones_pendientes: 0,
      monto_total_pendiente: 0,
      total_comisiones_servicios: 0,
      total_comisiones_productos: 0,
      moneda: getStoredCurrency('USD'),
      por_profesional: []
    };
  }

  async getCommissions(filters: CommissionFilters = {}): Promise<Commission[]> {
    // Si el usuario es admin_sede, usar su sede_id automáticamente desde AuthContext
    const userSedeId = localStorage.getItem('beaux-sede_id') || 
                       sessionStorage.getItem('beaux-sede_id');
    
    const userRole = localStorage.getItem('beaux-role') || 
                     sessionStorage.getItem('beaux-role');
    
    // Crear filtros finales
    const finalFilters: any = { ...filters };
    
    // Añadir estado pendiente SIEMPRE (según tu endpoint)
    if (!finalFilters.estado) {
      finalFilters.estado = 'pendiente';
    }
    
    // Para admin_sede, forzar el filtro por su sede
    if (userRole === 'admin_sede' && userSedeId && !finalFilters.sede_id) {
      finalFilters.sede_id = userSedeId;
    }
    
    // Limpiar filtros - quitar valores vacíos
    const cleanedFilters: any = {};
    Object.entries(finalFilters).forEach(([key, value]) => {
      if (value && value !== 'todos' && value !== '') {
        cleanedFilters[key] = value;
      }
    });

    console.log('📤 Enviando filtros a API:', cleanedFilters);
    
    // Generar un key único para esta solicitud
    const requestKey = this.generateRequestKey('commissions', cleanedFilters);
    
    const response = await apiClient.get<Commission[]>('api/commissions/', cleanedFilters, requestKey);
    
    if (response.error && response.error !== 'Request aborted') {
      console.error('Error obteniendo comisiones:', response.error);
      throw new Error(response.error);
    }
    
    // Si fue abortado, retornar array vacío
    if (response.error === 'Request aborted') {
      return [];
    }
    
    return response.data || [];
  }

  async getCommissionDetail(commissionId: string): Promise<CommissionDetail> {
    const response = await apiClient.get<CommissionDetail>(`api/commissions/${commissionId}`);
    
    if (response.error && response.error !== 'Request aborted') {
      console.error('Error obteniendo detalle de comisión:', response.error);
      throw new Error(response.error);
    }
    
    if (response.error === 'Request aborted') {
      throw new Error('Request aborted');
    }
    
    if (!response.data) {
      throw new Error('Comisión no encontrada');
    }
    
    return response.data;
  }

  async getCommissionSummary(commissionId: string): Promise<CommissionSummary> {
    const detail = await this.getCommissionDetail(commissionId);
    const moneda = normalizeCurrencyCode(detail.moneda || getStoredCurrency('USD'));
    
    // Transformar servicios_detalle al formato del frontend
    const servicios: ServiceCommission[] = detail.servicios_detalle
      .filter(item => item.tipo_comision_sede === 'servicios')
      .map(item => ({
        id: item.servicio_id,
        nombre: item.servicio_nombre,
        precio: item.valor_servicio,
        comisionEstilistaPorcentaje: item.porcentaje,
        comisionEstilistaMonto: item.valor_comision_servicio,
        comisionCasaPorcentaje: 100 - item.porcentaje,
        comisionCasaMonto: item.valor_servicio - item.valor_comision_servicio,
        fecha: item.fecha
      }));

    const productos: ProductCommission[] = detail.servicios_detalle
      .filter(item => item.tipo_comision_sede === 'productos')
      .map(item => ({
        id: item.servicio_id,
        nombre: item.servicio_nombre,
        precio: item.valor_servicio,
        comisionEstilistaPorcentaje: item.porcentaje,
        comisionEstilistaMonto: item.valor_comision_productos,
        comisionCasaPorcentaje: 100 - item.porcentaje,
        comisionCasaMonto: item.valor_servicio - item.valor_comision_productos
      }));

    // Calcular totales
    const totales: CommissionTotals = {
      totalServicios: servicios.reduce((sum, s) => sum + s.precio, 0),
      totalProductos: productos.reduce((sum, p) => sum + p.precio, 0),
      totalComisionEstilista: servicios.reduce((sum, s) => sum + s.comisionEstilistaMonto, 0) +
                              productos.reduce((sum, p) => sum + p.comisionEstilistaMonto, 0),
      totalComisionCasa: servicios.reduce((sum, s) => sum + s.comisionCasaMonto, 0) +
                         productos.reduce((sum, p) => sum + p.comisionCasaMonto, 0),
      descuentosNomina: 0,
      anticiposBonos: 0,
      totalAPagar: detail.total_comisiones
    };

    return { servicios, productos, totales, moneda };
  }

  async approveCommission(commissionId: string): Promise<boolean> {
    const response = await apiClient.put(`api/commissions/${commissionId}/approve`);
    return !response.error;
  }

  // ✅ Método opcional: Añadir filtro de fecha por defecto si no se especifica
  getDefaultDateRange(): { fecha_inicio: string; fecha_fin: string } {
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    
    return {
      fecha_inicio: firstDayOfMonth.toISOString().split('T')[0],
      fecha_fin: lastDayOfMonth.toISOString().split('T')[0]
    };
  }
}

export const commissionsService = new CommissionsService();
