"use client"
import { useState, useCallback, CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Cliente } from "../../../types/cliente"
import { EditClientModal } from "./EditClientModal"
import { clientesService } from "./clientesService"
import { useAuth } from "../../../components/Auth/AuthContext"

interface ClientDetailProps {
  client: Cliente
  onBack: () => void
  onClientUpdated?: () => void
}

type Tab = 'resumen' | 'capilar' | 'evolucion' | 'historial' | 'notas'

const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO")
const ini = (n: string) =>
  n.split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()

const fmtDate = (s?: string): string => {
  if (!s) return '—'
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`
  return s
}

const cleanPhone = (phone: string): string => phone.replace(/\D/g, '')
const whatsappUrl = (phone: string) => `https://wa.me/${cleanPhone(phone)}`

const deriveTags = (name: string): string[] => {
  const n = name.toLowerCase()
  const tags: string[] = []
  if (n.includes('color') || n.includes('tinte') || n.includes('baño')) tags.push('Color')
  if (n.includes('mech') || n.includes('balay') || n.includes('baby')) tags.push('Mechas')
  if (n.includes('corte')) tags.push('Corte')
  if (n.includes('keratina')) tags.push('Keratina')
  if (n.includes('hidrat')) tags.push('Hidratación')
  if (n.includes('peinado') || n.includes('definici')) tags.push('Peinado')
  if (n.includes('recons')) tags.push('Reconstrucción')
  if (n.includes('tratam')) tags.push('Tratamiento')
  return tags.length > 0 ? tags : [name.split(' ')[0]]
}

const S: Record<string, CSSProperties> = {
  shell: {
    display: 'flex', flexDirection: 'column', height: '100%',
    overflow: 'hidden', background: '#FFF',
    fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif",
    color: '#1E293B',
  },
  dHeader: {
    padding: '20px 28px', borderBottom: '1px solid #E2E8F0',
    display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0,
  },
  dAvatar: {
    width: '56px', height: '56px', borderRadius: '50%', background: '#1E293B',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '20px', fontWeight: 700, color: '#fff', flexShrink: 0,
  },
  dName: { fontSize: '20px', fontWeight: 700, letterSpacing: '-.3px', color: '#1E293B' },
  dSub: { fontSize: '12px', color: '#64748B', marginTop: '2px', display: 'flex', gap: '12px', flexWrap: 'wrap' },
  dActions: { marginLeft: 'auto', display: 'flex', gap: '6px', flexShrink: 0 },
  dBtn: {
    padding: '7px 14px', border: '1px solid #E2E8F0', borderRadius: '6px',
    fontSize: '11px', color: '#64748B', fontWeight: 500, cursor: 'pointer',
    background: '#FFF', fontFamily: 'inherit',
  },
  dBtnPrimary: {
    padding: '7px 14px', border: '1px solid #1E293B', borderRadius: '6px',
    fontSize: '11px', color: '#fff', fontWeight: 500, cursor: 'pointer',
    background: '#1E293B', fontFamily: 'inherit',
  },
  tabsBar: { display: 'flex', borderBottom: '1px solid #E2E8F0', padding: '0 28px', flexShrink: 0 },
  tab: (active: boolean): CSSProperties => ({
    padding: '10px 16px', fontSize: '12px',
    fontWeight: active ? 600 : 500,
    color: active ? '#1E293B' : '#64748B',
    borderBottom: `2px solid ${active ? '#1E293B' : 'transparent'}`,
    cursor: 'pointer', background: 'none', border: 'none',
    borderBottomStyle: 'solid', fontFamily: 'inherit',
  }),
  body: { flex: 1, overflowY: 'auto' as const, padding: '24px 28px' },
  kpiRow: { display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '10px', marginBottom: '24px' },
  kpi: { padding: '14px', border: '1px solid #E2E8F0', borderRadius: '8px' },
  kpiLabel: { fontSize: '10px', color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '4px' },
  kpiValue: { fontSize: '20px', fontWeight: 700, letterSpacing: '-.3px', color: '#1E293B' },
  kpiSub: { fontSize: '10px', color: '#94A3B8', marginTop: '2px' },
  section: { marginBottom: '28px' },
  sTitle: { fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: '#94A3B8', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  sTitleRight: { fontSize: '10px', fontWeight: 500, color: '#94A3B8', textTransform: 'none', letterSpacing: 0 },
  infoGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' },
  infoItem: { padding: '10px 12px', background: '#F8FAFC', borderRadius: '6px' },
  infoLabel: { fontSize: '10px', color: '#94A3B8', marginBottom: '2px' },
  infoValue: { fontSize: '13px', fontWeight: 500, color: '#1E293B' },
  recBar: { height: '6px', background: '#F1F5F9', borderRadius: '3px', marginTop: '6px' },
  recFill: (pct: number): CSSProperties => ({ height: '100%', background: '#1E293B', borderRadius: '3px', width: `${pct}%` }),
  growthRow: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px' },
  growthCard: { padding: '12px', border: '1px solid #E2E8F0', borderRadius: '8px', textAlign: 'center' },
  growthLabel: { fontSize: '9px', color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: '4px' },
  growthValue: { fontSize: '16px', fontWeight: 700, color: '#1E293B' },
  growthSub: { fontSize: '9px', color: '#94A3B8', marginTop: '2px' },
  hTable: { width: '100%', borderCollapse: 'collapse' as const },
  hTh: { textAlign: 'left' as const, fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: '#94A3B8', padding: '8px 0', borderBottom: '1px solid #E2E8F0' },
  hTd: { padding: '10px 0', borderBottom: '1px solid #F1F5F9', fontSize: '12px', color: '#1E293B' },
  hStatus: { fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', padding: '2px 6px', border: '1px solid #E2E8F0', borderRadius: '3px', color: '#64748B' },
  capGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' },
  capCard: { padding: '14px', border: '1px solid #E2E8F0', borderRadius: '8px' },
  capLabel: { fontSize: '10px', color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '6px' },
  capValue: { fontSize: '14px', fontWeight: 600, color: '#1E293B', marginBottom: '2px' },
  capDetail: { fontSize: '11px', color: '#64748B', lineHeight: '1.5' },
  timeline: { position: 'relative', paddingLeft: '20px' },
  tlItem: { position: 'relative', paddingBottom: '20px' },
  tlDot: { position: 'absolute', left: '-20px', top: '4px', width: '11px', height: '11px', borderRadius: '50%', background: '#1E293B', border: '2px solid #FFF' },
  tlDate: { fontSize: '10px', color: '#94A3B8', fontWeight: 600, marginBottom: '3px' },
  tlContent: { padding: '10px 14px', background: '#F8FAFC', borderRadius: '8px' },
  tlTitle: { fontSize: '13px', fontWeight: 600, color: '#1E293B', marginBottom: '2px' },
  tlDetail: { fontSize: '11px', color: '#64748B', lineHeight: '1.5' },
  tlTags: { display: 'flex', gap: '4px', marginTop: '6px', flexWrap: 'wrap' },
  tlTag: { padding: '2px 8px', border: '1px solid #E2E8F0', borderRadius: '3px', fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.3px', color: '#64748B' },
  noteCard: { padding: '12px 14px', background: '#F8FAFC', borderRadius: '8px', marginBottom: '6px' },
  noteDate: { fontSize: '10px', color: '#94A3B8', marginBottom: '4px' },
  noteText: { fontSize: '12px', lineHeight: '1.5', color: '#1E293B' },
  noteAuthor: { fontSize: '10px', color: '#94A3B8', marginTop: '4px' },
  emptyState: { padding: '20px', textAlign: 'center', color: '#94A3B8', fontSize: '12px' },
}

function ResumenTab({ client }: { client: Cliente }) {
  const visits = client.historialCitas.length
  const daysSince = client.diasSinVenir ?? 0
  const overdue = daysSince > 30
  const lastFour = client.historialCitas.slice(0, 4)

  return (
    <>
      <div style={S.kpiRow}>
        <div style={S.kpi}>
          <div style={S.kpiLabel}>LTV</div>
          <div style={S.kpiValue}>{fmt(client.ltv)}</div>
          <div style={S.kpiSub}>{visits} visitas total</div>
        </div>
        <div style={S.kpi}>
          <div style={S.kpiLabel}>Ticket Promedio</div>
          <div style={S.kpiValue}>{fmt(client.ticketPromedio)}</div>
          <div style={S.kpiSub}>por visita</div>
        </div>
        <div style={S.kpi}>
          <div style={S.kpiLabel}>Recurrencia</div>
          <div style={{ ...S.kpiValue, fontSize: '14px' }}>—</div>
          <div style={S.kpiSub}>no disponible</div>
        </div>
        <div style={S.kpi}>
          <div style={S.kpiLabel}>Días sin venir</div>
          <div style={S.kpiValue}>{daysSince === 0 ? 'Hoy' : `${daysSince} días`}</div>
          <div style={S.kpiSub}>{overdue ? 'Fuera de ciclo' : 'Dentro del rango'}</div>
        </div>
        <div style={S.kpi}>
          <div style={S.kpiLabel}>Rizotipo</div>
          <div style={{ ...S.kpiValue, fontSize: '14px' }}>{client.rizotipo || '—'}</div>
          <div style={S.kpiSub}>{client.nota?.split(',')[0] || ''}</div>
        </div>
      </div>

      <div style={S.section}>
        <div style={S.sTitle}>Indicador de recurrencia</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748B', marginBottom: '4px' }}>
          <span>Última visita: {client.ultima_visita ? fmtDate(client.ultima_visita) : '—'}</span>
          <span>{daysSince}d transcurridos</span>
        </div>
        <div style={S.recBar}>
          <div style={S.recFill(Math.min(100, Math.round((daysSince / 30) * 100)))} />
        </div>
        <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '4px' }}>
          {overdue
            ? `Este cliente lleva ${daysSince - 30} días extra sin visitar`
            : `Último registro hace ${daysSince} días`}
        </div>
      </div>

      <div style={S.section}>
        <div style={S.sTitle}>Información personal</div>
        <div style={S.infoGrid}>
          <div style={S.infoItem}>
            <div style={S.infoLabel}>Teléfono</div>
            <div style={S.infoValue}>{client.telefono}</div>
          </div>
          <div style={S.infoItem}>
            <div style={S.infoLabel}>Email</div>
            <div style={{ ...S.infoValue, fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client.email}</div>
          </div>
          <div style={S.infoItem}>
            <div style={S.infoLabel}>Cliente desde</div>
            <div style={S.infoValue}>{client.fecha_creacion ? fmtDate(client.fecha_creacion) : '—'}</div>
          </div>
          {client.cedula && (
            <div style={S.infoItem}>
              <div style={S.infoLabel}>Cédula</div>
              <div style={S.infoValue}>{client.cedula}</div>
            </div>
          )}
          {client.sede_id && (
            <div style={S.infoItem}>
              <div style={S.infoLabel}>Sede</div>
              <div style={S.infoValue}>{client.sede_id}</div>
            </div>
          )}
        </div>
      </div>

      <div style={S.section}>
        <div style={S.sTitle}>Métricas de crecimiento</div>
        <div style={S.growthRow}>
          <div style={S.growthCard}>
            <div style={S.growthLabel}>Adquisición</div>
            <div style={{ ...S.growthValue, fontSize: '13px' }}>{client.fecha_creacion ? fmtDate(client.fecha_creacion) : '—'}</div>
            <div style={S.growthSub}>Fecha primer visita</div>
          </div>
          <div style={S.growthCard}>
            <div style={S.growthLabel}>Activación</div>
            <div style={S.growthValue}>{visits >= 3 ? 'Activo' : 'En proceso'}</div>
            <div style={S.growthSub}>{visits} visitas</div>
          </div>
          <div style={S.growthCard}>
            <div style={S.growthLabel}>Retención</div>
            <div style={S.growthValue}>{overdue ? 'En riesgo' : 'Retenido'}</div>
            <div style={S.growthSub}>{daysSince}d desde visita</div>
          </div>
          <div style={S.growthCard}>
            <div style={S.growthLabel}>Revenue</div>
            <div style={{ ...S.growthValue, fontSize: '13px' }}>{fmt(client.ticketPromedio)}</div>
            <div style={S.growthSub}>ticket promedio</div>
          </div>
        </div>
      </div>

      {lastFour.length > 0 && (
        <div style={S.section}>
          <div style={S.sTitle}>
            Últimas visitas
            <span style={S.sTitleRight}>{client.historialCitas.length} total</span>
          </div>
          <table style={S.hTable}>
            <thead>
              <tr>
                <th style={S.hTh}>Fecha</th>
                <th style={S.hTh}>Servicio</th>
                <th style={S.hTh}>Profesional</th>
                <th style={{ ...S.hTh, textAlign: 'right' }}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {lastFour.map((h, i) => (
                <tr key={i}>
                  <td style={{ ...S.hTd, fontSize: '11px', color: '#64748B', whiteSpace: 'nowrap' }}>{fmtDate(h.fecha)}</td>
                  <td style={{ ...S.hTd, fontWeight: 600 }}>{h.servicio}</td>
                  <td style={{ ...S.hTd, color: '#64748B' }}>{h.profesional}</td>
                  <td style={{ ...S.hTd, textAlign: 'right', fontWeight: 700, fontSize: '13px' }}>
                    {typeof h.valor_total === 'number' ? fmt(h.valor_total) : h.valor_total ? `$${h.valor_total}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function CapilarTab({ client }: { client: Cliente }) {
  const lastFicha = client.fichas?.[0]
  const datos = lastFicha?.datos_especificos

  return (
    <>
      <div style={S.section}>
        <div style={S.sTitle}>Diagnóstico capilar</div>
        <div style={S.capGrid}>
          <div style={S.capCard}>
            <div style={S.capLabel}>Rizotipo</div>
            <div style={S.capValue}>{client.rizotipo || '—'}</div>
            <div style={S.capDetail}>Clasificación André Walker</div>
          </div>
          <div style={S.capCard}>
            <div style={S.capLabel}>Porosidad</div>
            <div style={S.capValue}>{datos?.porosidad || '—'}</div>
            <div style={S.capDetail}>
              {datos?.porosidad === 'Alta' ? 'Absorbe rápido, pierde hidratación'
                : datos?.porosidad === 'Baja' ? 'Resistente a absorber producto'
                : 'Absorción equilibrada'}
            </div>
          </div>
          <div style={S.capCard}>
            <div style={S.capLabel}>Densidad</div>
            <div style={S.capValue}>{datos?.densidad || '—'}</div>
            <div style={S.capDetail}>Cantidad de cabello por cm²</div>
          </div>
          <div style={S.capCard}>
            <div style={S.capLabel}>Cuero cabelludo</div>
            <div style={S.capValue}>{datos?.oleosidad || datos?.exterior_lipidico || '—'}</div>
          </div>
        </div>
      </div>
      <div style={S.section}>
        <div style={S.sTitle}>Estado actual del cabello</div>
        <div style={{ ...S.infoItem, padding: '16px', borderRadius: '8px' }}>
          <div style={{ ...S.infoValue, fontSize: '14px', lineHeight: '1.6' }}>
            {datos?.observaciones_generales || lastFicha?.notas_cliente || client.nota || '—'}
          </div>
        </div>
      </div>
      {datos?.recomendaciones_personalizadas && (
        <div style={S.section}>
          <div style={S.sTitle}>Recomendaciones activas</div>
          <div style={S.noteCard}>
            <div style={S.noteText}>{datos.recomendaciones_personalizadas}</div>
          </div>
        </div>
      )}
    </>
  )
}

function EvolucionTab({ client }: { client: Cliente }) {
  const fichas = client.fichas ?? []
  const items = fichas.length > 0
    ? fichas.map(f => ({
        date: fmtDate(f.fecha_ficha),
        title: f.servicio_nombre,
        detail: f.comentario_interno || f.notas_cliente || '—',
        stylist: f.profesional_nombre || '—',
        tags: deriveTags(f.servicio_nombre),
      }))
    : client.historialCitas.map(h => ({
        date: fmtDate(h.fecha),
        title: h.servicio,
        detail: h.notas || '—',
        stylist: h.profesional,
        tags: deriveTags(h.servicio),
      }))

  if (items.length === 0) {
    return <div style={S.emptyState}>Sin registros de evolución</div>
  }

  return (
    <div style={S.section}>
      <div style={S.sTitle}>
        Evolución capilar
        <span style={S.sTitleRight}>{items.length} registros</span>
      </div>
      <div style={{ ...S.timeline, borderLeft: '1px solid #E2E8F0', paddingLeft: '20px' }}>
        {items.map((ev, i) => (
          <div key={i} style={{ ...S.tlItem, paddingBottom: i === items.length - 1 ? 0 : '20px' }}>
            <div style={S.tlDot} />
            <div style={S.tlDate}>{ev.date}</div>
            <div style={S.tlContent}>
              <div style={S.tlTitle}>{ev.title}</div>
              <div style={S.tlDetail}>{ev.detail}</div>
              <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '4px' }}>Profesional: {ev.stylist}</div>
              <div style={S.tlTags}>
                {ev.tags.map(t => <span key={t} style={S.tlTag}>{t}</span>)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function HistorialTab({ client }: { client: Cliente }) {
  const historial = client.historialCitas
  const total = historial.reduce((s, h) => {
    const v = typeof h.valor_total === 'number' ? h.valor_total : Number(h.valor_total) || 0
    return s + v
  }, 0)

  if (historial.length === 0) {
    return <div style={S.emptyState}>Sin historial de servicios</div>
  }

  return (
    <div style={S.section}>
      <div style={S.sTitle}>
        Historial completo de servicios
        <span style={S.sTitleRight}>{historial.length} visitas</span>
      </div>
      <table style={S.hTable}>
        <thead>
          <tr>
            <th style={S.hTh}>Fecha</th>
            <th style={S.hTh}>Servicio</th>
            <th style={S.hTh}>Profesional</th>
            <th style={S.hTh}>Estado</th>
            <th style={{ ...S.hTh, textAlign: 'right' }}>Valor</th>
          </tr>
        </thead>
        <tbody>
          {historial.map((h, i) => (
            <tr key={i}>
              <td style={{ ...S.hTd, fontSize: '11px', color: '#64748B', whiteSpace: 'nowrap' }}>{fmtDate(h.fecha)}</td>
              <td style={{ ...S.hTd, fontWeight: 600 }}>{h.servicio}</td>
              <td style={{ ...S.hTd, color: '#64748B' }}>{h.profesional}</td>
              <td style={S.hTd}>
                <span style={S.hStatus}>
                  {h.estado_pago === 'pagado' ? 'Completada' : h.estado_pago || h.estado || 'Pendiente'}
                </span>
              </td>
              <td style={{ ...S.hTd, textAlign: 'right', fontWeight: 700, fontSize: '13px' }}>
                {typeof h.valor_total === 'number' ? fmt(h.valor_total) : h.valor_total ? `$${h.valor_total}` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {total > 0 && (
        <div style={{ marginTop: '16px', padding: '12px', background: '#F8FAFC', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
          <span style={{ color: '#64748B' }}>Total gastado en servicios</span>
          <span style={{ fontWeight: 700, fontSize: '14px' }}>{fmt(total)}</span>
        </div>
      )}
    </div>
  )
}

function NotasTab({ client, onNoteAdded }: { client: Cliente; onNoteAdded?: () => void }) {
  const { user } = useAuth()
  const [newNote, setNewNote] = useState('')
  const [saving, setSaving] = useState(false)

  const getToken = () =>
    user?.access_token ||
    sessionStorage.getItem("access_token") ||
    localStorage.getItem("access_token") ||
    ""

  const autorName = user?.name || user?.nombre_local || ''

  const handleSave = useCallback(async () => {
    if (!newNote.trim()) return
    const token = getToken()
    if (!token) return
    setSaving(true)
    try {
      await clientesService.agregarNota(token, client.id, newNote.trim(), autorName)
      setNewNote('')
      onNoteAdded?.()
    } catch (err) {
      console.error("Error guardando nota:", err)
    } finally {
      setSaving(false)
    }
  }, [newNote, client.id, onNoteAdded, autorName])

  const notes = Array.isArray((client as any).notas_historial)
    ? (client as any).notas_historial as Array<{ contenido: string; fecha: string; autor?: string }>
    : client.nota
    ? [{ contenido: client.nota, fecha: '', autor: '' }]
    : []

  return (
    <div style={S.section}>
      <div style={S.sTitle}>Notas del profesional</div>

      {notes.length === 0 ? (
        <div style={S.emptyState}>Sin notas registradas</div>
      ) : (
        notes.map((n, i) => (
          <div key={i} style={S.noteCard}>
            {n.fecha && (
              <div style={S.noteDate}>{fmtDate(n.fecha)}</div>
            )}
            <div style={S.noteText}>{n.contenido}</div>
            {n.autor && (
              <div style={S.noteAuthor}>— {n.autor}</div>
            )}
          </div>
        ))
      )}

      {/* Input area */}
      <div style={{ marginTop: '12px' }}>
        <textarea
          value={newNote}
          onChange={e => setNewNote(e.target.value)}
          placeholder="Agregar nota..."
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSave()
          }}
          style={{
            width: '100%', padding: '12px', border: '1px solid #E2E8F0',
            borderRadius: '8px', fontSize: '12px', minHeight: '80px',
            resize: 'vertical', fontFamily: 'inherit', outline: 'none',
            boxSizing: 'border-box', color: '#1E293B', background: '#FFF',
          }}
          onFocus={e => { e.target.style.borderColor = '#1E293B' }}
          onBlur={e => { e.target.style.borderColor = '#E2E8F0' }}
        />
        {newNote.trim() && (
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              marginTop: '8px', padding: '7px 14px', border: '1px solid #1E293B',
              borderRadius: '6px', fontSize: '11px', color: '#fff',
              fontWeight: 500, cursor: saving ? 'default' : 'pointer',
              background: saving ? '#94A3B8' : '#1E293B',
              fontFamily: 'inherit',
            }}
          >
            {saving ? 'Guardando...' : 'Guardar nota'}
          </button>
        )}
      </div>
    </div>
  )
}

export function ClientDetail({ client, onBack, onClientUpdated }: ClientDetailProps) {
  const [tab, setTab] = useState<Tab>('resumen')
  const [isEditOpen, setIsEditOpen] = useState(false)
  const navigate = useNavigate()

  const handleLlamar = useCallback(() => {
    if (client.telefono && client.telefono !== 'No disponible') {
      window.location.href = `tel:${client.telefono.trim()}`
    }
  }, [client.telefono])

  const handleWhatsApp = useCallback(() => {
    if (client.telefono && client.telefono !== 'No disponible') {
      window.open(whatsappUrl(client.telefono), '_blank', 'noopener,noreferrer')
    }
  }, [client.telefono])

  const handleAgendarCita = useCallback(() => {
    navigate('/agenda', {
      state: {
        clienteNombre: client.nombre,
        clienteId: client.id,
        clienteTelefono: client.telefono,
      },
    })
  }, [navigate, client.nombre, client.id, client.telefono])

  const tabs: { key: Tab; label: string }[] = [
    { key: 'resumen', label: 'Resumen' },
    { key: 'capilar', label: 'Perfil Capilar' },
    { key: 'evolucion', label: 'Evolución' },
    { key: 'historial', label: 'Historial' },
    { key: 'notas', label: 'Notas' },
  ]

  return (
    <div style={S.shell}>
      <div style={S.dHeader}>
        <div style={S.dAvatar}>{ini(client.nombre)}</div>
        <div>
          <div style={S.dName}>{client.nombre}</div>
          <div style={S.dSub}>
            <span>{client.telefono}</span>
            <span>{client.email}</span>
            {client.fecha_creacion && (
              <span>Cliente desde {fmtDate(client.fecha_creacion)}</span>
            )}
          </div>
        </div>
        <div style={S.dActions}>
          <button style={S.dBtn} onClick={handleLlamar}>Llamar</button>
          <button style={S.dBtn} onClick={handleWhatsApp}>WhatsApp</button>
          <button style={S.dBtn} onClick={() => setIsEditOpen(true)}>Editar</button>
          <button style={S.dBtnPrimary} onClick={handleAgendarCita}>Agendar cita</button>
        </div>
      </div>

      <div style={S.tabsBar}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={S.tab(tab === t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={S.body}>
        {tab === 'resumen' && <ResumenTab client={client} />}
        {tab === 'capilar' && <CapilarTab client={client} />}
        {tab === 'evolucion' && <EvolucionTab client={client} />}
        {tab === 'historial' && <HistorialTab client={client} />}
        {tab === 'notas' && <NotasTab client={client} onNoteAdded={onClientUpdated} />}
      </div>

      {isEditOpen && (
        <EditClientModal
          client={client}
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
          onSuccess={() => { setIsEditOpen(false); onClientUpdated?.() }}
        />
      )}
    </div>
  )
}
