"use client"

import { useState, useEffect, useMemo } from "react"
import { AlertTriangle, Loader2 } from "lucide-react"
import { Button } from "../../../components/ui/button"
import { inventarioService } from "./inventario"
import type { InventarioProducto } from "./inventario"
import { Sidebar } from "../../../components/Layout/Sidebar"
import { useAuth } from "../../../components/Auth/AuthContext" // Ajusta la ruta según tu estructura
import { facturaService } from "../Sales-invoiced/facturas"
import {
  mapProductsRows,
  buildInvoiceDateRange,
  type DateRange as DashboardDateRange,
} from "../../PageSuperAdmin/Dashboard/super-admin-dashboard.utils"
import type { Factura } from "../../../types/factura"
import { normalizeCurrencyCode } from "../../../lib/currency"
import {
  ProductsHeaderFilters,
  ProductsSalesCard,
  InventorySummaryCard,
  type ProductSalesRow,
} from "../../../features/products-dashboard/components"

export function ProductsList() {
  const [productos, setProductos] = useState<InventarioProducto[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState<string>("today")
  const [dateRange, setDateRange] = useState<DashboardDateRange>(() =>
    buildInvoiceDateRange("today", { start_date: "", end_date: "" })
  )
  const [ventasLoading, setVentasLoading] = useState(false)
  const [ventasError, setVentasError] = useState<string | null>(null)
  const [productSalesRows, setProductSalesRows] = useState<ProductSalesRow[]>([])
  const [ventasCurrency, setVentasCurrency] = useState<string>("COP")

  // Usar el AuthContext en lugar de sessionStorage
  const { user, isAuthenticated, isLoading: authLoading } = useAuth()

  // Obtener datos de la sede desde el AuthContext
  // También mantenemos compatibilidad con sessionStorage como fallback
  const sedeId = user?.sede_id || sessionStorage.getItem("beaux-sede_id")
  const nombreLocal = user?.nombre_local || sessionStorage.getItem("beaux-nombre_local")

  // Mantener dateRange sincronizado cuando cambia el período (excepto custom)
  useEffect(() => {
    if (period === "custom") return
    const next = buildInvoiceDateRange(period, dateRange)
    if (next.start_date !== dateRange.start_date || next.end_date !== dateRange.end_date) {
      setDateRange(next)
    }
  }, [period])

  // Cargar inventario
  useEffect(() => {
    if (!authLoading && sedeId) {
      cargarInventario()
    }
  }, [authLoading, sedeId])

  // Mostrar mensaje si no está autenticado
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setError("Debes iniciar sesión para acceder al inventario")
      setIsLoading(false)
    }
  }, [authLoading, isAuthenticated])

  // Cargar ventas de productos para el dashboard
  useEffect(() => {
    const cargarVentasProductos = async () => {
      if (!isAuthenticated || !sedeId) {
        return
      }

      const effectiveRange =
        period === "custom" && dateRange.start_date && dateRange.end_date
          ? dateRange
          : buildInvoiceDateRange(period === "custom" ? "last_30_days" : period, dateRange)

      try {
        setVentasLoading(true)
        setVentasError(null)

        const facturas = await facturaService.getVentasBySede(
          sedeId,
          1,
          200,
          effectiveRange.start_date,
          effectiveRange.end_date
        )

        const currency = normalizeCurrencyCode(facturas[0]?.moneda || "COP")
        setVentasCurrency(currency)

        const rows = mapProductsRows(facturas as Factura[], currency).map((row) => ({
          productId: row.productId,
          nombre: row.producto,
          unidades: row.unidades,
          monto: row.ventas,
          currency: row.currency,
          participacion: row.participacion,
        }))

        setProductSalesRows(rows)
      } catch (err) {
        console.error("Error cargando ventas de productos:", err)
        setVentasError(
          err instanceof Error ? err.message : "No se pudieron cargar las ventas de productos"
        )
        setProductSalesRows([])
      } finally {
        setVentasLoading(false)
      }
    }

    void cargarVentasProductos()
  }, [period, dateRange, sedeId, isAuthenticated])

  const cargarInventario = async () => {
    try {
      setIsLoading(true)
      setError(null)

      // Verificar que tenemos los datos necesarios
      if (!sedeId) {
        throw new Error("No se encontró información de la sede")
      }

      if (!user?.token && !sessionStorage.getItem("access_token")) {
        throw new Error("No hay token de autenticación disponible")
      }

      // Pasar el token y sede_id al servicio
      const inventario = await inventarioService.getInventarioUsuario(
        false,
        user?.token || sessionStorage.getItem("access_token"),
        sedeId
      )

      setProductos(inventario)

    } catch (err) {
      console.error("Error cargando inventario:", err)
      const errorMessage = err instanceof Error ? err.message : "Error al cargar el inventario. Por favor, intenta nuevamente."
      setError(errorMessage)
      setProductos([])
    } finally {
      setIsLoading(false)
    }
  }

  const stats = useMemo(() => {
    const totalProductos = productos.length
    const productosBajoStock = productos.filter(p => p.stock_actual <= p.stock_minimo).length
    const productosSinStock = productos.filter(p => p.stock_actual === 0).length
    const totalStock = productos.reduce((sum, p) => sum + p.stock_actual, 0)
    const stockPromedio = productos.length > 0 ? Math.round(totalStock / productos.length) : 0

    return {
      totalProductos,
      productosBajoStock,
      productosSinStock,
      totalStock,
      stockPromedio
    }
  }, [productos])

  // Mostrar loading mientras se verifica la autenticación
  if (authLoading) {
    return (
      <div className="flex min-h-screen bg-white">
        <Sidebar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400 mb-4" />
          <p className="text-gray-600 ml-2">Verificando autenticación...</p>
        </div>
      </div>
    )
  }

  // Mostrar mensaje de error si no está autenticado
  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar />
        <div className="flex-1 flex flex-col items-center justify-center">
          <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Acceso no autorizado</h2>
          <p className="text-gray-600 mb-4">Debes iniciar sesión para acceder a esta página</p>
          <Button
            onClick={() => window.location.href = "/login"} // Ajusta la ruta según tu aplicación
            className="bg-black text-white hover:bg-neutral-900"
          >
            Ir al inicio de sesión
          </Button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="flex min-h-screen bg-white">
        <Sidebar />
        <div className="flex-1">
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            <ProductsHeaderFilters
              title="Dashboard de Productos"
              subtitle="Resumen de ventas e inventario de los productos"
              sedes={sedeId ? [{ sede_id: sedeId, nombre: nombreLocal || "Sede actual" }] : []}
              selectedSedeId={sedeId || ""}
              onSedeChange={() => {}}
              disableSedeSelect
              period={period}
              onPeriodChange={setPeriod}
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              onOpenConfig={() =>
                document.getElementById("inventario-detalle")?.scrollIntoView({ behavior: "smooth" })
              }
            />

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-900">No se pudo cargar el inventario</p>
                <p className="text-amber-800">{error}</p>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <ProductsSalesCard
              title={`Venta de Productos - ${nombreLocal || "Sede"}`}
              rows={productSalesRows}
              currency={ventasCurrency}
              loading={ventasLoading}
              error={ventasError}
              onViewDetail={() => {
                window.location.href = "/sede/sales-invoiced"
              }}
            />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ProductsSalesCard
                title="Top productos"
                rows={productSalesRows.slice(0, 4)}
                currency={ventasCurrency}
                loading={ventasLoading}
                error={ventasError}
                compact
                onViewDetail={() => {
                  window.location.href = "/sede/sales-invoiced"
                }}
              />
              <InventorySummaryCard
                totalProductos={stats.totalProductos}
                stockTotal={stats.totalStock}
                bajoStock={stats.productosBajoStock}
                sinStock={stats.productosSinStock}
                diasRestantes={null}
                loading={isLoading}
                onViewInventory={() =>
                  document.getElementById("inventario-detalle")?.scrollIntoView({ behavior: "smooth" })
                }
              />
            </div>
          </div>

          {false && (
            <div id="inventario-detalle" className="mt-10 space-y-6">
              {/* Sección de inventario detallado deshabilitada temporalmente */}
            </div>
          )}
          </div>
        </div>
      </div>
    </>
  )
}
