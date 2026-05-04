import { useState, useMemo, useEffect } from 'react'

export interface KanbanDocItem {
  id: string
  name: string
  kind: string
  status: string
  owner: string
  version: number
  tags: string[]
  assignedCount?: number
}

export interface KanbanTagItem {
  id: string
  label: string
  color: string
}

interface KanbanCol {
  id: string
  label: string
  color: string
  bg: string
}

const KANBAN_COLS: KanbanCol[] = [
  { id: 'borrador',        label: 'Borrador',           color: 'var(--fg-dim)',        bg: 'oklch(0.55 0 0 / 0.08)' },
  { id: 'revision',        label: 'En revisión',        color: 'oklch(0.72 0.13 255)', bg: 'oklch(0.35 0.08 255 / 0.12)' },
  { id: 'observado',       label: 'Observado',          color: 'oklch(0.78 0.14 75)',  bg: 'oklch(0.55 0.1 75 / 0.1)' },
  { id: 'pendiente-firma', label: 'Pendiente de firma', color: 'oklch(0.78 0.12 50)',  bg: 'oklch(0.55 0.1 50 / 0.1)' },
  { id: 'aprobado',        label: 'Aprobado',           color: 'oklch(0.75 0.14 155)', bg: 'oklch(0.45 0.1 155 / 0.1)' },
  { id: 'rechazado',       label: 'Rechazado',          color: 'oklch(0.7 0.17 25)',   bg: 'oklch(0.5 0.1 25 / 0.1)' },
]

function normalizeStatus(status: string): string {
  if (status === 'publicado') return 'aprobado'
  if (status === 'firmado') return 'archivado'
  return status
}

function kindTone(kind: string): string {
  if (kind === 'pdf') return '#ff6b6b'
  if (kind === 'sheet') return '#34d399'
  if (kind === 'slide') return '#f59e0b'
  if (kind === 'image') return '#a78bfa'
  return '#6aa8ff'
}

function kindLabel(kind: string): string {
  if (kind === 'pdf') return 'PDF'
  if (kind === 'sheet') return 'XLS'
  if (kind === 'slide') return 'PPT'
  if (kind === 'image') return 'IMG'
  return 'DOC'
}

function ownerInitials(ownerId: string): string {
  return ownerId.slice(0, 2).toUpperCase()
}

interface KanbanCardProps {
  doc: KanbanDocItem
  tags: KanbanTagItem[]
  isDragging: boolean
  onOpen: (id: string) => void
  onDragStart: () => void
  onDragEnd: () => void
}

function KanbanCard({ doc, tags, isDragging, onOpen, onDragStart, onDragEnd }: KanbanCardProps) {
  const tone = kindTone(doc.kind)
  const docTags = tags.filter((t) => doc.tags.includes(t.id))

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(doc.id)}
      style={{
        background: 'var(--bg-elev)',
        border: `1px solid ${isDragging ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 8,
        padding: '10px 12px',
        cursor: 'grab',
        opacity: isDragging ? 0.45 : 1,
        boxShadow: isDragging ? '0 8px 24px rgba(0,0,0,0.35)' : '0 1px 3px rgba(0,0,0,0.15)',
        transition: 'box-shadow 0.15s, border-color 0.15s, opacity 0.15s',
        userSelect: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
      onMouseEnter={(e) => { if (!isDragging) e.currentTarget.style.borderColor = 'var(--border-strong)' }}
      onMouseLeave={(e) => { if (!isDragging) e.currentTarget.style.borderColor = 'var(--border)' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <span style={{
          fontSize: 9,
          fontFamily: 'JetBrains Mono, monospace',
          fontWeight: 700,
          padding: '2px 5px',
          borderRadius: 3,
          flexShrink: 0,
          marginTop: 1,
          color: tone,
          background: `color-mix(in oklch, ${tone} 16%, transparent)`,
        }}>{kindLabel(doc.kind)}</span>
        <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--fg)', lineHeight: 1.35, flex: 1 }}>
          {doc.name}
        </span>
      </div>

      {docTags.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {docTags.slice(0, 2).map((t) => (
            <span key={t.id} style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '1px 6px',
              borderRadius: 10,
              fontSize: 10.5,
              color: t.color,
              background: `color-mix(in oklch, ${t.color} 14%, transparent)`,
            }}>{t.label}</span>
          ))}
          {docTags.length > 2 && (
            <span style={{ fontSize: 10.5, color: 'var(--fg-dim)' }}>+{docTags.length - 2}</span>
          )}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            width: 20, height: 20, borderRadius: 10,
            background: 'var(--bg-active)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--fg-muted)', fontSize: 8, fontWeight: 700,
            border: '1.5px solid var(--bg-elev)',
            flexShrink: 0,
          }}>{ownerInitials(doc.owner)}</span>
          {doc.assignedCount !== undefined && doc.assignedCount > 0 && (
            <span style={{ fontSize: 10.5, color: 'var(--fg-dim)' }}>
              +{doc.assignedCount} asignado{doc.assignedCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <span style={{ fontSize: 11, color: 'var(--fg-dim)', fontFamily: 'JetBrains Mono, monospace' }}>
          {doc.version > 0 ? `v${doc.version}` : 'v1'}
        </span>
      </div>
    </div>
  )
}

interface KanbanColumnProps {
  col: KanbanCol
  docs: KanbanDocItem[]
  tags: KanbanTagItem[]
  draggingId: string | null
  dragOverCol: string | null
  onOpen: (id: string) => void
  onDragStart: (docId: string, fromCol: string) => void
  onDragOver: (colId: string) => void
  onDrop: (toCol: string) => void
  onDragEnd: () => void
}

function KanbanColumn({ col, docs, tags, draggingId, dragOverCol, onOpen, onDragStart, onDragOver, onDrop, onDragEnd }: KanbanColumnProps) {
  const isOver = dragOverCol === col.id

  return (
    <div style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 12px', marginBottom: 0,
        borderRadius: '8px 8px 0 0',
        background: col.bg,
        border: `1px solid color-mix(in oklch, ${col.color} 22%, transparent)`,
        borderBottom: 'none',
      }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: col.color, flexShrink: 0 }} />
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--fg)', flex: 1 }}>{col.label}</span>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 8,
          background: `color-mix(in oklch, ${col.color} 18%, transparent)`,
          color: col.color,
        }}>{docs.length}</span>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); onDragOver(col.id) }}
        onDrop={(e) => { e.preventDefault(); onDrop(col.id) }}
        style={{
          flex: 1, minHeight: 180,
          padding: '6px 8px',
          borderRadius: '0 0 8px 8px',
          background: isOver
            ? `color-mix(in oklch, ${col.color} 8%, var(--bg-elev-2))`
            : 'var(--bg-elev-2)',
          border: `1px solid ${isOver ? col.color : `color-mix(in oklch, ${col.color} 22%, transparent)`}`,
          borderTop: 'none',
          transition: 'background 0.15s, border-color 0.15s',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}
      >
        {docs.map((doc) => (
          <KanbanCard
            key={doc.id}
            doc={doc}
            tags={tags}
            isDragging={draggingId === doc.id}
            onOpen={onOpen}
            onDragStart={() => onDragStart(doc.id, col.id)}
            onDragEnd={onDragEnd}
          />
        ))}
        {docs.length === 0 && !isOver && (
          <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--fg-dim)', fontSize: 12 }}>
            Sin documentos
          </div>
        )}
        {isOver && draggingId && (
          <div style={{
            height: 60, borderRadius: 7,
            border: `2px dashed ${col.color}`,
            background: `color-mix(in oklch, ${col.color} 8%, transparent)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: col.color, fontSize: 12,
          }}>Soltar aquí</div>
        )}
      </div>
    </div>
  )
}

interface KanbanViewProps {
  docs: KanbanDocItem[]
  tags: KanbanTagItem[]
  onOpen: (id: string) => void
  onStateChange?: (docId: string, newColId: string) => Promise<void>
}

export default function KanbanView({ docs, tags, onOpen, onStateChange }: KanbanViewProps) {
  const [dragging, setDragging] = useState<{ docId: string; fromCol: string } | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)
  const [statuses, setStatuses] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    docs.forEach((d) => { map[d.id] = normalizeStatus(d.status) })
    return map
  })
  const [filterKind, setFilterKind] = useState<string | null>(null)

  useEffect(() => {
    setStatuses((prev) => {
      const next = { ...prev }
      docs.forEach((d) => { next[d.id] = normalizeStatus(d.status) })
      return next
    })
  }, [docs])

  const filtered = useMemo(() =>
    docs.filter((d) => !filterKind || d.kind === filterKind),
    [docs, filterKind],
  )

  const byCol = useMemo(() => {
    const map: Record<string, KanbanDocItem[]> = {}
    KANBAN_COLS.forEach((c) => { map[c.id] = [] })
    filtered.forEach((d) => {
      const colId = statuses[d.id] ?? normalizeStatus(d.status)
      if (colId === 'archivado') return
      if (map[colId]) map[colId].push(d)
      else map['borrador'].push(d)
    })
    return map
  }, [filtered, statuses])

  async function handleDrop(toCol: string) {
    if (!dragging || dragging.fromCol === toCol) {
      setDragging(null)
      setDragOverCol(null)
      return
    }
    const { docId, fromCol } = dragging
    setDragging(null)
    setDragOverCol(null)
    setStatuses((prev) => ({ ...prev, [docId]: toCol }))
    if (onStateChange) {
      try {
        await onStateChange(docId, toCol)
      } catch {
        setStatuses((prev) => ({ ...prev, [docId]: fromCol }))
      }
    }
  }

  const kinds = ['pdf', 'doc', 'sheet', 'slide', 'image']

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
      <div style={{
        padding: '10px 18px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 8,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 12, color: 'var(--fg-dim)' }}>Tipo</span>
        <div style={{ display: 'flex', gap: 5 }}>
          {[null, ...kinds].map((k) => {
            const label = k ? kindLabel(k) : 'Todos'
            const active = filterKind === k
            return (
              <button key={String(k)} onClick={() => setFilterKind(k)} style={{
                padding: '3px 10px', borderRadius: 12, fontSize: 11.5,
                border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                background: active ? 'var(--accent-soft)' : 'var(--bg-elev)',
                color: active ? 'var(--accent)' : 'var(--fg-muted)',
                fontWeight: active ? 500 : 400,
              }}>{label}</button>
            )
          })}
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--fg-dim)' }}>
          {filtered.length} documento{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '18px 18px 32px' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', minWidth: 'max-content' }}>
          {KANBAN_COLS.map((col) => (
            <KanbanColumn
              key={col.id}
              col={col}
              docs={byCol[col.id] ?? []}
              tags={tags}
              draggingId={dragging?.docId ?? null}
              dragOverCol={dragOverCol}
              onOpen={onOpen}
              onDragStart={(docId, fromCol) => setDragging({ docId, fromCol })}
              onDragOver={setDragOverCol}
              onDrop={handleDrop}
              onDragEnd={() => { setDragging(null); setDragOverCol(null) }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
