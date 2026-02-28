// src/api/inventario.ts
import { API_BASE_URL } from "../../../types/config";

export interface InventarioProducto {
  _id: string;
  nombre: string;
  producto_id: string;
  sede_id: string;
  stock_actual: number;
  stock_minimo: number;
  fecha_creacion: string;
  fecha_ultima_actualizacion: string;
  creado_por: string;
  producto_nombre: string;
  producto_codigo: string;
  categoria: string;
}

export interface CrearInventarioInput {
  producto_id: string;
  sede_id: string;
  stock_actual: number;
  stock_minimo: number;
}

export class InventarioService {
  // No almacenar token en el constructor
  private getHeaders(token: string | null) {
    const headers: HeadersInit = {
      "accept": "application/json",
      "Content-Type": "application/json",
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    return headers;
  }

  private parseErrorDetail(detail: unknown): string {
    if (typeof detail === "string") {
      return detail;
    }

    if (Array.isArray(detail)) {
      const mensajes = detail
        .map((item) => {
          if (item && typeof item === "object" && "msg" in item) {
            const msg = (item as { msg?: unknown }).msg;
            return typeof msg === "string" ? msg : null;
          }
          return null;
        })
        .filter((msg): msg is string => Boolean(msg));

      if (mensajes.length > 0) {
        return mensajes.join(", ");
      }
    }

    return "No se pudo procesar la solicitud";
  }

  // Obtener inventario de una sede específica
  async getInventarioBySede(
    sede_id: string,
    stockBajo: boolean = false,
    token: string | null
  ): Promise<InventarioProducto[]> {
    try {
      const url = new URL(`${API_BASE_URL}inventary/inventarios/inventarios/`);

      // Agregar parámetros a la URL
      url.searchParams.append('sede_id', sede_id);
      if (stockBajo) {
        url.searchParams.append('stock_bajo', 'true');
      }

      const response = await fetch(url.toString(), {
        method: "GET",
        headers: this.getHeaders(token),
      });

      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      const data: InventarioProducto[] = await response.json();
      return data;

    } catch (error) {
      console.error("Error obteniendo inventario de la sede:", error);
      throw error;
    }
  }

  // Obtener inventario del usuario autenticado
  async getInventarioUsuario(
    stockBajo: boolean = false,
    token?: string | null,
    sede_id?: string | null
  ): Promise<InventarioProducto[]> {
    try {
      // Usar el token y sede_id proporcionados, o intentar obtenerlos de sessionStorage
      const actualToken = token || sessionStorage.getItem("access_token");
      const actualSedeId = sede_id || sessionStorage.getItem("beaux-sede_id");

      if (!actualSedeId) {
        throw new Error("No se encontró sede_id");
      }

      if (!actualToken) {
        throw new Error("No se encontró token de autenticación");
      }

      return await this.getInventarioBySede(actualSedeId, stockBajo, actualToken);

    } catch (error) {
      console.error("Error obteniendo inventario del usuario:", error);
      throw error;
    }
  }

  // Ajuste de stock: backend espera cantidad_ajuste (delta = nuevoValor - valorActual).
  // PATCH .../inventary/inventarios/inventarios/{inventario_id}/ajustar
  async ajustarInventario(
    inventarioId: string,
    cantidadAjuste: number,
    token?: string | null
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const actualToken = token || sessionStorage.getItem("access_token");

      if (!actualToken) {
        throw new Error("No se encontró token de autenticación");
      }

      const response = await fetch(
        `${API_BASE_URL}inventary/inventarios/inventarios/${inventarioId}/ajustar`,
        {
          method: "PATCH",
          headers: this.getHeaders(actualToken),
          body: JSON.stringify({
            cantidad_ajuste: cantidadAjuste
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: Array.isArray(data.detail)
            ? data.detail.map((e: any) => e.msg).join(", ")
            : data.detail || "No se pudo ajustar el inventario"

        };
      }

      return {
        success: true,
        message: data.msg || "Inventario ajustado correctamente"
      };

    } catch (error) {
      console.error("Error ajustando inventario:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Error desconocido"
      };
    }
  }

  // Crear inventario inicial
  async crearInventario(
    payload: CrearInventarioInput,
    token?: string | null
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const actualToken = token || sessionStorage.getItem("access_token");

      if (!actualToken) {
        throw new Error("No se encontró token de autenticación");
      }

      const response = await fetch(
        `${API_BASE_URL}inventary/inventarios/inventarios/`,
        {
          method: "POST",
          headers: this.getHeaders(actualToken),
          body: JSON.stringify(payload),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: this.parseErrorDetail((data as { detail?: unknown }).detail),
        };
      }

      return {
        success: true,
        message: (data as { msg?: string }).msg || "Inventario creado correctamente",
      };
    } catch (error) {
      console.error("Error creando inventario:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Error desconocido",
      };
    }
  }

  // Filtrar productos
  async buscarProductos(filtros: {
    searchTerm?: string;
    categoria?: string;
    stockBajo?: boolean;
  }, token?: string | null, sede_id?: string | null): Promise<InventarioProducto[]> {
    try {
      // Obtener todos los productos del inventario
      let productos = await this.getInventarioUsuario(
        filtros.stockBajo,
        token,
        sede_id
      );

      // Aplicar filtros
      if (filtros.searchTerm) {
        const searchLower = filtros.searchTerm.toLowerCase();
        productos = productos.filter(producto =>
          producto.nombre.toLowerCase().includes(searchLower) ||
          producto.producto_id.toLowerCase().includes(searchLower) ||
          producto.producto_codigo.toLowerCase().includes(searchLower)
        );
      }

      if (filtros.categoria && filtros.categoria !== "all") {
        productos = productos.filter(producto =>
          producto.categoria === filtros.categoria
        );
      }

      return productos;

    } catch (error) {
      console.error("Error buscando productos:", error);
      throw error;
    }
  }
}

// Exportar una instancia única del servicio
export const inventarioService = new InventarioService();
