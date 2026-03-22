"use client"

import { useState, useEffect, useMemo } from "react"
import { AlertTriangle, Loader2 } from "lucide-react"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../components/ui/dialog"
import { inventarioService } from "../../PageSede/Products/inventario"
import type { InventarioProducto } from "../../PageSede/Products/inventario"
import { Sidebar } from "../../../components/Layout/Sidebar"
import { useAuth } from "../../../components/Auth/AuthContext" // Ajusta la ruta según tu estructura
import { API_BASE_URL } from "../../../types/config"
import { sedeService } from "../Sedes/sedeService"
import type { Sede } from "../../../types/sede"
import { facturaService } from "../../PageSede/Sales-invoiced/facturas"
import { mapProductsRows, buildInvoiceDateRange, type DateRange as DashboardDateRange } from "../Dashboard/super-admin-dashboard.utils"
import type { Factura } from "../../../types/factura"
import { normalizeCurrencyCode } from "../../../lib/currency"
import {
  ProductsHeaderFilters,
  ProductsSalesCard,
  InventorySummaryCard,
  type ProductSalesRow,
  ProductCardsGrid,
} from "../../../features/products-dashboard/components"

type CatalogoProducto = {
  id: string
  nombre: string
  codigo: string
}

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
  const [selectedDashboardSede, setSelectedDashboardSede] = useState<string>("")
  const [multiSedeSales, setMultiSedeSales] = useState<Record<string, ProductSalesRow[]>>({})
  const [multiSedeCurrency, setMultiSedeCurrency] = useState<Record<string, string>>({})
  const [countrySales, setCountrySales] = useState<Record<string, ProductSalesRow[]>>({})
  const [countryCurrency, setCountryCurrency] = useState<Record<string, string>>({})
  const [missingCountrySedes, setMissingCountrySedes] = useState<string[]>([])
  const [editingProductId, setEditingProductId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState<string>("")
  const [editingPrice, setEditingPrice] = useState<string>("")
  const [editingLoading, setEditingLoading] = useState<boolean>(false)
  const [productPrices, setProductPrices] = useState<Record<string, { price: number; currency: string }>>({})
  const [isCreateProductModalOpen, setIsCreateProductModalOpen] = useState(false)
  const [newProductName, setNewProductName] = useState("")
  const [newProductCategory, setNewProductCategory] = useState("")
  const [newProductCode, setNewProductCode] = useState("")
  const [newProductDescription, setNewProductDescription] = useState("")
  const [newProductPriceCOP, setNewProductPriceCOP] = useState("")
  const [newProductPriceUSD, setNewProductPriceUSD] = useState("")
  const [newProductPriceMXN, setNewProductPriceMXN] = useState("")
  const [newProductCommission, setNewProductCommission] = useState("")
  const [newProductStock, setNewProductStock] = useState("0")
  const [newProductStockMin, setNewProductStockMin] = useState("5")
  const [isCreatingProduct, setIsCreatingProduct] = useState(false)
  const [createProductError, setCreateProductError] = useState<string | null>(null)
  const [createProductSuccess, setCreateProductSuccess] = useState<string | null>(null)

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isCreatingInventario, setIsCreatingInventario] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [modalDataError, setModalDataError] = useState<string | null>(null)
  const [isLoadingCreateData, setIsLoadingCreateData] = useState(false)
  const [sedesDisponibles, setSedesDisponibles] = useState<Sede[]>([])
  const [productosCatalogo, setProductosCatalogo] = useState<CatalogoProducto[]>([])
  const [nuevoProductoId, setNuevoProductoId] = useState("")
  const [nuevoSedeId, setNuevoSedeId] = useState("")
  const [nuevoStockInicial, setNuevoStockInicial] = useState("0")
  const [nuevoStockMinimo, setNuevoStockMinimo] = useState("5")

  // Usar el AuthContext en lugar de sessionStorage
  const { user, isAuthenticated, isLoading: authLoading, activeSedeId } = useAuth()

  // Obtener datos de la sede desde el AuthContext
  // También mantenemos compatibilidad con sessionStorage como fallback
  const sedeId = user?.sede_id || activeSedeId || sessionStorage.getItem("beaux-sede_id")
  const nombreLocal = user?.nombre_local || sessionStorage.getItem("beaux-nombre_local")
  const resolveToken = () =>
    user?.token ||
    user?.access_token ||
    sessionStorage.getItem("access_token") ||
    localStorage.getItem("access_token")

  const resolveSedeId = (preferida?: string | null) =>
    (preferida && preferida.trim() && preferida.trim() !== "all" ? preferida.trim() : "") ||
    activeSedeId ||
    sedeId ||
    sessionStorage.getItem("beaux-sede_id") ||
    localStorage.getItem("beaux-sede_id") ||
    ""

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
    if (authLoading) return
    if (selectedDashboardSede === "all") {
      setProductos([])
      setIsLoading(false)
      setError(null)
      return
    }
    cargarInventario(selectedDashboardSede || null)
  }, [authLoading, sedeId, activeSedeId, selectedDashboardSede])

  // Mostrar mensaje si no está autenticado
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setError("Debes iniciar sesión para acceder al inventario")
      setIsLoading(false)
    }
  }, [authLoading, isAuthenticated])

  const selectedSedeName = useMemo(() => {
    const match = sedesDisponibles.find((sede) => sede.sede_id === selectedDashboardSede)
    return match?.nombre || nombreLocal || "Sede seleccionada"
  }, [sedesDisponibles, selectedDashboardSede, nombreLocal])

  useEffect(() => {
    const buildRange = () =>
      period === "custom" && dateRange.start_date && dateRange.end_date
        ? dateRange
        : buildInvoiceDateRange(period === "custom" ? "last_30_days" : period, dateRange)

    const cargarVentasProductosSede = async (sedeObjetivo: string) => {
      const effectiveRange = buildRange()
      const facturas = await facturaService.getVentasBySede(
        sedeObjetivo,
        1,
        200,
        effectiveRange.start_date,
        effectiveRange.end_date
      )
      const currency = normalizeCurrencyCode(facturas[0]?.moneda || user?.moneda || "COP")
      const rows = mapProductsRows(facturas as Factura[], currency).map((row) => ({
        productId: row.productId,
        nombre: row.producto,
        unidades: row.unidades,
        monto: row.ventas,
        currency: row.currency,
        participacion: row.participacion,
      }))
      return { rows, currency }
    }

    const cargarVentasProductos = async () => {
      if (!isAuthenticated) return

      const sedeObjetivo = selectedDashboardSede || resolveSedeId()
      if (!sedeObjetivo) {
        setVentasError("Selecciona una sede para ver las ventas de productos")
        setProductSalesRows([])
        return
      }

      try {
        setVentasLoading(true)
        setVentasError(null)

        if (sedeObjetivo === "all") {
          const mapaVentas: Record<string, ProductSalesRow[]> = {}
          const mapaMoneda: Record<string, string> = {}
          const sedes = sedesDisponibles.length > 0 ? sedesDisponibles : []

          if (sedes.length === 0) {
            setVentasError("No hay sedes disponibles para mostrar")
            setVentasLoading(false)
            return
          }

          await Promise.all(
            sedes.map(async (sede) => {
              try {
                const resultado = await cargarVentasProductosSede(sede.sede_id)
                mapaVentas[sede.sede_id] = resultado.rows
                mapaMoneda[sede.sede_id] = resultado.currency
              } catch (err) {
                console.warn(`No se pudieron cargar ventas para la sede ${sede.nombre}`, err)
              }
            })
          )

          setMultiSedeSales(mapaVentas)
          setMultiSedeCurrency(mapaMoneda)
          agruparVentasPorPais(sedes, mapaVentas, mapaMoneda)
          setProductSalesRows([])
        } else {
          const resultado = await cargarVentasProductosSede(sedeObjetivo)
          setVentasCurrency(resultado.currency)
          setProductSalesRows(resultado.rows)
          setCountrySales({})
          setMissingCountrySedes([])
        }
      } catch (err) {
        console.error("Error cargando ventas de productos:", err)
        setVentasError(
          err instanceof Error ? err.message : "No se pudieron cargar las ventas de productos"
        )
        setProductSalesRows([])
        setMultiSedeSales({})
        setCountrySales({})
        setMissingCountrySedes([])
      } finally {
        setVentasLoading(false)
      }
    }

    void cargarVentasProductos()
  }, [selectedDashboardSede, period, dateRange, isAuthenticated, user, sedesDisponibles])

  useEffect(() => {
    const resolved = resolveSedeId()
    if (resolved && !nuevoSedeId) {
      setNuevoSedeId(resolved)
    }
  }, [sedeId, activeSedeId, nuevoSedeId])

  useEffect(() => {
    const cargarSedesDisponibles = async () => {
      const token = resolveToken()
      if (!token) return
      try {
        const sedes = await sedeService.getSedes(token)
        setSedesDisponibles(sedes)
        if (!selectedDashboardSede) {
          const resolvedPreferida = resolveSedeId() || sedes[0]?.sede_id || ""
          const next = resolvedPreferida || "all"
          setSelectedDashboardSede(next)
          if (next !== "all" && next.trim()) {
            setNuevoSedeId(next)
          } else if (sedes[0]?.sede_id) {
            setNuevoSedeId(sedes[0].sede_id)
          }
        }
      } catch (err) {
        console.warn("No se pudieron cargar las sedes disponibles:", err)
      }
    }

    void cargarSedesDisponibles()
  }, [authLoading])

  const cargarInventario = async (sedeDestino?: string | null) => {
    if (sedeDestino === "all") {
      setProductos([])
      setIsLoading(false)
      return
    }
    try {
      setIsLoading(true)
      setError(null)

      // Verificar que tenemos los datos necesarios
      const sedeObjetivo = resolveSedeId(sedeDestino)
      if (!sedeObjetivo) {
        setError("Selecciona una sede para gestionar el inventario")
        return
      }

      const token = resolveToken()
      if (!token) {
        setError("No hay token de autenticación disponible")
        return
      }

      // Pasar el token y sede_id al servicio
      const inventario = await inventarioService.getInventarioUsuario(
        false,
        token,
        sedeObjetivo
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

  const agruparVentasPorPais = (
    sedes: Sede[],
    ventasPorSede: Record<string, ProductSalesRow[]>,
    monedaPorSede: Record<string, string>
  ) => {
    const missing: string[] = []
    const agrupado: Record<string, Record<string, ProductSalesRow>> = {}
    const monedaPais: Record<string, string> = {}

    sedes.forEach((sede) => {
      const pais = (sede.pais || "").trim()
      if (!pais) {
        missing.push(sede.nombre)
        return
      }

      const rows = ventasPorSede[sede.sede_id] || []
      if (!monedaPais[pais]) {
        monedaPais[pais] = monedaPorSede[sede.sede_id] || sede.moneda || ventasCurrency
      }

      rows.forEach((row) => {
        const key = row.productId || row.nombre
        if (!agrupado[pais]) agrupado[pais] = {}
        const existente = agrupado[pais][key]
        if (existente) {
          agrupado[pais][key] = {
            ...existente,
            unidades: existente.unidades + row.unidades,
            monto: existente.monto + row.monto,
          }
        } else {
          agrupado[pais][key] = { ...row }
        }
      })
    })

    const resultado: Record<string, ProductSalesRow[]> = {}
    Object.entries(agrupado).forEach(([pais, rowsMap]) => {
      resultado[pais] = Object.values(rowsMap).sort((a, b) => b.unidades - a.unidades)
    })

    setCountrySales(resultado)
    setCountryCurrency(monedaPais)
    setMissingCountrySedes(missing)
  }

  const abrirModalCreacion = () => {
    setCreateError(null)
    setModalDataError(null)
    setNuevoProductoId("")
    setNuevoSedeId(resolveSedeId() || "")
    setNuevoStockInicial("0")
    setNuevoStockMinimo("5")
    setIsCreateModalOpen(true)
    void cargarDatosModalCreacion()
  }

  const cerrarModalCreacion = () => {
    setIsCreateModalOpen(false)
    setCreateError(null)
    setModalDataError(null)
  }

  const parseApiError = async (response: Response, fallback: string) => {
    try {
      const body = await response.json() as { detail?: string | Array<{ msg?: string }> }
      if (typeof body?.detail === "string" && body.detail.trim().length > 0) {
        return body.detail
      }
      if (Array.isArray(body?.detail) && body.detail.length > 0) {
        const firstMessage = body.detail[0]?.msg
        if (typeof firstMessage === "string" && firstMessage.trim().length > 0) {
          return firstMessage
        }
      }
      return fallback
    } catch {
      return fallback
    }
  }

  const handleCreateProduct = async () => {
    setCreateProductError(null)
    setCreateProductSuccess(null)

    const nombre = newProductName.trim()
    if (!nombre) {
      setCreateProductError("El nombre es obligatorio")
      return
    }

    const parseNumber = (value: string) => {
      const num = Number(value)
      return Number.isFinite(num) ? num : NaN
    }

    const precios: Record<string, number> = {}
    const cop = parseNumber(newProductPriceCOP)
    const usd = parseNumber(newProductPriceUSD)
    const mxn = parseNumber(newProductPriceMXN)

    if (Number.isFinite(cop) && cop > 0) precios.COP = cop
    if (Number.isFinite(usd) && usd > 0) precios.USD = usd
    if (Number.isFinite(mxn) && mxn > 0) precios.MXN = mxn

    if (Object.keys(precios).length === 0) {
      setCreateProductError("Debes ingresar al menos un precio (COP, USD o MXN)")
      return
    }

    const stockActual = parseNumber(newProductStock)
    const stockMinimo = parseNumber(newProductStockMin)
    if (!Number.isFinite(stockActual) || stockActual < 0) {
      setCreateProductError("Stock actual debe ser un número mayor o igual a 0")
      return
    }
    if (!Number.isFinite(stockMinimo) || stockMinimo < 0) {
      setCreateProductError("Stock mínimo debe ser un número mayor o igual a 0")
      return
    }

    const comision = newProductCommission.trim()
    let comisionNum: number | undefined
    if (comision) {
      comisionNum = Number(comision)
      if (!Number.isFinite(comisionNum) || comisionNum < 0 || comisionNum > 100) {
        setCreateProductError("La comisión debe estar entre 0 y 100")
        return
      }
    }

    const token = resolveToken()
    if (!token) {
      setCreateProductError("No hay token de autenticación disponible")
      return
    }

    const payload = {
      nombre,
      codigo: newProductCode.trim() || undefined,
      descripcion: newProductDescription.trim() || undefined,
      categoria: newProductCategory.trim() || undefined,
      comision: comision ? comisionNum : undefined,
      precios,
      stock_actual: stockActual || 0,
      stock_minimo: stockMinimo || 0,
    }

    setIsCreatingProduct(true)
    try {
      const response = await fetch(`${API_BASE_URL}inventary/product/productos/`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error(await parseApiError(response, "No se pudo crear el producto"))
      }

      const data = await response.json() as { msg?: string; producto?: { id?: string; _id?: string } }
      setCreateProductSuccess(data.msg || "Producto creado correctamente")

      const createdId = data.producto?.id || data.producto?._id
      if (createdId) {
        setNuevoProductoId(String(createdId))
      }

      // Refrescar catálogo y limpiar formulario
      try {
        const catalogoActualizado = await cargarCatalogoProductos(token)
        setProductosCatalogo(catalogoActualizado)
      } catch {
        // si falla, no interrumpe la UX principal
      }

      setNewProductName("")
      setNewProductCategory("")
      setNewProductCode("")
      setNewProductDescription("")
      setNewProductPriceCOP("")
      setNewProductPriceUSD("")
      setNewProductPriceMXN("")
      setNewProductCommission("")
      setNewProductStock("0")
      setNewProductStockMin("5")
    } catch (err) {
      setCreateProductError(err instanceof Error ? err.message : "Error desconocido al crear el producto")
    } finally {
      setIsCreatingProduct(false)
    }
  }

  const cargarCatalogoProductos = async (token: string): Promise<CatalogoProducto[]> => {
    const moneda = (user?.moneda || sessionStorage.getItem("beaux-moneda") || "USD").toUpperCase()
    const params = new URLSearchParams()
    params.set("moneda", moneda)
    const url = `${API_BASE_URL}inventary/product/productos/?${params.toString()}`

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      throw new Error(await parseApiError(response, `Error ${response.status}: ${response.statusText}`))
    }

    const data = await response.json()
    const rawProductos: Array<Record<string, unknown>> = Array.isArray(data)
      ? data
      : Array.isArray((data as { productos?: Array<Record<string, unknown>> })?.productos)
        ? (data as { productos: Array<Record<string, unknown>> }).productos
        : Array.isArray((data as { items?: Array<Record<string, unknown>> })?.items)
          ? (data as { items: Array<Record<string, unknown>> }).items
          : []

    const productosNormalizados = rawProductos
      .map((producto) => {
        const id = String(producto.id ?? producto._id ?? producto.producto_id ?? "").trim()
        const nombre = String(producto.nombre ?? producto.producto_nombre ?? "").trim()
        const codigo = String(producto.codigo ?? producto.producto_codigo ?? "").trim()
        if (!id || !nombre) {
          return null
        }
        return { id, nombre, codigo }
      })
      .filter((producto): producto is CatalogoProducto => Boolean(producto))

    const mapPorId = new Map<string, CatalogoProducto>()
    productosNormalizados.forEach((producto) => {
      if (!mapPorId.has(producto.id)) {
        mapPorId.set(producto.id, producto)
      }
    })

    return Array.from(mapPorId.values()).sort((a, b) => a.nombre.localeCompare(b.nombre))
  }

  const cargarDatosModalCreacion = async () => {
    const token = resolveToken()
    if (!token) {
      setModalDataError("No hay token de autenticación disponible para cargar los catálogos")
      return
    }

    setIsLoadingCreateData(true)
    setModalDataError(null)

    const [sedesResult, productosResult] = await Promise.allSettled([
      sedeService.getSedes(token),
      cargarCatalogoProductos(token),
    ])

    const errores: string[] = []

    if (sedesResult.status === "fulfilled") {
      const sedes = sedesResult.value
      setSedesDisponibles(sedes)
      if (!nuevoSedeId && sedes.length > 0) {
        const sedeActual = sedes.find((sede) => sede.sede_id === sedeId || sede._id === sedeId)
        setNuevoSedeId(sedeActual?.sede_id || sedes[0].sede_id)
      }
    } else {
      setSedesDisponibles([])
      errores.push("No se pudieron cargar las sedes")
    }

    if (productosResult.status === "fulfilled") {
      const catalogo = productosResult.value
      setProductosCatalogo(catalogo)
      if (!nuevoProductoId && catalogo.length === 1) {
        setNuevoProductoId(catalogo[0].id)
      }
    } else {
      setProductosCatalogo([])
      errores.push("No se pudieron cargar los productos")
    }

    if (errores.length > 0) {
      setModalDataError(`${errores.join(". ")}.`)
    }

    setIsLoadingCreateData(false)
  }

  const crearInventario = async () => {
    const productoId = nuevoProductoId.trim()
    const sedeInventarioId = nuevoSedeId.trim() || resolveSedeId()
    const stockInicial = Number(nuevoStockInicial)
    const stockMinimo = Number(nuevoStockMinimo)

    if (!productoId) {
      setCreateError("El campo producto_id es obligatorio")
      return
    }

    if (!sedeInventarioId) {
      setCreateError("El campo sede_id es obligatorio")
      return
    }

    if (!Number.isFinite(stockInicial) || stockInicial < 0) {
      setCreateError("El stock inicial debe ser un número mayor o igual a 0")
      return
    }

    if (!Number.isFinite(stockMinimo) || stockMinimo < 0) {
      setCreateError("El stock mínimo debe ser un número mayor o igual a 0")
      return
    }

    const token = resolveToken()
    if (!token) {
      setCreateError("No hay token de autenticación disponible")
      return
    }

    setIsCreatingInventario(true)
    setCreateError(null)

    try {
      const resultado = await inventarioService.crearInventario(
        {
          producto_id: productoId,
          sede_id: sedeInventarioId,
          stock_actual: stockInicial,
          stock_minimo: stockMinimo
        },
        token
      )

      if (!resultado.success) {
        setCreateError(resultado.error || "No se pudo crear el inventario")
        return
      }

      cerrarModalCreacion()
      await cargarInventario(sedeInventarioId)
    } catch (err) {
      console.error("Error creando inventario:", err)
      setCreateError("Error inesperado al crear el inventario")
    } finally {
      setIsCreatingInventario(false)
    }
  }

  // Mostrar loading mientras se verifica la autenticación
  if (authLoading) {
    return (
      <div className="flex min-h-screen bg-gray-50">
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

  const countryKeys = Object.keys(countrySales)
  const showCountryView = selectedDashboardSede === "all" && countryKeys.length > 0
  const productCards = useMemo(
    () =>
      productos.map((p) => ({
        id: p.producto_id || p._id,
        nombre: p.nombre || p.producto_nombre || "Producto",
        categoria: p.categoria,
        codigo: p.producto_codigo,
        stock: p.stock_actual,
        stockMinimo: p.stock_minimo,
        updatedAt: p.fecha_ultima_actualizacion,
        price: productPrices[p.producto_id || p._id]?.price,
        priceCurrency: productPrices[p.producto_id || p._id]?.currency || ventasCurrency,
      })),
    [productos, productPrices, ventasCurrency]
  )

  useEffect(() => {
    const fetchPrices = async () => {
      const token = resolveToken()
      const moneda = ventasCurrency || user?.moneda || "COP"
      const ids = productos.map((p) => p.producto_id || p._id).filter(Boolean)
      if (!token || ids.length === 0) return
      try {
        const results = await Promise.all(
          ids.map(async (id) => {
            const resp = await fetch(
              `${API_BASE_URL}inventary/product/productos/${encodeURIComponent(id)}?moneda=${encodeURIComponent(moneda)}`,
              {
                headers: {
                  Accept: "application/json",
                  Authorization: `Bearer ${token}`,
                },
              }
            )
            if (!resp.ok) return null
            const data = await resp.json() as any
            const price =
              data?.precio_local ??
              data?.precio ??
              (data?.precios && (data.precios[moneda] ?? data.precios.USD))
            if (price === undefined || price === null) return null
            return { id, price: Number(price), currency: moneda }
          })
        )
        const map: Record<string, { price: number; currency: string }> = {}
        results.forEach((r) => {
          if (r) map[r.id] = { price: r.price, currency: r.currency }
        })
        if (Object.keys(map).length > 0) {
          setProductPrices((prev) => ({ ...prev, ...map }))
        }
      } catch (err) {
        console.warn("No se pudieron obtener precios de productos", err)
      }
    }
    fetchPrices().catch(() => {})
  }, [productos, ventasCurrency, user])

  const openEditModal = async (productId: string) => {
    const product = productCards.find((p) => p.id === productId)
    if (!product) return
    setEditingProductId(productId)
    setEditingName(product.nombre)
    const cachedPrice = productPrices[productId]?.price
    setEditingPrice(cachedPrice !== undefined ? String(cachedPrice) : "")
    setEditingLoading(true)
    try {
      const token = resolveToken()
      const moneda = ventasCurrency || "COP"
      const resp = await fetch(
        `${API_BASE_URL}inventary/product/productos/${encodeURIComponent(productId)}?moneda=${encodeURIComponent(moneda)}`,
        {
          headers: {
            Accept: "application/json",
            Authorization: token ? `Bearer ${token}` : "",
          },
        }
      )
      if (resp.ok) {
        const data = await resp.json() as any
        const precio =
          data?.precio_local ??
          data?.precio ??
          (data?.precios && (data.precios[moneda] ?? data.precios.USD)) ??
          ""
        setEditingPrice(
          precio !== null && precio !== undefined
            ? String(precio)
            : cachedPrice !== undefined
              ? String(cachedPrice)
              : ""
        )
      }
    } catch (err) {
      console.warn("No se pudo obtener precio del producto", err)
    } finally {
      setEditingLoading(false)
    }
  }

  const handleSaveEdit = () => {
    if (!editingProductId) return
    setProductos((prev) =>
      prev.map((p) =>
        (p.producto_id || p._id) === editingProductId
          ? { ...p, nombre: editingName || p.nombre }
          : p
      )
    )
    setEditingProductId(null)
  }

  return (
    <div className="flex min-h-screen bg-white">
      <Sidebar />
      <div className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <ProductsHeaderFilters
            title="Dashboard de Productos"
            subtitle="Resumen de ventas e inventario de los productos"
            sedes={sedesDisponibles.map((sede) => ({ sede_id: sede.sede_id, nombre: sede.nombre }))}
            selectedSedeId={selectedDashboardSede || resolveSedeId()}
            onSedeChange={(value) => {
              setSelectedDashboardSede(value)
              if (value !== "all") {
                setNuevoSedeId(value)
              } else if (sedesDisponibles[0]?.sede_id) {
                setNuevoSedeId(sedesDisponibles[0].sede_id)
              }
            }}
            enableAllSedesOption
            period={period}
            onPeriodChange={setPeriod}
            dateRange={dateRange}
          onDateRangeChange={setDateRange}
          onOpenConfig={abrirModalCreacion}
        />

          {error && selectedDashboardSede !== "all" && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-900">No se pudo cargar el inventario</p>
                <p className="text-amber-800">{error}</p>
              </div>
            </div>
          )}

          {selectedDashboardSede === "all" && missingCountrySedes.length > 0 && (
            <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Algunas sedes no reportan país: {missingCountrySedes.join(", ")}. Se muestran solo los países conocidos.
            </div>
          )}

          <div className="space-y-4 mb-10">
            {selectedDashboardSede === "all" ? (
              showCountryView ? (
                (() => {
                  const preferredOrder = ["Colombia", "Ecuador", "México"]
                  const sortedCountries = [...countryKeys].sort((a, b) => {
                    const ia = preferredOrder.indexOf(a)
                    const ib = preferredOrder.indexOf(b)
                    if (ia === -1 && ib === -1) return a.localeCompare(b)
                    if (ia === -1) return 1
                    if (ib === -1) return -1
                    return ia - ib
                  })
                  const mainCountry = sortedCountries[0]
                  const otherCountries = sortedCountries.slice(1)
                  return (
                    <>
                      <ProductsSalesCard
                        title={`Venta de Productos - ${mainCountry}`}
                        rows={countrySales[mainCountry] || []}
                        currency={countryCurrency[mainCountry] || ventasCurrency}
                        loading={ventasLoading}
                        error={ventasError}
                        onViewDetail={() => { window.location.href = "/superadmin/sales-invoices" }}
                      />

                      {otherCountries.length > 0 && (
                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                          {otherCountries.map((pais) => (
                            <ProductsSalesCard
                              key={pais}
                              title={`Venta de Productos - ${pais}`}
                              rows={countrySales[pais] || []}
                              currency={countryCurrency[pais] || ventasCurrency}
                              loading={ventasLoading}
                              error={ventasError}
                              compact
                              onViewDetail={() => { window.location.href = "/superadmin/sales-invoices" }}
                            />
                          ))}
                        </div>
                      )}
                    </>
                  )
                })()
              ) : sedesDisponibles.length > 0 ? (
                <>
                  <ProductsSalesCard
                    title={`Venta de Productos - ${sedesDisponibles[0].nombre}`}
                    rows={multiSedeSales[sedesDisponibles[0].sede_id] || []}
                    currency={multiSedeCurrency[sedesDisponibles[0].sede_id] || ventasCurrency}
                    loading={ventasLoading}
                    error={ventasError}
                    onViewDetail={() => { window.location.href = "/superadmin/sales-invoices" }}
                  />

                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {sedesDisponibles.slice(1).map((sede) => (
                      <ProductsSalesCard
                        key={sede.sede_id}
                        title={`Venta de Productos - ${sede.nombre}`}
                        rows={multiSedeSales[sede.sede_id] || []}
                        currency={multiSedeCurrency[sede.sede_id] || ventasCurrency}
                        loading={ventasLoading}
                        error={ventasError}
                        compact
                        onViewDetail={() => { window.location.href = "/superadmin/sales-invoices" }}
                      />
                    ))}
                  </div>
                </>
              ) : null
            ) : (
              <>
                <ProductsSalesCard
                  title={`Venta de Productos - ${selectedSedeName}`}
                  rows={productSalesRows}
                  currency={ventasCurrency}
                  loading={ventasLoading}
                  error={ventasError}
                  onViewDetail={() => { window.location.href = "/superadmin/sales-invoices" }}
                />

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <ProductsSalesCard
                    title="Top productos"
                    rows={productSalesRows.slice(0, 4)}
                    currency={ventasCurrency}
                    loading={ventasLoading}
                    error={ventasError}
                    compact
                    onViewDetail={() => { window.location.href = "/superadmin/sales-invoices" }}
                  />
                  <InventorySummaryCard
                    totalProductos={stats.totalProductos}
                    stockTotal={stats.totalStock}
                    bajoStock={stats.productosBajoStock}
                    sinStock={stats.productosSinStock}
                    diasRestantes={null}
                    loading={isLoading}
                    onViewInventory={() => document.getElementById("inventario-detalle")?.scrollIntoView({ behavior: "smooth" })}
                  />
                </div>
              </>
            )}
          </div>

          {false && (
            <div id="inventario-detalle">
              {/* Sección de inventario detallado deshabilitada */}
            </div>
          )}
        </div>

        <Dialog
          open={isCreateModalOpen}
          onOpenChange={(open) => {
            if (!open) {
              cerrarModalCreacion()
              return
            }
            setIsCreateModalOpen(true)
          }}
        >
          <DialogContent className="sm:max-w-md bg-white border-gray-200 text-gray-900">
            <DialogHeader>
              <DialogTitle>Crear producto en inventario</DialogTitle>
              <DialogDescription>
                Registra el inventario inicial de un producto en una sede.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {isLoadingCreateData && (
                <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Cargando productos y sedes...
                </div>
              )}

              {modalDataError && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  {modalDataError}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700" htmlFor="producto-id">
                  Producto
                </label>
                {productosCatalogo.length > 0 ? (
                  <Select
                    value={nuevoProductoId}
                    onValueChange={setNuevoProductoId}
                    disabled={isCreatingInventario || isLoadingCreateData}
                  >
                    <SelectTrigger id="producto-id" className="bg-white border-gray-300 text-gray-900">
                      <SelectValue placeholder="Selecciona un producto" />
                    </SelectTrigger>
                    <SelectContent className="z-[60] bg-white border-gray-200 text-gray-900">
                      {productosCatalogo.map((producto) => (
                        <SelectItem className="text-gray-900 focus:bg-gray-100 focus:text-gray-900" key={producto.id} value={producto.id}>
                          {producto.nombre}{producto.codigo ? ` (${producto.codigo})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id="producto-id"
                    placeholder="Ej: P001"
                    value={nuevoProductoId}
                    onChange={(e) => setNuevoProductoId(e.target.value)}
                    disabled={isCreatingInventario || isLoadingCreateData}
                    className="bg-white"
                  />
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700" htmlFor="sede-id">
                  Sede
                </label>
                <Select
                  value={nuevoSedeId}
                  onValueChange={setNuevoSedeId}
                  disabled={isCreatingInventario || isLoadingCreateData || sedesDisponibles.length === 0}
                >
                  <SelectTrigger id="sede-id" className="bg-white border-gray-300 text-gray-900">
                    <SelectValue placeholder="Selecciona una sede" />
                  </SelectTrigger>
                  <SelectContent className="z-[60] bg-white border-gray-200 text-gray-900">
                    {sedesDisponibles.map((sede) => (
                      <SelectItem className="text-gray-900 focus:bg-gray-100 focus:text-gray-900" key={sede._id} value={sede.sede_id}>
                        {sede.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700" htmlFor="stock-inicial">
                    Stock inicial
                  </label>
                  <Input
                    id="stock-inicial"
                    type="number"
                    min="0"
                    value={nuevoStockInicial}
                    onChange={(e) => setNuevoStockInicial(e.target.value)}
                    disabled={isCreatingInventario}
                    className="bg-white"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700" htmlFor="stock-minimo">
                    Stock mínimo
                  </label>
                  <Input
                    id="stock-minimo"
                    type="number"
                    min="0"
                    value={nuevoStockMinimo}
                    onChange={(e) => setNuevoStockMinimo(e.target.value)}
                    disabled={isCreatingInventario}
                    className="bg-white"
                  />
          </div>

          {selectedDashboardSede !== "all" && (
            <div className="mt-10">
              <div className="flex items-center justify-between mb-3">
                <div />
                <Button
                  variant="default"
                  className="bg-gray-900 text-white hover:bg-gray-800"
                  onClick={() => {
                    setCreateProductError(null)
                    setCreateProductSuccess(null)
                    setIsCreateProductModalOpen(true)
                  }}
                >
                  Crear producto
                </Button>
              </div>
              <ProductCardsGrid
                title=""
                products={productCards}
                loading={isLoading}
                onEditProduct={(id) => openEditModal(id)}
              />
            </div>
          )}
        </div>

        <Dialog open={Boolean(editingProductId)} onOpenChange={(open) => !open && setEditingProductId(null)}>
          <DialogContent className="sm:max-w-md bg-white border-gray-200">
            <DialogHeader>
              <DialogTitle>Editar producto</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-700">Nombre</label>
                <Input
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  disabled={editingLoading}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm text-gray-700">Precio</label>
                <Input
                  type="number"
                  min="0"
                  value={editingPrice}
                  onChange={(e) => setEditingPrice(e.target.value)}
                  disabled={editingLoading}
                  className="mt-1"
                />
                <p className="text-xs text-gray-500 mt-1">Edición local en UI; no guarda en backend.</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingProductId(null)} disabled={editingLoading}>
                Cancelar
              </Button>
              <Button onClick={handleSaveEdit} disabled={editingLoading}>
                Guardar cambios
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isCreateProductModalOpen} onOpenChange={(open) => !open && setIsCreateProductModalOpen(false)}>
          <DialogContent className="sm:max-w-lg bg-white border-gray-200">
            <DialogHeader>
              <DialogTitle>Crear producto (catálogo)</DialogTitle>
              <DialogDescription>Se crea en el catálogo global. Luego podrás asignarlo al inventario de una sede.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {createProductError && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {createProductError}
                </div>
              )}
              {createProductSuccess && (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  {createProductSuccess}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm text-gray-700">Nombre *</label>
                  <Input value={newProductName} onChange={(e) => setNewProductName(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-gray-700">Código</label>
                  <Input value={newProductCode} onChange={(e) => setNewProductCode(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-gray-700">Categoría</label>
                  <Input value={newProductCategory} onChange={(e) => setNewProductCategory(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-gray-700">Descripción</label>
                  <Input value={newProductDescription} onChange={(e) => setNewProductDescription(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-sm text-gray-700">Precio COP</label>
                  <Input type="number" min="0" value={newProductPriceCOP} onChange={(e) => setNewProductPriceCOP(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-gray-700">Precio USD</label>
                  <Input type="number" min="0" value={newProductPriceUSD} onChange={(e) => setNewProductPriceUSD(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-gray-700">Precio MXN</label>
                  <Input type="number" min="0" value={newProductPriceMXN} onChange={(e) => setNewProductPriceMXN(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-sm text-gray-700">Comisión (%)</label>
                  <Input type="number" min="0" max="100" value={newProductCommission} onChange={(e) => setNewProductCommission(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-gray-700">Stock actual</label>
                  <Input type="number" min="0" value={newProductStock} onChange={(e) => setNewProductStock(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-gray-700">Stock mínimo</label>
                  <Input type="number" min="0" value={newProductStockMin} onChange={(e) => setNewProductStockMin(e.target.value)} />
                </div>
              </div>

              <p className="text-xs text-gray-500">El producto se guarda en backend y quedará disponible para crear inventario por sede.</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateProductModalOpen(false)} disabled={isCreatingProduct}>
                Cancelar
              </Button>
              <Button onClick={handleCreateProduct} disabled={isCreatingProduct} className="gap-2 bg-gray-900 text-white hover:bg-gray-800">
                {isCreatingProduct && <Loader2 className="h-4 w-4 animate-spin" />}
                Crear
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

              {createError && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {createError}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={cerrarModalCreacion}
                disabled={isCreatingInventario}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={crearInventario}
                disabled={isCreatingInventario || isLoadingCreateData || !nuevoProductoId || !nuevoSedeId}
                className="gap-2 bg-gray-900 text-white hover:bg-gray-800"
              >
                {isCreatingInventario && <Loader2 className="h-4 w-4 animate-spin" />}
                Guardar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}

