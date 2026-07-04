import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { listUsers, type UserMe } from '../api/auth'
import { listExpedients, type ExpedientItem } from '../api/expedients'

/**
 * Pantalla principal de Proyectos: primera pantalla tras login. Es standalone
 * (topbar propio, sin el sidebar del dashboard). Lista los proyectos
 * (expedientes) ya filtrados por rol desde el backend y, al abrir uno, entra al
 * dashboard escopado a ese proyecto (/proyecto/:id).
 */

const STATUS: Record<string, { label: string; color: string }> = {
  'activo': { label: 'Activo', color: 'oklch(0.75 0.14 155)' },
  'en-riesgo': { label: 'En riesgo', color: 'oklch(0.7 0.17 25)' },
  'en-pausa': { label: 'En pausa', color: 'oklch(0.7 0.02 260)' },
  'completado': { label: 'Completado', color: 'oklch(0.72 0.13 255)' },
}

const Ic = ({ d, size = 16, style }: { d: string; size?: number; style?: CSSProperties }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}
    strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, ...style }}><path d={d} /></svg>
)
const IcSearch = (p: { size?: number; style?: CSSProperties }) => <Ic {...p} d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3" />
const IcGrid = (p: { size?: number }) => <Ic {...p} d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" />
const IcList = (p: { size?: number }) => <Ic {...p} d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
const IcSign = (p: { size?: number; style?: CSSProperties }) => <Ic {...p} d="M3 17s3-6 6-6 4 4 7 4 5-3 5-3M4 21h16" />
const IcFile = (p: { size?: number; style?: CSSProperties }) => <Ic {...p} d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5zM14 3v5h5" />
const IcLogout = (p: { size?: number }) => <Ic {...p} d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
const IcFolder = (p: { size?: number }) => <Ic {...p} d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
const IcChev = (p: { size?: number; style?: CSSProperties }) => <Ic {...p} d="M9 18l6-6-6-6" />
const IcClock = (p: { size?: number; style?: CSSProperties }) => <Ic {...p} d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2" />

const AVATAR_PALETTE = [
  'oklch(0.7 0.14 30)', 'oklch(0.68 0.13 180)', 'oklch(0.7 0.14 290)',
  'oklch(0.7 0.14 130)', 'oklch(0.72 0.12 55)', 'oklch(0.7 0.13 340)',
]
function userInitials(u?: UserMe | null): string {
  if (!u) return '?'
  const a = (u.first_name || '').trim()
  const b = (u.last_name || '').trim()
  if (a || b) return `${a.slice(0, 1)}${b.slice(0, 1)}`.toUpperCase() || '?'
  return (u.email || '?').slice(0, 1).toUpperCase()
}
function userName(u?: UserMe | null): string {
  if (!u) return 'Desconocido'
  const full = `${u.first_name || ''} ${u.last_name || ''}`.trim()
  return full || u.email
}
function userColor(u: UserMe | undefined, id: string): string {
  if (u?.color) return u.color
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length]
}

function Avatar({ u, id, size = 24, ring = false }: { u?: UserMe; id: string; size?: number; ring?: boolean }) {
  return (
    <div title={userName(u)} style={{
      width: size, height: size, borderRadius: size, flexShrink: 0,
      background: userColor(u, id), color: '#fff',
      fontSize: size * 0.4, fontWeight: 600, letterSpacing: '-0.02em',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: ring ? '0 0 0 2px var(--bg-elev)' : 'none',
    }}>{userInitials(u)}</div>
  )
}

function AvatarStack({ ids, byId, size = 24, max = 4 }: { ids: string[]; byId: Map<string, UserMe>; size?: number; max?: number }) {
  const shown = ids.slice(0, max)
  const extra = ids.length - shown.length
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {shown.map((id, i) => (
        <div key={id} style={{ marginLeft: i === 0 ? 0 : -8, zIndex: shown.length - i }}>
          <Avatar u={byId.get(id)} id={id} size={size} ring />
        </div>
      ))}
      {extra > 0 && (
        <div style={{
          marginLeft: -8, width: size, height: size, borderRadius: size, flexShrink: 0,
          background: 'var(--bg-active)', color: 'var(--fg-muted)', boxShadow: '0 0 0 2px var(--bg-elev)',
          fontSize: size * 0.36, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>+{extra}</div>
      )}
    </div>
  )
}

function StatusPill({ status }: { status?: string | null }) {
  const s = STATUS[status ?? 'activo'] ?? STATUS['activo']
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 500,
      padding: '3px 9px', borderRadius: 20, color: s.color,
      background: `color-mix(in oklch, ${s.color} 15%, transparent)`,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 6, background: s.color }} />
      {s.label}
    </span>
  )
}

function RoleBadge({ relation }: { relation: string | null }) {
  if (!relation || relation === 'admin') return null
  const isCoord = relation === 'coord'
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 600, letterSpacing: '0.02em', padding: '2px 8px', borderRadius: 5,
      color: isCoord ? 'var(--accent)' : 'var(--fg-muted)',
      background: isCoord ? 'var(--accent-soft)' : 'var(--bg-active)',
    }}>{isCoord ? 'Coordino' : 'Colaboro'}</span>
  )
}

function ProgressBar({ value, color, height = 5 }: { value: number; color: string; height?: number }) {
  return (
    <div style={{ height, background: 'var(--bg-active)', borderRadius: height, overflow: 'hidden', width: '100%' }}>
      <div style={{ width: `${value}%`, height: '100%', background: color, borderRadius: height, transition: 'width .4s ease' }} />
    </div>
  )
}

function formatUpdated(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short' })
}

function ProjectCard({ p, relation, byId, onOpen }: {
  p: ExpedientItem; relation: string | null; byId: Map<string, UserMe>; onOpen: () => void
}) {
  const s = STATUS[p.status ?? 'activo'] ?? STATUS['activo']
  const coord = byId.get(p.created_by_user_id)
  const members = p.member_user_ids ?? []
  const pending = p.pending_count ?? 0
  return (
    <button className="edms-nav-item" onClick={onOpen} style={{
      textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 14,
      background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 14,
      padding: 18, position: 'relative', overflow: 'hidden', cursor: 'pointer', color: 'var(--fg)',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: s.color, opacity: 0.85 }} />
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10, flexShrink: 0,
          background: `color-mix(in oklch, ${s.color} 16%, var(--bg-elev-2))`, color: s.color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><IcFolder size={19} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <RoleBadge relation={relation} />
          </div>
          <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.25,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</h3>
        </div>
        <StatusPill status={p.status} />
      </div>

      {p.description && (
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--fg-muted)', lineHeight: 1.45, minHeight: 36,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.description}</p>
      )}

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--fg-dim)', marginBottom: 6 }}>
          <span>Progreso</span>
          <span style={{ color: s.color, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{p.progress ?? 0}%</span>
        </div>
        <ProgressBar value={p.progress ?? 0} color={s.color} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 2 }}>
        <Avatar u={coord} id={p.created_by_user_id} size={24} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 10, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Coordinador</div>
          <div style={{ fontSize: 12, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userName(coord)}</div>
        </div>
        <AvatarStack ids={members} byId={byId} size={24} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 2 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fg-muted)' }}>
          <IcFile size={13} /> {p.document_count ?? 0} docs
        </span>
        {pending > 0
          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 500,
              color: 'var(--warn)', padding: '3px 8px', borderRadius: 6, background: 'color-mix(in oklch, var(--warn) 14%, transparent)' }}>
              <IcSign size={12} /> {pending} pendiente{pending === 1 ? '' : 's'}
            </span>
          : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--fg-dim)' }}>
              <IcClock size={12} /> {formatUpdated(p.updated_at)}
            </span>}
      </div>
    </button>
  )
}

function ProjectRow({ p, relation, byId, onOpen }: {
  p: ExpedientItem; relation: string | null; byId: Map<string, UserMe>; onOpen: () => void
}) {
  const s = STATUS[p.status ?? 'activo'] ?? STATUS['activo']
  const coord = byId.get(p.created_by_user_id)
  return (
    <button className="edms-nav-item" onClick={onOpen} style={{
      textAlign: 'left', width: '100%', display: 'grid',
      gridTemplateColumns: 'minmax(190px,2.4fr) 108px minmax(110px,1.1fr) 110px minmax(120px,1.3fr) 18px',
      alignItems: 'center', gap: 14, padding: '13px 18px',
      borderBottom: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--fg)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <div style={{ width: 34, height: 34, borderRadius: 8, flexShrink: 0,
          background: `color-mix(in oklch, ${s.color} 16%, var(--bg-elev-2))`, color: s.color,
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}><IcFolder size={16} /></div>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
            <RoleBadge relation={relation} />
          </div>
          {p.description && <div style={{ fontSize: 11.5, color: 'var(--fg-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.description}</div>}
        </div>
      </div>
      <div><StatusPill status={p.status} /></div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <Avatar u={coord} id={p.created_by_user_id} size={22} />
        <span style={{ fontSize: 12, color: 'var(--fg-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userName(coord).split(' ')[0]}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <AvatarStack ids={p.member_user_ids ?? []} byId={byId} size={22} max={3} />
        <span style={{ fontSize: 11, color: 'var(--fg-dim)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><IcFile size={11} /> {p.document_count ?? 0} docs</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
          <span style={{ color: 'var(--fg-dim)' }}>{formatUpdated(p.updated_at)}</span>
          <span style={{ color: s.color, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{p.progress ?? 0}%</span>
        </div>
        <ProgressBar value={p.progress ?? 0} color={s.color} height={4} />
      </div>
      <IcChev size={15} style={{ color: 'var(--fg-dim)' }} />
    </button>
  )
}

function Section({ title, count, subtitle, children }: { title: string; count: number; subtitle?: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 34 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>{title}</h2>
        <span style={{ fontSize: 12, color: 'var(--fg-dim)', fontVariantNumeric: 'tabular-nums',
          background: 'var(--bg-elev-2)', border: '1px solid var(--border)', padding: '1px 8px', borderRadius: 20 }}>{count}</span>
        {subtitle && <span style={{ fontSize: 12, color: 'var(--fg-muted)', marginLeft: 2 }}>{subtitle}</span>}
      </div>
      {children}
    </section>
  )
}

export default function ProjectsPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [expedients, setExpedients] = useState<ExpedientItem[]>([])
  const [users, setUsers] = useState<UserMe[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [layout, setLayout] = useState<'grid' | 'list'>('grid')

  useEffect(() => {
    let mounted = true
    Promise.all([listExpedients(), listUsers().catch(() => ({ data: [] as UserMe[] }))])
      .then(([exp, usr]) => { if (mounted) { setExpedients(exp.data); setUsers(usr.data ?? []) } })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  const byId = useMemo(() => new Map(users.map((u) => [u.id, u])), [users])
  const isAdmin = Boolean(user?.is_superuser) || Boolean(user?.roles?.includes('admin'))
  const meId = user?.id ?? ''

  const relation = (p: ExpedientItem): string | null =>
    p.created_by_user_id === meId ? 'coord'
      : (p.member_user_ids ?? []).includes(meId) ? 'collab'
        : (isAdmin ? 'admin' : null)

  const match = (p: ExpedientItem) => {
    const q = query.trim().toLowerCase()
    if (q && !p.name.toLowerCase().includes(q) && !(p.description ?? '').toLowerCase().includes(q)) return false
    if (statusFilter !== 'all' && (p.status ?? 'activo') !== statusFilter) return false
    return true
  }

  const groups = useMemo(() => {
    const visible = expedients.filter(match)
    if (isAdmin) {
      return [{ key: 'all', title: 'Todos los proyectos', subtitle: 'Vista de administrador', items: visible }]
    }
    const coord = visible.filter((p) => p.created_by_user_id === meId)
    const collab = visible.filter((p) => p.created_by_user_id !== meId && (p.member_user_ids ?? []).includes(meId))
    const g: { key: string; title: string; subtitle: string; items: ExpedientItem[] }[] = []
    if (coord.length) g.push({ key: 'coord', title: 'Proyectos que coordino', subtitle: 'Eres responsable de estos proyectos', items: coord })
    if (collab.length) g.push({ key: 'collab', title: 'Donde colaboro', subtitle: 'Participas como colaborador', items: collab })
    // Sin relación explícita (ej. creados por otro pero visibles): agrúpalos aparte.
    const rest = visible.filter((p) => p.created_by_user_id !== meId && !(p.member_user_ids ?? []).includes(meId))
    if (rest.length) g.push({ key: 'rest', title: 'Otros proyectos', subtitle: 'Con acceso', items: rest })
    return g
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expedients, isAdmin, meId, query, statusFilter])

  const totalVisible = groups.reduce((a, g) => a + g.items.length, 0)
  const firstName = (user?.first_name || user?.email || '').split(' ')[0]
  const roleLabel = isAdmin ? 'Administrador' : (user?.roles?.[0] ?? 'Colaborador')
  const subtitleByRole = isAdmin
    ? 'Tienes acceso a todos los proyectos del workspace.'
    : 'Los proyectos que coordinas y aquellos en los que colaboras.'

  const onLogout = async () => { await logout(); navigate('/login') }

  return (
    <div style={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)', color: 'var(--fg)' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: 16,
        padding: '12px 26px', borderBottom: '1px solid var(--border)',
        background: 'color-mix(in oklch, var(--bg) 82%, transparent)', backdropFilter: 'blur(10px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--accent)', color: 'var(--accent-fg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15 }}>A</div>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1 }}>Archivo</div>
            <div style={{ fontSize: 10.5, color: 'var(--fg-dim)', marginTop: 2 }}>Proyectos</div>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', maxWidth: 420,
            background: 'var(--bg-elev-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 11px', height: 34 }}>
            <IcSearch size={14} style={{ color: 'var(--fg-dim)' }} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar proyectos…"
              style={{ flex: 1, background: 'transparent', border: 0, outline: 'none', fontSize: 13, color: 'var(--fg)' }} />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-elev-2)', border: '1px solid var(--border)', borderRadius: 7, padding: 2 }}>
          <button className="edms-nav-item" onClick={() => setLayout('grid')} title="Cuadrícula" style={{ padding: '5px 8px', borderRadius: 5,
            color: layout === 'grid' ? 'var(--fg)' : 'var(--fg-dim)', background: layout === 'grid' ? 'var(--bg-active)' : 'transparent' }}><IcGrid size={15} /></button>
          <button className="edms-nav-item" onClick={() => setLayout('list')} title="Lista" style={{ padding: '5px 8px', borderRadius: 5,
            color: layout === 'list' ? 'var(--fg)' : 'var(--fg-dim)', background: layout === 'list' ? 'var(--bg-active)' : 'transparent' }}><IcList size={15} /></button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 6, borderLeft: '1px solid var(--border)' }}>
          <div style={{ textAlign: 'right', lineHeight: 1.2 }}>
            <div style={{ fontSize: 12.5, fontWeight: 500 }}>{userName(user)}</div>
            <div style={{ fontSize: 10.5, color: 'var(--accent)', fontWeight: 600 }}>{roleLabel}</div>
          </div>
          {user && <Avatar u={user} id={user.id} size={30} />}
          <button className="edms-nav-item" onClick={onLogout} title="Cerrar sesión"
            style={{ width: 30, height: 30, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-dim)' }}>
            <IcLogout size={15} />
          </button>
        </div>
      </header>

      <main style={{ flex: 1, width: '100%', maxWidth: 1200, margin: '0 auto', padding: '32px 26px 60px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, marginBottom: 24, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: '0 0 6px', fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em' }}>Hola, {firstName}</h1>
            <p style={{ margin: 0, fontSize: 13.5, color: 'var(--fg-muted)' }}>{subtitleByRole}</p>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[['all', 'Todos'] as [string, string], ...Object.entries(STATUS).map(([k, v]) => [k, v.label] as [string, string])].map(([k, label]) => {
              const active = statusFilter === k
              const c = k === 'all' ? 'var(--accent)' : STATUS[k].color
              return (
                <button key={k} onClick={() => setStatusFilter(k)} style={{
                  fontSize: 12, fontWeight: 500, padding: '5px 11px', borderRadius: 7,
                  border: '1px solid ' + (active ? 'transparent' : 'var(--border)'),
                  color: active ? (k === 'all' ? 'var(--accent-fg)' : '#fff') : 'var(--fg-muted)',
                  background: active ? c : 'var(--bg-elev)', cursor: 'pointer',
                }}>{label}</button>
              )
            })}
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--fg-dim)', fontSize: 13 }}>Cargando proyectos…</div>
        ) : totalVisible === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--fg-dim)' }}>
            <div style={{ width: 52, height: 52, borderRadius: 12, background: 'var(--bg-elev-2)', border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: 'var(--fg-dim)' }}><IcFolder size={24} /></div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg-muted)', marginBottom: 4 }}>Sin proyectos</div>
            <div style={{ fontSize: 13 }}>
              {expedients.length === 0 ? 'No participas en ningún proyecto todavía.' : 'No hay proyectos que coincidan con tu búsqueda o filtro.'}
            </div>
          </div>
        ) : groups.map((g) => (
          <Section key={g.key} title={g.title} count={g.items.length} subtitle={g.subtitle}>
            {layout === 'grid' ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
                {g.items.map((p) => <ProjectCard key={p.id} p={p} relation={relation(p)} byId={byId} onOpen={() => navigate(`/proyecto/${p.id}`)} />)}
              </div>
            ) : (
              <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                {g.items.map((p) => <ProjectRow key={p.id} p={p} relation={relation(p)} byId={byId} onOpen={() => navigate(`/proyecto/${p.id}`)} />)}
              </div>
            )}
          </Section>
        ))}
      </main>
    </div>
  )
}
