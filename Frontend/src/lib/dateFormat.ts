const DMY_REGEX = /^(\d{2})-(\d{2})-(\d{4})$/;
const YMD_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const BACKEND_DATE_KEYS = new Set([
  "start_date",
  "end_date",
  "fecha_inicio",
  "fecha_fin",
  "fecha_desde",
  "fecha_hasta",
]);

const pad = (value: number) => String(value).padStart(2, "0");

export const toDMY = (date: Date): string => {
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`;
};

export const parseDateToDate = (input?: string | number | Date): Date | null => {
  if (!input) return null;

  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input;
  }

  if (typeof input === "number") {
    const date = new Date(input);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const raw = String(input).trim();
  if (!raw) return null;

  const dateOnly = raw.split("T")[0];
  const dmyMatch = dateOnly.match(DMY_REGEX);
  if (dmyMatch) {
    const [, dd, mm, yyyy] = dmyMatch;
    const date = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const ymdMatch = dateOnly.match(YMD_REGEX);
  if (ymdMatch) {
    const [, yyyy, mm, dd] = ymdMatch;
    const date = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const formatDateDMY = (
  input?: string | number | Date,
  fallback: string = "-"
): string => {
  const date = parseDateToDate(input);
  if (!date) return fallback;
  return toDMY(date);
};

export const toBackendDate = (input?: string | number | Date): string => {
  if (input === undefined || input === null) return "";
  const raw = String(input).trim();
  if (!raw) return "";

  const date = parseDateToDate(raw);
  return date ? toDMY(date) : raw;
};

export const normalizeBackendDateParams = <T extends Record<string, any> | undefined>(
  params?: T
): T => {
  if (!params) return params as T;

  const normalized = Object.entries(params).reduce<Record<string, any>>((acc, [key, value]) => {
    if (
      BACKEND_DATE_KEYS.has(key.toLowerCase()) &&
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      acc[key] = toBackendDate(value);
      return acc;
    }

    acc[key] = value;
    return acc;
  }, {});

  return normalized as T;
};
