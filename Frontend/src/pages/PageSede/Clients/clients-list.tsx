// components/ClientsList.tsx
"use client"
import { memo, useCallback, useMemo } from 'react'
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

interface TableColumn {
  key: string
  label: string
  className: string
}

interface ClientRowProps {
  cliente: Cliente
  onSelectClient: (client: Cliente) => void
}

const formatTableValue = (value?: string) => {
  if (!value || value === "No disponible") return "—"
  return value
}

const formatCedula = (cedula?: string) => {
  const value = cedula?.trim()
  return value ? value : "—"
}

const ClientRow = memo(function ClientRow({ cliente, onSelectClient }: ClientRowProps) {
  const handleSelect = useCallback(() => {
    onSelectClient(cliente)
  }, [cliente, onSelectClient])

  return (
    <tr
      onClick={handleSelect}
      className="border-b border-gray-50 last:border-b-0 hover:bg-gray-50 cursor-pointer transition-colors"
    >
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-medium text-blue-600">
            {cliente.nombre.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="font-medium text-gray-900">{cliente.nombre}</div>
          </div>
        </div>
      </td>
      <td className="px-3 py-2 text-gray-600">{formatTableValue(cliente.telefono)}</td>
      <td className="px-3 py-2 text-gray-600">{formatTableValue(cliente.email)}</td>
      <td className="px-3 py-2 text-gray-600">{formatCedula(cliente.cedula)}</td>
    </tr>
  )
})

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
  const totalPages = metadata?.total_paginas ?? 1
  const currentPage = metadata?.pagina ?? 1

  const tableColumns = useMemo<TableColumn[]>(
    () => [
      {
        key: "nombre",
        label: "Nombre",
        className: "px-3 py-2 text-left font-medium text-gray-700 text-xs",
      },
      {
        key: "telefono",
        label: "Teléfono",
        className: "px-3 py-2 text-left font-medium text-gray-700 text-xs",
      },
      {
        key: "email",
        label: "Email",
        className: "px-3 py-2 text-left font-medium text-gray-700 text-xs",
      },
      {
        key: "cedula",
        label: "Cédula",
        className: "px-3 py-2 text-left font-medium text-gray-700 text-xs",
      },
    ],
    []
  )

  const pageNumbers = useMemo(() => {
    const maxVisiblePages = Math.min(5, totalPages)
    return Array.from({ length: maxVisiblePages }, (_, i) => {
      if (totalPages <= 5) {
        return i + 1
      }
      if (currentPage <= 3) {
        return i + 1
      }
      if (currentPage >= totalPages - 2) {
        return totalPages - 4 + i
      }
      return currentPage - 2 + i
    })
  }, [currentPage, totalPages])

  const shouldShowLastPageShortcut =
    totalPages > 5 && currentPage < totalPages - 2

  const clearSearch = useCallback(() => {
    onSearch?.("")
  }, [onSearch])

  const handleSearchChange = useCallback((value: string) => {
    onSearch?.(value)
  }, [onSearch])

  const handleRetry = useCallback(() => {
    onPageChange?.(1, searchValue)
  }, [onPageChange, searchValue])

  // Manejar cambio de página
  const handlePageChange = useCallback((page: number) => {
    if (!onPageChange) return
    const nextPage = Math.max(1, Math.min(page, totalPages))
    onPageChange(nextPage, searchValue)
  }, [onPageChange, searchValue, totalPages])

  const goToPreviousPage = useCallback(() => {
    if (metadata?.tiene_anterior && currentPage > 1) {
      handlePageChange(currentPage - 1)
    }
  }, [metadata?.tiene_anterior, currentPage, handlePageChange])

  const goToNextPage = useCallback(() => {
    if (metadata?.tiene_siguiente && currentPage < totalPages) {
      handlePageChange(currentPage + 1)
    }
  }, [metadata?.tiene_siguiente, currentPage, totalPages, handlePageChange])

  const goToPage = useCallback((page: number) => {
    if (page >= 1 && page <= totalPages) {
      handlePageChange(page)
    }
  }, [handlePageChange, totalPages])

  const clientRows = useMemo(() => {
    return clientes.map((cliente) => (
      <ClientRow
        key={cliente.id}
        cliente={cliente}
        onSelectClient={onSelectClient}
      />
    ))
  }, [clientes, onSelectClient])

  if (error && clientes.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-4">
        <div className="text-center">
          <div className="text-sm text-gray-600 mb-2">Error al cargar clientes</div>
          <p className="text-xs text-gray-500 mb-3">{error}</p>
          {onPageChange && (
            <Button 
              onClick={handleRetry}
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
              onChange={(e) => handleSearchChange(e.target.value)}
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
                    {tableColumns.map((column) => (
                      <th key={column.key} className={column.className}>
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>{clientRows}</tbody>
              </table>
            </div>

            {/* Controles de paginación */}
            {metadata && metadata.total_paginas > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-1 py-2">
                <div className="text-xs text-gray-600">
                  <span className="font-medium">Página {currentPage}</span> de {totalPages} • 
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
                    {pageNumbers.map((pageNumber) => (
                      <Button
                        key={pageNumber}
                        variant={pageNumber === currentPage ? "default" : "outline"}
                        size="sm"
                        onClick={() => goToPage(pageNumber)}
                        disabled={isFetching}
                        className={`h-8 w-8 text-sm ${
                          pageNumber === currentPage
                            ? "bg-blue-600 text-white hover:bg-blue-700"
                            : "border-gray-300 text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        {pageNumber}
                      </Button>
                    ))}
                    
                    {shouldShowLastPageShortcut && (
                      <>
                        <span className="text-gray-400">...</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => goToPage(totalPages)}
                          disabled={isFetching}
                          className="h-8 w-8 text-sm border-gray-300 text-gray-700 hover:bg-gray-50"
                        >
                          {totalPages}
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
