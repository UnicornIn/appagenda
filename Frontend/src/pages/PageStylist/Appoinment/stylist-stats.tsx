// src/components/StylistStats.tsx - VERSIÓN CORREGIDA
"use client";

interface StylistStatsProps {
  citasHoy: number;
  serviciosCompletadosHoy: number;
  totalVentasHoy: number;
  bloqueosHoy?: number; // ← Hacerlo opcional con "?"
  comisionServiciosPct?: number | null;
  comisionProductosPct?: number | null;
}

export function StylistStats({
  totalVentasHoy,
  comisionServiciosPct,
  comisionProductosPct,
}: StylistStatsProps) {
  // Datos de ejemplo para productos
  const ventasProductos = [
    { nombre: "Producto A", total: 0 },
    { nombre: "Producto B", total: 0 },
  ];

  const totalVentasProductos = ventasProductos.reduce((acc, v) => acc + v.total, 0);
  const pctServicios = typeof comisionServiciosPct === "number" ? comisionServiciosPct / 100 : 0.3;
  const pctProductos = typeof comisionProductosPct === "number" ? comisionProductosPct / 100 : 0.2;

  const comisionServicio = totalVentasHoy * pctServicios;
  const comisionProductos = totalVentasProductos * pctProductos;
  const totalComisiones = comisionServicio + comisionProductos;

  // Función para formatear moneda
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      {/* COMISIONES */}
      <div className="rounded-lg border border-gray-300 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Mis comisiones</h3>

        {/* Bloque de productos (oculto a pedido del usuario) */}

        {/* Total comisiones */}
        <div className="border-t border-gray-400 pt-3 mt-3">
          <div className="flex justify-between items-center">
            <div>
              <span className="font-bold text-gray-900">Total comisiones</span>
              <div className="text-xs text-gray-700 mt-1">
                Hoy • Generado automáticamente
              </div>
            </div>
            <div className="text-right">
              <div className="text-xl font-bold text-gray-900">
                {formatCurrency(totalComisiones)}
              </div>
              <div className="text-xs text-gray-600 mt-1">
                Disponible para pago
              </div>
            </div>
          </div>
        </div>

        {/* Información adicional */}
        {/* Información adicional de ventas de productos oculta a solicitud */}
      </div>
    </div>
  )
}
