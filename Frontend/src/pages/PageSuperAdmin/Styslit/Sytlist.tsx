"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "../../../components/Layout/Sidebar"
import { EstilistasList } from "./estilistas-list"
import { EstilistaDetail } from "./estilista-detail"
import { EstilistaFormModal } from "./estilista-form-modal"
import { Plus, Loader, Users } from 'lucide-react'
import { Button } from "../../../components/ui/button"
import type { Estilista, CreateEstilistaData } from "../../../types/estilista"
import { estilistaService } from "./estilistaService"
import { useAuth } from "../../../components/Auth/AuthContext"

export default function EstilistasPage() {
  const [estilistas, setEstilistas] = useState<Estilista[]>([])
  const [selectedEstilista, setSelectedEstilista] = useState<Estilista | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingEstilista, setEditingEstilista] = useState<Estilista | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { user, isLoading: authLoading } = useAuth()

  // Cargar estilistas desde la API
  const loadEstilistas = async () => {
    if (!user?.access_token) {
      setError('No hay token de autenticación disponible')
      setIsLoading(false)
      return
    }

    try {
      setIsLoading(true)
      setError(null)

      const estilistasData = await estilistaService.getEstilistas(user.access_token)
      setEstilistas(estilistasData)

      // Seleccionar el primer estilista por defecto si hay datos
      if (estilistasData.length > 0 && !selectedEstilista) {
        setSelectedEstilista(estilistasData[0])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar los estilistas')
      console.error('Error loading estilistas:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!authLoading && user) {
      loadEstilistas()
    }
  }, [user, authLoading])

  const handleAddEstilista = () => {
    setEditingEstilista(null)
    setIsModalOpen(true)
  }

  const handleEditEstilista = (estilista: Estilista) => {
    setEditingEstilista(estilista)
    setIsModalOpen(true)
  }

  const handleSaveEstilista = async (estilistaData: Partial<Estilista> & { password?: string }) => {
    if (!user?.access_token) {
      setError('No hay token de autenticación disponible')
      return
    }

    try {
      setIsSaving(true)
      setError(null)

      // Asegurar que especialidades siempre sea un array
      const especialidades = estilistaData.especialidades || [];

      if (editingEstilista) {
        await estilistaService.updateEstilista(
          user.access_token,
          editingEstilista.profesional_id,
          {
            nombre: estilistaData.nombre,
            email: estilistaData.email,
            sede_id: estilistaData.sede_id,
            especialidades: especialidades,
            comision: estilistaData.comision || null,
            activo: estilistaData.activo
          }
        )

        await loadEstilistas()
      } else {
        // Crear nuevo estilista
        const createData: CreateEstilistaData = {
          nombre: estilistaData.nombre || "",
          email: estilistaData.email || "",
          sede_id: estilistaData.sede_id || "",
          especialidades: especialidades,
          comision: estilistaData.comision || null,
          password: estilistaData.password || "Unicornio123"
        }

        if (!createData.sede_id) {
          throw new Error('Debe seleccionar una sede para crear el estilista')
        }

        // Crear el estilista
        await estilistaService.createEstilista(user.access_token, createData)
        
        // Recargar la lista completa para obtener todos los datos actualizados
        await loadEstilistas()
      }

      setIsModalOpen(false)
      setEditingEstilista(null)

    } catch (err) {
      console.error('Error al guardar estilista:', err)
      setError(err instanceof Error ? err.message : 'Error al guardar el estilista')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteEstilista = async (estilista: Estilista) => {
    if (!user?.access_token) {
      setError('No hay token de autenticación disponible')
      return
    }

    try {
      await estilistaService.deleteEstilista(user.access_token, estilista.profesional_id)

      // Recargar la lista
      await loadEstilistas()

      // Si el estilista eliminado era el seleccionado, limpiar la selección
      if (selectedEstilista?.profesional_id === estilista.profesional_id) {
        setSelectedEstilista(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar el estilista')
      console.error('Error deleting estilista:', err)
    }
  }

  // Mostrar loading mientras se verifica la autenticación
  if (authLoading || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <Loader className="h-8 w-8 animate-spin text-gray-900" />
          <span className="text-base text-gray-600">
            {authLoading ? "Verificando autenticación..." : "Cargando estilistas..."}
          </span>
        </div>
      </div>
    )
  }

  // Si no hay usuario autenticado
  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="text-center">
          <div className="text-gray-900 text-lg mb-4 font-medium">No autenticado</div>
          <div className="text-gray-600">Por favor inicia sesión para acceder a esta página</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-white">
      <Sidebar />

      <div className="flex flex-1 overflow-hidden">
        {/* Lista lateral de estilistas */}
        <div className="w-80 lg:w-[22rem] border-r border-gray-100 bg-white overflow-y-auto">
          {/* Header de la lista */}
          <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-gray-900" />
                <h1 className="text-lg font-semibold text-gray-900">Estilistas</h1>
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                  {estilistas.length}
                </span>
              </div>
              <Button
                onClick={handleAddEstilista}
                className="bg-gray-900 hover:bg-gray-800 text-white"
                size="sm"
              >
                <Plus className="h-4 w-4 mr-2" />
                Nuevo
              </Button>
            </div>
          </div>

          {error && (
            <div className="mx-4 my-3 p-3 bg-red-50 border border-red-100 rounded-lg">
              <div className="flex items-start justify-between">
                <div className="text-sm text-red-800">
                  {error}
                </div>
                <button
                  onClick={loadEstilistas}
                  className="text-red-600 hover:text-red-800 text-sm font-medium"
                >
                  Reintentar
                </button>
              </div>
            </div>
          )}

          {/* Lista de estilistas */}
          <div className="p-1.5">
            <EstilistasList
              estilistas={estilistas}
              selectedEstilista={selectedEstilista}
              onSelectEstilista={setSelectedEstilista}
              onEdit={handleEditEstilista}
              onDelete={handleDeleteEstilista}
            />
          </div>
        </div>

        {/* Panel de detalle */}
        <div className="flex-1 overflow-y-auto bg-gray-50">
          {selectedEstilista ? (
            <EstilistaDetail
              estilista={selectedEstilista}
              onEdit={handleEditEstilista}
              onDelete={handleDeleteEstilista}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center p-8">
              <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center mb-6">
                <Users className="h-12 w-12 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {estilistas.length === 0 
                  ? 'No hay estilistas registrados' 
                  : 'Selecciona un estilista'
                }
              </h3>
              <p className="text-sm text-gray-600 text-center max-w-sm mb-6">
                {estilistas.length === 0
                  ? 'Comienza agregando tu primer estilista al equipo'
                  : 'Haz clic en un estilista de la lista para ver su información detallada'
                }
              </p>
              {estilistas.length === 0 && (
                <Button
                  onClick={handleAddEstilista}
                  className="bg-gray-900 hover:bg-gray-800 text-white"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Agregar primer estilista
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <EstilistaFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveEstilista}
        estilista={editingEstilista}
        isSaving={isSaving}
      />
    </div>
  )
}
