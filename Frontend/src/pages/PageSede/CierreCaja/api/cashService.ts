import { API_BASE_URL } from "../../../../types/config";

const getToken = (): string | null => {
  return sessionStorage.getItem("access_token") || localStorage.getItem("access_token");
};

const getHeaders = (): HeadersInit => {
  const token = getToken();
  const headers: HeadersInit = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return headers;
};

const getBaseUrl = () => (API_BASE_URL.endsWith("/") ? API_BASE_URL : `${API_BASE_URL}/`);

const buildUrl = (path: string, params?: Record<string, any>) => {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${getBaseUrl()}cash${normalized}`);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.append(key, String(value));
      }
    });
  }

  return url.toString();
};

const parseErrorMessage = async (response: Response, fallback: string) => {
  try {
    const data = await response.json();
    if (typeof data?.detail === "string" && data.detail.trim()) {
      return data.detail;
    }
    if (typeof data?.message === "string" && data.message.trim()) {
      return data.message;
    }
  } catch {
    // ignore parse error and fallback
  }

  return fallback;
};

const request = async <T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  params?: Record<string, any>,
  body?: Record<string, any>
): Promise<T> => {
  const url = buildUrl(path, params);

  const response = await fetch(url, {
    method,
    headers: getHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      errorText || `Error ${response.status}: ${response.statusText}`
    );
  }

  if (response.status === 204) {
    return {} as T;
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : {}) as T;
};

const extractFilename = (contentDisposition: string | null): string | null => {
  if (!contentDisposition) return null;

  const encodedMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (encodedMatch?.[1]) {
    try {
      return decodeURIComponent(encodedMatch[1].replace(/["']/g, ""));
    } catch {
      return encodedMatch[1].replace(/["']/g, "");
    }
  }

  const plainMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  return plainMatch?.[1] ?? null;
};

const requestBlob = async (
  path: string,
  params?: Record<string, any>
): Promise<{ blob: Blob; filename: string | null }> => {
  const url = buildUrl(path, params);
  const response = await fetch(url, {
    method: "GET",
    headers: getHeaders(),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      errorText || `Error ${response.status}: ${response.statusText}`
    );
  }

  const blob = await response.blob();
  const filename = extractFilename(response.headers.get("content-disposition"));

  return { blob, filename };
};

export const getEfectivoDia = async (
  token: string,
  params?: Record<string, any>
): Promise<any> => {
  const url = buildUrl("/efectivo-dia", params);
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const detail = await parseErrorMessage(response, "Error al obtener efectivo del día");
    throw new Error(detail);
  }

  return response.json();
};

export const cashService = {
  getEfectivoDia: async (params?: Record<string, any>) => {
    const token = getToken();
    if (token) {
      return getEfectivoDia(token, params);
    }
    return request<any>("GET", "/efectivo-dia", params);
  },

  getIngresos: (params?: Record<string, any>) =>
    request<any>("GET", "/ingresos", params),

  getEgresos: (params?: Record<string, any>) =>
    request<any>("GET", "/egresos", params),

  createIngreso: (body: Record<string, any>) =>
    request<any>("POST", "/ingreso", undefined, body),

  createEgreso: (body: Record<string, any>) =>
    request<any>("POST", "/egreso", undefined, body),

  deleteEgreso: (egresoId: string, params?: Record<string, any>) =>
    request<any>("DELETE", `/egresos/${egresoId}`, params),

  aperturaCaja: (body: Record<string, any>) =>
    request<any>("POST", "/apertura", undefined, body),

  cierreCaja: (body: Record<string, any>) =>
    request<any>("POST", "/cierre", undefined, body),

  getCierres: (params?: Record<string, any>) =>
    request<any>("GET", "/cierres", params),

  getCierreById: (cierreId: string) =>
    request<any>("GET", `/cierres/${cierreId}`),

  getReportePeriodo: (params?: Record<string, any>) =>
    request<any>("GET", "/reporte-periodo", params),

  getReporteExcel: (params?: Record<string, any>) =>
    requestBlob("/reporte-excel", params),
};
