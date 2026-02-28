"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "../../../components/Layout/Sidebar"
import { ClientsList } from "./clients-list"
import { ClientDetail } from "./client-detail"
import { ClientFormModal } from "./ClientFormModal"
import type { Cliente } from "../../../types/cliente"
import type { Sede } from "../Sedes/sedeService"
import { clientesService } from "./clientesService"
import { sedeService } from "../Sedes/sedeService" // ✅ Cambiado de sedesService a sedeService
import { useAuth } from "../../../components/Auth/AuthContext"
import { Loader } from "lucide-react"

export default function ClientsPage() {
  const [selectedClient, setSelectedClient] = useState<Cliente | null>(null)
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [sedes, setSedes] = useState<Sede[]>([])
  const [selectedSede, setSelectedSede] = useState<string>("all")
  const [isLoading, setIsLoading] = useState(true)
  const [_, setIsLoadingSedes] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const { user, isLoading: authLoading } = useAuth()

  // Cargar sedes
  const loadSedes = async () => {
    if (!user?.access_token) return

    try {
      setIsLoadingSedes(true)
      const sedesData = await sedeService.getSedes(user.access_token) // ✅ Usando sedeService
      console.log('📥 Sedes cargadas:', sedesData)
      setSedes(sedesData)
    } catch (err) {
      console.error('Error cargando sedes:', err)
    } finally {
      setIsLoadingSedes(false)
    }
  }

  // Cargar clientes desde la API
  const loadClientes = async (sedeId?: string) => {
    if (!user?.access_token) {
      setError('No hay token de autenticación disponible')
      setIsLoading(false)
      return
    }

    try {
      setIsLoading(true)
      setError(null)
      console.log('🔄 Cargando clientes para sede:', sedeId || 'todas')
      const clientesData = await clientesService.getClientes(user.access_token, sedeId)
      console.log('📥 Clientes recibidos del backend:', clientesData)
      setClientes(clientesData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar los clientes')
      console.error('Error loading clients:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!authLoading && user) {
      loadSedes()
      loadClientes()
    }
  }, [user, authLoading])

  const handleSedeChange = (sedeId: string) => {
    console.log('🎯 Cambiando filtro de sede a:', sedeId)
    setSelectedSede(sedeId)
    loadClientes(sedeId === "all" ? undefined : sedeId)
  }

  const handleSelectClient = async (client: Cliente) => {
    if (!user?.access_token) {
      setError('No hay token de autenticación disponible')
      return
    }

    try {
      const clienteCompleto = await clientesService.getClienteById(user.access_token, client.id)
      setSelectedClient(clienteCompleto)
    } catch (err) {
      console.error('Error cargando detalles del cliente:', err)
      setSelectedClient(client)
    }
  }

  const handleAddClient = () => {
    setIsModalOpen(true)
  }

  const handleSaveClient = async () => {
    if (!user?.access_token) {
      setError('No hay token de autenticación disponible')
      return
    }

    try {
      setIsSaving(true)
      setError(null)

      // Recargar la lista manteniendo el filtro actual
      await loadClientes(selectedSede !== "all" ? selectedSede : undefined)
      setIsModalOpen(false)

    } catch (err) {
      console.error('Error al crear cliente:', err)
      setError(err instanceof Error ? err.message : 'Error al crear el cliente')
    } finally {
      setIsSaving(false)
    }
  }

  const handleBack = () => {
    setSelectedClient(null)
  }

  // Mostrar loading mientras se verifica la autenticación
  if (authLoading || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="flex items-center gap-3">
          <Loader className="h-6 w-6 animate-spin text-blue-600" />
          <span className="text-lg text-gray-600">
            {authLoading ? "Verificando autenticación..." : "Cargando clientes..."}
          </span>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-red-600 text-lg mb-4">No autenticado</div>
          <div className="text-gray-600">Por favor inicia sesión para acceder a esta página</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 overflow-auto">
        {selectedClient ? (
          <ClientDetail
            client={selectedClient}
            onBack={handleBack}
          />
        ) : (
          <ClientsList
            onSelectClient={handleSelectClient}
            onAddClient={handleAddClient}
            clientes={clientes}
            error={error}
            onRetry={() => loadClientes(selectedSede !== "all" ? selectedSede : undefined)}
            onSedeChange={handleSedeChange}
            selectedSede={selectedSede}
            sedes={sedes}
          />
        )}
      </div>

      <ClientFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleSaveClient} // ✅ Usa onSuccess
        isSaving={isSaving}
        sedeId={selectedSede !== "all" ? selectedSede : ""}
      />
    </div>
  )
}
