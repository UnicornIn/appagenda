"use client"

import { useState, useEffect } from "react"
import { Search, Download, Loader2, Building } from "lucide-react"
import { FacturaDetailModal } from "./factura-detail-modal"
import type { Factura } from "../../../types/factura"
import { facturaService } from "./facturas"
import { sedeService } from "../Sedes/sedeService"
import type { Sede } from "../../../types/sede"
import { formatSedeNombre } from "../../../lib/sede"
import { formatDateDMY } from "../../../lib/dateFormat"

export function VentasFacturadasList() {
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedSede, setSelectedSede] = useState("")
  const [selectedEstado, setSelectedEstado] = useState("all")
  const [selectedFactura, setSelectedFactura] = useState<Factura | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [facturas, setFacturas] = useState<Factura[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingSedes, setIsLoadingSedes] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sedes, setSedes] = useState<Sede[]>([])
  const [sedeIdMap, setSedeIdMap] = useState<Record<string, string>>({}) // Mapa de _id a sede_id

  // Cargar sedes disponibles
  useEffect(() => {
    cargarSedes()
  }, [])

  // Cargar facturas cuando se selecciona una sede
  useEffect(() => {
    if (selectedSede && sedeIdMap[selectedSede]) {
      cargarFacturas()
    } else {
      setFacturas([])
    }
  }, [selectedSede, sedeIdMap])

  const cargarSedes = async () => {
    try {
      setIsLoadingSedes(true)
      const token = sessionStorage.getItem("access_token")
      if (!token) {
        throw new Error("No hay token de autenticación")
      }
      
      const sedesData = await sedeService.getSedes(token)
      setSedes(sedesData)
      
      // Crear mapa de _id a sede_id
      const idMap: Record<string, string> = {}
      sedesData.forEach(sede => {
        if (sede._id && sede.sede_id) {
          idMap[sede._id] = sede.sede_id
        }
      })
      setSedeIdMap(idMap)
      
      // Si solo hay una sede, seleccionarla automáticamente
      if (sedesData.length === 1) {
        setSelectedSede(sedesData[0]._id)
      }
    } catch (err) {
      console.error("Error cargando sedes:", err)
      setError("Error al cargar las sedes disponibles")
    } finally {
      setIsLoadingSedes(false)
    }
  }

  const cargarFacturas = async () => {
    try {
      setIsLoading(true)
      setError(null)
      
      // Usar el sede_id correcto (SD-XXXXX)
      const sedeId = sedeIdMap[selectedSede]
      if (!sedeId) {
        throw new Error("ID de sede no válido")
      }
      
      console.log("Cargando facturas para sede:", sedeId)
      
      // Usar el servicio existente que obtiene ventas por sede
      const ventas = await facturaService.getVentasBySede(sedeId)
      
      console.log("Facturas cargadas:", ventas.length)
      
      // Actualizar el estado con las facturas
      setFacturas(ventas as Factura[])
      
    } catch (err: any) {
      console.error("Error cargando facturas:", err)
      setError(err.message || "Error al cargar las facturas. Por favor, intenta nuevamente.")
      setFacturas([])
    } finally {
      setIsLoading(false)
    }
  }

  // Filtrar facturas basado en los criterios
  const facturasFiltradas = facturas.filter(factura => {
    // Filtro por término de búsqueda
    if (searchTerm) {
      const termino = searchTerm.toLowerCase()
      const cumpleBusqueda = 
        factura.identificador?.toLowerCase().includes(termino) ||
        factura.nombre_cliente?.toLowerCase().includes(termino) ||
        factura.numero_comprobante?.toLowerCase().includes(termino)
      
      if (!cumpleBusqueda) return false
    }
    
    // Filtro por estado
    if (selectedEstado !== "all" && factura.estado !== selectedEstado) {
      return false
    }
    
    return true
  })

  const handleRowClick = (factura: Factura) => {
    setSelectedFactura(factura)
    setIsModalOpen(true)
  }

  const formatDate = (dateString: string) => formatDateDMY(dateString, dateString)

  const getCurrencyLocale = (currency: string) => {
    if (currency === "USD") return "en-US"
    if (currency === "MXN") return "es-MX"
    return "es-CO"
  }

  const formatCurrency = (amount: number, currency: string) => {
    const safeCurrency = (currency || "COP").toUpperCase()
    const safeAmount = Number.isFinite(amount) ? amount : 0
    return `${safeCurrency} ${Math.round(safeAmount).toLocaleString(getCurrencyLocale(safeCurrency))}`
  }

  const selectedSedeNombre = formatSedeNombre(
    sedes.find(s => s._id === selectedSede)?.nombre,
    "Sede seleccionada"
  )

  const handleExportCSV = () => {
    try {
      // Crear encabezados CSV
      const headers = [
        "Fecha Pago",
        "Cliente",
        "Local",
        "Profesional",
        "N° Comprobante",
        "Método Pago",
        "Total",
        "Estado"
      ]
      
      // Crear filas de datos
      const rows = facturasFiltradas.map(factura => [
        formatDate(factura.fecha_pago),
        factura.nombre_cliente,
        factura.local,
        factura.profesional_nombre,
        factura.numero_comprobante,
        factura.metodo_pago,
        formatCurrency(factura.total, factura.moneda),
        factura.estado
      ])
      
      // Crear contenido CSV
      const csvContent = [
        headers.join(","),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
      ].join("\n")
      
      // Obtener nombre de la sede seleccionada
      const sedeNombre = formatSedeNombre(
        sedes.find(s => s._id === selectedSede)?.nombre,
        "sede"
      )
      
      // Crear y descargar archivo
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.setAttribute("download", `ventas-${sedeNombre}-${new Date().toISOString().split('T')[0]}.csv`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      
    } catch (error) {
      console.error("Error exportando CSV:", error)
      alert("Error al exportar el archivo CSV")
    }
  }

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-medium">Ventas facturadas</h1>
            <p className="text-sm text-gray-600 mt-1">
              {selectedSede 
                ? `Sede: ${selectedSedeNombre}`
                : "Selecciona una sede para ver las facturas"}
            </p>
          </div>
          
          {selectedSede && facturasFiltradas.length > 0 && (
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1 px-3 py-1.5 text-sm border border-black hover:bg-gray-50"
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              Exportar CSV
            </button>
          )}
        </div>

        {/* Selector de Sede */}
        <div className="mb-6">
          <label className="block text-sm mb-2">Seleccionar sede</label>
          {isLoadingSedes ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span className="text-sm text-gray-600">Cargando sedes...</span>
            </div>
          ) : sedes.length === 0 ? (
            <div className="text-sm text-gray-600">No hay sedes disponibles</div>
          ) : (
            <select
              value={selectedSede}
              onChange={(e) => setSelectedSede(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border focus:outline-none focus:border-gray-400"
              disabled={isLoadingSedes}
            >
              <option value="">-- Seleccionar sede --</option>
              {sedes.map((sede) => (
                <option key={sede._id} value={sede._id}>
                  {formatSedeNombre(sede.nombre)}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Filtros (solo mostrar si hay sede seleccionada) */}
        {selectedSede && (
          <>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar facturas..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-sm border focus:outline-none focus:border-gray-400"
                  disabled={isLoading}
                />
              </div>
              
              <select
                value={selectedEstado}
                onChange={(e) => setSelectedEstado(e.target.value)}
                className="px-3 py-1.5 text-sm border focus:outline-none focus:border-gray-400"
                disabled={isLoading}
              >
                <option value="all">Todos los estados</option>
                <option value="pagado">Pagado</option>
                <option value="pendiente">Pendiente</option>
              </select>
            </div>

            {/* Estado de carga/error */}
            {isLoading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="ml-2 text-sm text-gray-600">Cargando facturas...</span>
              </div>
            )}

            {error && !isLoading && (
              <div className="p-3 border border-red-300 bg-red-50">
                <p className="text-sm text-red-800">{error}</p>
                <button 
                  onClick={cargarFacturas}
                  className="mt-2 text-sm underline"
                >
                  Reintentar
                </button>
              </div>
            )}

            {/* Tabla */}
            {!isLoading && !error && (
              <div className="border">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-4 py-2 text-left">Fecha pago</th>
                        <th className="px-4 py-2 text-left">Cliente</th>
                        <th className="px-4 py-2 text-left">Profesional</th>
                        <th className="px-4 py-2 text-left">Comprobante</th>
                        <th className="px-4 py-2 text-left">Método</th>
                        <th className="px-4 py-2 text-left">Total</th>
                        <th className="px-4 py-2 text-left">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {facturasFiltradas.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                            {searchTerm || selectedEstado !== "all"
                              ? "No se encontraron facturas con los filtros aplicados"
                              : "No hay facturas registradas en esta sede"}
                          </td>
                        </tr>
                      ) : (
                        facturasFiltradas.map((factura) => (
                          <tr
                            key={factura.identificador}
                            onClick={() => handleRowClick(factura)}
                            className="cursor-pointer hover:bg-gray-50 border-b"
                          >
                            <td className="px-4 py-2 text-gray-700">{formatDate(factura.fecha_pago)}</td>
                            <td className="px-4 py-2 text-gray-700">{factura.nombre_cliente}</td>
                            <td className="px-4 py-2 text-gray-700">{factura.profesional_nombre}</td>
                            <td className="px-4 py-2 text-gray-700">{factura.numero_comprobante}</td>
                            <td className="px-4 py-2 text-gray-700 capitalize">{factura.metodo_pago}</td>
                            <td className="px-4 py-2 font-medium">
                              {formatCurrency(factura.total, factura.moneda)}
                            </td>
                            <td className="px-4 py-2">
                              <span className={`text-xs px-2 py-0.5 ${
                                factura.estado === "pagado" 
                                  ? "bg-gray-100" 
                                  : "bg-gray-200"
                              }`}>
                                {factura.estado}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Resumen */}
            {!isLoading && !error && facturasFiltradas.length > 0 && (
              <div className="text-sm text-gray-600">
                Mostrando {facturasFiltradas.length} de {facturas.length} facturas
              </div>
            )}
          </>
        )}

        {/* Mensaje cuando no hay sede seleccionada */}
        {!selectedSede && sedes.length > 0 && !isLoadingSedes && (
          <div className="text-center py-12 border border-dashed">
            <Building className="h-8 w-8 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600 text-sm">Selecciona una sede para ver las facturas</p>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedFactura && (
        <FacturaDetailModal 
          factura={selectedFactura} 
          open={isModalOpen} 
          onOpenChange={setIsModalOpen} 
        />
      )}
    </>
  )
}
