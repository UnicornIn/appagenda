"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Sidebar } from "../../../components/Layout/Sidebar"
import { ClientsList } from "./clients-list"
import { ClientDetail } from "./client-detail"
import { ClientFormModal } from "./ClientFormModal"
import type { Cliente } from "../../../types/cliente"
import { clientesService, type ClientesPaginadosMetadata } from "./clientesService"
import { sedeService } from "../../PageSuperAdmin/Sedes/sedeService"
import { useAuth } from "../../../components/Auth/AuthContext"
import { Loader } from "lucide-react"

const SEARCH_DEBOUNCE_MS = 300

const normalizarFichas = (raw: any): any[] | undefined => {
  if (Array.isArray(raw)) return raw
  if (Array.isArray(raw?.data)) return raw.data
  if (Array.isArray(raw?.fichas)) return raw.fichas
  if (Array.isArray(raw?.items)) return raw.items
  return undefined
}

const firstNonEmptyString = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value === "string" || typeof value === "number") {
      const normalized = String(value).trim()
      if (normalized) {
        return normalized
      }
    }
  }
  return ""
}

const extractCedula = (clienteData: any): string =>
  firstNonEmptyString(
    clienteData?.cedula,
    clienteData?.numero_cedula,
    clienteData?.numeroDocumento,
    clienteData?.numero_documento,
    clienteData?.documento,
    clienteData?.identificacion,
    clienteData?.dni
  )

// Función para asegurar que un objeto cumpla con la interfaz Cliente
const asegurarClienteCompleto = (clienteData: any): Cliente => {
  const fichasNormalizadas =
    normalizarFichas(clienteData?.fichas) ??
    normalizarFichas(clienteData?.data?.fichas)

  return {
    ...clienteData,
    id: clienteData.id || clienteData._id || clienteData.cliente_id || "",
    nombre: clienteData.nombre || "",
    email: clienteData.email || clienteData.correo || "No disponible",
    telefono: clienteData.telefono || "No disponible",
    cedula: extractCedula(clienteData),
    ciudad: clienteData.ciudad || "",
    sede_id: clienteData.sede_id || "",
    diasSinVenir: clienteData.diasSinVenir ?? clienteData.dias_sin_visitar ?? 0,
    diasSinComprar: clienteData.diasSinComprar ?? 0,
    ltv: clienteData.ltv ?? clienteData.total_gastado ?? 0,
    ticketPromedio: clienteData.ticketPromedio ?? clienteData.ticket_promedio ?? 0,
    rizotipo: clienteData.rizotipo || "",
    nota: clienteData.nota || clienteData.notas || "",
    historialCitas: Array.isArray(clienteData.historialCitas) ? clienteData.historialCitas : [],
    historialCabello: Array.isArray(clienteData.historialCabello) ? clienteData.historialCabello : [],
    historialProductos: Array.isArray(clienteData.historialProductos) ? clienteData.historialProductos : [],
    fichas: fichasNormalizadas
  }
}

export default function ClientsPage() {
  const [selectedClient, setSelectedClient] = useState<Cliente | null>(null)
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [metadata, setMetadata] = useState<ClientesPaginadosMetadata | null>(null)
  const [isInitialLoading, setIsInitialLoading] = useState(true)
  const [isFetching, setIsFetching] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [sedes, setSedes] = useState<any[]>([])
  const [itemsPorPagina, setItemsPorPagina] = useState(10)
  const hasLoadedInitialRef = useRef(false)
  const latestRequestIdRef = useRef(0)
  const latestCedulaHydrationRef = useRef(0)
  const cedulaCacheRef = useRef<Map<string, string | null>>(new Map())

  const { user, isLoading: authLoading } = useAuth()

  const loadSedes = useCallback(async () => {
    if (!user?.access_token) return
    try {
      const sedesData = await sedeService.getSedes(user.access_token)
      setSedes(sedesData)
    } catch (err) {
      console.error("Error cargando sedes:", err)
    }
  }, [user?.access_token])

  const applyCedulaCache = useCallback((listado: Cliente[]): Cliente[] => {
    return listado.map((cliente) => {
      const cachedCedula = cedulaCacheRef.current.get(cliente.id)
      if (!cachedCedula || cliente.cedula?.trim()) {
        return cliente
      }
      return { ...cliente, cedula: cachedCedula }
    })
  }, [])

  const loadClientes = useCallback(async (
    pagina: number = 1,
    filtro: string = "",
    options: { initial?: boolean } = {}
  ) => {
    const isInitialRequest = options.initial ?? false

    if (!user?.access_token) {
      setError("No hay token de autenticación disponible")
      setIsInitialLoading(false)
      setIsFetching(false)
      return
    }

    const requestId = ++latestRequestIdRef.current

    try {
      if (isInitialRequest) {
        setIsInitialLoading(true)
      } else {
        setIsFetching(true)
      }

      setError(null)

      const result = await clientesService.getClientesPaginados(user.access_token, {
        pagina,
        limite: itemsPorPagina,
        filtro
      })

      if (requestId !== latestRequestIdRef.current) return

      const clientesNormalizados = result.clientes.map(asegurarClienteCompleto)
      setClientes(applyCedulaCache(clientesNormalizados))
      setMetadata(result.metadata)

    } catch (err) {
      if (requestId !== latestRequestIdRef.current) return
      console.error("❌ Error cargando clientes:", err)
      setError(err instanceof Error ? err.message : "Error al cargar los clientes")
    } finally {
      if (requestId !== latestRequestIdRef.current) return

      if (isInitialRequest) {
        setIsInitialLoading(false)
      } else {
        setIsFetching(false)
      }
    }
  }, [user?.access_token, itemsPorPagina, applyCedulaCache])

  useEffect(() => {
    if (!authLoading && user) {
      loadSedes()
    }
  }, [user, authLoading, loadSedes])

  useEffect(() => {
    if (!user?.access_token) return

    if (!hasLoadedInitialRef.current) {
      hasLoadedInitialRef.current = true
      loadClientes(1, searchTerm, { initial: true })
      return
    }

    const timeout = setTimeout(() => {
      loadClientes(1, searchTerm)
    }, SEARCH_DEBOUNCE_MS)

    return () => clearTimeout(timeout)
  }, [user?.access_token, searchTerm, itemsPorPagina, loadClientes])

  useEffect(() => {
    if (!authLoading && !user) {
      setIsInitialLoading(false)
    }
  }, [authLoading, user])

  useEffect(() => {
    if (!user?.access_token || clientes.length === 0) return

    const idsSinCedula = clientes
      .filter((cliente) => !cliente.cedula?.trim() && !cedulaCacheRef.current.has(cliente.id))
      .map((cliente) => cliente.id)

    if (idsSinCedula.length === 0) return

    let cancelled = false
    const hydrationRequestId = ++latestCedulaHydrationRef.current

    const hydrateCedulas = async () => {
      const updates = new Map<string, string>()

      const results = await Promise.allSettled(
        idsSinCedula.map(async (clienteId) => {
          const cedula = await clientesService.getClienteCedula(user.access_token, clienteId)
          return { clienteId, cedula: cedula.trim() }
        })
      )

      if (cancelled || hydrationRequestId !== latestCedulaHydrationRef.current) {
        return
      }

      for (const result of results) {
        if (result.status !== "fulfilled") continue
        const { clienteId, cedula } = result.value
        cedulaCacheRef.current.set(clienteId, cedula || null)
        if (cedula) {
          updates.set(clienteId, cedula)
        }
      }

      if (updates.size === 0) return

      setClientes((prev) =>
        prev.map((cliente) => {
          const updatedCedula = updates.get(cliente.id)
          if (!updatedCedula || cliente.cedula?.trim() === updatedCedula) {
            return cliente
          }
          return { ...cliente, cedula: updatedCedula }
        })
      )
    }

    void hydrateCedulas()

    return () => {
      cancelled = true
    }
  }, [clientes, user?.access_token])

  const handlePageChange = useCallback((pagina: number, filtro: string = "") => {
    loadClientes(pagina, filtro)
  }, [loadClientes])

  const handleSearch = useCallback((value: string) => {
    setSearchTerm(value)
  }, [])

  const handleItemsPerPageChange = useCallback((value: number) => {
    setItemsPorPagina(value)
  }, [])

  const handleSelectClient = useCallback(async (client: Cliente) => {
    if (!user?.access_token) return
    try {
      const clienteCompleto = await clientesService.getClienteById(user.access_token, client.id)
      setSelectedClient(asegurarClienteCompleto(clienteCompleto))
    } catch (err) {
      console.error("Error cargando detalles:", err)
      setSelectedClient(client)
    }
  }, [user?.access_token])

  const handleAddClient = useCallback(() => {
    setIsModalOpen(true)
  }, [])

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false)
  }, [])

  const handleSaveClient = useCallback(async () => {
    if (!user?.access_token) return
    try {
      setIsSaving(true)
      setError(null)
      await loadClientes(1, searchTerm)
      setIsModalOpen(false)

    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear el cliente")
    } finally {
      setIsSaving(false)
    }
  }, [user?.access_token, loadClientes, searchTerm])

  const handleBack = useCallback(() => {
    setSelectedClient(null)
  }, [])

  const handleClientUpdated = useCallback(async () => {
    if (!user?.access_token || !selectedClient) return

    try {
      const clienteActualizado = await clientesService.getClienteById(user.access_token, selectedClient.id)
      setSelectedClient(asegurarClienteCompleto(clienteActualizado))
      await loadClientes(metadata?.pagina ?? 1, searchTerm)
    } catch (err) {
      console.error("Error refrescando cliente actualizado:", err)
    }
  }, [user?.access_token, selectedClient, loadClientes, metadata?.pagina, searchTerm])

  if (authLoading || (Boolean(user) && isInitialLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="flex items-center gap-3">
          <Loader className="h-5 w-5 animate-spin text-gray-600" />
          <span className="text-sm text-gray-600">Cargando clientes...</span>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="text-center">
          <div className="text-sm text-gray-600 mb-2">No autenticado</div>
          <div className="text-xs text-gray-500">Inicia sesión para acceder</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-white">
      <Sidebar />
      <div className="flex-1 overflow-auto">
        {selectedClient ? (
          <ClientDetail
            client={selectedClient}
            onBack={handleBack}
            onClientUpdated={handleClientUpdated}
          />
        ) : (
          <>
            {/* Controles de cantidad por página */}
            <div className="border-b border-gray-100 p-4 bg-white">
              <div className="max-w-6xl mx-auto flex items-center justify-between">
                <div>
                  <h1 className="text-lg font-medium text-gray-900">Clientes</h1>
                  <p className="text-xs text-gray-500 mt-1">
                    {metadata
                      ? `Mostrando ${clientes.length} de ${metadata.total} clientes`
                      : `${clientes.length} clientes`}
                  </p>
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-700">Mostrar:</span>
                    <select
                      value={itemsPorPagina}
                      onChange={(e) => handleItemsPerPageChange(Number(e.target.value))}
                      className="h-8 text-sm border border-gray-300 rounded px-2 focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
                    >
                      <option value="10">10</option>
                      <option value="25">25</option>
                      <option value="50">50</option>
                      <option value="100">100</option>
                    </select>
                    <span className="text-xs text-gray-500">por página</span>
                  </div>
                </div>
              </div>
              {error && (
                <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-600">
                  Error: {error}
                </div>
              )}
            </div>
            
            <ClientsList
              onSelectClient={handleSelectClient}
              onAddClient={handleAddClient}
              clientes={clientes}
              metadata={metadata || undefined}
              error={error}
              isFetching={isFetching}
              onPageChange={handlePageChange}
              onSearch={handleSearch}
              searchValue={searchTerm}
            />
          </>
        )}
      </div>

      <ClientFormModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSuccess={handleSaveClient}
        isSaving={isSaving}
        sedeId={sedes.length > 0 ? (sedes[0].id || sedes[0]._id || "") : ""}
      />
    </div>
  )
}
