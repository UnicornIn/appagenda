export const PAYROLL_PAYMENT_METHOD = "descuento_por_nomina" as const;

const LEGACY_PAYMENT_METHOD_MAP: Record<string, string> = {
  descuento_nomina: PAYROLL_PAYMENT_METHOD,
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
  tarjeta_credito: "Tarjeta de Crédito",
  tarjeta_debito: "Tarjeta de Débito",
  giftcard: "Gift Card",
  addi: "Addi",
  link_pago: "Pago con link",
  link_de_pago: "Pago con link",
  sin_pago: "Sin pago",
  [PAYROLL_PAYMENT_METHOD]: "Descuento por nómina",
  descuento_nomina: "Descuento por nómina",
};

export const normalizePaymentMethodForBackend = (
  method: string | null | undefined
): string => {
  const normalized = String(method ?? "").trim();
  if (!normalized) return normalized;
  return LEGACY_PAYMENT_METHOD_MAP[normalized] || normalized;
};

export const getPaymentMethodLabel = (
  method: string | null | undefined
): string => {
  const normalized = normalizePaymentMethodForBackend(method);
  return PAYMENT_METHOD_LABELS[normalized] || PAYMENT_METHOD_LABELS[String(method ?? "").trim()] || normalized;
};
