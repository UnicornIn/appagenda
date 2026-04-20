"use client"
import { memo, useCallback, useMemo, useState, CSSProperties } from "react"
import { Search, Plus, ChevronLeft, ChevronRight, Loader2, X } from "lucide-react"
import type { Cliente } from "../../../types/cliente"
import type { Sede } from "../Sedes/sedeService"
import type { ClientesPaginadosMetadata } from "./clientesService"
import { formatSedeNombre } from "../../../lib/sede"

interface ClientsListProps {
  onSelectClient: (client: Cliente) => void
  onAddClient: () => void
  clientes: Cliente[]
  selectedId?: string
  metadata?: ClientesPaginadosMetadata
  error?: string | null
  onRetry?: () => void
  onPageChange?: (page: number, filtro?: string) => void
  onSearch?: (filtro: string) => void
  searchValue: string
  onSedeChange?: (sedeId: string) => void
  selectedSede?: string
  sedes?: Sede[]
  onItemsPerPageChange?: (value: number) => void
  itemsPerPage?: number
  isFetching?: boolean
  isInitialLoading?: boolean
}

type FilterType = 'Todos' | 'Activos' | 'Inactivos 30d+' | 'Nuevos' | 'VIP'

const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO")
const ini = (n: string) =>
  n.split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()

const S: Record<string, CSSProperties> = {
  shell: {
    width: '420px', borderRight: '1px solid #E2E8F0',
    display: 'flex', flexDirection: 'column', flexShrink: 0,
    height: '100%', overflow: 'hidden',
    fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif",
  },
  header: { padding: '20px 20px 0' },
  h1: { fontSize: '20px', fontWeight: 700, letterSpacing: '-.3px', color: '#1E293B', margin: 0 },
  sub: { fontSize: '12px', color: '#64748B', marginTop: '2px' },
  searchWrap: { margin: '14px 20px 0', position: 'relative' },
  searchIcon: { position: 'absolute', left: '12px', top: '11px', color: '#94A3B8', width: '15px', height: '15px', pointerEvents: 'none' },
  searchInput: {
    width: '100%', padding: '10px 36px 10px 36px',
    border: '1px solid #E2E8F0', borderRadius: '8px',
    fontSize: '13px', background: '#F8FAFC', outline: 'none',
    fontFamily: 'inherit', color: '#1E293B', boxSizing: 'border-box',
  },
  clearBtn: {
    position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
    background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: 0,
  },
  filtersRow: { display: 'flex', gap: '4px', padding: '10px 20px', flexWrap: 'wrap' },
  sedeSelect: {
    width: '100%', padding: '6px 10px', border: '1px solid #E2E8F0',
    borderRadius: '8px', fontSize: '11px', color: '#64748B',
    background: '#F8FAFC', outline: 'none', fontFamily: 'inherit',
    marginTop: '6px', cursor: 'pointer',
  },
  count: {
    padding: '4px 20px', fontSize: '10px', color: '#94A3B8',
    fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px',
    display: 'flex', alignItems: 'center', gap: '8px',
  },
  listScroll: { flex: 1, overflowY: 'auto' as const },
  row: (selected: boolean): CSSProperties => ({
    display: 'flex', alignItems: 'center', padding: '10px 20px',
    cursor: 'pointer', gap: '10px', transition: 'background .1s',
    borderLeft: selected ? '3px solid #1E293B' : '3px solid transparent',
    background: selected ? '#F1F5F9' : 'transparent',
  }),
  avatar: {
    width: '36px', height: '36px', borderRadius: '50%', background: '#1E293B',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '11px', fontWeight: 700, color: '#fff', flexShrink: 0,
  },
  clInfo: { flex: 1, minWidth: 0 },
  clName: { fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#1E293B' },
  clMeta: { fontSize: '10px', color: '#64748B', marginTop: '1px', display: 'flex', gap: '8px' },
  clRight: { textAlign: 'right', flexShrink: 0 },
  clLtv: { fontSize: '12px', fontWeight: 700, color: '#1E293B' },
  clLast: { fontSize: '9px', color: '#94A3B8' },
  pagination: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '8px 20px', borderTop: '1px solid #E2E8F0',
    fontSize: '11px', color: '#64748B',
  },
  pgBtn: (enabled: boolean): CSSProperties => ({
    background: 'none', border: '1px solid #E2E8F0', borderRadius: '6px',
    padding: '4px 8px', cursor: enabled ? 'pointer' : 'default',
    color: enabled ? '#64748B' : '#CBD5E1', fontFamily: 'inherit',
    display: 'flex', alignItems: 'center',
  }),
  addBtn: {
    width: '100%', padding: '8px', border: '1px dashed #E2E8F0', borderRadius: '8px',
    fontSize: '12px', color: '#94A3B8', cursor: 'pointer', background: 'none',
    fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
  },
  addWrap: { padding: '12px 20px' },
  skeletonRow: { display: 'flex', alignItems: 'center', padding: '10px 20px', gap: '10px' },
  skeletonCircle: { width: '36px', height: '36px', borderRadius: '50%', background: '#E2E8F0', flexShrink: 0 },
  skeletonLine: (w: string, h: string, mb?: string): CSSProperties => ({
    height: h, background: '#E2E8F0', borderRadius: '4px', width: w, marginBottom: mb,
  }),
}

interface ClientRowProps {
  cliente: Cliente
  selected: boolean
  onSelect: (c: Cliente) => void
}

const ClientRow = memo(function ClientRow({ cliente, selected, onSelect }: ClientRowProps) {
  const handleClick = useCallback(() => onSelect(cliente), [cliente, onSelect])
  const daysSince = cliente.diasSinVenir ?? 0

  return (
    <div
      onClick={handleClick}
      style={S.row(selected)}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = '#F8FAFC' }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent' }}
    >
      <div style={S.avatar}>{ini(cliente.nombre)}</div>
      <div style={S.clInfo}>
        <div style={S.clName}>{cliente.nombre}</div>
        <div style={S.clMeta}>
          {cliente.historialCitas.length > 0 && (
            <span>{cliente.historialCitas.length} visitas</span>
          )}
          <span>{daysSince === 0 ? 'Hoy' : `${daysSince}d sin venir`}</span>
        </div>
      </div>
      <div style={S.clRight}>
        <div style={S.clLtv}>{fmt(cliente.ltv)}</div>
        <div style={S.clLast}>{cliente.ultima_visita ?? '—'}</div>
      </div>
    </div>
  )
})

function ClientsListComponent({
  onSelectClient, onAddClient, clientes, selectedId,
  metadata, error, onRetry, isFetching = false, isInitialLoading = false,
  onPageChange, onSearch, searchValue,
  onSedeChange, selectedSede = "all", sedes = [],
}: ClientsListProps) {
  const [activeFilter, setActiveFilter] = useState<FilterType>('Todos')

  const totalPages = metadata?.total_paginas ?? 1
  const currentPage = metadata?.pagina ?? 1
  const tieneAnterior = metadata?.tiene_anterior ?? currentPage > 1
  const tieneSiguiente = metadata?.tiene_siguiente ?? currentPage < totalPages
  const clientCount = metadata?.total ?? clientes.length

  const handlePageChange = useCallback((page: number) => {
    onPageChange?.(Math.max(1, Math.min(page, totalPages)), searchValue)
  }, [onPageChange, searchValue, totalPages])

  const handleSearchChange = useCallback((v: string) => onSearch?.(v), [onSearch])
  const clearSearch = useCallback(() => onSearch?.(""), [onSearch])

  const rows = useMemo(() => clientes.map(c => (
    <ClientRow key={c.id} cliente={c} selected={c.id === selectedId} onSelect={onSelectClient} />
  )), [clientes, selectedId, onSelectClient])

  const filterBtn = (f: FilterType) => {
    const active = activeFilter === f
    return (
      <button
        key={f}
        onClick={() => setActiveFilter(f)}
        style={{
          padding: '5px 10px',
          border: `1px solid ${active ? '#1E293B' : '#E2E8F0'}`,
          borderRadius: '16px', fontSize: '10px',
          color: active ? '#fff' : '#64748B',
          fontWeight: 500, cursor: 'pointer',
          background: active ? '#1E293B' : 'transparent',
          fontFamily: 'inherit',
        }}
      >
        {f}
      </button>
    )
  }

  return (
    <div style={S.shell}>
      {/* Header */}
      <div style={S.header}>
        <h1 style={S.h1}>Clientes</h1>
        <div style={S.sub}>Base de datos · Todas las sedes</div>
      </div>

      {/* Search */}
      <div style={S.searchWrap}>
        <Search style={S.searchIcon} />
        <input
          placeholder="Buscar por nombre, teléfono o email..."
          value={searchValue}
          onChange={e => handleSearchChange(e.target.value)}
          style={S.searchInput}
          onFocus={e => { e.target.style.borderColor = '#1E293B'; e.target.style.background = '#FFF' }}
          onBlur={e => { e.target.style.borderColor = '#E2E8F0'; e.target.style.background = '#F8FAFC' }}
        />
        {searchValue && (
          <button onClick={clearSearch} style={S.clearBtn} aria-label="Limpiar búsqueda">
            <X style={{ width: '14px', height: '14px' }} />
          </button>
        )}
      </div>

      {/* Filters + Sede selector */}
      <div style={{ padding: '10px 20px 0' }}>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {(['Todos', 'Activos', 'Inactivos 30d+', 'Nuevos', 'VIP'] as FilterType[]).map(filterBtn)}
        </div>
        {sedes.length > 0 && (
          <select
            value={selectedSede}
            onChange={e => onSedeChange?.(e.target.value)}
            style={S.sedeSelect}
          >
            <option value="all">Todas las sedes</option>
            {sedes.map(s => (
              <option key={s.sede_id} value={s.sede_id}>
                {formatSedeNombre(s.nombre)}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Count */}
      <div style={S.count}>
        {isInitialLoading ? 'Cargando...' : `${clientCount} clientes`}
        {isFetching && !isInitialLoading && (
          <Loader2 style={{ width: '10px', height: '10px', animation: 'spin 1s linear infinite' }} />
        )}
      </div>

      {/* List scroll */}
      <div style={S.listScroll}>
        {error && clientes.length === 0 && !isInitialLoading ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>
            Error al cargar clientes
            <br />
            <button
              onClick={onRetry}
              style={{ marginTop: '8px', background: 'none', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '4px 12px', cursor: 'pointer', fontSize: '12px', color: '#64748B', fontFamily: 'inherit' }}
            >
              Reintentar
            </button>
          </div>
        ) : isInitialLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={S.skeletonRow}>
              <div style={S.skeletonCircle} />
              <div style={{ flex: 1 }}>
                <div style={S.skeletonLine('60%', '13px', '6px')} />
                <div style={{ ...S.skeletonLine('40%', '10px'), background: '#F1F5F9' }} />
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ ...S.skeletonLine('60px', '12px', '4px') }} />
                <div style={{ ...S.skeletonLine('40px', '9px'), background: '#F1F5F9' }} />
              </div>
            </div>
          ))
        ) : clientes.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>
            {searchValue ? 'Sin resultados para la búsqueda' : 'Sin clientes registrados'}
          </div>
        ) : (
          rows
        )}

        {/* Pagination */}
        {!isInitialLoading && totalPages > 1 && (
          <div style={S.pagination}>
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={!tieneAnterior}
              style={S.pgBtn(tieneAnterior)}
            >
              <ChevronLeft style={{ width: '12px', height: '12px' }} />
            </button>
            <span>Pág {currentPage} / {totalPages}</span>
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={!tieneSiguiente}
              style={S.pgBtn(tieneSiguiente)}
            >
              <ChevronRight style={{ width: '12px', height: '12px' }} />
            </button>
          </div>
        )}

        {/* Add client */}
        <div style={S.addWrap}>
          <button onClick={onAddClient} style={S.addBtn}>
            <Plus style={{ width: '12px', height: '12px' }} />
            Nuevo cliente
          </button>
        </div>
      </div>
    </div>
  )
}

export const ClientsList = memo(ClientsListComponent)
