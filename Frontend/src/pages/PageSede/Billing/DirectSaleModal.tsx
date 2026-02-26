"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Badge } from "../../../components/ui/badge";
import { useAuth } from "../../../components/Auth/AuthContext";
import {
  createDirectSale,
  deleteAllDirectSaleProducts,
  deleteDirectSaleProduct,
  type DirectSaleLineItem,
  fetchInventoryProductDetail,
  fetchInventoryProducts,
  type InventoryProduct,
  type PaymentMethod,
  registerDirectSalePayment,
  verifyDirectSaleInBillingReport,
} from "./directSalesApi";
import { handleFacturarRequest, type FacturarTipo } from "./facturarApi";

interface DirectSaleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaleCompleted?: (saleId: string) => void;
}

interface CartItem {
  productId: string;
  inventoryId: string;
  name: string;
  category?: string;
  quantity: number;
  unitPrice: number;
  stockAvailable: number;
}

const DEFAULT_PAYMENT_METHOD: PaymentMethod = "efectivo";
const ALL_PAYMENT_BREAKDOWN_METHODS = [
  "efectivo",
  "transferencia",
  "tarjeta_credito",
  "tarjeta_debito",
  "giftcard",
  "addi",
] as const;
type PaymentBreakdownMethod = (typeof ALL_PAYMENT_BREAKDOWN_METHODS)[number];

const ALL_PAYMENT_METHOD_OPTIONS: Array<{ value: PaymentMethod; label: string }> = [
  { value: "efectivo", label: "Efectivo" },
  { value: "transferencia", label: "Transferencia" },
  { value: "tarjeta_credito", label: "Tarjeta de Crédito" },
  { value: "tarjeta_debito", label: "Tarjeta de Débito" },
  { value: "giftcard", label: "Gift Card" },
  { value: "addi", label: "Addi" },
  { value: "tarjeta", label: "Tarjeta (legacy)" },
];

const buildEmptyPaymentBreakdown = (): Record<PaymentBreakdownMethod, number> => ({
  efectivo: 0,
  transferencia: 0,
  tarjeta_credito: 0,
  tarjeta_debito: 0,
  giftcard: 0,
  addi: 0,
});

const roundMoney = (value: number): number => Math.round(value * 100) / 100;

export function DirectSaleModal({ isOpen, onClose, onSaleCompleted }: DirectSaleModalProps) {
  const { user } = useAuth();

  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [cartByProductId, setCartByProductId] = useState<Record<string, CartItem>>({});
  const [quantityInputs, setQuantityInputs] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(DEFAULT_PAYMENT_METHOD);
  const [giftCardCode, setGiftCardCode] = useState("");
  const [paymentBreakdown, setPaymentBreakdown] = useState<Record<PaymentBreakdownMethod, number>>(
    buildEmptyPaymentBreakdown()
  );
  const [saleId, setSaleId] = useState<string | null>(null);

  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [isCreatingSale, setIsCreatingSale] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [isClearingSale, setIsClearingSale] = useState(false);
  const [isVerifyingReport, setIsVerifyingReport] = useState(false);
  const [validatingProductId, setValidatingProductId] = useState<string | null>(null);
  const [removingProductId, setRemovingProductId] = useState<string | null>(null);

  const [productsError, setProductsError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const token =
    user?.access_token ||
    sessionStorage.getItem("access_token") ||
    localStorage.getItem("access_token") ||
    "";

  const sedeId = user?.sede_id || sessionStorage.getItem("beaux-sede_id") || "";
  const currency = String(user?.moneda || sessionStorage.getItem("beaux-moneda") || "USD").toUpperCase();
  const isCopCurrency = currency === "COP";

  const cartItems = useMemo(() => Object.values(cartByProductId), [cartByProductId]);
  const cartTotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    [cartItems]
  );
  const availablePaymentMethodOptions = useMemo(
    () => ALL_PAYMENT_METHOD_OPTIONS.filter((option) => isCopCurrency || option.value !== "addi"),
    [isCopCurrency]
  );
  const availablePaymentBreakdownMethods = useMemo(
    () => ALL_PAYMENT_BREAKDOWN_METHODS.filter((method) => isCopCurrency || method !== "addi"),
    [isCopCurrency]
  );
  const paymentBreakdownTotal = useMemo(
    () =>
      roundMoney(
        availablePaymentBreakdownMethods.reduce(
          (sum, method) => sum + (Number.isFinite(paymentBreakdown[method]) ? paymentBreakdown[method] : 0),
          0
        )
      ),
    [availablePaymentBreakdownMethods, paymentBreakdown]
  );
  const hasCustomPaymentBreakdown = paymentBreakdownTotal > 0;
  const paymentBreakdownDelta = roundMoney(cartTotal - paymentBreakdownTotal);
  const paymentBreakdownOverpaid = hasCustomPaymentBreakdown && paymentBreakdownDelta < -0.009;
  const paymentBreakdownIncomplete = hasCustomPaymentBreakdown && paymentBreakdownDelta > 0.009;
  const hasGiftCardInBreakdown = (paymentBreakdown.giftcard || 0) > 0;
  const requiresGiftCardInput = paymentMethod === "giftcard" || hasGiftCardInBreakdown;

  const filteredProducts = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) {
      return products;
    }
    return products.filter((product) => {
      const name = product.name.toLowerCase();
      const category = product.category.toLowerCase();
      const description = product.description.toLowerCase();
      return name.includes(query) || category.includes(query) || description.includes(query);
    });
  }, [products, searchTerm]);

  const isCatalogLocked = Boolean(saleId);
  const isBusy =
    isLoadingProducts ||
    isCreatingSale ||
    isProcessingPayment ||
    isClearingSale ||
    isVerifyingReport;

  const sanitizePaymentMethodForCurrency = (method: PaymentMethod): PaymentMethod => {
    if (!isCopCurrency && method === "addi") {
      return DEFAULT_PAYMENT_METHOD;
    }
    return method;
  };

  const resetModalState = () => {
    setProducts([]);
    setCartByProductId({});
    setQuantityInputs({});
    setSearchTerm("");
    setPaymentMethod(DEFAULT_PAYMENT_METHOD);
    setGiftCardCode("");
    setPaymentBreakdown(buildEmptyPaymentBreakdown());
    setSaleId(null);
    setProductsError(null);
    setActionError(null);
    setSuccessMessage(null);
    setValidatingProductId(null);
    setRemovingProductId(null);
    setIsLoadingProducts(false);
    setIsCreatingSale(false);
    setIsProcessingPayment(false);
    setIsClearingSale(false);
    setIsVerifyingReport(false);
  };

  const handleCloseModal = () => {
    resetModalState();
    onClose();
  };

  const loadProducts = async () => {
    if (!token) {
      setProductsError("No se encontró token de autenticación.");
      return;
    }

    try {
      setIsLoadingProducts(true);
      setProductsError(null);
      const result = await fetchInventoryProducts(token, currency);
      setProducts(result.filter((product) => product.active));
    } catch (error) {
      setProductsError(error instanceof Error ? error.message : "No se pudieron cargar los productos.");
    } finally {
      setIsLoadingProducts(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      resetModalState();
      return;
    }
    void loadProducts();
  }, [isOpen, currency]);

  useEffect(() => {
    if (!isCopCurrency && paymentMethod === "addi") {
      setPaymentMethod(DEFAULT_PAYMENT_METHOD);
    }
  }, [isCopCurrency, paymentMethod]);

  useEffect(() => {
    if (!isCopCurrency && paymentBreakdown.addi > 0) {
      setPaymentBreakdown((prev) => ({
        ...prev,
        addi: 0,
      }));
    }
  }, [isCopCurrency, paymentBreakdown.addi]);

  useEffect(() => {
    if (!requiresGiftCardInput && giftCardCode) {
      setGiftCardCode("");
    }
  }, [requiresGiftCardInput, giftCardCode]);

  const formatCurrency = (value: number): string => {
    try {
      return new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(value);
    } catch {
      return new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(value);
    }
  };

  const getQuantityInput = (productId: string): string => quantityInputs[productId] || "1";

  const parseInputQuantity = (value: string): number => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
      return 0;
    }
    return parsed;
  };

  const setError = (message: string) => {
    setActionError(message);
    setSuccessMessage(null);
  };

  const setSuccess = (message: string) => {
    setSuccessMessage(message);
    setActionError(null);
  };

  const updatePaymentBreakdown = (method: PaymentBreakdownMethod, rawValue: string) => {
    const parsed = Number.parseFloat(rawValue);
    const nextValue = Number.isFinite(parsed) ? Math.max(0, roundMoney(parsed)) : 0;
    setPaymentBreakdown((prev) => ({
      ...prev,
      [method]: nextValue,
    }));
  };

  const clearPaymentBreakdown = () => {
    setPaymentBreakdown(buildEmptyPaymentBreakdown());
  };

  const toSaleLineItems = (): DirectSaleLineItem[] =>
    cartItems.map((item) => ({
      productId: item.productId,
      inventoryId: item.inventoryId,
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    }));

  const calculateProductsTotal = (): number => roundMoney(cartTotal);

  const calculateFinalTotal = (): number => roundMoney(cartTotal);

  const handleFacturar = async ({
    id,
    tipo,
  }: {
    id: string;
    tipo: FacturarTipo;
  }) => {
    const productosParaFacturar = cartItems.map((item) => ({
      producto_id: item.productId,
      nombre: item.name,
      precio: roundMoney(item.unitPrice),
      cantidad: item.quantity,
      categoria: item.category || "",
    }));

    return handleFacturarRequest({
      id,
      tipo,
      token,
      productos: productosParaFacturar,
      total_productos: calculateProductsTotal(),
      total_final: calculateFinalTotal(),
    });
  };

  const handleFacturarVenta = async (ventaId: string) => {
    return handleFacturar({
      id: ventaId,
      tipo: "venta",
    });
  };

  const addProductToCart = async (product: InventoryProduct) => {
    if (isCatalogLocked) {
      setError("La venta ya fue creada. Solo puedes eliminar productos antes de registrar el pago.");
      return;
    }

    const desiredQuantity = parseInputQuantity(getQuantityInput(product.productId));
    if (desiredQuantity <= 0) {
      setError("La cantidad debe ser mayor a 0.");
      return;
    }

    if (!token) {
      setError("No se encontró token de autenticación.");
      return;
    }

    setValidatingProductId(product.productId);
    setActionError(null);

    try {
      const productDetail = await fetchInventoryProductDetail({
        token,
        inventoryId: product.inventoryId,
        fallbackInventoryId: product.productId,
        currency,
      });

      const currentQuantity = cartByProductId[product.productId]?.quantity || 0;
      const nextQuantity = currentQuantity + desiredQuantity;

      if (nextQuantity > productDetail.stockAvailable) {
        setError(
          `Stock insuficiente para "${productDetail.name}". Disponible: ${productDetail.stockAvailable}.`
        );
        return;
      }

      setCartByProductId((prev) => ({
        ...prev,
        [product.productId]: {
          productId: product.productId,
          inventoryId: product.inventoryId,
          name: productDetail.name,
          category: product.category,
          quantity: nextQuantity,
          unitPrice: productDetail.unitPrice,
          stockAvailable: productDetail.stockAvailable,
        },
      }));

      setQuantityInputs((prev) => ({ ...prev, [product.productId]: "1" }));
      setSuccess(`"${productDetail.name}" agregado (${desiredQuantity}).`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo validar el stock del producto.");
    } finally {
      setValidatingProductId(null);
    }
  };

  const updateLocalQuantity = (productId: string, nextQuantity: number) => {
    if (isCatalogLocked) {
      setError("No puedes editar cantidades después de crear la venta.");
      return;
    }

    const current = cartByProductId[productId];
    if (!current) {
      return;
    }

    if (nextQuantity <= 0) {
      const updated = { ...cartByProductId };
      delete updated[productId];
      setCartByProductId(updated);
      return;
    }

    if (nextQuantity > current.stockAvailable) {
      setError(`Stock máximo disponible para "${current.name}": ${current.stockAvailable}.`);
      return;
    }

    setCartByProductId((prev) => ({
      ...prev,
      [productId]: {
        ...current,
        quantity: nextQuantity,
      },
    }));
  };

  const removeProduct = async (productId: string) => {
    const current = cartByProductId[productId];
    if (!current) {
      return;
    }

    setActionError(null);
    setRemovingProductId(productId);

    try {
      if (saleId) {
        if (!token) {
          throw new Error("No se encontró token de autenticación.");
        }
        await deleteDirectSaleProduct(token, saleId, productId);
      }

      setCartByProductId((prev) => {
        const updated = { ...prev };
        delete updated[productId];
        return updated;
      });

      setSuccess(`"${current.name}" eliminado correctamente.`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo eliminar el producto.");
    } finally {
      setRemovingProductId(null);
    }
  };

  const clearSale = async () => {
    setActionError(null);

    try {
      setIsClearingSale(true);
      if (saleId) {
        if (!token) {
          throw new Error("No se encontró token de autenticación.");
        }
        await deleteAllDirectSaleProducts(token, saleId);
      }
      setCartByProductId({});
      setSaleId(null);
      setSuccess("Venta limpiada correctamente.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo limpiar la venta.");
    } finally {
      setIsClearingSale(false);
    }
  };

  const createSale = async (
    initialPaymentMethod: PaymentMethod = paymentMethod,
    giftCardCodeOverride?: string
  ): Promise<string> => {
    if (saleId) {
      return saleId;
    }

    if (!token) {
      throw new Error("No se encontró token de autenticación.");
    }
    if (!sedeId) {
      throw new Error("No se pudo determinar la sede del usuario.");
    }
    if (cartItems.length === 0) {
      throw new Error("Agrega al menos un producto antes de crear la venta.");
    }

    setIsCreatingSale(true);
    const safeInitialPaymentMethod = sanitizePaymentMethodForCurrency(initialPaymentMethod);
    const codigoGiftcard = (giftCardCodeOverride ?? giftCardCode).trim();
    if (safeInitialPaymentMethod === "giftcard" && !codigoGiftcard) {
      throw new Error("Debes ingresar el codigo de la Gift Card para crear la venta.");
    }

    const created = await createDirectSale({
      token,
      sedeId,
      total: cartTotal,
      paymentMethod: safeInitialPaymentMethod,
      giftCardCode: safeInitialPaymentMethod === "giftcard" ? codigoGiftcard : undefined,
      items: toSaleLineItems(),
    });
    setSaleId(created.saleId);
    setIsCreatingSale(false);
    return created.saleId;
  };

  const handleCreateSale = async () => {
    setActionError(null);
    setSuccessMessage(null);
    try {
      if (paymentMethod === "giftcard" && !giftCardCode.trim()) {
        throw new Error("Ingresa el codigo de la Gift Card.");
      }
      const createdSaleId = await createSale();
      setSuccess(`Venta creada correctamente. ID: ${createdSaleId}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo crear la venta.");
    } finally {
      setIsCreatingSale(false);
    }
  };

  const handlePaySale = async () => {
    if (cartItems.length === 0) {
      setError("No hay productos en la venta.");
      return;
    }

    if (!token) {
      setError("No se encontró token de autenticación.");
      return;
    }

    try {
      const safeMainMethod = sanitizePaymentMethodForCurrency(paymentMethod);
      const plannedPayments = hasCustomPaymentBreakdown
        ? availablePaymentBreakdownMethods
            .map((method) => ({
              method: method as PaymentMethod,
              amount: roundMoney(paymentBreakdown[method] || 0),
            }))
            .filter((payment) => payment.amount > 0)
        : [{ method: safeMainMethod, amount: roundMoney(cartTotal) }];

      if (plannedPayments.length === 0) {
        setError("Define al menos un pago para continuar.");
        return;
      }

      const plannedTotal = roundMoney(plannedPayments.reduce((sum, payment) => sum + payment.amount, 0));
      if (plannedTotal > roundMoney(cartTotal) + 0.009) {
        setError(`El total de pagos (${formatCurrency(plannedTotal)}) no puede superar la venta (${formatCurrency(cartTotal)}).`);
        return;
      }
      if (plannedTotal < roundMoney(cartTotal) - 0.009) {
        setError(`Falta asignar ${formatCurrency(roundMoney(cartTotal - plannedTotal))} para completar la venta.`);
        return;
      }

      const codigoGiftcard = giftCardCode.trim();
      const needsGiftCardCode = plannedPayments.some((payment) => payment.method === "giftcard");
      if (needsGiftCardCode && !codigoGiftcard) {
        setError("Ingresa el codigo de la Gift Card para continuar.");
        return;
      }

      setIsProcessingPayment(true);
      setActionError(null);
      setSuccessMessage(null);

      const targetSaleId = await createSale(plannedPayments[0].method, codigoGiftcard);
      if (!targetSaleId?.trim()) {
        throw new Error("No se pudo determinar el ID de la venta creada.");
      }

      for (const payment of plannedPayments) {
        await registerDirectSalePayment({
          token,
          saleId: targetSaleId,
          amount: payment.amount,
          paymentMethod: payment.method,
          giftCardCode: payment.method === "giftcard" ? codigoGiftcard : undefined,
        });
      }

      if (sedeId) {
        setIsVerifyingReport(true);
        await verifyDirectSaleInBillingReport({
          token,
          sedeId,
          saleId: targetSaleId,
        });
      }

      await handleFacturarVenta(targetSaleId);

      setSuccess(`Venta ${targetSaleId} cobrada y cerrada correctamente. Factura generada correctamente.`);
      onSaleCompleted?.(targetSaleId);
      setTimeout(() => {
        handleCloseModal();
      }, 1000);
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo registrar el pago.");
    } finally {
      setIsCreatingSale(false);
      setIsProcessingPayment(false);
      setIsVerifyingReport(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 p-3 sm:p-4">
      <div className="mx-auto flex h-full items-center justify-center">
        <div className="flex w-full max-w-7xl max-h-[90vh] flex-col overflow-hidden rounded-xl bg-white">
        <div className="flex items-center justify-between border-b border-gray-200 p-5">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Venta directa</h2>
            <p className="text-sm text-gray-600">
              Factura productos sin crear cita. Flujo rápido de mostrador.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0 text-gray-600 hover:bg-gray-100"
            onClick={handleCloseModal}
            disabled={isBusy}
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Cerrar</span>
          </Button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="grid grid-cols-1 gap-4 border-b border-gray-200 px-5 py-4 lg:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600">
              Método principal
            </label>
            <select
              className="h-9 w-full rounded-md border border-gray-300 px-3 text-sm"
              value={paymentMethod}
              onChange={(event) => setPaymentMethod(event.target.value)}
              disabled={isBusy}
            >
              {availablePaymentMethodOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end justify-start lg:justify-end">
            <Badge variant="outline" className="border-gray-300 px-3 py-1 text-sm text-gray-700">
              Moneda: {currency}
            </Badge>
          </div>
        </div>

          {requiresGiftCardInput && (
            <div className="border-b border-gray-200 px-5 py-4">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600">
                Codigo Gift Card
              </label>
              <Input
                value={giftCardCode}
                onChange={(event) => setGiftCardCode(event.target.value)}
                placeholder="Ej: RFC-GCP-1234"
                className="h-9 max-w-md"
                disabled={isBusy}
              />
              <p className="mt-1 text-xs text-gray-500">
                Obligatorio cuando el pago principal o el desglose incluye Gift Card.
              </p>
            </div>
          )}

          {(productsError || actionError || successMessage) && (
            <div className="space-y-2 border-b border-gray-200 px-5 py-3">
              {productsError && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {productsError}
                </div>
              )}
              {actionError && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {actionError}
                </div>
              )}
              {successMessage && (
                <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                  {successMessage}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col lg:flex-row">
            <div className="flex flex-1 flex-col border-gray-200 lg:border-r">
            <div className="border-b border-gray-200 p-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
                <Input
                  className="pl-9"
                  placeholder="Buscar por nombre, categoría o descripción..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </div>
            </div>

            <div className="p-4">
              {isLoadingProducts ? (
                <div className="flex h-40 flex-col items-center justify-center text-gray-600">
                  <Loader2 className="mb-2 h-6 w-6 animate-spin" />
                  Cargando productos...
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="flex h-40 flex-col items-center justify-center text-center text-gray-600">
                  <ShoppingCart className="mb-2 h-8 w-8 text-gray-400" />
                  No hay productos disponibles.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {filteredProducts.map((product) => {
                    const isValidating = validatingProductId === product.productId;
                    const quantityValue = getQuantityInput(product.productId);
                    return (
                      <div key={product.productId} className="rounded-lg border border-gray-200 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-gray-900">{product.name}</p>
                            <p className="text-xs text-gray-600">{product.category}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-gray-900">{formatCurrency(product.unitPrice)}</p>
                            <p className="text-xs text-gray-500">Stock: {product.stockAvailable}</p>
                          </div>
                        </div>

                        <div className="mt-3 flex items-center gap-2">
                          <Input
                            type="number"
                            min={1}
                            value={quantityValue}
                            onChange={(event) =>
                              setQuantityInputs((prev) => ({
                                ...prev,
                                [product.productId]: event.target.value,
                              }))
                            }
                            className="h-9 w-20"
                            disabled={isCatalogLocked || isBusy}
                          />
                          <Button
                            className="h-9 flex-1 bg-black text-white hover:bg-gray-800"
                            onClick={() => {
                              void addProductToCart(product);
                            }}
                            disabled={isCatalogLocked || isBusy || isValidating}
                          >
                            {isValidating ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Validando...
                              </>
                            ) : (
                              <>
                                <Plus className="mr-2 h-4 w-4" />
                                Agregar
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

            <div className="flex w-full flex-col bg-gray-50 lg:w-[420px]">
            <div className="border-b border-gray-200 p-4">
              <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900">
                <ShoppingCart className="h-5 w-5" />
                Resumen de venta
              </h3>
              {saleId ? (
                <p className="mt-1 text-xs text-gray-600">Venta creada: {saleId}</p>
              ) : (
                <p className="mt-1 text-xs text-gray-600">Aún no se ha creado la venta en backend.</p>
              )}
            </div>

            <div className="p-4">
              {cartItems.length === 0 ? (
                <div className="flex h-40 flex-col items-center justify-center text-center text-gray-600">
                  <ShoppingCart className="mb-2 h-8 w-8 text-gray-400" />
                  Agrega productos para iniciar la venta.
                </div>
              ) : (
                <div className="space-y-3">
                  {cartItems.map((item) => {
                    const isRemoving = removingProductId === item.productId;
                    return (
                      <div key={item.productId} className="rounded-lg border border-gray-200 bg-white p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-gray-900">{item.name}</p>
                            <p className="text-xs text-gray-600">
                              {formatCurrency(item.unitPrice)} x {item.quantity}
                            </p>
                          </div>
                          <p className="font-semibold text-gray-900">
                            {formatCurrency(item.unitPrice * item.quantity)}
                          </p>
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-2">
                          {saleId ? (
                            <p className="text-xs text-gray-600">
                              Cantidad fija tras crear venta. Usa eliminar si te equivocaste.
                            </p>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                className="h-8 w-8 p-0"
                                onClick={() => updateLocalQuantity(item.productId, item.quantity - 1)}
                                disabled={isBusy}
                              >
                                -
                              </Button>
                              <span className="min-w-[2rem] text-center text-sm font-semibold text-gray-900">
                                {item.quantity}
                              </span>
                              <Button
                                variant="outline"
                                className="h-8 w-8 p-0"
                                onClick={() => updateLocalQuantity(item.productId, item.quantity + 1)}
                                disabled={isBusy}
                              >
                                +
                              </Button>
                            </div>
                          )}

                          <Button
                            variant="ghost"
                            className="h-8 px-2 text-red-600 hover:bg-red-50 hover:text-red-700"
                            onClick={() => {
                              void removeProduct(item.productId);
                            }}
                            disabled={isBusy || isRemoving}
                          >
                            {isRemoving ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border-t border-gray-200 bg-white p-4">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm text-gray-700">Total</p>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(cartTotal)}</p>
              </div>

              <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-700">Desglose de pagos</p>
                  <Button
                    variant="ghost"
                    className="h-7 px-2 text-xs text-gray-600 hover:bg-gray-100"
                    onClick={clearPaymentBreakdown}
                    disabled={isBusy}
                  >
                    Limpiar
                  </Button>
                </div>
                <p className="mb-3 text-xs text-gray-600">
                  Opcional. Si no defines montos, se cobra todo por el método principal.
                </p>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {availablePaymentBreakdownMethods.map((method) => (
                    <div key={method} className="rounded-md border border-gray-200 bg-white p-2">
                      <label className="mb-1 block text-[11px] font-medium text-gray-700">
                        {
                          method === "tarjeta_credito"
                            ? "Tarjeta de Crédito"
                            : method === "tarjeta_debito"
                            ? "Tarjeta de Débito"
                            : method === "transferencia"
                            ? "Transferencia"
                            : method === "giftcard"
                            ? "Gift Card"
                            : method === "addi"
                            ? "Addi"
                            : "Efectivo"
                        }
                      </label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={paymentBreakdown[method] || ""}
                        onChange={(event) => updatePaymentBreakdown(method, event.target.value)}
                        disabled={isBusy}
                        placeholder="0"
                        className="h-8"
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-3 rounded-md border border-gray-200 bg-white p-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Total asignado:</span>
                    <span className="font-semibold text-gray-900">{formatCurrency(paymentBreakdownTotal)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-gray-600">Diferencia:</span>
                    <span
                      className={`font-semibold ${
                        paymentBreakdownOverpaid
                          ? "text-red-700"
                          : paymentBreakdownIncomplete
                          ? "text-amber-700"
                          : "text-emerald-700"
                      }`}
                    >
                      {paymentBreakdownDelta >= 0 ? formatCurrency(paymentBreakdownDelta) : `-${formatCurrency(Math.abs(paymentBreakdownDelta))}`}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                {!saleId ? (
                  <>
                    <Button
                      className="h-11 w-full bg-black text-white hover:bg-gray-800"
                      onClick={() => {
                        void handlePaySale();
                      }}
                      disabled={isBusy || cartItems.length === 0 || paymentBreakdownOverpaid || paymentBreakdownIncomplete}
                    >
                      {isProcessingPayment ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Procesando...
                        </>
                      ) : (
                        "Crear y cobrar venta"
                      )}
                    </Button>

                    <Button
                      variant="outline"
                      className="h-11 w-full border-gray-300 text-gray-800 hover:bg-gray-100"
                      onClick={() => {
                        void handleCreateSale();
                      }}
                      disabled={isBusy || cartItems.length === 0}
                    >
                      {isCreatingSale ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creando venta...
                        </>
                      ) : (
                        "Crear venta (sin cobrar)"
                      )}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      className="h-11 w-full bg-black text-white hover:bg-gray-800"
                      onClick={() => {
                        void handlePaySale();
                      }}
                      disabled={isBusy || cartItems.length === 0 || paymentBreakdownOverpaid || paymentBreakdownIncomplete}
                    >
                      {isProcessingPayment ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Registrando pago...
                        </>
                      ) : (
                        "Registrar pago y cerrar"
                      )}
                    </Button>

                    <Button
                      variant="outline"
                      className="h-11 w-full border-red-300 text-red-700 hover:bg-red-50"
                      onClick={() => {
                        void clearSale();
                      }}
                      disabled={isBusy}
                    >
                      {isClearingSale ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Cancelando venta...
                        </>
                      ) : (
                        "Cancelar venta"
                      )}
                    </Button>
                  </>
                )}

                <Button
                  variant="outline"
                  className="h-10 w-full border-gray-300 text-gray-800 hover:bg-gray-100"
                  onClick={handleCloseModal}
                  disabled={isBusy}
                >
                  Cerrar
                </Button>
              </div>

              {isVerifyingReport && (
                <p className="mt-2 text-xs text-gray-600">Verificando persistencia en reportes...</p>
              )}
            </div>
          </div>
        </div>
        </div>
        </div>
      </div>
    </div>
  );
}
