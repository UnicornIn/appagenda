import { FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { CheckCircle2, CreditCard, Landmark, Loader2, Search, Wallet } from "lucide-react";
import { Button } from "../../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { giftcardsService } from "../giftcardsService";
import type { GiftCardClientOption, GiftCardCreatePayload } from "../types";
import { formatMoney, NEVER_EXPIRES_LABEL, toPositiveNumber } from "./utils";

const PRESET_AMOUNTS = [50000, 100000, 150000, 200000, 300000];

type AmountMode = "free" | "preset";
type PaymentMethod = "efectivo" | "transferencia" | "tarjeta_credito" | "tarjeta_debito";

const PAYMENT_OPTIONS: Array<{ label: string; value: PaymentMethod; icon: ReactNode }> = [
  { label: "Efectivo", value: "efectivo", icon: <Wallet className="h-4 w-4" /> },
  { label: "Transferencia", value: "transferencia", icon: <Landmark className="h-4 w-4" /> },
  { label: "Tarjeta-Crédito", value: "tarjeta_credito", icon: <CreditCard className="h-4 w-4" /> },
  { label: "Tarjeta-Débito", value: "tarjeta_debito", icon: <CreditCard className="h-4 w-4" /> },
];

export interface CreateGiftCardSubmission {
  payload: GiftCardCreatePayload;
  paymentMethod: PaymentMethod;
  beneficiaryEmail?: string;
  beneficiaryPhone?: string;
}

interface CreateGiftCardModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  sedeId: string;
  sedeName?: string;
  currency: string;
  onCreate: (submission: CreateGiftCardSubmission) => Promise<void>;
  isSubmitting: boolean;
}

function formatAmountInput(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "";
  return Math.round(value).toLocaleString("es-CO");
}

export function CreateGiftCardModal({
  open,
  onOpenChange,
  token,
  sedeId,
  sedeName,
  currency,
  onCreate,
  isSubmitting,
}: CreateGiftCardModalProps) {
  const [clients, setClients] = useState<GiftCardClientOption[]>([]);
  const [isLoadingClients, setIsLoadingClients] = useState(false);
  const [clientsError, setClientsError] = useState<string | null>(null);
  const [hasLoadedClients, setHasLoadedClients] = useState(false);

  const [amountMode, setAmountMode] = useState<AmountMode>("free");
  const [presetAmount, setPresetAmount] = useState<number>(150000);
  const [freeAmountInput, setFreeAmountInput] = useState<string>("150000");

  const [buyerSearch, setBuyerSearch] = useState("");
  const [selectedBuyerId, setSelectedBuyerId] = useState("");

  const [isForAnotherPerson, setIsForAnotherPerson] = useState(false);
  const [beneficiaryName, setBeneficiaryName] = useState("");
  const [beneficiaryPhone, setBeneficiaryPhone] = useState("");
  const [beneficiaryEmail, setBeneficiaryEmail] = useState("");
  const [optionalMessage, setOptionalMessage] = useState("");

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("efectivo");
  const [formError, setFormError] = useState<string | null>(null);

  const selectedBuyer = useMemo(
    () => clients.find((client) => client.id === selectedBuyerId) ?? null,
    [clients, selectedBuyerId]
  );

  const buyerOptions = useMemo(() => {
    const term = buyerSearch.trim().toLowerCase();
    if (!term) return clients.slice(0, 80);

    return clients
      .filter((client) => {
        const value = `${client.nombre} ${client.email ?? ""}`.toLowerCase();
        return value.includes(term);
      });
  }, [buyerSearch, clients]);

  const totalAmount = amountMode === "preset" ? presetAmount : toPositiveNumber(freeAmountInput);

  useEffect(() => {
    if (!open || !token || hasLoadedClients) return;

    let isMounted = true;

    const loadClients = async () => {
      try {
        setIsLoadingClients(true);
        setClientsError(null);
        const list = await giftcardsService.fetchClientsForSelector(token);
        if (!isMounted) return;
        setClients(list);
        setHasLoadedClients(true);
      } catch (error) {
        if (!isMounted) return;
        setClientsError(error instanceof Error ? error.message : "No se pudieron cargar clientes");
      } finally {
        if (isMounted) {
          setIsLoadingClients(false);
        }
      }
    };

    void loadClients();

    return () => {
      isMounted = false;
    };
  }, [open, token, hasLoadedClients]);

  useEffect(() => {
    if (!open) {
      setFormError(null);
      setAmountMode("free");
      setPresetAmount(150000);
      setFreeAmountInput("150000");
      setBuyerSearch("");
      setSelectedBuyerId("");
      setIsForAnotherPerson(false);
      setBeneficiaryName("");
      setBeneficiaryPhone("");
      setBeneficiaryEmail("");
      setOptionalMessage("");
      setPaymentMethod("efectivo");
      return;
    }

    if (!isForAnotherPerson && selectedBuyer) {
      setBeneficiaryName(selectedBuyer.nombre || "");
      setBeneficiaryPhone(selectedBuyer.telefono || "");
      setBeneficiaryEmail(selectedBuyer.email || "");
    }
  }, [open, isForAnotherPerson, selectedBuyer]);

  const submitCreateGiftCard = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    if (!sedeId) {
      setFormError("No se encontró la sede para crear la Gift Card.");
      return;
    }

    if (!totalAmount || totalAmount <= 0) {
      setFormError("El valor de la Gift Card debe ser mayor a 0.");
      return;
    }

    if (!selectedBuyer) {
      setFormError("Debes seleccionar el cliente comprador.");
      return;
    }

    const finalBeneficiaryName = isForAnotherPerson ? beneficiaryName.trim() : selectedBuyer.nombre;
    const finalBeneficiaryPhone = isForAnotherPerson
      ? beneficiaryPhone.trim()
      : String(selectedBuyer.telefono || "").trim();
    const finalBeneficiaryEmail = isForAnotherPerson
      ? beneficiaryEmail.trim()
      : String(selectedBuyer.email || "").trim();

    if (!finalBeneficiaryName) {
      setFormError("Debes ingresar el nombre del beneficiario.");
      return;
    }

    const notesParts: string[] = [];
    if (optionalMessage.trim()) {
      notesParts.push(`Mensaje: ${optionalMessage.trim()}`);
    }
    notesParts.push(`Metodo de pago: ${paymentMethod}`);
    if (finalBeneficiaryPhone) {
      notesParts.push(`Telefono beneficiario: ${finalBeneficiaryPhone}`);
    }
    if (finalBeneficiaryEmail) {
      notesParts.push(`Email beneficiario: ${finalBeneficiaryEmail}`);
    }

    const payload: GiftCardCreatePayload = {
      sede_id: sedeId,
      valor: totalAmount,
      moneda: currency,
      comprador_cliente_id: selectedBuyer.id,
      comprador_nombre: selectedBuyer.nombre,
      beneficiario_cliente_id: isForAnotherPerson ? undefined : selectedBuyer.id,
      beneficiario_nombre: finalBeneficiaryName,
      notas: notesParts.join(" | "),
    };

    try {
      await onCreate({
        payload,
        paymentMethod,
        beneficiaryEmail: finalBeneficiaryEmail || undefined,
        beneficiaryPhone: finalBeneficiaryPhone || undefined,
      });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "No se pudo crear la Gift Card.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-[780px] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-0 shadow-2xl">
        <div className="border-b border-gray-200 px-6 py-5">
          <DialogHeader className="text-left">
            <DialogTitle className="text-3xl font-semibold text-gray-900">Crear Gift Card</DialogTitle>
            <DialogDescription className="mt-1 text-sm text-gray-500">
              Emite una tarjeta regalo y asigna su beneficiario.
            </DialogDescription>
          </DialogHeader>
        </div>

        <form onSubmit={submitCreateGiftCard} className="space-y-5 px-6 py-5">
          <section className="space-y-3">
            <h3 className="text-base font-semibold text-gray-900">Valor de la Gift Card</h3>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
                $
              </span>
              <Input
                inputMode="numeric"
                value={
                  amountMode === "preset"
                    ? formatAmountInput(presetAmount)
                    : freeAmountInput.replace(/[^\d]/g, "")
                }
                onChange={(event) => {
                  if (amountMode !== "free") return;
                  setFreeAmountInput(event.target.value.replace(/[^\d]/g, ""));
                }}
                className="h-11 pl-8 text-base"
                placeholder="150000"
                readOnly={amountMode === "preset"}
              />
            </div>

            <div className="flex flex-wrap gap-5">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                <input
                  type="radio"
                  name="amount-mode"
                  value="free"
                  checked={amountMode === "free"}
                  onChange={() => setAmountMode("free")}
                  className="h-4 w-4 accent-indigo-600"
                />
                Monto libre
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                <input
                  type="radio"
                  name="amount-mode"
                  value="preset"
                  checked={amountMode === "preset"}
                  onChange={() => setAmountMode("preset")}
                  className="h-4 w-4 accent-indigo-600"
                />
                Monto predefinido
              </label>
            </div>

            {amountMode === "preset" ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {PRESET_AMOUNTS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPresetAmount(value)}
                    className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                      presetAmount === value
                        ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                        : "border-gray-200 bg-white text-gray-700 hover:border-indigo-300"
                    }`}
                  >
                    {formatMoney(value, currency)}
                  </button>
                ))}
              </div>
            ) : null}
          </section>

          <section className="space-y-3">
            <h3 className="text-base font-semibold text-gray-900">Comprador</h3>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                value={buyerSearch}
                onChange={(event) => setBuyerSearch(event.target.value)}
                placeholder="Buscar cliente"
                className="h-11 pl-9"
              />
            </div>

            <select
              value={selectedBuyerId}
              onChange={(event) => setSelectedBuyerId(event.target.value)}
              className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700"
              disabled={isLoadingClients}
            >
              <option value="">Selecciona cliente comprador</option>
              {buyerOptions.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.nombre} {client.email ? `(${client.email})` : ""}
                </option>
              ))}
            </select>

            {isLoadingClients ? (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Cargando clientes...
              </div>
            ) : null}
            {clientsError ? <p className="text-xs text-amber-700">{clientsError}</p> : null}
          </section>

          <section className="space-y-3">
            <h3 className="text-base font-semibold text-gray-900">Beneficiario</h3>

            <div className="flex flex-wrap gap-5">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                <input
                  type="radio"
                  name="beneficiary-mode"
                  checked={isForAnotherPerson}
                  onChange={() => setIsForAnotherPerson(true)}
                  className="h-4 w-4 accent-indigo-600"
                />
                Es para otra persona
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                <input
                  type="radio"
                  name="beneficiary-mode"
                  checked={!isForAnotherPerson}
                  onChange={() => setIsForAnotherPerson(false)}
                  className="h-4 w-4 accent-indigo-600"
                />
                Es para el comprador
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Input
                value={beneficiaryName}
                onChange={(event) => setBeneficiaryName(event.target.value)}
                placeholder="Nombre beneficiario"
                disabled={!isForAnotherPerson}
                className="h-11"
              />
              <Input
                value={beneficiaryPhone}
                onChange={(event) => setBeneficiaryPhone(event.target.value)}
                placeholder="Teléfono"
                disabled={!isForAnotherPerson}
                className="h-11"
              />
              <Input
                value={beneficiaryEmail}
                onChange={(event) => setBeneficiaryEmail(event.target.value)}
                placeholder="Email"
                disabled={!isForAnotherPerson}
                className="h-11"
              />
              <Input
                value={optionalMessage}
                onChange={(event) => setOptionalMessage(event.target.value)}
                placeholder="Mensaje (opcional)"
                className="h-11"
              />
            </div>
          </section>

          <section className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="space-y-3">
              <h3 className="text-base font-semibold text-gray-900">Vigencia</h3>
              <Input value={NEVER_EXPIRES_LABEL} readOnly className="h-11 bg-gray-50" />
            </div>

            <div className="space-y-3">
              <h3 className="text-base font-semibold text-gray-900">Nombre Sede</h3>
              <Input value={sedeName?.trim() || "—"} readOnly className="h-11 bg-gray-50" />
              <p className="text-xs text-gray-500">Total a emitir: {formatMoney(totalAmount, currency)}</p>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-base font-semibold text-gray-900">Método de pago</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {PAYMENT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setPaymentMethod(option.value)}
                  className={`flex h-10 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium ${
                    paymentMethod === option.value
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                      : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                  }`}
                >
                  {option.icon}
                  {option.label}
                  {paymentMethod === option.value ? <CheckCircle2 className="h-4 w-4" /> : null}
                </button>
              ))}
            </div>
          </section>

          {formError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </div>
          ) : null}

          <DialogFooter className="border-t border-gray-200 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting} className="bg-indigo-600 text-white hover:bg-indigo-500">
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creando...
                </>
              ) : (
                "Crear Gift Card"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
