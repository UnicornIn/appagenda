"use client"

import type React from "react"
import { X } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog"
import { Button } from "../../../components/ui/button"
import type { Factura } from "../../../types/factura"
import { formatDateDMY } from "../../../lib/dateFormat"

interface FacturaDetailModalProps {
  factura: Factura
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function FacturaDetailModal({ factura, open, onOpenChange }: FacturaDetailModalProps) {
  const formatDate = (dateString: string) => formatDateDMY(dateString, "-")

  const formatCurrency = (amount: number, currency: string) => {
    const safeCurrency = String(currency || "COP").toUpperCase()
    const safeAmount = Number.isFinite(amount) ? amount : 0
    const locale = safeCurrency === "USD" ? "en-US" : safeCurrency === "MXN" ? "es-MX" : "es-CO"
    return `${safeCurrency} ${Math.round(safeAmount).toLocaleString(locale)}`
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between text-2xl">
            Detalle de Factura
            <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
              <X className="h-5 w-5" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Información General */}
          <div>
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Información General</h3>
            <div className="grid grid-cols-2 gap-4 rounded-lg border bg-gray-50 p-4">
              <DetailRow label="Identificador" value={factura.identificador} />
              <DetailRow label="Fecha de pago" value={formatDate(factura.fecha_pago)} />
              <DetailRow label="Local" value={factura.local} />
              <DetailRow label="Moneda" value={factura.moneda} />
              <DetailRow label="Tipo de comisión" value={factura.tipo_comision} />
            </div>
          </div>

          {/* Información del Cliente */}
          <div>
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Información del Cliente</h3>
            <div className="grid grid-cols-2 gap-4 rounded-lg border bg-gray-50 p-4">
              <DetailRow label="ID Cliente" value={factura.cliente_id} />
              <DetailRow label="Nombre" value={factura.nombre_cliente} />
              <DetailRow label="Cédula" value={factura.cedula_cliente || "N/A"} />
              <DetailRow label="Email" value={factura.email_cliente} />
              <DetailRow label="Teléfono" value={factura.telefono_cliente} />
            </div>
          </div>

          {/* Información del Profesional */}
          <div>
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Información del Profesional</h3>
            <div className="grid grid-cols-2 gap-4 rounded-lg border bg-gray-50 p-4">
              <DetailRow label="ID Profesional" value={factura.profesional_id} />
              <DetailRow label="Nombre" value={factura.profesional_nombre} />
            </div>
          </div>

          {/* Información de Pago */}
          <div>
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Información de Pago</h3>
            <div className="grid grid-cols-2 gap-4 rounded-lg border bg-gray-50 p-4">
              <DetailRow label="Comprobante de pago" value={factura.comprobante_de_pago} />
              <DetailRow label="Número de comprobante" value={factura.numero_comprobante} />
              <DetailRow label="Fecha comprobante" value={formatDate(factura.fecha_comprobante)} />
              <DetailRow label="Método de pago" value={factura.metodo_pago} />
              <DetailRow label="Monto" value={formatCurrency(factura.monto, factura.moneda)} />
              <DetailRow label="Total" value={formatCurrency(factura.total, factura.moneda)} highlight />
              <DetailRow label="Facturado por" value={factura.facturado_por} />
              <DetailRow
                label="Estado"
                value={
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                      factura.estado === "pagado" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"
                    }`}
                  >
                    {factura.estado}
                  </span>
                }
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          <Button className="bg-[oklch(0.55_0.25_280)] hover:bg-[oklch(0.50_0.25_280)]">Imprimir factura</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface DetailRowProps {
  label: string
  value: React.ReactNode
  highlight?: boolean
}

function DetailRow({ label, value, highlight }: DetailRowProps) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`mt-1 text-sm ${highlight ? "text-lg font-bold text-[oklch(0.55_0.25_280)]" : "text-gray-900"}`}>
        {value}
      </p>
    </div>
  )
}
