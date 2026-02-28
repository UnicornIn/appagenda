"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Sidebar } from "../../../components/Layout/Sidebar"
import { ClientsList } from "./clients-list"
import { ClientDetail } from "./client-detail"
import { ClientFormModal } from "./ClientFormModal"
import type { Cliente } from "../../../types/cliente"
import type { Sede } from "../Sedes/sedeService"
import { clientesService, type ClientesPaginadosMetadata } from "./clientesService"
import { sedeService } from "../Sedes/sedeService" // ✅ Cambiado de sedesService a sedeService
import { useAuth } from "../../../components/Auth/AuthContext"
import { Loader } from "lucide-react"

const SEARCH_DEBOUNCE_MS = 300

export default function ClientsPage() {
  const [selectedClient, setSelectedClient] = useState<Cliente | null>(null)
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [metadata, setMetadata] = useState<ClientesPaginadosMetadata | null>(null)
  const [sedes, setSedes] = useState<Sede[]>([])
  const [selectedSede, setSelectedSede] = useState<string>("all")
  const [itemsPorPagina, setItemsPorPagina] = useState(10)
  const [isInitialLoading, setIsInitialLoading] = useState(true)
  const [isFetching, setIsFetching] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const hasLoadedInitialRef = useRef(false)
  const latestRequestIdRef = useRef(0)
  const latestCedulaHydrationRef = useRef(0)
  const cedulaCacheRef = useRef<Map<string, string | null>>(new Map())

  const { user, isLoading: authLoading } = useAuth()
  const getAccessToken = useCallback((): string => {
    if (user?.access_token) return user.access_token
    return (
      sessionStorage.getItem("access_token") ||
      localStorage.getItem("access_token") ||
      ""
    )
  }, [user?.access_token])

  // Cargar sedes
  const loadSedes = useCallback(async () => {
    const token = getAccessToken()
    if (!token) return

    try {
      const sedesData = await sedeService.getSedes(token) // ✅ Usando sedeService
      setSedes(sedesData)
    } catch (err) {
      console.error('Error cargando sedes:', err)
    }
  }, [getAccessToken])

  // Cargar clientes desde la API
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
    sedeId: string = "all",
    options: { initial?: boolean } = {}
  ) => {
    const isInitialRequest = options.initial ?? false
    const token = getAccessToken()

    if (!token) {
      setError('No hay token de autenticación disponible')
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
      const result = await clientesService.getClientesPaginados(token, {
        pagina,
        limite: itemsPorPagina,
        filtro,
        sedeId: sedeId !== "all" ? sedeId : undefined,
      })

      if (requestId !== latestRequestIdRef.current) return

      setClientes(applyCedulaCache(result.clientes))
      setMetadata(result.metadata)
    } catch (err) {
      if (requestId !== latestRequestIdRef.current) return
      setError(err instanceof Error ? err.message : 'Error al cargar los clientes')
      console.error('Error loading clients:', err)
    } finally {
      if (requestId !== latestRequestIdRef.current) return

      if (isInitialRequest) {
        setIsInitialLoading(false)
      } else {
        setIsFetching(false)
      }
    }
  }, [getAccessToken, itemsPorPagina, applyCedulaCache])

  useEffect(() => {
    if (!authLoading && user) {
      loadSedes()
    }
  }, [user, authLoading, loadSedes])

  useEffect(() => {
    const token = getAccessToken()
    if (!token) {
      setError((prev) => prev || "No hay token de autenticación disponible")
      setIsInitialLoading(false)
      return
    }

    if (!hasLoadedInitialRef.current) {
      hasLoadedInitialRef.current = true
      loadClientes(1, searchTerm, selectedSede, { initial: true })
      return
    }

    const timeout = setTimeout(() => {
      loadClientes(1, searchTerm, selectedSede)
    }, SEARCH_DEBOUNCE_MS)

    return () => clearTimeout(timeout)
  }, [getAccessToken, searchTerm, selectedSede, itemsPorPagina, loadClientes])

  useEffect(() => {
    if (!authLoading && !user) {
      setIsInitialLoading(false)
    }
  }, [authLoading, user])

  useEffect(() => {
    const token = getAccessToken()
    if (!token || clientes.length === 0) return

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
          const cedula = await clientesService.getClienteCedula(token, clienteId)
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
  }, [clientes, getAccessToken])

  const handleSedeChange = useCallback((sedeId: string) => {
    setSelectedSede(sedeId)
  }, [])

  const handlePageChange = useCallback((pagina: number, filtro: string = "") => {
    loadClientes(pagina, filtro, selectedSede)
  }, [loadClientes, selectedSede])

  const handleSearch = useCallback((value: string) => {
    setSearchTerm(value)
  }, [])

  const handleItemsPerPageChange = useCallback((value: number) => {
    setItemsPorPagina(value)
  }, [])

  const handleRetry = useCallback(() => {
    loadClientes(1, searchTerm, selectedSede)
  }, [loadClientes, searchTerm, selectedSede])

  const handleSelectClient = useCallback(async (client: Cliente) => {
    const token = getAccessToken()
    if (!token) {
      setError('No hay token de autenticación disponible')
      return
    }

    try {
      const clienteCompleto = await clientesService.getClienteById(token, client.id)
      setSelectedClient(clienteCompleto)
    } catch (err) {
      console.error('Error cargando detalles del cliente:', err)
      setSelectedClient(client)
    }
  }, [getAccessToken])

  const handleAddClient = useCallback(() => {
    setIsModalOpen(true)
  }, [])

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false)
  }, [])

  const handleSaveClient = useCallback(async () => {
    const token = getAccessToken()
    if (!token) {
      setError('No hay token de autenticación disponible')
      return
    }

    try {
      setIsSaving(true)
      setError(null)

      // Recargar la lista manteniendo el filtro actual
      await loadClientes(1, searchTerm, selectedSede)
      setIsModalOpen(false)

    } catch (err) {
      console.error('Error al crear cliente:', err)
      setError(err instanceof Error ? err.message : 'Error al crear el cliente')
    } finally {
      setIsSaving(false)
    }
  }, [getAccessToken, loadClientes, searchTerm, selectedSede])

  const handleBack = useCallback(() => {
    setSelectedClient(null)
  }, [])

  const handleClientUpdated = useCallback(async () => {
    const token = getAccessToken()
    if (!token || !selectedClient) return

    try {
      const clienteActualizado = await clientesService.getClienteById(token, selectedClient.id)
      setSelectedClient(clienteActualizado)
      await loadClientes(metadata?.pagina ?? 1, searchTerm, selectedSede)
    } catch (err) {
      console.error('Error refrescando cliente actualizado:', err)
    }
  }, [getAccessToken, selectedClient, loadClientes, metadata?.pagina, searchTerm, selectedSede])

  // Mostrar loading mientras se verifica la autenticación
  if (authLoading || (Boolean(user) && isInitialLoading)) {
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
            onClientUpdated={handleClientUpdated}
          />
        ) : (
          <ClientsList
            onSelectClient={handleSelectClient}
            onAddClient={handleAddClient}
            clientes={clientes}
            metadata={metadata || undefined}
            error={error}
            onRetry={handleRetry}
            onPageChange={handlePageChange}
            onSearch={handleSearch}
            searchValue={searchTerm}
            onSedeChange={handleSedeChange}
            selectedSede={selectedSede}
            sedes={sedes}
            onItemsPerPageChange={handleItemsPerPageChange}
            itemsPerPage={itemsPorPagina}
            isFetching={isFetching}
          />
        )}
      </div>

      <ClientFormModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSuccess={handleSaveClient} // ✅ Usa onSuccess
        isSaving={isSaving}
        sedeId={selectedSede !== "all" ? selectedSede : ""}
      />
    </div>
  )
}
