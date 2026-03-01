// app/(protected)/admin-sede/ventas/Billing.tsx
"use client"

import { useState } from "react"
import { Sidebar } from "../../../components/Layout/Sidebar"
import { PageHeader } from "../../../components/Layout/PageHeader"
import { SalesMetrics } from "./sales-metrics"
import { TodayAppointments } from "./today-appointments"
import { ServiceProtocol } from "./service-protocol"
import { Button } from "../../../components/ui/button"
import { ShoppingBag } from "lucide-react"
import { DirectSaleModal } from "./DirectSaleModal"
// Asegúrate de que esta interfaz coincida con la de TodayAppointments
interface Appointment {
  _id: string
  cliente: string
  cliente_nombre?: string
  fecha: string
  hora_inicio: string
  hora_fin: string
  servicio: string
  servicio_nombre?: string
  estilista?: string
  profesional_nombre?: string
  estado: string
  sede_id: string
  valor_total?: number
  estado_pago?: string
}

export default function Billing() {
  // Estado para la cita seleccionada
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
  const [showDirectSaleModal, setShowDirectSaleModal] = useState(false)
  const [metricsRefreshKey, setMetricsRefreshKey] = useState(0)

  const handleSelectAppointment = (appointment: Appointment) => {
    setSelectedAppointment(appointment)
  }

  const handleCloseProtocol = () => {
    setSelectedAppointment(null)
  }

  const handleDirectSaleCompleted = () => {
    setMetricsRefreshKey((current) => current + 1)
  }

  return (
    <>
      <DirectSaleModal
        isOpen={showDirectSaleModal}
        onClose={() => setShowDirectSaleModal(false)}
        onSaleCompleted={handleDirectSaleCompleted}
      />

      <div className="flex h-screen bg-gray-50">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <div className="p-8">
            <PageHeader
              title="Facturación"
              actions={
                <Button
                  className="bg-black text-white hover:bg-gray-800"
                  onClick={() => setShowDirectSaleModal(true)}
                >
                  <ShoppingBag className="mr-2 h-4 w-4" />
                  Venta directa
                </Button>
              }
            />

            {/* Sales Metrics */}
            <SalesMetrics key={metricsRefreshKey} />

            {/* Main Content Grid */}
            <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Left Column */}
              <div className="space-y-6">
                <TodayAppointments
                  onSelectAppointment={handleSelectAppointment}
                  selectedAppointmentId={selectedAppointment?._id}
                />
              </div>

              {/* Right Column - Muestra el protocolo de la cita seleccionada */}
              <div>
                <ServiceProtocol
                  selectedAppointment={selectedAppointment}
                  onClose={handleCloseProtocol}
                />
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  )
}
