// components/ClientsList.tsx
"use client"
import { memo } from 'react'
import { 
  Search, 
  Plus, 
  User, 
  ChevronLeft, 
  ChevronRight, 
  Loader2,
  X
} from 'lucide-react'
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { Badge } from "../../../components/ui/badge"
import type { Cliente } from "../../../types/cliente"

interface ClientsListProps {
  onSelectClient: (client: Cliente) => void
  onAddClient: () => void
  clientes: Cliente[]
  metadata?: {
    total: number;
    pagina: number;
    limite: number;
    total_paginas: number;
    tiene_siguiente: boolean;
    tiene_anterior: boolean;
  }
  error?: string | null
  isFetching?: boolean
  onPageChange?: (page: number, filtro?: string) => void
  onSearch?: (filtro: string) => void
  searchValue: string
}

function ClientsListComponent({ 
  onSelectClient, 
  onAddClient, 
  clientes, 
  metadata,
  error, 
  isFetching = false,
  onPageChange,
  onSearch,
  searchValue
}: ClientsListProps) {

  const clearSearch = () => {
    onSearch?.("")
  }

  // Manejar cambio de página
  const handlePageChange = (page: number) => {
    if (onPageChange) {
      onPageChange(page, searchValue
)
    }
  }

  const goToPreviousPage = () => {
    if (metadata?.tiene_anterior && metadata.pagina > 1) {
      handlePageChange(metadata.pagina - 1)
    }
  }

  const goToNextPage = () => {
    if (metadata?.tiene_siguiente && metadata.pagina < (metadata.total_paginas || 1)) {
      handlePageChange(metadata.pagina + 1)
    }
  }

  const goToPage = (page: number) => {
    if (page >= 1 && page <= (metadata?.total_paginas || 1)) {
      handlePageChange(page)
    }
  }

  if (error && clientes.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-4">
        <div className="text-center">
          <div className="text-sm text-gray-600 mb-2">Error al cargar clientes</div>
          <p className="text-xs text-gray-500 mb-3">{error}</p>
          {onPageChange && (
            <Button 
              onClick={() => onPageChange(1, searchValue)}
              variant="outline"
              className="text-xs border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Reintentar
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-gray-100 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div>
            {metadata && (
              <p className="text-xs text-gray-500 mt-1">
              </p>
            )}
          </div>
          <Button
            onClick={onAddClient}
            variant="outline"
            size="sm"
            className="border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            <Plus className="h-3 w-3 mr-1" />
            <span className="text-xs">Nuevo</span>
          </Button>
        </div>
        
        {/* Filtros */}
        <div className="space-y-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Buscar por nombre, email, teléfono o cédula..."
              value={searchValue}
              onChange={(e) => onSearch?.(e.target.value)}
              className="pl-9 h-8 text-sm border-gray-300"
            />
            {searchValue && (
              <button
                onClick={clearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Badges de filtros activos */}
        {searchValue && (
          <div className="mt-2 flex flex-wrap gap-1">
            <Badge variant="secondary" className="text-xs">
              Buscando: "{searchValue}"
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-2 text-xs text-gray-500 hover:text-gray-700"
              onClick={clearSearch}
            >
              Limpiar filtro
            </Button>
          </div>
        )}

        {error && clientes.length > 0 && (
          <div className="mt-2 text-xs text-red-600">
            No se pudieron actualizar los resultados: {error}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-4">
        {isFetching && (
          <div className="mb-3 flex items-center gap-2 text-xs text-gray-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
            <span>Buscando clientes...</span>
          </div>
        )}

        {clientes.length === 0 ? (
          <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-gray-200 bg-white">
            <div className="text-center">
              <User className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-600 mb-1">
                {searchValue ? "No se encontraron resultados" : "No hay clientes"}
              </p>
              <p className="text-xs text-gray-500">
                {searchValue ? "Ajusta tu búsqueda" : "Agrega tu primer cliente"}
              </p>
              {!searchValue && (
                <Button
                  onClick={onAddClient}
                  variant="outline"
                  size="sm"
                  className="mt-3 text-xs border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Agregar cliente
                </Button>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="rounded-lg border border-gray-100 bg-white mb-4 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-3 py-2 text-left font-medium text-gray-700 text-xs">Nombre</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-700 text-xs">Teléfono</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-700 text-xs">Email</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-700 text-xs">Cédula</th>
                  </tr>
                </thead>
                <tbody>
                  {clientes.map((cliente) => (
                    <tr
                      key={cliente.id}
                      onClick={() => onSelectClient(cliente)}
                      className="border-b border-gray-50 last:border-b-0 hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-medium text-blue-600">
                            {cliente.nombre.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium text-gray-900">{cliente.nombre}</div>
                            {/* {cliente.diasSinVenir !== undefined && (
                              <div className={`text-xs ${
                                cliente.diasSinVenir > 60 
                                  ? 'text-red-600' 
                                  : cliente.diasSinVenir > 30 
                                  ? 'text-yellow-600'
                                  : 'text-green-600'
                              }`}>
                                {cliente.diasSinVenir} días sin venir
                              </div>
                            )} */}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-gray-600">
                        {cliente.telefono !== 'No disponible' && cliente.telefono ? (
                          <span>{cliente.telefono}</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-600">
                        {cliente.email !== 'No disponible' && cliente.email ? (
                          <span>{cliente.email}</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-600">
                        {cliente.cedula || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Controles de paginación */}
            {metadata && metadata.total_paginas > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-1 py-2">
                <div className="text-xs text-gray-600">
                  <span className="font-medium">Página {metadata.pagina}</span> de {metadata.total_paginas} • 
                  Total: {metadata.total} clientes
                </div>
                
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={goToPreviousPage}
                    disabled={!metadata.tiene_anterior || isFetching}
                    className="h-8 px-3 border-gray-300 text-gray-700 hover:bg-gray-50"
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    <span className="text-sm">Anterior</span>
                  </Button>
                  
                  <div className="flex items-center gap-1">
                    {/* Mostrar números de página */}
                    {Array.from({ length: Math.min(5, metadata.total_paginas) }, (_, i) => {
                      let pageNumber
                      if (metadata.total_paginas <= 5) {
                        pageNumber = i + 1
                      } else if (metadata.pagina <= 3) {
                        pageNumber = i + 1
                      } else if (metadata.pagina >= metadata.total_paginas - 2) {
                        pageNumber = metadata.total_paginas - 4 + i
                      } else {
                        pageNumber = metadata.pagina - 2 + i
                      }
                      
                      return (
                        <Button
                          key={pageNumber}
                          variant={pageNumber === metadata.pagina ? "default" : "outline"}
                          size="sm"
                          onClick={() => goToPage(pageNumber)}
                          disabled={isFetching}
                          className={`h-8 w-8 text-sm ${
                            pageNumber === metadata.pagina 
                              ? "bg-blue-600 text-white hover:bg-blue-700" 
                              : "border-gray-300 text-gray-700 hover:bg-gray-50"
                          }`}
                        >
                          {pageNumber}
                        </Button>
                      )
                    })}
                    
                    {metadata.total_paginas > 5 && metadata.pagina < metadata.total_paginas - 2 && (
                      <>
                        <span className="text-gray-400">...</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => goToPage(metadata.total_paginas)}
                          disabled={isFetching}
                          className="h-8 w-8 text-sm border-gray-300 text-gray-700 hover:bg-gray-50"
                        >
                          {metadata.total_paginas}
                        </Button>
                      </>
                    )}
                  </div>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={goToNextPage}
                    disabled={!metadata.tiene_siguiente || isFetching}
                    className="h-8 px-3 border-gray-300 text-gray-700 hover:bg-gray-50"
                  >
                    <span className="text-sm">Siguiente</span>
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
                
                <div className="text-xs text-gray-600">
                  Mostrando {metadata.limite} por página
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export const ClientsList = memo(ClientsListComponent)
