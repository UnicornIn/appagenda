// components/products/ProductManagementPanel.tsx
"use client"

import { useState, useEffect } from "react"
import {
    ShoppingCart,
    Plus,
    Trash2,
    Package,
    AlertCircle,
    CheckCircle,
    Loader2
} from "lucide-react"
import { Button } from "../../../components/ui/button"
import { Badge } from "../../../components/ui/badge"
import { ProductCatalogModal } from "../../PageSede/Billing/ProductCatalogModal"
import { API_BASE_URL } from "../../../types/config"

interface Producto {
    _id?: string
    id: string
    nombre: string
    categoria: string
    descripcion: string
    imagen: string
    activo: boolean
    tipo_codigo: string
    descuento: string | number
    stock: string | number
    precios?: {
        COP?: number
        MXN?: number
        USD?: number
    }
    precio_local?: number
    moneda_local?: string
    precio?: number
    stock_actual?: number
    stock_minimo?: number
    tipo_precio?: string
    cantidad?: number;
}

interface ProductManagementPanelProps {
    citaId: string
    onProductsUpdated?: (total: number) => void
    moneda?: string
    disabled?: boolean
}

export function ProductManagementPanel({
    citaId,
    onProductsUpdated,
    moneda = "USD",
    disabled = false
}: ProductManagementPanelProps) {
    const [showProductModal, setShowProductModal] = useState(false)
    const [selectedProducts, setSelectedProducts] = useState<Producto[]>([])
    const [productsQuantities, setProductsQuantities] = useState<Record<string, number>>({})
    const [loadingProducts, setLoadingProducts] = useState(false)
    const [isDeleting, setIsDeleting] = useState<string | null>(null)

    // Cargar productos existentes de la cita
    useEffect(() => {
        if (citaId) {
            fetchExistingProducts()
        }
    }, [citaId])

    const fetchExistingProducts = async () => {
        try {
            setLoadingProducts(true)
            const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token')

            if (!token) {
                console.warn('No hay token de autenticación')
                return
            }

            const response = await fetch(
                `${API_BASE_URL}scheduling/quotes/cita/${citaId}/productos`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/json'
                    }
                }
            )

            if (response.ok) {
                const data = await response.json()
                console.log('Productos cargados de la cita:', data)

                if (data.success && data.productos) {
                    // Transformar los productos al formato esperado - VERSIÓN COMPLETA
                    const productosTransformados = data.productos.map((p: any) => ({
                        id: p.producto_id || p.id || p._id,
                        nombre: p.nombre || 'Producto sin nombre',
                        categoria: p.categoria || "Sin categoría",
                        descripcion: p.descripcion || "",
                        precio: p.precio_unitario || p.precio || p.subtotal || 0,
                        precio_local: p.precio_unitario || p.precio || p.subtotal || 0,
                        cantidad: p.cantidad || 1,
                        stock: p.stock || p.stock_actual || "0",
                        stock_actual: p.stock_actual || 0,
                        stock_minimo: p.stock_minimo || 0,
                        tipo_codigo: p.tipo_codigo || "",
                        imagen: p.imagen || "",
                        activo: p.activo !== false,
                        descuento: p.descuento || 0,
                        tipo_precio: p.tipo_precio || "sin_iva_internacional",
                        moneda_local: moneda
                    }))

                    console.log('Productos transformados:', productosTransformados)
                    setSelectedProducts(productosTransformados)

                    // Establecer cantidades
                    const nuevasCantidades: Record<string, number> = {}
                    productosTransformados.forEach((p: Producto) => {
                        nuevasCantidades[p.id] = p.cantidad || 1
                    })
                    setProductsQuantities(nuevasCantidades)

                    // Notificar al padre
                    if (onProductsUpdated) {
                        onProductsUpdated(calculateTotal())
                    }
                }
            } else {
                console.warn('No se pudieron cargar productos existentes:', response.status)
            }
        } catch (error) {
            console.error('Error cargando productos:', error)
        } finally {
            setLoadingProducts(false)
        }
    }

    const handleAddProducts = (products: Producto[]) => {
        if (products.length === 0) {
            return
        }

        // Agrupar productos por ID
        const productosAgrupados: Record<string, { product: Producto, quantity: number }> = {}

        // Procesar productos existentes
        selectedProducts.forEach(product => {
            if (productosAgrupados[product.id]) {
                productosAgrupados[product.id].quantity += 1
            } else {
                productosAgrupados[product.id] = {
                    product,
                    quantity: productsQuantities[product.id] || 1
                }
            }
        })

        // Agregar nuevos productos
        products.forEach(product => {
            if (productosAgrupados[product.id]) {
                productosAgrupados[product.id].quantity += 1
            } else {
                productosAgrupados[product.id] = {
                    product,
                    quantity: 1
                }
            }
        })

        // Actualizar estados
        const nuevosProductos = Object.values(productosAgrupados).flatMap(({ product, quantity }) =>
            Array(quantity).fill(product)
        )
        setSelectedProducts(nuevosProductos)

        const nuevasCantidades: Record<string, number> = {}
        Object.entries(productosAgrupados).forEach(([id, { quantity }]) => {
            nuevasCantidades[id] = quantity
        })
        setProductsQuantities(nuevasCantidades)

        // Notificar al padre
        if (onProductsUpdated) {
            onProductsUpdated(calculateTotal())
        }
    }

    const handleDeleteProduct = async (productId: string) => {
        if (!citaId) return

        setIsDeleting(productId)
        try {
            const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token')

            if (!token) {
                alert('❌ No se encontró token de autenticación')
                return
            }

            const response = await fetch(
                `${API_BASE_URL}scheduling/quotes/cita/${citaId}/productos/${productId}`,
                {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/json'
                    }
                }
            )

            if (response.ok) {
                // Actualizar estado local
                const updatedProducts = selectedProducts.filter(p => p.id !== productId)
                setSelectedProducts(updatedProducts)

                const newQuantities = { ...productsQuantities }
                delete newQuantities[productId]
                setProductsQuantities(newQuantities)

                // Notificar al padre
                if (onProductsUpdated) {
                    onProductsUpdated(calculateTotal())
                }

                alert('✅ Producto eliminado correctamente')
            } else {
                const errorData = await response.json().catch(() => ({}))
                throw new Error(errorData.detail || 'Error al eliminar producto')
            }
        } catch (error) {
            console.error('Error eliminando producto:', error)
            alert(`❌ Error: ${error instanceof Error ? error.message : 'Error desconocido'}`)
        } finally {
            setIsDeleting(null)
        }
    }

    const handleDeleteAllProducts = async () => {
        if (!citaId || selectedProducts.length === 0) return

        if (!confirm(`¿Estás seguro de eliminar todos los productos (${selectedProducts.length})?`)) {
            return
        }

        try {
            const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token')

            if (!token) {
                alert('❌ No se encontró token de autenticación')
                return
            }

            const response = await fetch(
                `${API_BASE_URL}scheduling/quotes/cita/${citaId}/productos`,
                {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/json'
                    }
                }
            )

            if (response.ok) {
                // Limpiar estado local
                setSelectedProducts([])
                setProductsQuantities({})

                // Notificar al padre
                if (onProductsUpdated) {
                    onProductsUpdated(0)
                }

                alert(`✅ ${selectedProducts.length} producto(s) eliminado(s)`)
            } else {
                const errorData = await response.json().catch(() => ({}))
                throw new Error(errorData.detail || 'Error al eliminar productos')
            }
        } catch (error) {
            console.error('Error eliminando productos:', error)
            alert(`❌ Error: ${error instanceof Error ? error.message : 'Error desconocido'}`)
        }
    }

    const handleClearProducts = () => {
        if (selectedProducts.length === 0) return

        if (confirm(`¿Estás seguro de limpiar todos los productos (${selectedProducts.length})?`)) {
            setSelectedProducts([])
            setProductsQuantities({})

            if (onProductsUpdated) {
                onProductsUpdated(0)
            }
        }
    }

    const calculateTotal = () => {
        return selectedProducts.reduce((sum, product) => {
            const precio = product.precio || 0
            const cantidad = productsQuantities[product.id] || 1
            return sum + (precio * cantidad)
        }, 0)
    }

    const formatMoney = (amount: number): string => {
        if (typeof amount !== 'number' || isNaN(amount)) {
            amount = 0
        }
        return amount.toLocaleString('es-ES', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
            useGrouping: true
        })
    }

    if (loadingProducts) {
        return (
            <div className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                    <span className="ml-2 text-gray-600">Cargando productos...</span>
                </div>
            </div>
        )
    }

    return (
        <>
            <ProductCatalogModal
                isOpen={showProductModal}
                onClose={() => setShowProductModal(false)}
                onAddProducts={handleAddProducts}
                selectedProducts={selectedProducts}
                moneda={moneda}
                citaId={citaId}
            />

            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <ShoppingCart className="h-5 w-5 text-blue-600" />
                        <h3 className="font-semibold text-blue-900">Productos para Facturar</h3>
                        {selectedProducts.length > 0 && (
                            <Badge variant="secondary" className="ml-2">
                                {Object.values(productsQuantities).reduce((sum, qty) => sum + qty, 0)} items
                            </Badge>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        {selectedProducts.length > 0 && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleDeleteAllProducts}
                                className="text-red-700 hover:text-red-800 hover:bg-red-50 border border-red-200"
                                disabled={disabled}
                            >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Eliminar todos
                            </Button>
                        )}

                        <Button
                            size="sm"
                            onClick={() => setShowProductModal(true)}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                            disabled={disabled}
                        >
                            <Plus className="h-4 w-4 mr-2" />
                            {selectedProducts.length > 0 ? 'Agregar más' : 'Agregar productos'}
                        </Button>
                    </div>
                </div>

                {selectedProducts.length === 0 ? (
                    <div className="text-center py-6">
                        <Package className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                        <p className="text-gray-600">No hay productos seleccionados</p>
                        <p className="text-sm text-gray-500 mt-1">
                            Haz clic en "Agregar productos" para comenzar
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2">
                            {Object.entries(productsQuantities).map(([productId, quantity]) => {
                                const product = selectedProducts.find(p => p.id === productId)
                                if (!product) return null

                                const precio = product.precio || 0
                                const totalProducto = precio * quantity

                                return (
                                    <div key={productId} className="bg-white rounded p-3 flex items-center justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium text-sm">{product.nombre}</span>
                                                <Badge variant="outline" className="text-xs">
                                                    {product.categoria}
                                                </Badge>
                                            </div>
                                            <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
                                                <span>Cantidad: {quantity}</span>
                                                <span>${formatMoney(precio)} c/u</span>
                                                <span>Total: ${formatMoney(totalProducto)}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-blue-600">
                                                ${formatMoney(totalProducto)}
                                            </span>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 px-2 text-red-700 hover:text-red-800 hover:bg-red-100 border border-red-200"
                                                onClick={() => handleDeleteProduct(productId)}
                                                disabled={disabled || isDeleting === productId}
                                                title="Eliminar producto"
                                            >
                                                {isDeleting === productId ? (
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                ) : (
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        <div className="flex items-center justify-between pt-3 border-t border-blue-200 mt-3">
                            <div className="text-sm text-blue-800">
                                Total productos: ${formatMoney(calculateTotal())}
                            </div>

                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleClearProducts}
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                    disabled={disabled}
                                >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Limpiar
                                </Button>
                            </div>
                        </div>

                        {/* Estado del producto */}
                        <div className="mt-3 pt-3 border-t border-blue-100">
                            <div className="flex items-center gap-2 text-sm">
                                {selectedProducts.some(p => Number(p.stock) < (productsQuantities[p.id] || 1)) ? (
                                    <>
                                        <AlertCircle className="h-4 w-4 text-yellow-600" />
                                        <span className="text-yellow-700">
                                            Algunos productos tienen stock insuficiente
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle className="h-4 w-4 text-green-600" />
                                        <span className="text-green-700">
                                            Todo el stock está disponible
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </>
    )
}
