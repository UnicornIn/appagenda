// components/Quotes/citasApi.ts - Agrega esta función
import { API_BASE_URL } from '../../../types/config'; // Ajusta la ruta según tu estructura

export const updateCita = async (citaId: string, cambios: any, token: string) => {
  try {
    const response = await fetch(`${API_BASE_URL}scheduling/quotes/${citaId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(cambios)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || `Error ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error en updateCita:', error);
    throw error;
  }

};
// En tu archivo citasApi.ts
export const registrarPagoCita = async (
  citaId: string,
  pagoData: {
    monto: number;
    metodo_pago: string;
  },
  token: string
) => {
  const response = await fetch(
    `${API_BASE_URL}scheduling/quotes/citas/${citaId}/pago`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(pagoData)
    }
  );

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.detail || 'Error al registrar pago');
  }

  return await response.json();
};
