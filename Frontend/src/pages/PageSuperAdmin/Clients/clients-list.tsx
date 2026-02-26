"use client"

import { useState, useMemo } from "react"
import { Search, Plus, User, Download, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2 } from 'lucide-react'
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select"
import type { Cliente } from "../../../types/cliente"
import type { Sede } from "../Sedes/sedeService"
import { formatSedeNombre } from "../../../lib/sede"

interface ClientsListProps {
  onSelectClient: (client: Cliente) => void
  onAddClient: () => void
  clientes: Cliente[]
  error?: string | null
  onRetry?: () => void
  onSedeChange?: (sedeId: string) => void
  selectedSede?: string
  sedes?: Sede[]
  onExport?: () => void
  itemsPerPage?: number
  isFetching?: boolean
}

export function ClientsList({ 
  onSelectClient, 
  onAddClient, 
  clientes, 
  error, 
  onRetry,
  onSedeChange,
  selectedSede = "all",
  sedes = [],
  onExport,
  itemsPerPage = 10,
  isFetching = false
}: ClientsListProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [currentPage, setCurrentPage] = useState(1)

  // Filtrado de clientes
  const filteredClientes = useMemo(() => {
    return clientes.filter(cliente =>
      cliente.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cliente.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cliente.telefono.toLowerCase().includes(searchTerm.toLowerCase())
    )
  }, [clientes, searchTerm])

  // Cálculo de paginación
  const totalPages = Math.ceil(filteredClientes.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedClientes = filteredClientes.slice(startIndex, endIndex)

  const handleSedeChange = (sedeId: string) => {
    setCurrentPage(1) // Resetear a primera página al cambiar sede
    if (onSedeChange) {
      onSedeChange(sedeId)
    }
  }

  const handlePageChange = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)))
  }

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value)
    setCurrentPage(1) // Resetear a primera página al buscar
  }

  // Generar rango de páginas para mostrar
  const getPageNumbers = () => {
    const delta = 2
    const range = []
    const rangeWithDots = []
    
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= currentPage - delta && i <= currentPage + delta)) {
        range.push(i)
      }
    }
    
    let prev = 0
    for (const i of range) {
      if (prev) {
        if (i - prev === 2) {
          rangeWithDots.push(prev + 1)
        } else if (i - prev !== 1) {
          rangeWithDots.push('...')
        }
      }
      rangeWithDots.push(i)
      prev = i
    }
    
    return rangeWithDots
  }

  if (error && clientes.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8">
        <div className="text-center">
          <div className="text-lg font-medium text-gray-900 mb-2">Error al cargar clientes</div>
          <p className="text-sm text-gray-600 mb-6 max-w-md">{error}</p>
          {onRetry && (
            <Button 
              onClick={onRetry}
              className="bg-gray-900 hover:bg-gray-800 text-white"
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
      <div className="bg-white px-6 py-5 border-b border-gray-200">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
            <p className="text-sm text-gray-600 mt-1">
              {filteredClientes.length} cliente{filteredClientes.length !== 1 ? 's' : ''} encontrado{filteredClientes.length !== 1 ? 's' : ''}
              {searchTerm && ` para "${searchTerm}"`}
            </p>
            {isFetching && (
              <div className="mt-2 inline-flex items-center gap-2 text-xs text-gray-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
                <span>Actualizando clientes...</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            {onExport && (
              <Button
                onClick={onExport}
                variant="outline"
                size="sm"
                className="bg-white border-gray-300 text-gray-700 hover:bg-gray-50 hover:text-gray-900"
              >
                <Download className="h-4 w-4 mr-2" />
                Exportar
              </Button>
            )}
            <Button
              onClick={onAddClient}
              className="bg-gray-900 hover:bg-gray-800 text-white"
              size="sm"
            >
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Cliente
            </Button>
          </div>
        </div>
        
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Buscar por nombre, email o teléfono..."
              value={searchTerm}
              onChange={handleSearchChange}
              className="pl-10 h-10 bg-white"
            />
          </div>
          
          <div className="w-full sm:w-[220px]">
            <Select value={selectedSede} onValueChange={handleSedeChange}>
              <SelectTrigger className="w-full h-10 bg-white border border-gray-300 hover:border-gray-400 text-gray-900">
                <SelectValue placeholder="Todas las sedes" className="text-gray-900" />
              </SelectTrigger>
              <SelectContent className="bg-white border border-gray-300">
                <SelectItem value="all" className="text-gray-900 hover:bg-gray-100">
                  Todas las sedes
                </SelectItem>
                  {sedes.map((sede) => (
                    <SelectItem 
                      key={sede.sede_id} 
                      value={sede.sede_id}
                      className="text-gray-900 hover:bg-gray-100"
                    >
                    {formatSedeNombre(sede.nombre)}
                    </SelectItem>
                  ))}
                </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-6">
        {error && clientes.length > 0 && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            No se pudo actualizar la lista: {error}
          </div>
        )}

        {filteredClientes.length === 0 ? (
          <div className="flex h-64 items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white">
            <div className="text-center px-8">
              <User className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-lg font-medium text-gray-900 mb-1">
                {searchTerm || selectedSede !== "all" 
                  ? "No se encontraron clientes" 
                  : "No hay clientes registrados"}
              </p>
              <p className="text-sm text-gray-600 mb-6 max-w-sm">
                {searchTerm || selectedSede !== "all"
                  ? "Ajusta los términos de búsqueda o el filtro de sede"
                  : "Comienza agregando tu primer cliente a la plataforma"}
              </p>
              {clientes.length === 0 && (
                <Button
                  onClick={onAddClient}
                  className="bg-gray-900 hover:bg-gray-800 text-white"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Agregar primer cliente
                </Button>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="rounded-lg border border-gray-200 bg-white overflow-hidden mb-4">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px]">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Cliente
                      </th>
                      <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Contacto
                      </th>
                      <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Días sin venir
                      </th>
                      <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Sede
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paginatedClientes.map((cliente) => (
                      <tr
                        key={cliente.id}
                        onClick={() => onSelectClient(cliente)}
                        className="hover:bg-gray-50 active:bg-gray-100 cursor-pointer transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex-shrink-0 h-10 w-10 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center text-gray-700 font-medium">
                              {cliente.nombre.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-medium text-gray-900">{cliente.nombre}</div>
                              <div className="text-sm text-gray-500">{cliente.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-gray-900">{cliente.telefono}</div>
                          <div className="text-sm text-gray-500">{cliente.email}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            cliente.diasSinVenir > 30 
                              ? 'bg-red-100 text-red-800' 
                              : cliente.diasSinVenir > 15
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-green-100 text-green-800'
                          }`}>
                            {cliente.diasSinVenir} días
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-gray-900">
                            {cliente.sede_id 
                              ? formatSedeNombre(sedes.find(s => s.sede_id === cliente.sede_id)?.nombre, 'Sede asignada')
                              : 'Sin sede asignada'}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Paginación */}
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-gray-200 bg-white px-6 py-4 rounded-b-lg">
                <div className="flex items-center gap-2">
                  <p className="text-sm text-gray-700">
                    Mostrando <span className="font-medium">{startIndex + 1}</span> a{" "}
                    <span className="font-medium">{Math.min(endIndex, filteredClientes.length)}</span> de{" "}
                    <span className="font-medium">{filteredClientes.length}</span> resultados
                  </p>
                </div>
                
                <div className="flex items-center gap-1">
                  {/* Botón Primera página */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(1)}
                    disabled={currentPage === 1}
                    className="h-8 w-8 p-0 bg-white border-gray-300 hover:bg-gray-50"
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                  
                  {/* Botón Página anterior */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="h-8 w-8 p-0 bg-white border-gray-300 hover:bg-gray-50"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  
                  {/* Números de página */}
                  <div className="flex items-center gap-1 mx-2">
                    {getPageNumbers().map((page, index) => (
                      page === '...' ? (
                        <span key={`dots-${index}`} className="px-2 text-gray-500">
                          ...
                        </span>
                      ) : (
                        <Button
                          key={page}
                          variant={currentPage === page ? "default" : "outline"}
                          size="sm"
                          onClick={() => handlePageChange(page as number)}
                          className={`h-8 w-8 p-0 ${
                            currentPage === page 
                              ? 'bg-gray-900 hover:bg-gray-800 text-white' 
                              : 'bg-white border-gray-300 hover:bg-gray-50 text-gray-700'
                          }`}
                        >
                          {page}
                        </Button>
                      )
                    ))}
                  </div>
                  
                  {/* Botón Página siguiente */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="h-8 w-8 p-0 bg-white border-gray-300 hover:bg-gray-50"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  
                  {/* Botón Última página */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(totalPages)}
                    disabled={currentPage === totalPages}
                    className="h-8 w-8 p-0 bg-white border-gray-300 hover:bg-gray-50"
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
                
                {/* Selector de items por página */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-700">Mostrar:</span>
                  <Select
                    value={itemsPerPage.toString()}
                    onValueChange={() => {
                      // Nota: Necesitarías manejar el cambio de itemsPerPage desde el componente padre
                      setCurrentPage(1)
                    }}
                  >
                    <SelectTrigger className="h-8 w-20 bg-white border border-gray-300 hover:border-gray-400 text-gray-900">
                      <SelectValue placeholder={itemsPerPage.toString()} />
                    </SelectTrigger>
                    <SelectContent className="bg-white border border-gray-300">
                      <SelectItem value="10" className="text-gray-900 hover:bg-gray-100">10</SelectItem>
                      <SelectItem value="25" className="text-gray-900 hover:bg-gray-100">25</SelectItem>
                      <SelectItem value="50" className="text-gray-900 hover:bg-gray-100">50</SelectItem>
                      <SelectItem value="100" className="text-gray-900 hover:bg-gray-100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
