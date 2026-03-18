export const CASH_PAYMENT_METHOD_OPTIONS = [
  { value: "efectivo", label: "Efectivo" },
  { value: "tarjeta_credito", label: "Tarjeta crédito" },
  { value: "tarjeta_debito", label: "Tarjeta débito" },
  { value: "pos", label: "POS" },
  { value: "transferencia", label: "Transferencia" },
  { value: "link_de_pago", label: "Link de pago" },
  { value: "giftcard", label: "Giftcard" },
  { value: "addi", label: "Addi" },
  { value: "abonos", label: "Abonos" },
  { value: "descuento_por_nomina", label: "Descuento por nómina" },
  { value: "otros", label: "Otros" },
] as const;

export const CASH_EXPENSE_TYPE_OPTIONS = [
  { value: "compra_interna", label: "Compra interna" },
  { value: "gasto_operativo", label: "Gasto operativo" },
  { value: "retiro_caja", label: "Retiro de caja" },
  { value: "otro", label: "Otro" },
] as const;

export const CASH_INCOME_TYPE_OPTIONS = [
  { value: "ingreso_operativo", label: "Ingreso operativo" },
  { value: "abono_cliente", label: "Abono cliente" },
  { value: "ajuste_caja", label: "Ajuste de caja" },
  { value: "otro", label: "Otro" },
] as const;

export const DEFAULT_CASH_PAYMENT_METHOD = CASH_PAYMENT_METHOD_OPTIONS[0].value;
export const DEFAULT_CASH_EXPENSE_TYPE = CASH_EXPENSE_TYPE_OPTIONS[1].value;
export const DEFAULT_CASH_INCOME_TYPE = CASH_INCOME_TYPE_OPTIONS[0].value;

const CASH_PAYMENT_METHOD_LABELS = Object.fromEntries(
  CASH_PAYMENT_METHOD_OPTIONS.map((option) => [option.value, option.label])
) as Record<string, string>;

const CASH_EXPENSE_TYPE_LABELS = Object.fromEntries(
  CASH_EXPENSE_TYPE_OPTIONS.map((option) => [option.value, option.label])
) as Record<string, string>;

const CASH_INCOME_TYPE_LABELS = Object.fromEntries(
  CASH_INCOME_TYPE_OPTIONS.map((option) => [option.value, option.label])
) as Record<string, string>;

export const getCashPaymentMethodLabel = (value?: string) => {
  const key = String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
  return CASH_PAYMENT_METHOD_LABELS[key] || "Otros";
};

export const getCashMovementTypeLabel = (
  movementKind: "ingreso" | "egreso",
  value?: string,
  fallback?: string
) => {
  const key = String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
  const labels = movementKind === "ingreso" ? CASH_INCOME_TYPE_LABELS : CASH_EXPENSE_TYPE_LABELS;
  return labels[key] || fallback || (movementKind === "ingreso" ? "Ingreso manual" : "Egreso");
};
