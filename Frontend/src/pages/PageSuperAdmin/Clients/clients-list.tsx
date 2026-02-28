"use client"

import { memo, useCallback, useMemo } from "react"
import {
  Search,
  Plus,
  User,
  Download,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2
} from "lucide-react"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select"
import { useAuth } from "../../../components/Auth/AuthContext"
import type { Cliente } from "../../../types/cliente"
import type { Sede } from "../Sedes/sedeService"
import type { ClientesPaginadosMetadata } from "./clientesService"
import { formatSedeNombre } from "../../../lib/sede"

interface ClientsListProps {
  onSelectClient: (client: Cliente) => void
  onAddClient: () => void
  clientes: Cliente[]
  metadata?: ClientesPaginadosMetadata
  error?: string | null
  onRetry?: () => void
  onPageChange?: (page: number, filtro?: string) => void
  onSearch?: (filtro: string) => void
  searchValue: string
  onSedeChange?: (sedeId: string) => void
  selectedSede?: string
  sedes?: Sede[]
  onExport?: () => void
  onItemsPerPageChange?: (value: number) => void
  itemsPerPage?: number
  isFetching?: boolean
}

interface TableColumn {
  key: string
  label: string
  className: string
}

interface ClientRowProps {
  cliente: Cliente
  onSelectClient: (client: Cliente) => void
  sedeNombre: string
  isSuperAdmin: boolean
}

const formatCedula = (cedula?: string) => {
  const value = cedula?.trim()
  return value ? value : "—"
}

type ClienteConDiasOpcional = Cliente & {
  diasSinVenir?: number | null
}

const getDiasSinVenirValue = (cliente: Cliente): number | null => {
  const diasSinVenir = (cliente as ClienteConDiasOpcional).diasSinVenir
  return typeof diasSinVenir === "number" && Number.isFinite(diasSinVenir) ? diasSinVenir : null
}

const getDiasSinVenirBadgeClass = (diasSinVenir: number) => {
  if (diasSinVenir > 30) return "bg-red-100 text-red-800"
  if (diasSinVenir > 15) return "bg-yellow-100 text-yellow-800"
  return "bg-green-100 text-green-800"
}

const ClientRow = memo(function ClientRow({
  cliente,
  onSelectClient,
  sedeNombre,
  isSuperAdmin,
}: ClientRowProps) {
  const handleSelect = useCallback(() => {
    onSelectClient(cliente)
  }, [onSelectClient, cliente])
  const diasSinVenir = getDiasSinVenirValue(cliente)

  return (
    <tr
      onClick={handleSelect}
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
      <td className="px-6 py-4 text-gray-700">{formatCedula(cliente.cedula)}</td>
      {isSuperAdmin && (
        <td className="px-6 py-4">
          {diasSinVenir === null ? (
            <span className="text-gray-500">—</span>
          ) : (
            <span
              className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getDiasSinVenirBadgeClass(
                diasSinVenir
              )}`}
            >
              {diasSinVenir} días
            </span>
          )}
        </td>
      )}
      <td className="px-6 py-4">
        <div className="text-gray-900">{sedeNombre}</div>
      </td>
    </tr>
  )
})

function ClientsListComponent({
  onSelectClient,
  onAddClient,
  clientes,
  metadata,
  error,
  onRetry,
  onPageChange,
  onSearch,
  searchValue,
  onSedeChange,
  selectedSede = "all",
  sedes = [],
  onExport,
  onItemsPerPageChange,
  itemsPerPage = 10,
  isFetching = false
}: ClientsListProps) {
  const { user } = useAuth()
  const isSuperAdmin =
    user?.role === "SUPERADMIN" || user?.role === "super_admin" || user?.role === "superadmin"

  const totalClientes = metadata?.total ?? clientes.length
  const totalPages = metadata?.total_paginas ?? 1
  const currentPage = metadata?.pagina ?? 1
  const rangoInicio = metadata?.rango_inicio ?? (clientes.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0)
  const rangoFin = metadata?.rango_fin ?? ((currentPage - 1) * itemsPerPage + clientes.length)
  const tieneAnterior = metadata?.tiene_anterior ?? currentPage > 1
  const tieneSiguiente = metadata?.tiene_siguiente ?? currentPage < totalPages

  const tableColumns = useMemo<TableColumn[]>(() => {
    const columns: TableColumn[] = [
      {
        key: "cliente",
        label: "Cliente",
        className: "px-6 py-3.5 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider",
      },
      {
        key: "contacto",
        label: "Contacto",
        className: "px-6 py-3.5 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider",
      },
      {
        key: "cedula",
        label: "Cédula",
        className: "px-6 py-3.5 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider",
      },
    ]

    if (isSuperAdmin) {
      columns.push({
        key: "dias_sin_venir",
        label: "Días sin venir",
        className: "px-6 py-3.5 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider",
      })
    }

    columns.push({
      key: "sede",
      label: "Sede",
      className: "px-6 py-3.5 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider",
    })

    return columns
  }, [isSuperAdmin])

  const sedeNombresById = useMemo(() => {
    const byId = new Map<string, string>()
    for (const sede of sedes) {
      byId.set(sede.sede_id, formatSedeNombre(sede.nombre))
    }
    return byId
  }, [sedes])

  const pageNumbers = useMemo(() => {
    if (totalPages <= 1) return [1]

    const delta = 2
    const range: number[] = []
    const rangeWithDots: Array<number | "..."> = []

    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= currentPage - delta && i <= currentPage + delta)) {
        range.push(i)
      }
    }

    let prev = 0
    for (const page of range) {
      if (prev) {
        if (page - prev === 2) {
          rangeWithDots.push(prev + 1)
        } else if (page - prev !== 1) {
          rangeWithDots.push("...")
        }
      }
      rangeWithDots.push(page)
      prev = page
    }

    return rangeWithDots
  }, [currentPage, totalPages])

  const handlePageChange = useCallback((page: number) => {
    if (!onPageChange) return
    const nextPage = Math.max(1, Math.min(page, totalPages))
    onPageChange(nextPage, searchValue)
  }, [onPageChange, searchValue, totalPages])

  const handleSearchChange = useCallback((value: string) => {
    onSearch?.(value)
  }, [onSearch])

  const handleSedeChange = useCallback((value: string) => {
    onSedeChange?.(value)
  }, [onSedeChange])

  const handleItemsPerPageChange = useCallback((value: string) => {
    onItemsPerPageChange?.(Number(value))
  }, [onItemsPerPageChange])

  const clientRows = useMemo(() => {
    return clientes.map((cliente) => {
      const sedeNombre = cliente.sede_id
        ? (sedeNombresById.get(cliente.sede_id) ?? "Sede asignada")
        : "Sin sede asignada"

      return (
        <ClientRow
          key={cliente.id}
          cliente={cliente}
          onSelectClient={onSelectClient}
          sedeNombre={sedeNombre}
          isSuperAdmin={isSuperAdmin}
        />
      )
    })
  }, [clientes, isSuperAdmin, onSelectClient, sedeNombresById])

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
      <div className="bg-white px-6 py-5 border-b border-gray-200">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
            <p className="text-sm text-gray-600 mt-1">
              {totalClientes} cliente{totalClientes !== 1 ? 's' : ''}
              {searchValue && ` para "${searchValue}"`}
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

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Buscar por nombre, email, teléfono o cédula..."
              value={searchValue}
              onChange={(e) => handleSearchChange(e.target.value)}
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

      <div className="flex-1 overflow-auto p-6">
        {error && clientes.length > 0 && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            No se pudo actualizar la lista: {error}
          </div>
        )}

        {clientes.length === 0 ? (
          <div className="flex h-64 items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white">
            <div className="text-center px-8">
              <User className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-lg font-medium text-gray-900 mb-1">
                {searchValue || selectedSede !== "all"
                  ? "No se encontraron clientes"
                  : "No hay clientes registrados"}
              </p>
              <p className="text-sm text-gray-600 mb-6 max-w-sm">
                {searchValue || selectedSede !== "all"
                  ? "Ajusta los términos de búsqueda o el filtro de sede"
                  : "Comienza agregando tu primer cliente a la plataforma"}
              </p>
              <Button
                onClick={onAddClient}
                className="bg-gray-900 hover:bg-gray-800 text-white"
              >
                <Plus className="h-4 w-4 mr-2" />
                {searchValue || selectedSede !== "all" ? "Agregar cliente" : "Agregar primer cliente"}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="rounded-lg border border-gray-200 bg-white overflow-hidden mb-4">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px]">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      {tableColumns.map((column) => (
                        <th key={column.key} className={column.className}>
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">{clientRows}</tbody>
                </table>
              </div>
            </div>

            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-gray-200 bg-white px-6 py-4 rounded-b-lg">
                <div className="flex items-center gap-2">
                  <p className="text-sm text-gray-700">
                    Mostrando <span className="font-medium">{rangoInicio}</span> a{" "}
                    <span className="font-medium">{rangoFin}</span> de{" "}
                    <span className="font-medium">{totalClientes}</span> resultados
                  </p>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(1)}
                    disabled={!tieneAnterior}
                    className="h-8 w-8 p-0 bg-white border-gray-300 hover:bg-gray-50"
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={!tieneAnterior}
                    className="h-8 w-8 p-0 bg-white border-gray-300 hover:bg-gray-50"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>

                  <div className="flex items-center gap-1 mx-2">
                    {pageNumbers.map((page, index) => (
                      page === "..." ? (
                        <span key={`dots-${index}`} className="px-2 text-gray-500">
                          ...
                        </span>
                      ) : (
                        <Button
                          key={page}
                          variant={currentPage === page ? "default" : "outline"}
                          size="sm"
                          onClick={() => handlePageChange(page)}
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

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={!tieneSiguiente}
                    className="h-8 w-8 p-0 bg-white border-gray-300 hover:bg-gray-50"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(totalPages)}
                    disabled={!tieneSiguiente}
                    className="h-8 w-8 p-0 bg-white border-gray-300 hover:bg-gray-50"
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-700">Mostrar:</span>
                  <Select
                    value={String(itemsPerPage)}
                    onValueChange={handleItemsPerPageChange}
                  >
                    <SelectTrigger className="h-8 w-20 bg-white border border-gray-300 hover:border-gray-400 text-gray-900">
                      <SelectValue placeholder={String(itemsPerPage)} />
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

export const ClientsList = memo(ClientsListComponent)
