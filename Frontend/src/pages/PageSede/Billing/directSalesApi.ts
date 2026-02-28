import { API_BASE_URL } from "../../../types/config";

export type PaymentMethod = "efectivo" | "tarjeta" | "transferencia" | string;

interface ApiErrorBody {
  detail?: string | Array<{ msg?: string }>;
  message?: string;
  error?: string;
}

export interface InventoryProductRaw {
  _id?: string;
  id?: string;
  producto_id?: string;
  nombre?: string;
  categoria?: string;
  descripcion?: string;
  activo?: boolean;
  stock?: number | string;
  stock_actual?: number | string;
  precio_local?: number | string;
  precio?: number | string;
  moneda_local?: string;
  precios?: Record<string, number | string>;
}

export interface InventoryProduct {
  productId: string;
  inventoryId: string;
  name: string;
  category: string;
  description: string;
  active: boolean;
  stockAvailable: number;
  unitPrice: number;
  currency: string;
}

export interface DirectSaleLineItem {
  productId: string;
  inventoryId: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface CreateDirectSaleInput {
  token: string;
  sedeId: string;
  clienteId?: string;
  total: number;
  paymentMethod: PaymentMethod;
  items: DirectSaleLineItem[];
  notes?: string;
}

export interface RegisterDirectSalePaymentInput {
  token: string;
  saleId: string;
  amount: number;
  paymentMethod: PaymentMethod;
}

export interface CreatedDirectSale {
  saleId: string;
  raw: Record<string, unknown> | null;
}

interface GetInventoryDetailParams {
  token: string;
  inventoryId: string;
  fallbackInventoryId?: string;
  currency: string;
}

interface VerifyBillingSaleParams {
  token: string;
  sedeId: string;
  saleId: string;
}

function buildAuthHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
}

function toNumeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function pickFirstNumber(values: unknown[]): number | null {
  for (const current of values) {
    const numeric = toNumeric(current);
    if (numeric !== null) {
      return numeric;
    }
  }
  return null;
}

function resolveUnitPrice(raw: InventoryProductRaw, currency: string): number {
  const directPrice = pickFirstNumber([raw.precio_local, raw.precio]);
  if (directPrice !== null) {
    return roundToTwo(directPrice);
  }

  if (raw.precios && typeof raw.precios === "object") {
    const currencyPrice = toNumeric(raw.precios[currency]);
    if (currencyPrice !== null) {
      return roundToTwo(currencyPrice);
    }

    const fallbackPrice = pickFirstNumber(Object.values(raw.precios));
    if (fallbackPrice !== null) {
      return roundToTwo(fallbackPrice);
    }
  }

  return 0;
}

function normalizeInventoryProduct(raw: InventoryProductRaw, currency: string): InventoryProduct | null {
  const productId = String(raw.id ?? raw.producto_id ?? raw._id ?? "").trim();
  const inventoryId = String(raw._id ?? raw.id ?? raw.producto_id ?? "").trim();

  if (!productId || !inventoryId) {
    return null;
  }

  const stock = pickFirstNumber([raw.stock_actual, raw.stock]) ?? 0;

  return {
    productId,
    inventoryId,
    name: String(raw.nombre ?? "Producto sin nombre").trim(),
    category: String(raw.categoria ?? "Sin categoría").trim(),
    description: String(raw.descripcion ?? "").trim(),
    active: raw.activo !== false,
    stockAvailable: Math.max(0, Math.trunc(stock)),
    unitPrice: resolveUnitPrice(raw, currency),
    currency: String(raw.moneda_local ?? currency).toUpperCase(),
  };
}

async function parseJsonSafely<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function parseApiError(response: Response): Promise<string> {
  const fallback = `Error ${response.status}: ${response.statusText}`;
  const body = await parseJsonSafely<ApiErrorBody>(response);

  if (!body) {
    return fallback;
  }

  if (typeof body.detail === "string" && body.detail.trim().length > 0) {
    return body.detail;
  }

  if (Array.isArray(body.detail) && body.detail.length > 0) {
    const firstDetail = body.detail[0];
    if (firstDetail?.msg) {
      return firstDetail.msg;
    }
  }

  if (typeof body.message === "string" && body.message.trim().length > 0) {
    return body.message;
  }

  if (typeof body.error === "string" && body.error.trim().length > 0) {
    return body.error;
  }

  return fallback;
}

function extractSaleId(data: Record<string, unknown> | null): string | null {
  if (!data) {
    return null;
  }

  const directId = data.venta_id ?? data.sale_id ?? data.id ?? data._id;
  if (typeof directId === "string" && directId.trim().length > 0) {
    return directId;
  }

  const nestedData = data.data;
  if (nestedData && typeof nestedData === "object") {
    const record = nestedData as Record<string, unknown>;
    const nestedId = record.venta_id ?? record.sale_id ?? record.id ?? record._id;
    if (typeof nestedId === "string" && nestedId.trim().length > 0) {
      return nestedId;
    }
  }

  return null;
}

function buildCreateSalePayload(
  input: CreateDirectSaleInput,
  includeModernFields: boolean
): Record<string, unknown> {
  const clientId = input.clienteId?.trim();

  const payload: Record<string, unknown> = {
    sede_id: input.sedeId,
    productos: input.items.map((item) => ({
      producto_id: item.productId,
      cantidad: Math.trunc(item.quantity),
    })),
    metodo_pago: input.paymentMethod,
    abono: 0,
  };

  if (input.notes && input.notes.trim().length > 0) {
    payload.notas = input.notes.trim();
  }

  if (clientId) {
    payload.cliente_id = clientId;
  } else if (!includeModernFields) {
    payload.cliente_id = "";
  }

  if (includeModernFields) {
    payload.tipo = "venta_directa";
    payload.total = roundToTwo(input.total);
  }

  return payload;
}

export async function fetchInventoryProducts(token: string, currency: string): Promise<InventoryProduct[]> {
  const url = `${API_BASE_URL}inventary/product/productos/?moneda=${encodeURIComponent(currency)}`;

  const response = await fetch(url, {
    method: "GET",
    headers: buildAuthHeaders(token),
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  const data = await parseJsonSafely<InventoryProductRaw[] | Record<string, unknown>>(response);
  const source = Array.isArray(data) ? data : [];

  return source
    .map((raw) => normalizeInventoryProduct(raw, currency))
    .filter((product): product is InventoryProduct => Boolean(product))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function fetchInventoryProductDetailByPath(
  token: string,
  inventoryId: string,
  currency: string
): Promise<InventoryProduct> {
  const url = `${API_BASE_URL}inventary/product/productos/${encodeURIComponent(inventoryId)}?moneda=${encodeURIComponent(currency)}`;
  const response = await fetch(url, {
    method: "GET",
    headers: buildAuthHeaders(token),
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  const raw = await parseJsonSafely<InventoryProductRaw>(response);
  const normalized = raw ? normalizeInventoryProduct(raw, currency) : null;

  if (!normalized) {
    throw new Error("No se pudo normalizar el detalle del producto");
  }

  return normalized;
}

export async function fetchInventoryProductDetail(params: GetInventoryDetailParams): Promise<InventoryProduct> {
  try {
    return await fetchInventoryProductDetailByPath(params.token, params.inventoryId, params.currency);
  } catch (error) {
    if (!params.fallbackInventoryId || params.fallbackInventoryId === params.inventoryId) {
      throw error;
    }
    return fetchInventoryProductDetailByPath(params.token, params.fallbackInventoryId, params.currency);
  }
}

export async function createDirectSale(input: CreateDirectSaleInput): Promise<CreatedDirectSale> {
  const attempts = [
    buildCreateSalePayload(input, true),
    buildCreateSalePayload(input, false),
  ];

  let lastError = "No se pudo crear la venta directa";

  for (let index = 0; index < attempts.length; index += 1) {
    const response = await fetch(`${API_BASE_URL}sales/`, {
      method: "POST",
      headers: {
        ...buildAuthHeaders(input.token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(attempts[index]),
    });

    if (response.ok) {
      const data = await parseJsonSafely<Record<string, unknown>>(response);
      const saleId = extractSaleId(data);

      if (!saleId) {
        throw new Error("La API no devolvió el identificador de la venta");
      }

      return {
        saleId,
        raw: data,
      };
    }

    lastError = await parseApiError(response);
    const canRetry = response.status === 422 && index < attempts.length - 1;
    if (!canRetry) {
      break;
    }
  }

  throw new Error(lastError);
}

export async function registerDirectSalePayment(
  input: RegisterDirectSalePaymentInput
): Promise<Record<string, unknown> | null> {
  const baseUrl = `${API_BASE_URL}sales/${encodeURIComponent(input.saleId)}/pago`;
  const amount = roundToTwo(input.amount);
  const bodyPayload = {
    monto: amount,
    metodo_pago: input.paymentMethod,
  };

  const bodyResponse = await fetch(baseUrl, {
    method: "POST",
    headers: {
      ...buildAuthHeaders(input.token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(bodyPayload),
  });

  if (bodyResponse.ok) {
    return parseJsonSafely<Record<string, unknown>>(bodyResponse);
  }

  if (![400, 405, 422].includes(bodyResponse.status)) {
    throw new Error(await parseApiError(bodyResponse));
  }

  const query = new URLSearchParams({
    monto: String(amount),
    metodo_pago: input.paymentMethod,
  });

  const queryResponse = await fetch(`${baseUrl}?${query.toString()}`, {
    method: "POST",
    headers: buildAuthHeaders(input.token),
  });

  if (!queryResponse.ok) {
    throw new Error(await parseApiError(queryResponse));
  }

  return parseJsonSafely<Record<string, unknown>>(queryResponse);
}

export async function deleteDirectSaleProduct(token: string, saleId: string, productId: string): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}sales/${encodeURIComponent(saleId)}/productos/${encodeURIComponent(productId)}`,
    {
      method: "DELETE",
      headers: buildAuthHeaders(token),
    }
  );

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }
}

export async function deleteAllDirectSaleProducts(token: string, saleId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}sales/${encodeURIComponent(saleId)}/productos`, {
    method: "DELETE",
    headers: buildAuthHeaders(token),
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }
}

export async function verifyDirectSaleInBillingReport(
  params: VerifyBillingSaleParams
): Promise<Record<string, unknown> | null> {
  const url = `${API_BASE_URL}api/billing/sales/${encodeURIComponent(params.sedeId)}/${encodeURIComponent(params.saleId)}`;
  const response = await fetch(url, {
    method: "GET",
    headers: buildAuthHeaders(params.token),
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  return parseJsonSafely<Record<string, unknown>>(response);
}
