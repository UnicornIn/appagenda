export interface SedeCurrencyInput {
  sede_id?: string | null;
  nombre?: string | null;
  pais?: string | null;
  moneda?: string | null;
  es_internacional?: boolean | null;
}

const GUAYAQUIL_SEDE_IDS = new Set(["SD-28080"]);

function normalizeText(value?: string | null): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function normalizeCurrencyCode(value?: string | null): string {
  const normalized = String(value ?? "").trim().toUpperCase();
  return normalized || "USD";
}

export function isGuayaquilSede(sede?: SedeCurrencyInput | null): boolean {
  if (!sede) return false;

  const sedeId = String(sede.sede_id ?? "").trim().toUpperCase();
  if (GUAYAQUIL_SEDE_IDS.has(sedeId)) return true;

  return normalizeText(sede.nombre).includes("guayaquil");
}

export function resolveCurrencyFromSede(
  sede?: SedeCurrencyInput | null,
  fallback: string = "USD"
): string {
  if (!sede) {
    return normalizeCurrencyCode(fallback);
  }

  const explicitCurrency = normalizeCurrencyCode(sede.moneda);
  if (sede.moneda && explicitCurrency) {
    return explicitCurrency;
  }

  const normalizedCountry = normalizeText(sede.pais);
  if (normalizedCountry.includes("colombia")) return "COP";
  if (normalizedCountry.includes("mexico")) return "MXN";
  if (normalizedCountry.includes("ecuador")) return "USD";

  if (sede.es_internacional === true) return "USD";
  if (isGuayaquilSede(sede)) return "USD";

  return normalizeCurrencyCode(fallback);
}
