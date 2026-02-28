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

export const cashService = {
  getEfectivoDia: (params?: Record<string, any>) =>
    request<any>("GET", "/efectivo-dia", params),

  getEgresos: (params?: Record<string, any>) =>
    request<any>("GET", "/egresos", params),

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
};
