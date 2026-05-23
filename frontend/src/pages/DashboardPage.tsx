import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import logo from '../assets/logo.png'
import { normalizeMentionToken, notifTimeAgo } from '../lib/text'
import { useAuth } from '../context/AuthContext'
import KanbanView from '../components/kanban/KanbanView'
import { assignRole, createUser, listRoles, listUsers, type RoleItem, type UserMe } from '../api/auth'
import {
  createComment,
  createDocument,
  getDocumentDetail,
  getDocumentMetrics,
  listDocuments,
  listTrashedDocuments,
  moveDocumentToTrash,
  permanentlyDeleteDocument,
  resolveComment,
  restoreDocumentFromTrash,
  unresolveComment,
  updateDocumentMetadata,
  type DocumentActivityItem,
  type DocumentDetailResponse,
  type DocumentDetailTimelineItem,
  type DocumentItemResponse,
  type DocumentMetricsResponse,
  type ListDocumentsParams,
} from '../api/documents'
import {
  assignFileToDocument,
  getFileContent,
  getStorageSummary,
  listTrashedFiles,
  listUnassignedFiles,
  moveFileToTrash,
  permanentlyDeleteAllTrashedFiles,
  permanentlyDeleteFile,
  permanentlyDeleteFiles,
  restoreAllTrashedFiles,
  restoreFileFromTrash,
  restoreFilesFromTrash,
  uploadDocumentFile,
  type StoredFileItem,
} from '../api/files'
import {
  assignTagToDocument,
  listTags,
  createTag,
  updateTag,
  deleteTag,
  getDocumentTags,
  removeTagFromDocument,
  type Tag as ApiTag,
} from '../api/tags'
import {
  addDocumentAssignment,
  assignDocumentAssignee,
  changeDocumentState,
  getAssignmentCounts,
  removeDocumentAssignment,
  updateDocumentAssignmentRole,
} from '../api/workflow'
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from '../api/notifications'
import { getRecentActivity, type ActivityItem as RecentActivityItem } from '../api/activity'
import {
  grantDocumentPermission,
  listDocumentPermissions,
  revokeDocumentPermission,
  PERMISSION_CODES,
  type DocumentPermissionGrant,
} from '../api/permissions'
import {
  attachDocumentsToExpedient,
  createExpedient,
  getExpedient,
  listExpedients,
  type ExpedientDetail,
  type ExpedientItem,
} from '../api/expedients'

type ViewMode = 'list' | 'grid'
type DocKind = 'pdf' | 'doc' | 'sheet' | 'slide' | 'image' | 'sig'
type SelectedView =
  | 'inicio'
  | 'kanban'
  | 'archivos-sin-asignar'
  | 'recientes'
  | 'compartidos'
  | 'favoritos'
  | 'aprobaciones'
  | 'papelera'
  | 'carpeta'
  | 'admin'
  | 'expediente'

interface FolderItem {
  id: string
  name: string
  icon?: string
  count?: number
  shared?: boolean
  children?: FolderItem[]
}

interface UserItem {
  id: string
  name: string
  initials: string
  color: string
}

interface TagItem {
  id: string
  label: string
  color: string
}

interface KindItem {
  label: string
  tone: string
}

interface DocumentItem {
  id: string
  code?: string
  name: string
  kind: DocKind
  description?: string | null
  documentTypeId?: string | null
  confidentialityLevel?: string
  metadataActivity?: DocumentActivityItem[]
  assignee?: string | null
  assignedUserIds?: string[]
  createdAt?: string
  updatedAt?: string
  dueDate?: string | null
  folder: string
  owner: string
  size: string
  modified: string
  version: number
  tags: string[]
  shared: string[]
  status: 'borrador' | 'revision' | 'observado' | 'aprobado' | 'pendiente-firma' | 'rechazado' | 'archivado'
  pages?: number
  rows?: number
  starred?: boolean
  locked?: boolean
}

interface DocumentAttachmentResult {
  attachedUnassignedFileId?: string
  attachedUnassignedFile?: StoredFileItem
  uploadedFile?: File
}

interface ApprovalItem {
  id: string
  docId: string
  title: string
  requester: string
  due: string
  priority: 'alta' | 'media'
}

interface ActivityItem {
  id: string
  who: string
  what: string
  doc: string
  at: string
}

interface FiltersState {
  documentType: string | null
  assignee: string | null
  assigned: string | null
  status: string | null
  date: string | null
}

interface ContextMenuState {
  x: number
  y: number
  docId: string
}

interface FilterPill {
  key: keyof FiltersState
  label: string
  options: [string, string][]
}

interface ActionItem {
  id: string
  icon: ReactNode
  label: string
  danger?: boolean
}

interface MenuItem extends ActionItem {
  shortcut?: string
}

interface DashboardData {
  users: UserItem[]
  folders: FolderItem[]
  tags: TagItem[]
  kinds: Record<DocKind, KindItem>
  docs: DocumentItem[]
  approvals: ApprovalItem[]
  activity: ActivityItem[]
  stats: {
    total: number
    deltaWeek: number
    storage: {
      used: number
      total: number
    }
    pendientes: number
    compartidos: number
  }
}

const dashboardData: DashboardData = {
  users: [
    { id: 'u1', name: 'Laura Ibáñez', initials: 'LI', color: 'oklch(0.7 0.14 30)' },
    { id: 'u2', name: 'Martín Solé', initials: 'MS', color: 'oklch(0.68 0.13 180)' },
    { id: 'u3', name: 'Pablo Quirós', initials: 'PQ', color: 'oklch(0.7 0.14 290)' },
    { id: 'u4', name: 'Eva Restrepo', initials: 'ER', color: 'oklch(0.7 0.14 130)' },
    { id: 'u5', name: 'Diego Manrique', initials: 'DM', color: 'oklch(0.72 0.12 55)' },
    { id: 'u6', name: 'Consultora externa — Bafora', initials: 'BF', color: 'oklch(0.7 0.13 340)' },
  ],
  folders: [
    {
      id: 'root',
      name: 'Archivo',
      icon: 'Home',
      children: [
        {
          id: 'legal',
          name: 'Legal',
          count: 142,
          children: [
            {
              id: 'contratos',
              name: 'Contratos',
              count: 64,
              children: [
                { id: 'vigentes', name: 'Vigentes', count: 41 },
                { id: 'vencidos', name: 'Vencidos', count: 23 },
              ],
            },
            { id: 'compliance', name: 'Compliance', count: 28 },
            { id: 'nda', name: 'NDAs', count: 50 },
          ],
        },
        {
          id: 'finanzas',
          name: 'Finanzas',
          count: 317,
          children: [
            { id: 'facturas', name: 'Facturas 2026', count: 204 },
            { id: 'impuestos', name: 'Impuestos', count: 51 },
            { id: 'auditoria', name: 'Auditoría Q1', count: 62 },
          ],
        },
        {
          id: 'rrhh',
          name: 'RR.HH.',
          count: 89,
          children: [
            { id: 'contratacion', name: 'Contratación', count: 34 },
            { id: 'politicas', name: 'Políticas internas', count: 12 },
          ],
        },
        {
          id: 'producto',
          name: 'Producto',
          count: 208,
          children: [
            { id: 'prds', name: 'PRDs', count: 47 },
            { id: 'research', name: 'Research', count: 63 },
            { id: 'roadmap', name: 'Roadmap', count: 8 },
          ],
        },
        { id: 'clientes', name: 'Clientes (externo)', count: 74, shared: true },
      ],
    },
  ],
  tags: [
    { id: 'confidencial', label: 'Confidencial', color: 'oklch(0.7 0.17 25)' },
    { id: 'urgente', label: 'Urgente', color: 'oklch(0.78 0.14 75)' },
    { id: 'aprobado', label: 'Aprobado', color: 'oklch(0.75 0.14 155)' },
    { id: 'revision', label: 'En revisión', color: 'oklch(0.72 0.13 255)' },
    { id: 'externo', label: 'Compartido externo', color: 'oklch(0.72 0.14 300)' },
  ],
  kinds: {
    pdf: { label: 'PDF', tone: 'oklch(0.7 0.17 25)' },
    doc: { label: 'DOC', tone: 'oklch(0.72 0.13 255)' },
    sheet: { label: 'HOJA', tone: 'oklch(0.75 0.14 155)' },
    slide: { label: 'SLIDE', tone: 'oklch(0.78 0.14 55)' },
    image: { label: 'IMG', tone: 'oklch(0.72 0.14 300)' },
    sig: { label: 'FIRMA', tone: 'oklch(0.7 0.13 200)' },
  },
  docs: [
    { id: 'd01', name: 'Contrato de servicios — Acme Logística v4.2', kind: 'pdf', folder: 'contratos', owner: 'u1', size: '1.4 MB', modified: 'hace 14 min', version: 12, tags: ['revision', 'urgente'], shared: ['u2', 'u3', 'u6'], status: 'pendiente-firma', pages: 24, starred: true },
    { id: 'd02', name: 'NDA Mútuo — Klarva Labs', kind: 'pdf', folder: 'nda', owner: 'u3', size: '312 KB', modified: 'hace 2 h', version: 3, tags: ['confidencial'], shared: ['u1'], status: 'archivado', pages: 6 },
    { id: 'd03', name: 'Política de tratamiento de datos 2026', kind: 'doc', folder: 'compliance', owner: 'u1', size: '640 KB', modified: 'ayer', version: 8, tags: ['aprobado'], shared: ['u2', 'u4', 'u5'], status: 'aprobado', pages: 18, starred: true },
    { id: 'd04', name: 'Análisis financiero Q1 — Borrador', kind: 'sheet', folder: 'auditoria', owner: 'u5', size: '2.8 MB', modified: 'hace 3 h', version: 6, tags: ['revision'], shared: ['u1', 'u2'], status: 'borrador', rows: 4821 },
    { id: 'd05', name: 'PRD — Motor de búsqueda semántica', kind: 'doc', folder: 'prds', owner: 'u3', size: '420 KB', modified: 'hace 1 d', version: 4, tags: [], shared: ['u2', 'u4'], status: 'aprobado', pages: 11 },
    { id: 'd06', name: 'Presentación All-Hands abril', kind: 'slide', folder: 'roadmap', owner: 'u2', size: '14.2 MB', modified: 'hace 2 d', version: 2, tags: ['revision'], shared: ['u1', 'u3', 'u4', 'u5'], status: 'borrador', pages: 38 },
    { id: 'd07', name: 'Nómina — marzo 2026 (cifrado)', kind: 'sheet', folder: 'rrhh', owner: 'u4', size: '890 KB', modified: 'hace 3 d', version: 1, tags: ['confidencial'], shared: [], status: 'archivado', rows: 214, locked: true },
    { id: 'd08', name: 'Plan de investigación — Onboarding B2B', kind: 'doc', folder: 'research', owner: 'u3', size: '1.1 MB', modified: 'hace 4 d', version: 9, tags: ['aprobado'], shared: ['u1', 'u2'], status: 'aprobado', pages: 32 },
    { id: 'd09', name: 'Wireframes — Pantalla de cobro', kind: 'image', folder: 'producto', owner: 'u2', size: '5.4 MB', modified: 'hace 5 d', version: 3, tags: [], shared: ['u3', 'u4'], status: 'borrador' },
    { id: 'd10', name: 'Memorando fiscal — Operaciones México', kind: 'pdf', folder: 'impuestos', owner: 'u5', size: '720 KB', modified: 'hace 6 d', version: 2, tags: ['confidencial', 'aprobado'], shared: ['u1'], status: 'aprobado', pages: 14 },
    { id: 'd11', name: 'Contrato laboral — Plantilla 2026', kind: 'doc', folder: 'contratacion', owner: 'u4', size: '380 KB', modified: 'hace 1 sem', version: 5, tags: ['aprobado'], shared: ['u1'], status: 'aprobado', pages: 9 },
    { id: 'd12', name: 'Factura FE-2026-01842 — Klarva Labs', kind: 'pdf', folder: 'facturas', owner: 'u5', size: '210 KB', modified: 'hace 1 sem', version: 1, tags: [], shared: [], status: 'aprobado', pages: 2 },
    { id: 'd13', name: 'Contrato SaaS — Bafora Consulting', kind: 'pdf', folder: 'clientes', owner: 'u6', size: '980 KB', modified: 'hace 9 d', version: 7, tags: ['externo', 'revision'], shared: ['u1', 'u3', 'u6'], status: 'pendiente-firma', pages: 22, starred: true },
    { id: 'd14', name: 'Auditoría de accesos — Plataforma', kind: 'sheet', folder: 'auditoria', owner: 'u2', size: '3.2 MB', modified: 'hace 11 d', version: 2, tags: ['confidencial'], shared: ['u1'], status: 'borrador', rows: 12090 },
  ],
  approvals: [
    { id: 'a1', docId: 'd01', title: 'Firma — Contrato Acme Logística', requester: 'u1', due: 'hoy, 18:00', priority: 'alta' },
    { id: 'a2', docId: 'd13', title: 'Firma — SaaS Bafora', requester: 'u6', due: 'mañana', priority: 'media' },
    { id: 'a3', docId: 'd04', title: 'Revisión — Análisis Q1', requester: 'u5', due: '24 abr', priority: 'media' },
  ],
  activity: [
    { id: 'ac1', who: 'u2', what: 'comentó en', doc: 'd01', at: 'hace 8 min' },
    { id: 'ac2', who: 'u4', what: 'subió v9 de', doc: 'd08', at: 'hace 42 min' },
    { id: 'ac3', who: 'u6', what: 'solicitó firma en', doc: 'd13', at: 'hace 2 h' },
    { id: 'ac4', who: 'u3', what: 'compartió', doc: 'd05', at: 'hace 3 h' },
    { id: 'ac5', who: 'u1', what: 'aprobó', doc: 'd03', at: 'ayer' },
  ],
  stats: {
    total: 1830,
    deltaWeek: 42,
    storage: { used: 68.4, total: 200 },
    pendientes: 7,
    compartidos: 312,
  },
}

const initialFilters: FiltersState = {
  documentType: null,
  assignee: null,
  assigned: null,
  status: null,
  date: null,
}

const DOCUMENT_TYPE_FILTER_OPTIONS: [string, string][] = [
  ['contrato', 'Contrato'],
  ['informe', 'Informe'],
  ['acta', 'Acta'],
  ['politica', 'Política'],
  ['memorando', 'Memorando'],
  ['planilla', 'Planilla'],
  ['factura', 'Factura'],
  ['presentacion', 'Presentación'],
]

const STATUS_FILTER_OPTIONS: [DocumentItem['status'], string][] = [
  ['borrador', 'Borrador'],
  ['revision', 'En revisión'],
  ['observado', 'Observado'],
  ['aprobado', 'Aprobado'],
  ['pendiente-firma', 'Pendiente de firma'],
  ['rechazado', 'Rechazado'],
  ['archivado', 'Archivado'],
]

const DATE_FILTER_OPTIONS: [string, string][] = [
  ['hoy', 'Hoy'],
  ['semana', 'Últimos 7 días'],
  ['mes', 'Último mes'],
  ['ano', 'Este año'],
]

const initialTweaks = {
  theme: 'dark',
  sidebarCollapsed: false,
  accentHue: 255,
}

const BYTES_IN_GB = 1024 ** 3

function userLabelFromAuth(firstName: string, lastName: string, email: string) {
  const full = `${firstName} ${lastName}`.trim()
  if (full) return full
  return email.split('@')[0]
}

function initialsFromLabel(label: string) {
  const parts = label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || 'ED'
}

function getApiErrorMessage(error: unknown, fallback: string) {
  const response = (error as { response?: { status?: number; data?: { detail?: unknown; message?: unknown } } })?.response
  const detail = response?.data?.detail
  const message = response?.data?.message

  if (response?.status === 413) return 'El archivo supera el tamaño permitido de 100 MB'

  if (typeof detail === 'string' && detail.trim()) return detail
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object' && 'msg' in item) return String(item.msg)
        return null
      })
      .filter(Boolean)
    if (messages.length > 0) return messages.join('. ')
  }
  if (message && typeof message === 'string' && message.trim()) return message
  return fallback
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatUploadedAt(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'fecha no disponible'
  return date.toLocaleString('es-CL', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDocumentDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'fecha no disponible'
  return date.toLocaleString('es-CL', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function dueDateLabel(value?: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Color + tinte + etiqueta relativa segun proximidad del vencimiento. */
function dueUrgency(value?: string | null): { color: string; soft: string; label: string } {
  if (!value) return { color: 'var(--fg-dim)', soft: 'var(--bg-elev-2)', label: '' }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return { color: 'var(--fg-dim)', soft: 'var(--bg-elev-2)', label: '' }
  const dayMs = 86_400_000
  const days = Math.ceil((date.getTime() - Date.now()) / dayMs)
  if (days < 0) return { color: 'var(--danger)', soft: 'var(--danger-soft)', label: 'Vencido' }
  if (days === 0) return { color: 'var(--danger)', soft: 'var(--danger-soft)', label: 'Vence hoy' }
  if (days <= 2) return { color: 'var(--danger)', soft: 'var(--danger-soft)', label: `Vence en ${days} d` }
  if (days <= 7) return { color: 'var(--warn)', soft: 'var(--warn-soft)', label: `Vence en ${days} d` }
  if (days <= 30) return { color: 'var(--warn)', soft: 'var(--warn-soft)', label: `Vence en ${days} d` }
  return { color: 'var(--fg-muted)', soft: 'var(--bg-elev-2)', label: '' }
}

const WORKFLOW_STATE_THEME: Record<string, { label: string; color: string; soft: string }> = {
  borrador:        { label: 'Borrador',           color: 'var(--fg-muted)', soft: 'var(--bg-elev-2)' },
  en_revision:     { label: 'En revisión',        color: 'var(--accent)',   soft: 'var(--accent-soft)' },
  observado:       { label: 'Observado',          color: 'var(--warn)',     soft: 'var(--warn-soft)' },
  pendiente_firma: { label: 'Pendiente de firma', color: 'var(--warn)',     soft: 'var(--warn-soft)' },
  aprobado:        { label: 'Aprobado',           color: 'var(--ok)',       soft: 'var(--ok-soft)' },
  rechazado:       { label: 'Rechazado',          color: 'var(--danger)',   soft: 'var(--danger-soft)' },
  archivado:       { label: 'Archivado',          color: 'var(--fg-dim)',   soft: 'var(--bg-elev-2)' },
}

function StateBadge({ state }: { state?: string | null }) {
  const theme = WORKFLOW_STATE_THEME[state ?? ''] ?? WORKFLOW_STATE_THEME.borrador
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '2px 9px',
        borderRadius: 999,
        fontSize: 11.5,
        fontWeight: 500,
        color: theme.color,
        background: theme.soft,
        border: `1px solid ${theme.color}`,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: 3, background: theme.color, flexShrink: 0 }} />
      {theme.label}
    </span>
  )
}

function docKindFromMime(mimeType: string): DocKind {
  if (mimeType === 'application/pdf') return 'pdf'
  if (mimeType.startsWith('image/')) return 'image'
  return 'doc'
}

function titleFromFilename(filename: string) {
  return filename
    .replace(/\.[^/.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .trim() || filename
}

function docKindFromType(documentTypeId?: string | null): DocKind {
  const normalized = String(documentTypeId ?? '').toLowerCase()
  if (normalized.includes('planilla') || normalized.includes('hoja') || normalized.includes('sheet')) return 'sheet'
  if (normalized.includes('presentacion') || normalized.includes('slide')) return 'slide'
  if (normalized.includes('imagen')) return 'image'
  if (normalized.includes('pdf')) return 'pdf'
  return 'doc'
}

function statusFromWorkflow(stateCode?: string | null): DocumentItem['status'] {
  if (stateCode === 'borrador') return 'borrador'
  if (stateCode === 'en_revision') return 'revision'
  if (stateCode === 'observado') return 'observado'
  if (stateCode === 'aprobado') return 'aprobado'
  if (stateCode === 'pendiente_firma') return 'pendiente-firma'
  if (stateCode === 'rechazado') return 'rechazado'
  if (stateCode === 'archivado') return 'archivado'
  return 'borrador'
}

function statusToWorkflow(statusValue?: string | null) {
  if (statusValue === 'revision') return 'en_revision'
  if (statusValue === 'pendiente-firma') return 'pendiente_firma'
  return statusValue ?? undefined
}

function documentMatchesDateFilter(doc: DocumentItem, value: string | null) {
  if (!value) return true
  const rawDate = doc.updatedAt ?? doc.createdAt
  if (!rawDate) return true
  const date = new Date(rawDate)
  if (Number.isNaN(date.getTime())) return true

  const now = new Date()
  let threshold: Date
  if (value === 'hoy') {
    threshold = new Date(now)
    threshold.setHours(0, 0, 0, 0)
  } else if (value === 'semana') {
    threshold = new Date(now)
    threshold.setDate(now.getDate() - 7)
  } else if (value === 'mes') {
    threshold = new Date(now)
    threshold.setDate(now.getDate() - 30)
  } else if (value === 'ano') {
    threshold = new Date(now.getFullYear(), 0, 1)
  } else {
    return true
  }

  return date >= threshold
}

function documentResponseToItem(document: DocumentItemResponse): DocumentItem {
  const assignedUserIds = document.assigned_user_ids ?? []
  return {
    id: document.id,
    code: document.code,
    name: document.title,
    kind: document.current_file_mime_type
      ? docKindFromMime(document.current_file_mime_type)
      : docKindFromType(document.document_type_id),
    description: document.description ?? null,
    documentTypeId: document.document_type_id ?? null,
    confidentialityLevel: document.confidentiality_level,
    metadataActivity: document.metadata_activity ?? [],
    assignee: document.assignee_user_id ?? document.owner_user_id,
    assignedUserIds,
    createdAt: document.created_at,
    updatedAt: document.updated_at,
    dueDate: document.due_date ?? null,
    folder: document.expedient_id || 'root',
    owner: document.owner_user_id,
    size: 'Sin archivo',
    modified: formatDocumentDate(document.archived_at ?? document.updated_at ?? document.created_at),
    version: 0,
    tags: [],
    shared: assignedUserIds.filter((userId) => userId !== document.owner_user_id),
    status: statusFromWorkflow(document.workflow_state_code),
  }
}

async function withDocumentTags(docs: DocumentItem[]) {
  const entries = await Promise.all(docs.map(async (doc) => {
    try {
      const response = await getDocumentTags(doc.id)
      return [doc.id, response.data.map((tag) => tag.id)] as const
    } catch {
      return [doc.id, doc.tags] as const
    }
  }))
  const tagsByDocument = new Map(entries)
  return docs.map((doc) => ({ ...doc, tags: tagsByDocument.get(doc.id) ?? doc.tags }))
}

function fileKindLabel(mimeType: string) {
  if (mimeType === 'application/pdf') return 'PDF'
  if (mimeType === 'image/png') return 'PNG'
  if (mimeType === 'image/jpeg') return 'JPG'
  return 'ARCH'
}

function fileTone(mimeType: string) {
  if (mimeType === 'application/pdf') return '#ff6b6b'
  if (mimeType.startsWith('image/')) return '#34d399'
  return '#6aa8ff'
}

function metadataFieldLabel(field: string) {
  const labels: Record<string, string> = {
    title: 'titulo',
    description: 'descripcion',
    document_type_id: 'tipo documental',
    expedient_id: 'expediente',
    confidentiality_level: 'confidencialidad',
    due_date: 'fecha de vencimiento',
  }
  return labels[field] ?? field
}

function confidentialityLabel(value?: string | null) {
  const labels: Record<string, string> = {
    publico_interno: 'Publico interno',
    confidencial: 'Confidencial',
    reservado: 'Reservado',
  }
  return labels[value ?? ''] ?? 'Publico interno'
}

async function fetchFileLists() {
  const [unassignedResponse, trashedResponse] = await Promise.all([
    listUnassignedFiles(),
    listTrashedFiles(),
  ])
  return {
    unassignedFiles: unassignedResponse.data,
    trashedFiles: trashedResponse.data,
  }
}

async function fetchStorageSummaryGb() {
  const res = await getStorageSummary()
  return {
    used: Math.round((res.data.used_bytes / BYTES_IN_GB) * 10) / 10,
    total: Math.round((res.data.total_bytes / BYTES_IN_GB) * 10) / 10,
  }
}

function flattenFolders(folders: FolderItem[], acc: FolderItem[] = []) {
  for (const folder of folders) {
    acc.push(folder)
    if (folder.children) flattenFolders(folder.children, acc)
  }
  return acc
}

function getFolderPath(folders: FolderItem[], targetId: string, path: FolderItem[] = []): FolderItem[] | null {
  for (const folder of folders) {
    const nextPath = [...path, folder]
    if (folder.id === targetId) return nextPath
    if (folder.children) {
      const found = getFolderPath(folder.children, targetId, nextPath)
      if (found) return found
    }
  }
  return null
}

function findUserById(userId: string) {
  return dashboardData.users.find((user) => user.id === userId) ?? null
}

function findKind(kindId: DocKind) {
  return dashboardData.kinds[kindId]
}

function findTag(tags: ApiTag[], tagId: string) {
  return tags.find((tag) => tag.id === tagId) ?? null
}

function Ic({
  d,
  size = 16,
  stroke = 1.6,
  fill = 'none',
  children,
  viewBox = '0 0 24 24',
  style,
}: {
  d?: string
  size?: number
  stroke?: number
  fill?: string
  children?: ReactNode
  viewBox?: string
  style?: CSSProperties
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill={fill}
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, ...style }}
    >
      {d ? <path d={d} /> : children}
    </svg>
  )
}

const Icon = {
  Search: (props: Partial<Parameters<typeof Ic>[0]>) => <Ic {...props} d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3" />,
  Plus: (props: Partial<Parameters<typeof Ic>[0]>) => <Ic {...props} d="M12 5v14M5 12h14" />,
  Upload: (props: Partial<Parameters<typeof Ic>[0]>) => <Ic {...props} d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />,
  Folder: (props: Partial<Parameters<typeof Ic>[0]>) => <Ic {...props} d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />,
  FolderOpen: (props: Partial<Parameters<typeof Ic>[0]>) => <Ic {...props} d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1H3V7zM3 9h18l-2 8a2 2 0 0 1-2 1.5H5A2 2 0 0 1 3 17V9z" />,
  File: (props: Partial<Parameters<typeof Ic>[0]>) => <Ic {...props} d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5zM14 3v5h5" />,
  Star: (props: Partial<Parameters<typeof Ic>[0]>) => <Ic {...props} d="M12 3l2.9 6 6.6.9-4.8 4.6 1.2 6.6L12 18l-5.9 3.1 1.2-6.6L2.5 9.9 9.1 9 12 3z" />,
  Users: (props: Partial<Parameters<typeof Ic>[0]>) => <Ic {...props} d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />,
  Check: (props: Partial<Parameters<typeof Ic>[0]>) => <Ic {...props} d="M20 6L9 17l-5-5" />,
  Clock: (props: Partial<Parameters<typeof Ic>[0]>) => <Ic {...props} d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2" />,
  Trash: (props: Partial<Parameters<typeof Ic>[0]>) => <Ic {...props} d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />,
  Tag: (props: Partial<Parameters<typeof Ic>[0]>) => <Ic {...props} d="M20.6 13.4L13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8zM7 7h.01" />,
  Filter: (props: Partial<Parameters<typeof Ic>[0]>) => <Ic {...props} d="M3 4h18l-7 9v6l-4 2v-8L3 4z" />,
  Grid: (props: Partial<Parameters<typeof Ic>[0]>) => <Ic {...props} d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" />,
  List: (props: Partial<Parameters<typeof Ic>[0]>) => <Ic {...props} d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  Chev: (props: Partial<Parameters<typeof Ic>[0]>) => <Ic {...props} d="M9 18l6-6-6-6" />,
  ChevDown: (props: Partial<Parameters<typeof Ic>[0]>) => <Ic {...props} d="M6 9l6 6 6-6" />,
  More: (props: Partial<Parameters<typeof Ic>[0]>) => <Ic {...props} d="M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" />,
  Download: (props: Partial<Parameters<typeof Ic>[0]>) => <Ic {...props} d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />,
  Share: (props: Partial<Parameters<typeof Ic>[0]>) => <Ic {...props} d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13" />,
  Move: (props: Partial<Parameters<typeof Ic>[0]>) => <Ic {...props} d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20" />,
  Scan: (props: Partial<Parameters<typeof Ic>[0]>) => <Ic {...props} d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10" />,
  Signature: (props: Partial<Parameters<typeof Ic>[0]>) => <Ic {...props} d="M3 17s3-6 6-6 4 4 7 4 5-3 5-3M4 21h16" />,
  Bell: (props: Partial<Parameters<typeof Ic>[0]>) => <Ic {...props} d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />,
  Comment: (props: Partial<Parameters<typeof Ic>[0]>) => <Ic {...props} d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  AtSign: (props: Partial<Parameters<typeof Ic>[0]>) => <Ic {...props} d="M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-5.4 8.2" />,
  Panel: (props: Partial<Parameters<typeof Ic>[0]>) => <Ic {...props} d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5zM10 3v18" />,
  Close: (props: Partial<Parameters<typeof Ic>[0]>) => <Ic {...props} d="M18 6L6 18M6 6l12 12" />,
  Eye: (props: Partial<Parameters<typeof Ic>[0]>) => <Ic {...props} d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />,
  Lock: (props: Partial<Parameters<typeof Ic>[0]>) => <Ic {...props} d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" />,
  Branch: (props: Partial<Parameters<typeof Ic>[0]>) => <Ic {...props} d="M6 3v12M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a9 9 0 0 0 9-9" />,
  Home: (props: Partial<Parameters<typeof Ic>[0]>) => <Ic {...props} d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2V9z" />,
  Arrow: (props: Partial<Parameters<typeof Ic>[0]>) => <Ic {...props} d="M5 12h14M13 5l7 7-7 7" />,
  Kanban: (props: Partial<Parameters<typeof Ic>[0]>) => <Ic {...props} d="M3 3h5v18H3zM10 3h5v11h-5zM17 3h5v14h-5z" />,
} as const

function KindBadge({ kind, small = false }: { kind: DocKind; small?: boolean }) {
  const item = findKind(kind)
  return (
    <span
      style={{
        fontSize: small ? 9 : 10,
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        fontWeight: 600,
        padding: small ? '1px 4px' : '2px 5px',
        borderRadius: 3,
        color: item.tone,
        background: `color-mix(in oklch, ${item.tone} 16%, transparent)`,
        letterSpacing: '0.04em',
        flexShrink: 0,
      }}
    >
      {item.label}
    </span>
  )
}

// Directorio global de usuarios reales (current user + workspaceUsers). Lo
// alimenta DashboardPage en cuanto carga; los avatares consultan aqui antes
// de caer al mock o al hash deterministico, asi cada persona tiene un solo
// color en todo el sistema.
interface UsersDirectoryValue {
  resolveColor: (userId?: string | null) => string
  resolveInitials: (userId?: string | null) => string
  resolveLabel: (userId?: string | null) => string
}

const UsersDirectoryContext = createContext<UsersDirectoryValue | null>(null)

function OwnerAvatar({ userId, size = 20 }: { userId: string; size?: number }) {
  const directory = useContext(UsersDirectoryContext)
  const mock = findUserById(userId)
  const resolvedColor = directory?.resolveColor(userId) ?? mock?.color
  const resolvedInitials = mock?.initials ?? directory?.resolveInitials(userId) ?? null
  const resolvedLabel = mock?.name ?? directory?.resolveLabel(userId) ?? userId
  if (!resolvedColor || !resolvedInitials) return null
  return (
    <span
      title={resolvedLabel}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        background: resolvedColor,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#0e0f12',
        fontSize: size * 0.45,
        fontWeight: 600,
        flexShrink: 0,
        border: '1.5px solid var(--bg-elev)',
      }}
    >
      {resolvedInitials}
    </span>
  )
}

function AvatarStack({ ids, max = 3 }: { ids: string[]; max?: number }) {
  const shown = ids.slice(0, max)
  const extra = ids.length - shown.length

  return (
    <div style={{ display: 'inline-flex' }}>
      {shown.map((id, index) => (
        <span key={id} style={{ marginLeft: index === 0 ? 0 : -6 }}>
          <OwnerAvatar userId={id} size={20} />
        </span>
      ))}
      {extra > 0 && (
        <span
          style={{
            marginLeft: -6,
            width: 20,
            height: 20,
            borderRadius: 10,
            background: 'var(--bg-active)',
            color: 'var(--fg-muted)',
            fontSize: 9,
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1.5px solid var(--bg-elev)',
          }}
        >
          +{extra}
        </span>
      )}
    </div>
  )
}

function TagChip({ id, tags }: { id: string; tags: ApiTag[] }) {
  const tag = findTag(tags, id)
  if (!tag) return null
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '1px 6px',
        borderRadius: 10,
        fontSize: 10.5,
        color: tag.color,
        background: `color-mix(in oklch, ${tag.color} 14%, transparent)`,
      }}
    >
      {tag.label}
    </span>
  )
}

function StatusPill({ status }: { status: DocumentItem['status'] }) {
  const map = {
    borrador:          { label: 'Borrador',           color: 'var(--fg-dim)' },
    revision:          { label: 'En revisión',        color: 'oklch(0.72 0.13 255)' },
    observado:         { label: 'Observado',          color: 'oklch(0.78 0.14 75)' },
    aprobado:          { label: 'Aprobado',           color: 'oklch(0.75 0.14 155)' },
    'pendiente-firma': { label: 'Pendiente de firma', color: 'oklch(0.78 0.12 50)' },
    rechazado:         { label: 'Rechazado',          color: 'oklch(0.7 0.17 25)' },
    archivado:         { label: 'Archivado',          color: 'var(--fg-dim)' },
  } as const

  const item = map[status]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: item.color }}>
      <span style={{ width: 6, height: 6, borderRadius: 3, background: item.color }} />
      {item.label}
    </span>
  )
}

function Checkbox({
  checked,
  onChange,
  indeterminate = false,
}: {
  checked: boolean
  onChange: () => void
  indeterminate?: boolean
}) {
  return (
    <button
      onClick={onChange}
      style={{
        width: 16,
        height: 16,
        borderRadius: 4,
        border: `1.4px solid ${checked || indeterminate ? 'var(--accent)' : 'var(--border-strong)'}`,
        background: checked || indeterminate ? 'var(--accent)' : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.1s',
      }}
    >
      {checked && <Icon.Check size={10} stroke={3} style={{ color: 'var(--accent-fg)' }} />}
      {indeterminate && !checked && (
        <span style={{ width: 7, height: 2, background: 'var(--accent-fg)', borderRadius: 1 }} />
      )}
    </button>
  )
}

function highlight(text: string, query: string) {
  if (!query) return text
  const index = text.toLowerCase().indexOf(query)
  if (index < 0) return text
  return (
    <>
      {text.slice(0, index)}
      <mark>{text.slice(index, index + query.length)}</mark>
      {text.slice(index + query.length)}
    </>
  )
}

function documentMatchesSearch(doc: DocumentItem, query: string) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true
  return doc.name.toLowerCase().includes(normalized) || (doc.code ?? '').toLowerCase().includes(normalized)
}

function SearchField({
  value,
  onChange,
  onSelectResult,
  docs,
  loading,
  error,
}: {
  value: string
  onChange: (value: string) => void
  onSelectResult: (docId: string) => void
  docs: DocumentItem[]
  loading?: boolean
  error?: string | null
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  const query = value.trim().toLowerCase()
  const hits = query.length > 0 ? docs.filter((doc) => documentMatchesSearch(doc, query)).slice(0, 6) : []
  const folderHits =
    query.length > 0 && hits.length === 0
      ? flattenFolders(dashboardData.folders)
          .filter((folder) => folder.name.toLowerCase().includes(query) && folder.id !== 'root')
          .slice(0, 3)
      : []

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    function handleShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        ref.current?.querySelector('input')?.focus()
        setOpen(true)
      }
    }

    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleShortcut)

    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleShortcut)
    }
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative', flex: 1, maxWidth: 560, zIndex: open ? 1000 : 1 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'var(--bg-elev-2)',
          border: '1px solid var(--border)',
          borderRadius: 7,
          padding: '6px 10px',
          height: 32,
        }}
      >
        <Icon.Search size={14} style={{ color: 'var(--fg-dim)' }} />
        <input
          value={value}
          onChange={(event) => {
            onChange(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar documentos, carpetas, personas…"
          style={{
            flex: 1,
            background: 'transparent',
            border: 0,
            outline: 'none',
            fontSize: 13,
            color: 'var(--fg)',
          }}
        />
        <kbd
          style={{
            fontSize: 10,
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            color: 'var(--fg-dim)',
            padding: '1px 5px',
            border: '1px solid var(--border)',
            borderRadius: 4,
            background: 'var(--bg)',
          }}
        >
          ⌘K
        </kbd>
      </div>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            background: 'var(--bg-elev)',
            border: '1px solid var(--border)',
            borderRadius: 9,
            boxShadow: 'var(--shadow)',
            zIndex: 1000,
            maxHeight: 'min(520px, calc(100vh - 140px))',
            overflow: 'auto',
            overscrollBehavior: 'contain',
          }}
        >
          {query.length === 0 && (
            <>
              <div
                style={{
                  padding: '10px 14px',
                  fontSize: 11,
                  color: 'var(--fg-dim)',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                }}
              >
                Búsquedas sugeridas
              </div>
              {[
                { q: 'contrato', icon: <Icon.File size={13} /> },
                { q: 'DOC-', icon: <Icon.File size={13} /> },
                { q: 'factura', icon: <Icon.Tag size={13} /> },
              ].map((item) => (
                <button
                  key={item.q}
                  onClick={() => onChange(item.q)}
                  className="edms-nav-item"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 14px',
                    width: '100%',
                    textAlign: 'left',
                    color: 'var(--fg-muted)',
                    fontSize: 13,
                  }}
                >
                  <span style={{ color: 'var(--fg-dim)' }}>{item.icon}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 12 }}>{item.q}</span>
                </button>
              ))}
            </>
          )}

          {folderHits.length > 0 && (
            <>
              <div
                style={{
                  padding: '10px 14px 4px',
                  fontSize: 11,
                  color: 'var(--fg-dim)',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                }}
              >
                Carpetas sin documentos coincidentes
              </div>
              {folderHits.map((folder) => (
                <button
                  key={folder.id}
                  className="edms-nav-item"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 14px',
                    width: '100%',
                    textAlign: 'left',
                    color: 'var(--fg)',
                    fontSize: 13,
                  }}
                >
                  <Icon.Folder size={14} style={{ color: 'var(--fg-dim)' }} />
                  <span>{folder.name}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--fg-dim)' }}>
                    {folder.count ?? 0} docs
                  </span>
                </button>
              ))}
            </>
          )}

          {hits.length > 0 && (
            <>
              <div
                style={{
                  padding: '10px 14px 4px',
                  fontSize: 11,
                  color: 'var(--fg-dim)',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                }}
              >
                Documentos encontrados
              </div>
              {hits.map((doc) => (
                <button
                  key={doc.id}
                  onClick={() => {
                    onSelectResult(doc.id)
                    setOpen(false)
                  }}
                  className="edms-nav-item"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 14px',
                    width: '100%',
                    textAlign: 'left',
                    color: 'var(--fg)',
                    fontSize: 13,
                  }}
                >
                  <KindBadge kind={doc.kind} small />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {highlight(doc.name, query)}
                    </span>
                    {doc.code && (
                      <span
                        style={{
                          display: 'block',
                          marginTop: 2,
                          fontSize: 10.5,
                          color: 'var(--fg-dim)',
                          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {highlight(doc.code, query)}
                      </span>
                    )}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{doc.modified}</span>
                </button>
              ))}
            </>
          )}

          {query.length > 0 && loading && hits.length === 0 && (
            <div style={{ padding: '18px 14px', fontSize: 13, color: 'var(--fg-dim)', textAlign: 'center' }}>
              Buscando documentos autorizados…
            </div>
          )}

          {query.length > 0 && error && (
            <div style={{ padding: '18px 14px', fontSize: 13, color: 'var(--danger)', textAlign: 'center' }}>
              {error}
            </div>
          )}

          {query.length > 0 && !loading && !error && hits.length === 0 && folderHits.length === 0 && (
            <div style={{ padding: '18px 14px', fontSize: 13, color: 'var(--fg-dim)', textAlign: 'center' }}>
              {`Sin resultados para "${query}"`}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Crumb({
  children,
  onClick,
  last,
}: {
  children: ReactNode
  onClick: () => void
  last: boolean
}) {
  return (
    <>
      <button
        onClick={onClick}
        className="edms-nav-item"
        style={{
          padding: '3px 6px',
          borderRadius: 5,
          color: last ? 'var(--fg)' : 'var(--fg-muted)',
          fontSize: 13,
          fontWeight: last ? 500 : 400,
        }}
      >
        {children}
      </button>
      {!last && <Icon.Chev size={11} style={{ color: 'var(--fg-dim)' }} />}
    </>
  )
}

function UserMenu({
  userLabel,
  userEmail,
  userInitials,
  userColor,
  onOpenNotifs,
  onAction,
  onLogout,
}: {
  userLabel: string
  userEmail: string
  userInitials: string
  userColor: string
  onOpenNotifs: () => void
  onAction: (action: string) => void
  onLogout: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function handleOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  async function handleLogout() {
    setOpen(false)
    await onLogout()
  }

  const menuItems = [
    { id: 'settings', label: 'Configuración', icon: <Icon.Panel size={14} />, onClick: () => onAction('settings') },
    { id: 'notifications', label: 'Notificaciones', icon: <Icon.Bell size={14} />, onClick: onOpenNotifs },
    { id: 'team', label: 'Gestionar equipo', icon: <Icon.Users size={14} />, onClick: () => onAction('team') },
  ] as const

  return (
    <div ref={ref} style={{ position: 'relative', marginLeft: 6 }}>
      <button
        onClick={() => setOpen((value) => !value)}
        className="edms-nav-item"
        title={userLabel}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '4px 8px 4px 4px',
          borderRadius: 9,
          background: open ? 'var(--bg-active)' : 'transparent',
          border: `1px solid ${open ? 'var(--border-strong)' : 'transparent'}`,
          minWidth: 0,
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            background: userColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {userInitials}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
          <span
            style={{
              maxWidth: 140,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              color: 'var(--fg)',
              fontSize: 12.5,
              fontWeight: 600,
              lineHeight: 1.15,
            }}
          >
            {userLabel}
          </span>
          <span style={{ color: 'var(--fg-dim)', fontSize: 10.5, lineHeight: 1.15 }}>
            Mi cuenta
          </span>
        </div>
        <Icon.ChevDown size={12} style={{ color: open ? 'var(--fg)' : 'var(--fg-dim)' }} />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: 220,
            background: 'var(--bg-elev)',
            border: '1px solid var(--border-strong)',
            borderRadius: 10,
            boxShadow: 'var(--shadow)',
            overflow: 'hidden',
            zIndex: 80,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 12px 10px',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                background: userColor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: 12,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {userInitials}
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  color: 'var(--fg)',
                  fontSize: 12.5,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {userLabel}
              </div>
              <div
                style={{
                  color: 'var(--fg-dim)',
                  fontSize: 11,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {userEmail}
              </div>
            </div>
          </div>

          <div style={{ padding: 6 }}>
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setOpen(false)
                  item.onClick()
                }}
                className="edms-nav-item"
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 10px',
                  borderRadius: 7,
                  color: 'var(--fg-muted)',
                  fontSize: 12.5,
                  textAlign: 'left',
                }}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}

            <button
              onClick={handleLogout}
              className="edms-nav-item"
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 10px',
                borderRadius: 7,
                color: 'var(--danger)',
                fontSize: 12.5,
                textAlign: 'left',
              }}
            >
              <Icon.Arrow size={14} style={{ transform: 'rotate(180deg)' }} />
              <span>Cerrar sesión</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Topbar({
  breadcrumb,
  onCrumbClick,
  search,
  onSearch,
  searchDocs,
  searchLoading,
  searchError,
  viewMode,
  onViewMode,
  onAction,
  onSelectResult,
  onOpenNotifs,
  notifCount,
  bellRef,
  userLabel,
  userInitials,
  userEmail,
  userColor,
  onLogout,
}: {
  breadcrumb: { id: string; label: string }[]
  onCrumbClick: (crumb: { id: string; label: string }) => void
  search: string
  onSearch: (value: string) => void
  searchDocs: DocumentItem[]
  searchLoading: boolean
  searchError: string | null
  viewMode: ViewMode
  onViewMode: (mode: ViewMode) => void
  onAction: (action: string) => void
  onSelectResult: (docId: string) => void
  onOpenNotifs: () => void
  notifCount: number
  bellRef: React.RefObject<HTMLButtonElement | null>
  userLabel: string
  userInitials: string
  userEmail: string
  userColor: string
  onLogout: () => Promise<void>
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '10px 18px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-elev)',
        flexShrink: 0,
        height: 52,
        position: 'relative',
        zIndex: 100,
        overflow: 'visible',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
        {breadcrumb.map((crumb, index) => (
          <Crumb key={crumb.id} last={index === breadcrumb.length - 1} onClick={() => onCrumbClick(crumb)}>
            {crumb.label}
          </Crumb>
        ))}
      </div>

      <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
        <SearchField
          value={search}
          onChange={onSearch}
          onSelectResult={onSelectResult}
          docs={searchDocs}
          loading={searchLoading}
          error={searchError}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            background: 'var(--bg-elev-2)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: 2,
          }}
        >
          <button
            onClick={() => onViewMode('list')}
            title="Lista"
            style={{
              padding: '4px 6px',
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              color: viewMode === 'list' ? 'var(--fg)' : 'var(--fg-dim)',
              background: viewMode === 'list' ? 'var(--bg-active)' : 'transparent',
            }}
          >
            <Icon.List size={14} />
          </button>
          <button
            onClick={() => onViewMode('grid')}
            title="Cuadrícula"
            style={{
              padding: '4px 6px',
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              color: viewMode === 'grid' ? 'var(--fg)' : 'var(--fg-dim)',
              background: viewMode === 'grid' ? 'var(--bg-active)' : 'transparent',
            }}
          >
            <Icon.Grid size={14} />
          </button>
        </div>

        <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 2px' }} />

        <button
          ref={bellRef}
          onClick={onOpenNotifs}
          className="edms-nav-item"
          title="Notificaciones"
          style={{
            position: 'relative',
            width: 30,
            height: 30,
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--fg-muted)',
          }}
        >
          <Icon.Bell size={15} />
          {notifCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: 5,
                right: 5,
                width: 6,
                height: 6,
                borderRadius: 3,
                background: 'var(--danger)',
              }}
            />
          )}
        </button>

        <div style={{ display: 'flex', gap: 0, marginLeft: 4 }}>
          <button
            onClick={() => onAction('upload')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 10px',
              borderRadius: '6px 0 0 6px',
              background: 'var(--bg-elev-2)',
              border: '1px solid var(--border)',
              color: 'var(--fg)',
              fontSize: 12.5,
              fontWeight: 500,
            }}
          >
            <Icon.Upload size={13} /> Subir
          </button>
          <button
            onClick={() => onAction('new')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 10px',
              borderRadius: '0 6px 6px 0',
              background: 'var(--accent)',
              color: 'var(--accent-fg)',
              fontSize: 12.5,
              fontWeight: 500,
              border: '1px solid var(--accent)',
              borderLeft: 0,
            }}
          >
            <Icon.Plus size={13} /> Nuevo
          </button>
        </div>

        <UserMenu
          userLabel={userLabel}
          userEmail={userEmail}
          userInitials={userInitials}
          userColor={userColor}
          onOpenNotifs={onOpenNotifs}
          onAction={onAction}
          onLogout={onLogout}
        />
      </div>
    </div>
  )
}

function NavItem({
  icon,
  label,
  count,
  active,
  onClick,
  badge,
}: {
  icon: ReactNode
  label: string
  count?: number
  active?: boolean
  onClick: () => void
  badge?: number
}) {
  return (
    <button
      onClick={onClick}
      className="edms-nav-item"
      data-active={active || undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        width: 'calc(100% - 12px)',
        margin: '0 6px',
        padding: '7px 10px',
        borderRadius: 6,
        color: active ? 'var(--fg)' : 'var(--fg-muted)',
        background: active ? 'var(--bg-active)' : 'transparent',
        fontSize: 13,
        textAlign: 'left',
        lineHeight: 1.2,
      }}
    >
      {icon}
      <span
        style={{
          flex: 1,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          fontWeight: active ? 500 : 400,
        }}
      >
        {label}
      </span>
      {count != null && (
        <span style={{ fontSize: 11, color: 'var(--fg-dim)', fontVariantNumeric: 'tabular-nums' }}>{count}</span>
      )}
      {badge != null && (
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            padding: '1px 6px',
            borderRadius: 10,
            background: 'var(--accent-soft)',
            color: 'var(--accent)',
          }}
        >
          {badge}
        </span>
      )}
    </button>
  )
}


function Sidebar({
  collapsed,
  selectedView,
  onSelectView,
  selectedTag,
  onSelectTag,
  unassignedCount,
  onToggleCollapsed,
  storage,
  tags,
  onCreateTag,
  onEditTag,
  onDeleteTag,
  expedients,
  selectedExpedientId,
  onSelectExpedient,
  onCreateExpedient,
  userCount,
  isAdmin = false,
}: {
  collapsed: boolean
  selectedView: SelectedView
  onSelectView: (view: SelectedView) => void
  selectedTag: string | null
  onSelectTag: (tagId: string | null) => void
  unassignedCount: number
  onToggleCollapsed: () => void
  storage: { used: number; total: number }
  tags: ApiTag[]
  onCreateTag: () => void
  onEditTag: (tag: ApiTag) => void
  onDeleteTag: (tagId: string) => void
  expedients: ExpedientItem[]
  selectedExpedientId: string | null
  onSelectExpedient: (expedientId: string) => void
  onCreateExpedient: () => void
  userCount?: number | null
  isAdmin?: boolean
}) {

  if (collapsed) {
    return (
      <aside
        style={{
          width: 52,
          height: '100%',
          background: 'var(--bg-elev)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '12px 0',
          gap: 4,
        }}
      >
        <img
          src={logo}
          alt="Muninn"
          style={{
            width: 50,
            height: 50,
            borderRadius: 7,
            objectFit: 'contain',
            marginBottom: 10,
          }}
        />
        {[
          { id: 'inicio', icon: <Icon.Home size={16} /> },
          { id: 'kanban', icon: <Icon.Kanban size={16} /> },
          { id: 'archivos-sin-asignar', icon: <Icon.File size={16} /> },
          { id: 'recientes', icon: <Icon.Clock size={16} /> },
          { id: 'compartidos', icon: <Icon.Users size={16} /> },
          { id: 'favoritos', icon: <Icon.Star size={16} /> },
          { id: 'aprobaciones', icon: <Icon.Signature size={16} /> },
          { id: 'papelera', icon: <Icon.Trash size={16} /> },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => onSelectView(item.id as SelectedView)}
            title={item.id}
            className="edms-nav-item"
            style={{
              width: 34,
              height: 34,
              borderRadius: 7,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: selectedView === item.id ? 'var(--fg)' : 'var(--fg-muted)',
              background: selectedView === item.id ? 'var(--bg-active)' : 'transparent',
            }}
          >
            {item.icon}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button
          onClick={onToggleCollapsed}
          title="Expandir sidebar"
          style={{
            width: 34,
            height: 34,
            borderRadius: 7,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--fg-dim)',
          }}
        >
          <Icon.Panel size={16} />
        </button>
      </aside>
    )
  }

  return (
    <aside
      style={{
        width: 260,
        height: '100%',
        background: 'var(--bg-elev)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          borderBottom: '1px solid var(--border)',
        }}
      >
        <img
          src={logo}
          alt="Muninn"
          style={{
            width: 50,
            height: 50,
            borderRadius: 7,
            objectFit: 'contain',
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--fg)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            Muninn
          </div>
          <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
            {userCount != null ? `Workspace · ${userCount} personas` : 'Workspace'}
          </div>
        </div>
        <button
          onClick={onToggleCollapsed}
          title="Colapsar"
          className="edms-nav-item"
          style={{
            width: 26,
            height: 26,
            borderRadius: 5,
            color: 'var(--fg-dim)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon.Panel size={14} />
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 12 }}>
        <div style={{ padding: '8px 0 4px' }}>
          <NavItem icon={<Icon.Home size={14} />} label="Inicio" active={selectedView === 'inicio'} onClick={() => onSelectView('inicio')} />
          <NavItem icon={<Icon.Kanban size={14} />} label="Pipeline" active={selectedView === 'kanban'} onClick={() => onSelectView('kanban')} />
          <NavItem
            icon={<Icon.File size={14} />}
            label="Archivos sin asignar"
            badge={unassignedCount > 0 ? unassignedCount : undefined}
            active={selectedView === 'archivos-sin-asignar'}
            onClick={() => onSelectView('archivos-sin-asignar')}
          />
          <NavItem icon={<Icon.Clock size={14} />} label="Recientes" active={selectedView === 'recientes'} onClick={() => onSelectView('recientes')} />
          <NavItem icon={<Icon.Users size={14} />} label="Compartidos conmigo" count={23} active={selectedView === 'compartidos'} onClick={() => onSelectView('compartidos')} />
          <NavItem icon={<Icon.Star size={14} />} label="Favoritos" count={4} active={selectedView === 'favoritos'} onClick={() => onSelectView('favoritos')} />
          <NavItem icon={<Icon.Signature size={14} />} label="Aprobaciones" badge={dashboardData.approvals.length} active={selectedView === 'aprobaciones'} onClick={() => onSelectView('aprobaciones')} />
          <NavItem icon={<Icon.Trash size={14} />} label="Papelera" active={selectedView === 'papelera'} onClick={() => onSelectView('papelera')} />
          {isAdmin && (
            <NavItem
              icon={<Icon.Lock size={14} />}
              label="Panel admin"
              active={selectedView === 'admin'}
              onClick={() => onSelectView('admin')}
            />
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 14px 6px', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--fg-dim)', fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>Etiquetas</span>
          <button
            onClick={onCreateTag}
            style={{ background: 'none', color: 'var(--fg-muted)', fontSize: 16, lineHeight: 1, padding: '0 2px', borderRadius: 4 }}
            title="Nueva etiqueta"
          >+</button>
        </div>
        <div style={{ padding: '0 6px' }}>
          {tags.map((tag) => (
            <div
              key={tag.id}
              style={{ display: 'flex', alignItems: 'center', borderRadius: 6, overflow: 'hidden' }}
              className="edms-nav-item-wrap"
            >
              <button
                onClick={() => onSelectTag(selectedTag === tag.id ? null : tag.id)}
                className="edms-nav-item"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  flex: 1,
                  padding: '6px 10px',
                  borderRadius: 6,
                  background: selectedTag === tag.id ? 'var(--bg-active)' : 'transparent',
                  color: selectedTag === tag.id ? 'var(--fg)' : 'var(--fg-muted)',
                  fontSize: 13,
                  textAlign: 'left',
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: 2, background: tag.color, flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{tag.label}</span>
              </button>
              <div style={{ display: 'flex', gap: 2, paddingRight: 4 }}>
                <button
                  onClick={() => onEditTag(tag)}
                  style={{ background: 'none', color: 'var(--fg-dim)', fontSize: 11, padding: '2px 4px', borderRadius: 3 }}
                  title="Editar"
                >✎</button>
                <button
                  onClick={() => onDeleteTag(tag.id)}
                  style={{ background: 'none', color: 'var(--fg-dim)', fontSize: 11, padding: '2px 4px', borderRadius: 3 }}
                  title="Eliminar"
                >✕</button>
              </div>
            </div>
          ))}
          {tags.length === 0 && (
            <div style={{ padding: '6px 10px', fontSize: 12, color: 'var(--fg-dim)' }}>Sin etiquetas</div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 14px 6px', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--fg-dim)', fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>Expedientes</span>
          <button
            onClick={onCreateExpedient}
            style={{ background: 'none', color: 'var(--fg-muted)', fontSize: 16, lineHeight: 1, padding: '0 2px', borderRadius: 4 }}
            title="Nuevo expediente"
          >+</button>
        </div>
        <div style={{ padding: '0 6px' }}>
          {expedients.map((exp) => {
            const active = selectedView === 'expediente' && selectedExpedientId === exp.id
            return (
              <button
                key={exp.id}
                onClick={() => onSelectExpedient(exp.id)}
                className="edms-nav-item"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  width: '100%',
                  padding: '6px 10px',
                  borderRadius: 6,
                  background: active ? 'var(--bg-active)' : 'transparent',
                  color: active ? 'var(--fg)' : 'var(--fg-muted)',
                  fontSize: 13,
                  textAlign: 'left',
                  marginBottom: 1,
                }}
                title={exp.code ? `${exp.name} (${exp.code})` : exp.name}
              >
                <Icon.Folder size={13} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{exp.name}</span>
                {exp.code && (
                  <span style={{ fontSize: 10.5, color: 'var(--fg-dim)', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{exp.code}</span>
                )}
              </button>
            )
          })}
          {expedients.length === 0 && (
            <div style={{ padding: '6px 10px', fontSize: 12, color: 'var(--fg-dim)' }}>Sin expedientes</div>
          )}
        </div>
      </div>

      <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 11,
            color: 'var(--fg-muted)',
            marginBottom: 6,
          }}
        >
          <span>Almacenamiento</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>
            {storage.used} / {storage.total} GB
          </span>
        </div>
        <div style={{ height: 4, background: 'var(--bg-active)', borderRadius: 3, overflow: 'hidden' }}>
          <div
            style={{
              width: `${storage.total > 0 ? (storage.used / storage.total) * 100 : 0}%`,
              height: '100%',
              background: 'var(--accent)',
              borderRadius: 3,
            }}
          />
        </div>
      </div>
    </aside>
  )
}

function FiltersRow({
  filters,
  userOptions,
  onFilters,
  onClear,
}: {
  filters: FiltersState
  userOptions: [string, string][]
  onFilters: (filters: FiltersState) => void
  onClear: () => void
}) {
  const [openKey, setOpenKey] = useState<string | null>(null)

  const pills: FilterPill[] = [
    { key: 'documentType', label: 'Tipo documental', options: DOCUMENT_TYPE_FILTER_OPTIONS },
    { key: 'status', label: 'Estado', options: STATUS_FILTER_OPTIONS },
    { key: 'assignee', label: 'Encargado', options: userOptions },
    { key: 'assigned', label: 'Asignado', options: userOptions },
    { key: 'date', label: 'Fecha', options: DATE_FILTER_OPTIONS },
  ] as const

  const active = Object.entries(filters).filter(([, value]) => value)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '10px 18px',
        borderBottom: '1px solid var(--border)',
        flexWrap: 'wrap',
        position: 'relative',
        zIndex: 80,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--fg-dim)', fontSize: 12, marginRight: 4 }}>
        <Icon.Filter size={12} /> Filtros
      </span>
      {pills.map((pill) => {
        const value = filters[pill.key]
        const activeLabel = value ? pill.options.find((option) => option[0] === value)?.[1] ?? value : null
        return (
          <div key={pill.key} style={{ position: 'relative' }}>
            <button
              onClick={() => setOpenKey(openKey === pill.key ? null : pill.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 10px',
                borderRadius: 14,
                border: '1px solid var(--border)',
                background: value ? 'var(--accent-soft)' : 'var(--bg-elev)',
                color: value ? 'var(--accent)' : 'var(--fg-muted)',
                fontSize: 12,
                fontWeight: value ? 500 : 400,
              }}
            >
              {pill.label}
              {value && <span style={{ color: 'var(--fg)' }}>: {activeLabel}</span>}
              <Icon.ChevDown size={10} />
            </button>

            {openKey === pill.key && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  left: 0,
                  zIndex: 1200,
                  background: 'var(--bg-elev)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  boxShadow: 'var(--shadow)',
                  minWidth: 180,
                  padding: 4,
                }}
              >
                {value && (
                  <button
                    onClick={() => {
                      onFilters({ ...filters, [pill.key]: null })
                      setOpenKey(null)
                    }}
                    className="edms-nav-item"
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '6px 10px',
                      borderRadius: 5,
                      fontSize: 12,
                      color: 'var(--fg-dim)',
                    }}
                  >
                    Limpiar
                  </button>
                )}

                {pill.options.map(([optionValue, optionLabel]) => (
                  <button
                    key={optionValue}
                    onClick={() => {
                      onFilters({ ...filters, [pill.key]: optionValue })
                      setOpenKey(null)
                    }}
                    className="edms-nav-item"
                    style={{
                      display: 'flex',
                      width: '100%',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 10px',
                      borderRadius: 5,
                      fontSize: 12.5,
                      color: 'var(--fg)',
                      textAlign: 'left',
                      background: value === optionValue ? 'var(--bg-active)' : 'transparent',
                    }}
                  >
                    {value === optionValue && <Icon.Check size={11} style={{ color: 'var(--accent)' }} />}
                    <span style={{ marginLeft: value === optionValue ? 0 : 17 }}>{optionLabel}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {active.length > 0 && (
        <button onClick={onClear} style={{ fontSize: 11, color: 'var(--fg-dim)', padding: '4px 6px', marginLeft: 2 }}>
          Limpiar todo
        </button>
      )}
    </div>
  )
}

function ListView({
  docs,
  selected,
  onToggleSelect,
  onSelectAll,
  allSelected,
  onOpenDoc,
  onContextMenu,
  tags,
  emptyTitle = 'Sin documentos',
  emptySubtitle = 'Ajusta los filtros o arrastra archivos aquí para subirlos.',
}: {
  docs: DocumentItem[]
  selected: Set<string>
  onToggleSelect: (id: string) => void
  onSelectAll: () => void
  allSelected: boolean
  onOpenDoc: (docId: string) => void
  onContextMenu: (event: React.MouseEvent, docId: string) => void
  tags: ApiTag[]
  emptyTitle?: string
  emptySubtitle?: string
}) {
  const directory = useContext(UsersDirectoryContext)
  const authorFirstName = (userId: string): string => {
    const mock = findUserById(userId)
    const label = mock?.name ?? directory?.resolveLabel(userId) ?? ''
    return label.split(' ')[0] ?? ''
  }
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '0 8px', position: 'relative', zIndex: 0 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 1 }}>
            <th style={{ width: 36, padding: '10px 4px 10px 10px', textAlign: 'left' }}>
              <Checkbox checked={allSelected} onChange={onSelectAll} indeterminate={selected.size > 0 && !allSelected} />
            </th>
            {['Nombre', 'Etiquetas', 'Autor', 'Estado', 'Versión', 'Compartido con', 'Modificado', 'Tamaño', ''].map((header) => (
              <th
                key={header}
                style={{
                  padding: '10px 12px',
                  textAlign: 'left',
                  fontWeight: 500,
                  color: 'var(--fg-dim)',
                  fontSize: 11,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {docs.map((doc) => {
            const isSelected = selected.has(doc.id)
            return (
              <tr
                key={doc.id}
                onClick={() => onOpenDoc(doc.id)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  onContextMenu(event, doc.id)
                }}
                style={{
                  cursor: 'pointer',
                  background: isSelected ? 'var(--accent-soft)' : 'transparent',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(event) => {
                  if (!isSelected) event.currentTarget.style.background = 'var(--bg-hover)'
                }}
                onMouseLeave={(event) => {
                  if (!isSelected) event.currentTarget.style.background = 'transparent'
                }}
              >
                <td
                  style={{ padding: '8px 4px 8px 10px', borderBottom: '1px solid var(--border)' }}
                  onClick={(event) => {
                    event.stopPropagation()
                    onToggleSelect(doc.id)
                  }}
                >
                  <Checkbox checked={isSelected} onChange={() => onToggleSelect(doc.id)} />
                </td>
                <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                    <KindBadge kind={doc.kind} />
                    {doc.starred && <Icon.Star size={12} style={{ color: 'oklch(0.8 0.14 75)', fill: 'oklch(0.8 0.14 75)' }} />}
                    {doc.locked && <Icon.Lock size={12} style={{ color: 'var(--fg-dim)' }} />}
                    <span style={{ minWidth: 0 }}>
                      <span
                        style={{
                          display: 'block',
                          color: 'var(--fg)',
                          fontWeight: 500,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: 340,
                        }}
                      >
                        {doc.name}
                      </span>
                      {doc.code && (
                        <span
                          style={{
                            display: 'block',
                            marginTop: 2,
                            color: 'var(--fg-dim)',
                            fontSize: 10.5,
                            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: 340,
                          }}
                        >
                          {doc.code}
                        </span>
                      )}
                      {doc.dueDate && (() => {
                        const urg = dueUrgency(doc.dueDate)
                        return (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              marginTop: 4,
                              fontSize: 10,
                              fontWeight: 500,
                              color: urg.color,
                              background: urg.soft,
                              border: `1px solid ${urg.color}`,
                              borderRadius: 999,
                              padding: '1px 7px',
                              alignSelf: 'flex-start',
                            }}
                          >
                            <Icon.Clock size={9} />
                            {urg.label ? `${urg.label} · ` : ''}{dueDateLabel(doc.dueDate)}
                          </span>
                        )
                      })()}
                    </span>
                  </div>
                </td>
                <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {doc.tags.map((tag) => (
                      <TagChip key={tag} id={tag} tags={tags} />
                    ))}
                  </div>
                </td>
                <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', color: 'var(--fg-muted)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <OwnerAvatar userId={doc.owner} size={18} />
                    <span>{authorFirstName(doc.owner)}</span>
                  </div>
                </td>
                <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                  <StatusPill status={doc.status} />
                </td>
                <td
                  style={{
                    padding: '8px 12px',
                    borderBottom: '1px solid var(--border)',
                    color: 'var(--fg-muted)',
                    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                    fontSize: 11.5,
                  }}
                >
                  v{doc.version}
                </td>
                <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                  {doc.shared.length > 0 ? <AvatarStack ids={doc.shared} /> : <span style={{ color: 'var(--fg-dim)', fontSize: 12 }}>—</span>}
                </td>
                <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', color: 'var(--fg-muted)', whiteSpace: 'nowrap' }}>
                  {doc.modified}
                </td>
                <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', color: 'var(--fg-dim)', fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
                  {doc.size}
                </td>
                <td
                  style={{ padding: '8px 12px 8px 4px', borderBottom: '1px solid var(--border)' }}
                  onClick={(event) => {
                    event.stopPropagation()
                    onContextMenu(event, doc.id)
                  }}
                >
                  <button
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 4,
                      color: 'var(--fg-dim)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon.More size={14} />
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {docs.length === 0 && (
        <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--fg-dim)' }}>
          <div style={{ fontSize: 14, marginBottom: 4 }}>{emptyTitle}</div>
          <div style={{ fontSize: 12 }}>{emptySubtitle}</div>
        </div>
      )}
    </div>
  )
}

function GridView({
  docs,
  selected,
  onToggleSelect,
  onOpenDoc,
  onContextMenu,
  emptyTitle = 'Sin documentos',
  emptySubtitle = 'Ajusta los filtros o sube archivos para crear documentos.',
}: {
  docs: DocumentItem[]
  selected: Set<string>
  onToggleSelect: (id: string) => void
  onOpenDoc: (docId: string) => void
  onContextMenu: (event: React.MouseEvent, docId: string) => void
  emptyTitle?: string
  emptySubtitle?: string
}) {
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '16px 18px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 14 }}>
        {docs.map((doc) => {
          const isSelected = selected.has(doc.id)
          const kind = findKind(doc.kind)
          return (
            <div
              key={doc.id}
              onClick={() => onOpenDoc(doc.id)}
              onContextMenu={(event) => {
                event.preventDefault()
                onContextMenu(event, doc.id)
              }}
              style={{
                background: 'var(--bg-elev)',
                border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 10,
                padding: 12,
                cursor: 'pointer',
                transition: 'all 0.12s',
                position: 'relative',
                boxShadow: isSelected ? '0 0 0 3px var(--accent-soft)' : 'none',
              }}
              onMouseEnter={(event) => {
                if (!isSelected) event.currentTarget.style.borderColor = 'var(--border-strong)'
              }}
              onMouseLeave={(event) => {
                if (!isSelected) event.currentTarget.style.borderColor = 'var(--border)'
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 8,
                  left: 8,
                  opacity: isSelected ? 1 : 0,
                  transition: 'opacity 0.1s',
                }}
                onClick={(event) => {
                  event.stopPropagation()
                  onToggleSelect(doc.id)
                }}
              >
                <Checkbox checked={isSelected} onChange={() => onToggleSelect(doc.id)} />
              </div>
              <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4 }}>
                {doc.starred && <Icon.Star size={12} style={{ color: 'oklch(0.8 0.14 75)', fill: 'oklch(0.8 0.14 75)' }} />}
                {doc.locked && <Icon.Lock size={12} style={{ color: 'var(--fg-dim)' }} />}
              </div>

              <div
                style={{
                  height: 110,
                  borderRadius: 6,
                  marginBottom: 10,
                  background: `linear-gradient(135deg, color-mix(in oklch, ${kind.tone} 14%, var(--bg-elev-2)), var(--bg-elev-2))`,
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'flex-end',
                  padding: 8,
                  overflow: 'hidden',
                  position: 'relative',
                }}
              >
                <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, opacity: 0.35 }}>
                  <defs>
                    <pattern id={`stripes-${doc.id}`} patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(45)">
                      <line x1="0" y1="0" x2="0" y2="7" stroke={kind.tone} strokeWidth="1" opacity="0.3" />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill={`url(#stripes-${doc.id})`} />
                </svg>
                <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
                  <div style={{ height: 3, width: '70%', background: 'color-mix(in oklch, currentColor 30%, transparent)', borderRadius: 1, color: kind.tone }} />
                  <div style={{ height: 3, width: '90%', background: 'color-mix(in oklch, currentColor 22%, transparent)', borderRadius: 1, color: kind.tone }} />
                  <div style={{ height: 3, width: '55%', background: 'color-mix(in oklch, currentColor 22%, transparent)', borderRadius: 1, color: kind.tone }} />
                </div>
                <div style={{ position: 'absolute', top: 8, left: 8 }}>
                  <KindBadge kind={doc.kind} />
                </div>
              </div>

              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--fg)',
                  marginBottom: 6,
                  lineHeight: 1.3,
                  display: '-webkit-box' as CSSProperties['display'],
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  minHeight: 34,
                }}
              >
                {doc.name}
              </div>
              {doc.code && (
                <div
                  style={{
                    marginTop: -2,
                    marginBottom: 8,
                    color: 'var(--fg-dim)',
                    fontSize: 10.5,
                    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {doc.code}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--fg-dim)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <OwnerAvatar userId={doc.owner} size={16} />
                  <span>{doc.modified}</span>
                </div>
                {doc.shared.length > 0 && <AvatarStack ids={doc.shared} max={2} />}
              </div>
            </div>
          )
        })}
      </div>
      {docs.length === 0 && (
        <div style={{ padding: '44px 20px', textAlign: 'center', color: 'var(--fg-dim)' }}>
          <div style={{ fontSize: 14, marginBottom: 4 }}>{emptyTitle}</div>
          <div style={{ fontSize: 12 }}>{emptySubtitle}</div>
        </div>
      )}
    </div>
  )
}

function OverviewCards({ storage, metrics }: { storage: { used: number; total: number }; metrics: DocumentMetricsResponse | null }) {
  const total = metrics?.total ?? 0
  const pendientesFirma = metrics?.pendientes_firma ?? 0
  const vencenHoy = metrics?.vencen_hoy ?? 0
  const vencidos = metrics?.vencidos ?? 0
  const pendientesRevision = metrics?.pendientes_revision ?? 0
  const cards = [
    {
      label: 'Documentos totales',
      value: total.toLocaleString('es-ES'),
      delta: metrics ? `${total} activos` : 'cargando...',
      deltaTone: 'var(--fg-muted)',
      accent: 'var(--accent)',
      icon: <Icon.File size={15} />,
    },
    {
      label: 'Pendientes de firma',
      value: pendientesFirma,
      delta: vencenHoy > 0 ? `${vencenHoy} vencen hoy` : 'al dia',
      deltaTone: vencenHoy > 0 ? 'var(--warn)' : 'var(--ok)',
      accent: 'var(--warn)',
      icon: <Icon.Signature size={15} />,
    },
    {
      label: 'En revision',
      value: pendientesRevision,
      delta: vencidos > 0 ? `${vencidos} vencidos` : 'sin vencidos',
      deltaTone: vencidos > 0 ? 'var(--danger)' : 'var(--fg-muted)',
      accent: 'var(--accent)',
      icon: <Icon.Eye size={15} />,
    },
    {
      label: 'Almacenamiento',
      value: `${storage.used} GB`,
      delta: `${storage.total > 0 ? Math.round((storage.used / storage.total) * 100) : 0}% usado`,
      deltaTone: 'var(--fg-muted)',
      accent: 'var(--ok)',
      icon: <Icon.Folder size={15} />,
    },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, padding: '16px 18px 4px' }}>
      {cards.map((card) => (
        <div
          key={card.label}
          style={{
            position: 'relative',
            background: 'var(--bg-elev)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '12px 14px 12px 16px',
            boxShadow: 'var(--shadow-sm)',
            overflow: 'hidden',
          }}
        >
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: card.accent }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 11.5, color: 'var(--fg-dim)', letterSpacing: '0.02em' }}>{card.label}</span>
            <span
              style={{
                width: 26,
                height: 26,
                borderRadius: 7,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: card.accent,
                background: `color-mix(in oklch, ${card.accent} 15%, transparent)`,
                flexShrink: 0,
              }}
            >
              {card.icon}
            </span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1, marginBottom: 6 }}>{card.value}</div>
          <div style={{ fontSize: 11, color: card.deltaTone }}>{card.delta}</div>
        </div>
      ))}
    </div>
  )
}

function ApprovalsPanel({ onOpenDoc }: { onOpenDoc: (docId: string) => void }) {
  return (
    <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <div
        style={{
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon.Signature size={14} style={{ color: 'var(--warn)' }} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>Pendientes de tu revisión</span>
          <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 10, background: 'var(--bg-active)', color: 'var(--fg-muted)' }}>
            {dashboardData.approvals.length}
          </span>
        </div>
        <button style={{ fontSize: 12, color: 'var(--fg-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
          Ver todo <Icon.Arrow size={11} />
        </button>
      </div>

      {dashboardData.approvals.map((approval) => (
        <div
          key={approval.id}
          onClick={() => onOpenDoc(approval.docId)}
          className="edms-nav-item"
          style={{
            padding: '10px 14px',
            borderBottom: '1px solid var(--border)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div
            style={{
              width: 4,
              alignSelf: 'stretch',
              background: approval.priority === 'alta' ? 'var(--danger)' : 'var(--warn)',
              borderRadius: 2,
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {approval.title}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', display: 'flex', gap: 10 }}>
              <span>
                Solicitado por <b style={{ color: 'var(--fg-muted)', fontWeight: 500 }}>{findUserById(approval.requester)?.name.split(' ')[0]}</b>
              </span>
              <span>·</span>
              <span style={{ color: approval.priority === 'alta' ? 'var(--danger)' : 'var(--fg-muted)' }}>
                Vence {approval.due}
              </span>
            </div>
          </div>
          <button
            onClick={(event) => event.stopPropagation()}
            style={{
              padding: '5px 10px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--bg-elev-2)',
              color: 'var(--fg)',
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            Revisar
          </button>
        </div>
      ))}
    </div>
  )
}

const ACTOR_AVATAR_PALETTE = [
  'oklch(0.74 0.16 25)',   // salmon
  'oklch(0.78 0.15 55)',   // orange
  'oklch(0.76 0.15 150)',  // green
  'oklch(0.73 0.13 245)',  // azul
  'oklch(0.72 0.17 295)',  // violeta
  'oklch(0.73 0.18 330)',  // rosa
  'oklch(0.75 0.14 200)',  // turquesa
  'oklch(0.78 0.15 90)',   // amarillo
]

function actorColorFromId(actorId: string | null | undefined): string {
  if (!actorId) return 'var(--bg-elev-2)'
  let hash = 0
  for (let i = 0; i < actorId.length; i += 1) {
    hash = (hash * 31 + actorId.charCodeAt(i)) >>> 0
  }
  return ACTOR_AVATAR_PALETTE[hash % ACTOR_AVATAR_PALETTE.length]
}

function activityVerb(type: string): string {
  switch (type) {
    case 'nuevo_comentario': return 'comentó en'
    case 'mencion': return 'te mencionó en'
    case 'cambio_estado': return 'movió a otro estado'
    case 'asignacion_encargado': return 'te asignó como encargado de'
    case 'asignacion_rol': return 'te asignó en'
    case 'subio_version': return 'subió una versión de'
    case 'firma_solicitud': return 'solicitó firma en'
    case 'aprobacion': return 'aprobó'
    case 'compartido': return 'compartió'
    case 'metadata_actualizada': return 'actualizó metadata'
    case 'fecha_vencimiento': return 'actualizó la fecha de vencimiento'
    default: return 'actualizó'
  }
}

function activityTarget(item: RecentActivityItem): string {
  // En eventos de metadata el body describe el cambio puntual; preferimos
  // mostrar eso. En el resto, mostramos el documento como target.
  if (item.type === 'metadata_actualizada' || item.type === 'fecha_vencimiento') {
    return item.body ?? item.document_name ?? ''
  }
  return item.document_name ?? item.body ?? ''
}

function ActivityPanel({
  items,
  onOpenDoc,
  userLabel,
  userColor,
}: {
  items: RecentActivityItem[]
  onOpenDoc: (documentId: string) => void
  userLabel: (userId?: string | null) => string
  userColor: (userId?: string | null) => string
}) {
  return (
    <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon.Clock size={14} style={{ color: 'var(--fg-muted)' }} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>Actividad reciente</span>
        </div>
      </div>
      {items.length === 0 ? (
        <div style={{ padding: '24px 14px', fontSize: 12, color: 'var(--fg-muted)', textAlign: 'center' }}>
          No hay actividad reciente
        </div>
      ) : (
        <div style={{ padding: '6px 0' }}>
          {items.map((item) => {
            const navigable = Boolean(item.document_id)
            const actorName = item.actor_user_id ? userLabel(item.actor_user_id) : ''
            const verb = activityVerb(item.type)
            const target = activityTarget(item)
            const initials = actorName ? initialsFromLabel(actorName) : '?'
            const avatarColor = userColor(item.actor_user_id)
            const showActorLine = Boolean(actorName)
            return (
              <div
                key={item.id}
                className={navigable ? 'edms-nav-item' : undefined}
                onClick={() => item.document_id && onOpenDoc(item.document_id)}
                style={{
                  padding: '8px 14px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  fontSize: 12.5,
                  cursor: navigable ? 'pointer' : 'default',
                }}
              >
                <span
                  title={actorName || undefined}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    background: avatarColor,
                    color: '#0e0f12',
                    fontSize: 10.5,
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    border: '1.5px solid var(--bg-elev)',
                    marginTop: 1,
                  }}
                >
                  {item.actor_user_id ? initials : notifIcon(item.type)}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {showActorLine ? (
                      <>
                        <span style={{ fontWeight: 600 }}>{actorName}</span>
                        {verb && <span style={{ color: 'var(--fg-muted)', fontWeight: 400 }}> {verb}</span>}
                      </>
                    ) : (
                      <span style={{ fontWeight: 500 }}>{item.title}</span>
                    )}
                  </div>
                  {target && (
                    <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1 }}>
                      {target}
                    </div>
                  )}
                </div>
                <span style={{ fontSize: 11, color: 'var(--fg-dim)', flexShrink: 0, alignSelf: 'flex-start', marginTop: 2 }}>{notifTimeAgo(item.created_at)}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StateBreakdownPanel({
  metrics,
  userLabel,
  userColor,
}: {
  metrics: DocumentMetricsResponse | null
  userLabel: (userId?: string | null) => string
  userColor: (userId?: string | null) => string
}) {
  const byState = metrics?.by_state ?? {}
  const byOwner = metrics?.by_owner ?? {}
  const totalState = Object.values(byState).reduce((acc, n) => acc + n, 0)
  const states = Object.entries(byState)
    .sort((a, b) => b[1] - a[1])
  const topOwners = Object.entries(byOwner)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  return (
    <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon.Branch size={14} style={{ color: 'var(--fg-muted)' }} />
        <span style={{ fontSize: 13, fontWeight: 600 }}>Documentos por estado</span>
      </div>
      {!metrics ? (
        <div style={{ padding: '24px 14px', fontSize: 12, color: 'var(--fg-muted)', textAlign: 'center' }}>Cargando metricas...</div>
      ) : states.length === 0 ? (
        <div style={{ padding: '24px 14px', fontSize: 12, color: 'var(--fg-muted)', textAlign: 'center' }}>Sin documentos</div>
      ) : (
        <div style={{ padding: '8px 14px 6px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {states.map(([code, count]) => {
            const pct = totalState > 0 ? Math.round((count / totalState) * 100) : 0
            return (
              <div key={code} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <StateBadge state={code} />
                </span>
                <div style={{ width: 80, height: 6, borderRadius: 3, background: 'var(--bg-elev-2)', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: 'var(--accent)', borderRadius: 3 }} />
                </div>
                <span style={{ fontSize: 12, color: 'var(--fg)', minWidth: 24, textAlign: 'right' }}>{count}</span>
              </div>
            )
          })}
        </div>
      )}
      {topOwners.length > 0 && (
        <div style={{ padding: '8px 14px 14px', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, color: 'var(--fg-dim)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>
            Por encargado
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {topOwners.map(([uid, count]) => (
              <div key={uid} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                <span style={{
                  width: 20, height: 20, borderRadius: 10,
                  background: userColor(uid), color: '#0e0f12',
                  fontSize: 10, fontWeight: 600,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  {initialsFromLabel(userLabel(uid))}
                </span>
                <span style={{ color: 'var(--fg)', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {userLabel(uid)}
                </span>
                <span style={{ color: 'var(--fg-muted)', fontSize: 12 }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function DueSoonPanel({
  docs,
  onOpenDoc,
  userLabel,
}: {
  docs: DocumentItem[]
  onOpenDoc: (docId: string) => void
  userLabel: (userId?: string | null) => string
}) {
  return (
    <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon.Clock size={14} style={{ color: 'var(--warn)' }} />
        <span style={{ fontSize: 13, fontWeight: 600 }}>Próximos vencimientos</span>
        <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 10, background: 'var(--bg-active)', color: 'var(--fg-muted)' }}>
          {docs.length}
        </span>
      </div>
      {docs.length === 0 ? (
        <div style={{ padding: '24px 14px', fontSize: 12, color: 'var(--fg-muted)', textAlign: 'center' }}>
          No hay vencimientos próximos
        </div>
      ) : (
        <div style={{ padding: '6px 0' }}>
          {docs.map((doc) => {
            const urg = dueUrgency(doc.dueDate)
            return (
              <div
                key={doc.id}
                className="edms-nav-item"
                onClick={() => onOpenDoc(doc.id)}
                style={{
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <div
                  style={{
                    width: 4,
                    alignSelf: 'stretch',
                    background: urg.color,
                    borderRadius: 2,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 2 }}>
                    {doc.name}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>
                    Encargado: {userLabel(doc.assignee ?? doc.owner)}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: urg.color,
                    background: urg.soft,
                    border: `1px solid ${urg.color}`,
                    borderRadius: 999,
                    padding: '2px 9px',
                    flexShrink: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <Icon.Clock size={11} />
                  {urg.label ? `${urg.label} · ` : ''}{dueDateLabel(doc.dueDate)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ExpedientDetailView({
  expedient,
  loading,
  error,
  userLabel,
  onOpenDoc,
  onAddDocument,
}: {
  expedient: ExpedientDetail | null
  loading: boolean
  error: string | null
  userLabel: (userId?: string | null) => string
  onOpenDoc: (docId: string) => void
  onAddDocument?: () => void
}) {
  if (loading) {
    return (
      <div style={{ padding: '24px 22px', color: 'var(--fg-muted)', fontSize: 13 }}>
        Cargando expediente...
      </div>
    )
  }
  if (error) {
    return (
      <div style={{ padding: '24px 22px', color: 'var(--danger)', fontSize: 13 }}>
        {error}
      </div>
    )
  }
  if (!expedient) {
    return (
      <div style={{ padding: '24px 22px', color: 'var(--fg-muted)', fontSize: 13 }}>
        Selecciona un expediente para ver sus documentos.
      </div>
    )
  }

  const createdAtLabel = formatDocumentDate(expedient.created_at)
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '14px 22px 24px' }}>
      <div
        style={{
          background: 'var(--bg-elev)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '16px 18px',
          marginBottom: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Icon.Folder size={18} style={{ color: 'var(--accent)' }} />
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{expedient.name}</h2>
          {expedient.code && (
            <span
              style={{
                fontSize: 11,
                padding: '2px 8px',
                borderRadius: 6,
                background: 'var(--bg-active)',
                color: 'var(--fg-muted)',
                fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              }}
            >
              {expedient.code}
            </span>
          )}
        </div>
        {expedient.description && (
          <div style={{ fontSize: 13, color: 'var(--fg)', marginBottom: 8, whiteSpace: 'pre-wrap' }}>
            {expedient.description}
          </div>
        )}
        <div style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>
          Creado por {userLabel(expedient.created_by_user_id)} · {createdAtLabel}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Documentos asociados</h3>
          <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
            {expedient.documents.length} {expedient.documents.length === 1 ? 'documento' : 'documentos'}
          </span>
        </div>
        {onAddDocument && (
          <button
            onClick={onAddDocument}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 11px',
              borderRadius: 7,
              border: '1px solid var(--border)',
              background: 'var(--bg-elev)',
              color: 'var(--fg)',
              fontSize: 12.5,
              cursor: 'pointer',
            }}
            title="Asociar documentos existentes a este expediente"
          >
            <Icon.Plus size={12} /> Agregar documento
          </button>
        )}
      </div>

      <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        {expedient.documents.length === 0 ? (
          <div style={{ padding: '28px 14px', fontSize: 12, color: 'var(--fg-muted)', textAlign: 'center' }}>
            Este expediente todavía no tiene documentos asociados visibles para ti.
          </div>
        ) : (
          <div>
            {expedient.documents.map((doc, index) => {
              const kind = doc.current_file_mime_type
                ? docKindFromMime(doc.current_file_mime_type)
                : docKindFromType(doc.document_type_id)
              const kindInfo = findKind(kind)
              return (
                <button
                  key={doc.id}
                  onClick={() => onOpenDoc(doc.id)}
                  className="edms-nav-item"
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 14px',
                    background: 'transparent',
                    color: 'var(--fg)',
                    borderBottom: index < expedient.documents.length - 1 ? '1px solid var(--border)' : 'none',
                    textAlign: 'left',
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 6,
                      flexShrink: 0,
                      background: `color-mix(in oklch, ${kindInfo.tone} 16%, var(--bg-elev-2))`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: kindInfo.tone,
                      fontSize: 9,
                      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                      fontWeight: 600,
                    }}
                  >
                    {kindInfo.label}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {doc.title}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--fg-dim)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{doc.code}</span>
                      <span>·</span>
                      <span>{userLabel(doc.owner_user_id)}</span>
                      {doc.due_date && (
                        <>
                          <span>·</span>
                          <span style={{ color: dueUrgency(doc.due_date).color }}>{dueUrgency(doc.due_date).label}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <StateBadge state={doc.workflow_state_code} />
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function BulkBar({
  count,
  onClear,
  onAction,
}: {
  count: number
  onClear: () => void
  onAction: (action: string) => void
}) {
  if (count === 0) return null

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 18,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'var(--bg-elev-2)',
        border: '1px solid var(--border-strong)',
        borderRadius: 10,
        boxShadow: 'var(--shadow)',
        padding: '6px 6px 6px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        zIndex: 30,
      }}
    >
      <span style={{ fontSize: 12.5, color: 'var(--fg)', fontWeight: 500, marginRight: 4 }}>{count} seleccionados</span>
      <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 4px' }} />
      {([
        { id: 'download', icon: <Icon.Download size={13} />, label: 'Descargar' },
        { id: 'share', icon: <Icon.Share size={13} />, label: 'Compartir' },
        { id: 'move', icon: <Icon.Move size={13} />, label: 'Mover' },
        { id: 'tag', icon: <Icon.Tag size={13} />, label: 'Etiquetar' },
        { id: 'trash', icon: <Icon.Trash size={13} />, label: 'Eliminar', danger: true },
      ] as ActionItem[]).map((action) => (
        <button
          key={action.id}
          onClick={() => onAction(action.id)}
          className="edms-nav-item"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '5px 9px',
            borderRadius: 6,
            color: action.danger ? 'var(--danger)' : 'var(--fg)',
            fontSize: 12,
          }}
        >
          {action.icon}
          {action.label}
        </button>
      ))}
      <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 2px' }} />
      <button
        onClick={onClear}
        title="Deseleccionar"
        style={{
          width: 24,
          height: 24,
          borderRadius: 5,
          color: 'var(--fg-dim)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon.Close size={13} />
      </button>
    </div>
  )
}

function DetailDrawer({
  doc,
  onClose,
  tags,
  onEditMetadata,
  detail,
  loading,
  error,
  currentUserId,
  currentUserLabel,
  assigneeOptions,
  onAssignAssignee,
  onAddAssignment,
  onRemoveAssignment,
  onUpdateAssignmentRole,
  onCommentPosted,
  onVersionUploaded,
  expedients = [],
  onOpenExpedient,
  onApproveDoc,
  onRejectDoc,
  fullScreen = false,
  onToggleFull,
}: {
  doc: DocumentItem | null
  onClose: () => void
  tags: ApiTag[]
  onEditMetadata: (doc: DocumentItem) => void
  detail: DocumentDetailResponse | null
  loading: boolean
  error: string | null
  currentUserId?: string | null
  currentUserLabel: string
  assigneeOptions: [string, string][]
  onAssignAssignee?: (docId: string, userId: string) => Promise<void>
  onAddAssignment?: (docId: string, userId: string, roleCode: string) => Promise<void>
  onRemoveAssignment?: (docId: string, assignmentId: string) => Promise<void>
  onUpdateAssignmentRole?: (docId: string, assignmentId: string, roleCode: string) => Promise<void>
  onCommentPosted?: (item: DocumentDetailTimelineItem) => void
  onVersionUploaded?: (docId: string) => Promise<void>
  expedients?: ExpedientItem[]
  onOpenExpedient?: (expedientId: string) => void
  onApproveDoc?: (docId: string) => Promise<void>
  onRejectDoc?: (docId: string) => Promise<void>
  fullScreen?: boolean
  onToggleFull?: () => void
}) {
  const [preview, setPreview] = useState<{
    fileId: string
    url?: string
    error?: string
  } | null>(null)
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null)
  const [commentText, setCommentText] = useState('')
  const [commentSending, setCommentSending] = useState(false)
  const [commentResolveBusy, setCommentResolveBusy] = useState<string | null>(null)
  const versionFileInputRef = useRef<HTMLInputElement | null>(null)
  const [versionUploading, setVersionUploading] = useState(false)
  const [versionUploadError, setVersionUploadError] = useState<string | null>(null)
  const [approvalBusy, setApprovalBusy] = useState<'approve' | 'reject' | null>(null)
  const [approvalError, setApprovalError] = useState<string | null>(null)
  // US-022: pueden quedar comentarios resueltos en el detalle local cuando el
  // usuario marca/desmarca, sin refetch completo. Guardamos delta aqui.
  const [commentResolutionOverrides, setCommentResolutionOverrides] = useState<Record<string, { resolved_at: string | null; resolved_by_user_id: string | null }>>({})
  const [showFullTimeline, setShowFullTimeline] = useState(false)
  const [timelineFilter, setTimelineFilter] = useState<'todos' | 'estado' | 'asignaciones' | 'permisos' | 'versiones' | 'metadata'>('todos')
  const [viewVersionId, setViewVersionId] = useState<string | null>(null)
  const commentRef = useRef<HTMLTextAreaElement>(null)
  // Autocompletado de menciones: token "@..." activo bajo el cursor.
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null)
  const [editingAssignee, setEditingAssignee] = useState(false)
  const [assigneeDraft, setAssigneeDraft] = useState('')
  const [assigneeSaving, setAssigneeSaving] = useState(false)
  const [assigneeError, setAssigneeError] = useState<string | null>(null)
  const [addingAssignment, setAddingAssignment] = useState(false)
  const [addAssignUser, setAddAssignUser] = useState('')
  const [addAssignRole, setAddAssignRole] = useState('revisor')
  const [assignmentBusy, setAssignmentBusy] = useState<string | null>(null)
  const [assignmentError, setAssignmentError] = useState<string | null>(null)
  // US-005: permisos explicitos otorgados al documento.
  const [grants, setGrants] = useState<DocumentPermissionGrant[]>([])
  const [grantsLoaded, setGrantsLoaded] = useState(false)
  const [addingGrant, setAddingGrant] = useState(false)
  const [grantUserDraft, setGrantUserDraft] = useState('')
  const [grantCodeDraft, setGrantCodeDraft] = useState<string>('view')
  const [grantExpiresDraft, setGrantExpiresDraft] = useState<string>('')
  const [grantBusy, setGrantBusy] = useState<string | null>(null)
  const [grantError, setGrantError] = useState<string | null>(null)
  const currentFile = detail?.files.find((file) => file.is_current) ?? detail?.files[0] ?? null
  const selectedVersionFile = viewVersionId
    ? (detail?.files.find((file) => file.id === viewVersionId) ?? null)
    : null
  const previewFile = selectedVersionFile ?? currentFile

  useEffect(() => {
    if (!doc) return
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [doc, onClose])

  // US-005: cargar grants explicitos del documento.
  useEffect(() => {
    if (!doc?.id) return
    let cancelled = false
    listDocumentPermissions(doc.id)
      .then((list) => {
        if (!cancelled) {
          setGrants(list)
          setGrantsLoaded(true)
        }
      })
      .catch(() => {
        if (!cancelled) setGrantsLoaded(true)
      })
    return () => { cancelled = true }
  }, [doc?.id])

  useEffect(() => {
    if (!previewFile) {
      return
    }

    const controller = new AbortController()
    let objectUrl: string | null = null

    getFileContent(previewFile.file_id, controller.signal)
      .then((response) => {
        objectUrl = URL.createObjectURL(response.data)
        setPreview({ fileId: previewFile.file_id, url: objectUrl })
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setPreview({ fileId: previewFile.file_id, error: 'No se pudo cargar la vista previa' })
        }
      })

    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [previewFile])

  if (!doc) return null

  const owner = findUserById(doc.owner)
  const effectiveKind = currentFile?.mime_type ? docKindFromMime(currentFile.mime_type) : doc.kind
  const kind = findKind(effectiveKind)
  const effectiveVersion = currentFile?.version_number ?? doc.version
  const versionLabel = effectiveVersion > 0 ? `v${effectiveVersion}` : 'Sin archivo'
  const workflow = detail?.workflow
  const permissions = detail?.permissions
  const canEditMetadata = permissions?.can_edit_metadata ?? true
  const canAssignAssignee = permissions?.can_assign_assignee ?? canEditMetadata
  const canDownloadFile = Boolean(currentFile) && (permissions?.can_download_file ?? true)
  const canApprove = Boolean(permissions?.can_approve)
  const assignments = workflow?.assignments ?? []
  const assigneeId = workflow?.assignee_user_id ?? doc.owner
  const canManageAssignments = Boolean(
    canAssignAssignee
      && currentUserId
      && workflow?.assignee_user_id
      && workflow.assignee_user_id === currentUserId
      && onAddAssignment
      && onRemoveAssignment
      && onUpdateAssignmentRole,
  )
  const nonOwnerRoleOptions: { value: string; label: string }[] = [
    { value: 'revisor', label: 'Revisor' },
    { value: 'aprobador', label: 'Aprobador' },
    { value: 'lector', label: 'Lector' },
  ]
  const availableUsersForNewAssignment = assigneeOptions.filter(
    ([id]) => id !== assigneeId,
  )
  const canManagePermissions = Boolean(permissions?.can_manage_permissions)

  async function handleAddAssignment() {
    if (!onAddAssignment || !doc) return
    if (!addAssignUser) {
      setAssignmentError('Selecciona un usuario')
      return
    }
    setAssignmentBusy('add')
    setAssignmentError(null)
    try {
      await onAddAssignment(doc.id, addAssignUser, addAssignRole)
      setAddAssignUser('')
      setAddAssignRole('revisor')
      setAddingAssignment(false)
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setAssignmentError(detail ?? 'No se pudo agregar la asignacion')
    } finally {
      setAssignmentBusy(null)
    }
  }

  async function handleRemoveAssignment(assignmentId: string) {
    if (!onRemoveAssignment || !doc) return
    setAssignmentBusy(`remove-${assignmentId}`)
    setAssignmentError(null)
    try {
      await onRemoveAssignment(doc.id, assignmentId)
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setAssignmentError(detail ?? 'No se pudo quitar la asignacion')
    } finally {
      setAssignmentBusy(null)
    }
  }

  async function handleGrantPermission() {
    if (!doc) return
    if (!grantUserDraft) {
      setGrantError('Selecciona un usuario')
      return
    }
    setGrantBusy('add')
    setGrantError(null)
    try {
      // Si el usuario eligio una fecha en el input datetime-local, asumimos
      // que esta en hora local y la convertimos a ISO con tz.
      const expiresAtIso = grantExpiresDraft
        ? new Date(grantExpiresDraft).toISOString()
        : null
      const grant = await grantDocumentPermission(doc.id, grantUserDraft, grantCodeDraft, expiresAtIso)
      setGrants((current) => [grant, ...current])
      setGrantUserDraft('')
      setGrantExpiresDraft('')
      setAddingGrant(false)
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setGrantError(detail ?? 'No se pudo otorgar el permiso')
    } finally {
      setGrantBusy(null)
    }
  }

  async function handleRevokePermission(grantId: string) {
    if (!doc) return
    setGrantBusy(`remove-${grantId}`)
    setGrantError(null)
    try {
      await revokeDocumentPermission(doc.id, grantId)
      setGrants((current) => current.filter((g) => g.id !== grantId))
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setGrantError(detail ?? 'No se pudo revocar el permiso')
    } finally {
      setGrantBusy(null)
    }
  }

  async function handleUpdateAssignmentRole(assignmentId: string, roleCode: string) {
    if (!onUpdateAssignmentRole || !doc) return
    setAssignmentBusy(`role-${assignmentId}`)
    setAssignmentError(null)
    try {
      await onUpdateAssignmentRole(doc.id, assignmentId, roleCode)
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setAssignmentError(detail ?? 'No se pudo cambiar el rol')
    } finally {
      setAssignmentBusy(null)
    }
  }
  const activePreview = previewFile && preview?.fileId === previewFile.file_id ? preview : null
  const viewingNonCurrent = Boolean(selectedVersionFile && !selectedVersionFile.is_current)
  const fallbackHistory: DocumentDetailTimelineItem[] = (doc.metadataActivity ?? []).map((item) => ({
    id: item.id,
    actor_user_id: item.actor_user_id,
    action: item.action,
    body: `Metadata actualizada: ${item.changed_fields.map(metadataFieldLabel).join(', ')}`,
    created_at: item.created_at,
  }))
  const historyItems = detail ? detail.history : fallbackHistory

  function userLabel(userId?: string | null) {
    if (!userId) return 'Sin asignar'
    if (currentUserId && userId === currentUserId) return currentUserLabel
    const option = assigneeOptions.find(([id]) => id === userId)
    if (option) return option[1]
    const found = findUserById(userId)
    if (found) return found.name
    return 'Usuario sin nombre'
  }

  function roleLabel(roleCode?: string | null) {
    const labels: Record<string, string> = {
      encargado: 'Encargado',
      revisor: 'Revisor',
      aprobador: 'Aprobador',
      lector: 'Lector',
    }
    return labels[roleCode ?? ''] ?? roleCode ?? 'Asignado'
  }

  function timelineLabel(item: DocumentDetailTimelineItem) {
    if (item.action === 'state_change' && item.body) {
      const stateLabels: Record<string, string> = {
        borrador: 'Borrador', en_revision: 'En revisión', observado: 'Observado',
        aprobado: 'Aprobado', pendiente_firma: 'Pendiente de firma', rechazado: 'Rechazado', archivado: 'Archivado',
      }
      const base = `Estado cambiado a: ${stateLabels[item.body] ?? item.body}`
      return item.note ? `${base} — “${item.note}”` : base
    }
    if (item.action === 'assignee_changed' && item.body) {
      return `Encargado asignado: ${userLabel(item.body)}`
    }
    if (item.action === 'assignment_added' && item.body) {
      return `Asignó a ${userLabel(item.body)}${item.note ? ` como ${item.note}` : ''}`
    }
    if (item.action === 'assignment_removed' && item.body) {
      return `Quitó a ${userLabel(item.body)}${item.note ? ` (${item.note})` : ''}`
    }
    if (item.action === 'permission_granted' && item.body) {
      return `Otorgó permiso ${item.note ?? ''} a ${userLabel(item.body)}`.trim()
    }
    if (item.action === 'permission_revoked' && item.body) {
      return `Revocó permiso ${item.note ?? ''} a ${userLabel(item.body)}`.trim()
    }
    if (item.action === 'permission_expired' && item.body) {
      return `Expiró permiso ${item.note ?? ''} de ${userLabel(item.body)}`.trim()
    }
    if (item.action === 'comment_resolved') {
      return 'Resolvió un comentario'
    }
    if (item.body) return item.body
    const labels: Record<string, string> = {
      metadata_updated: 'Metadata actualizada',
      version_uploaded: 'Nueva version registrada',
      comment: 'Comentario agregado',
      state_change: 'Estado cambiado',
      assignee_changed: 'Encargado actualizado',
      assignment_added: 'Asignacion agregada',
      assignment_removed: 'Asignacion revocada',
      permission_granted: 'Permiso otorgado',
      permission_revoked: 'Permiso revocado',
      permission_expired: 'Permiso expirado',
    }
    return labels[item.action] ?? item.action
  }

  // US-025: agrupacion por tipo para el filtro del historial.
  function timelineCategory(action: string): 'estado' | 'asignaciones' | 'permisos' | 'versiones' | 'metadata' | 'otros' {
    if (action === 'state_change') return 'estado'
    if (action === 'assignee_changed' || action === 'assignment_added' || action === 'assignment_removed') return 'asignaciones'
    if (action === 'permission_granted' || action === 'permission_revoked' || action === 'permission_expired') return 'permisos'
    if (action === 'version_uploaded') return 'versiones'
    if (action === 'metadata_updated' || action === 'fecha_vencimiento') return 'metadata'
    return 'otros'
  }

  function renderCommentBody(text: string) {
    const parts = text.split(/(@[\w.-]+)/g)
    return parts.map((part, i) =>
      part.startsWith('@')
        ? <span key={i} style={{ color: 'var(--accent)', fontWeight: 500 }}>{part}</span>
        : part
    )
  }

  function resolveMentionedUserIds(text: string) {
    const tokens = Array.from(text.matchAll(/@([\w.-]+)/g), (match) => normalizeMentionToken(match[1]))
    if (tokens.length === 0) return []
    const tokenSet = new Set(tokens)
    const mentioned = new Set<string>()

    assigneeOptions.forEach(([userId, label]) => {
      const candidates = [
        userId,
        label,
        label.replace(/\s+/g, '.'),
        label.replace(/\s+/g, '-'),
      ].map(normalizeMentionToken)

      if (candidates.some((candidate) => tokenSet.has(candidate))) {
        mentioned.add(userId)
      }
    })

    return Array.from(mentioned)
  }

  function handleCommentChange(value: string, caret: number) {
    setCommentText(value)
    const upto = value.slice(0, caret)
    const m = upto.match(/@([\w.-]*)$/)
    if (m) setMention({ query: normalizeMentionToken(m[1]), start: caret - m[0].length })
    else setMention(null)
  }

  const mentionMatches = mention
    ? assigneeOptions
        .filter(([, label]) => mention.query === '' || normalizeMentionToken(label).includes(mention.query))
        .slice(0, 6)
    : []

  function applyMention(label: string) {
    if (!mention) return
    const token = `@${label.trim().replace(/\s+/g, '.')} `
    const before = commentText.slice(0, mention.start)
    const after = commentText.slice(mention.start).replace(/^@[\w.-]*/, '')
    const next = before + token + after
    setCommentText(next)
    setMention(null)
    const pos = (before + token).length
    requestAnimationFrame(() => {
      const el = commentRef.current
      if (el) {
        el.focus()
        el.setSelectionRange(pos, pos)
      }
    })
  }

  async function handleToggleResolveComment(commentId: string, currentlyResolved: boolean) {
    if (!doc) return
    setCommentResolveBusy(commentId)
    try {
      const result = currentlyResolved
        ? (await unresolveComment(doc.id, commentId)).data
        : (await resolveComment(doc.id, commentId)).data
      setCommentResolutionOverrides((prev) => ({
        ...prev,
        [commentId]: {
          resolved_at: result.resolved_at ?? null,
          resolved_by_user_id: result.resolved_by_user_id ?? null,
        },
      }))
    } finally {
      setCommentResolveBusy(null)
    }
  }

  async function handleSubmitComment() {
    if (!doc || !commentText.trim()) return
    setCommentSending(true)
    try {
      const text = commentText.trim()
      const { data } = await createComment(doc.id, text, currentFile?.id ?? null, resolveMentionedUserIds(text))
      setCommentText('')
      onCommentPosted?.(data)
    } finally {
      setCommentSending(false)
    }
  }

  async function handleDownloadVersion(file: { file_id: string; original_filename?: string | null; version_number?: number | null }) {
    setDownloadingFileId(file.file_id)
    try {
      const response = await getFileContent(file.file_id)
      const objectUrl = URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = objectUrl
      const fallback = file.version_number ? `${doc?.name ?? 'documento'}-v${file.version_number}.bin` : `${doc?.name ?? 'documento'}.bin`
      link.download = file.original_filename || fallback
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(objectUrl)
    } finally {
      setDownloadingFileId(null)
    }
  }

  async function handleDownloadCurrentFile() {
    if (!currentFile) return
    await handleDownloadVersion(currentFile)
  }

  function handleUploadVersionClick() {
    setVersionUploadError(null)
    versionFileInputRef.current?.click()
  }

  async function handleApproveClick() {
    if (!doc || !onApproveDoc || approvalBusy) return
    setApprovalBusy('approve')
    setApprovalError(null)
    try {
      await onApproveDoc(doc.id)
    } catch (err) {
      setApprovalError(getApiErrorMessage(err, 'No se pudo aprobar el documento'))
    } finally {
      setApprovalBusy(null)
    }
  }

  async function handleRejectClick() {
    if (!doc || !onRejectDoc || approvalBusy) return
    setApprovalBusy('reject')
    setApprovalError(null)
    try {
      await onRejectDoc(doc.id)
    } catch (err) {
      const message = (err as Error)?.message
      if (message === 'Cambio de estado cancelado') {
        // El usuario canceló el prompt de motivo: no es error.
      } else {
        setApprovalError(getApiErrorMessage(err, 'No se pudo rechazar el documento'))
      }
    } finally {
      setApprovalBusy(null)
    }
  }

  async function handleVersionFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !doc) return
    const comment = window.prompt('Comentario para esta versión (opcional)') ?? ''
    setVersionUploading(true)
    setVersionUploadError(null)
    try {
      await uploadDocumentFile({
        file,
        document_id: doc.id,
        version_comment: comment.trim() ? comment.trim() : undefined,
      })
      if (onVersionUploaded) {
        await onVersionUploaded(doc.id)
      }
    } catch (err) {
      setVersionUploadError(getApiErrorMessage(err, 'No se pudo subir la nueva versión'))
    } finally {
      setVersionUploading(false)
    }
  }

  async function handleSaveAssignee() {
    if (!doc || !onAssignAssignee) return
    const nextAssignee = assigneeDraft.trim()
    if (!nextAssignee || nextAssignee === assigneeId) {
      setEditingAssignee(false)
      setAssigneeError(null)
      return
    }

    setAssigneeSaving(true)
    setAssigneeError(null)
    try {
      await onAssignAssignee(doc.id, nextAssignee)
      setEditingAssignee(false)
    } catch (err) {
      setAssigneeError(getApiErrorMessage(err, 'No se pudo asignar encargado'))
    } finally {
      setAssigneeSaving(false)
    }
  }

  const assigneeField = editingAssignee ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <select
        value={assigneeDraft}
        onChange={(event) => setAssigneeDraft(event.target.value)}
        disabled={assigneeSaving}
        style={{
          width: '100%',
          minWidth: 0,
          borderRadius: 6,
          border: '1px solid var(--border)',
          background: 'var(--bg-elev-2)',
          color: 'var(--fg)',
          padding: '6px 8px',
          fontSize: 12,
          outline: 'none',
        }}
      >
        <option value="">Selecciona encargado</option>
        {assigneeOptions.map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          className="edms-button edms-button-primary"
          onClick={handleSaveAssignee}
          disabled={assigneeSaving || !assigneeDraft}
          style={{ ...btnStylePrimary, padding: '5px 8px', fontSize: 11.5 }}
        >
          {assigneeSaving ? 'Guardando' : 'Guardar'}
        </button>
        <button
          className="edms-button"
          onClick={() => {
            setEditingAssignee(false)
            setAssigneeError(null)
          }}
          disabled={assigneeSaving}
          style={{ ...btnStyleGhost, padding: '5px 8px', fontSize: 11.5 }}
        >
          Cancelar
        </button>
      </div>
      {assigneeError && <span style={{ color: 'var(--danger)', fontSize: 11 }}>{assigneeError}</span>}
    </div>
  ) : (
    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <span>{userLabel(assigneeId)}</span>
      {canAssignAssignee && onAssignAssignee && assigneeOptions.length > 0 && (
        <button
          className="edms-button"
          onClick={() => {
            setAssigneeDraft(assigneeId ?? '')
            setAssigneeError(null)
            setEditingAssignee(true)
          }}
          style={{ ...btnStyleGhost, padding: '4px 7px', fontSize: 11 }}
        >
          Cambiar
        </button>
      )}
    </span>
  )

  return (
    <aside
      style={
        fullScreen
          ? {
              position: 'fixed',
              inset: 0,
              zIndex: 1000,
              width: '100vw',
              height: '100vh',
              background: 'var(--bg-elev)',
              display: 'flex',
              flexDirection: 'column',
            }
          : {
              width: 360,
              height: '100%',
              flexShrink: 0,
              background: 'var(--bg-elev)',
              borderLeft: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              animation: 'edms-slide-in 0.18s ease-out',
            }
      }
    >
      <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border)' }}>
        <KindBadge kind={effectiveKind} />
        <span style={{ flex: 1, fontSize: 12, color: 'var(--fg-muted)' }}>Detalles</span>
        <button
          onClick={onToggleFull}
          className="edms-nav-item"
          title={fullScreen ? 'Salir de pantalla completa' : 'Abrir completo'}
          style={{ width: 26, height: 26, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', color: fullScreen ? 'var(--accent)' : 'var(--fg-muted)' }}
        >
          <Icon.Eye size={14} />
        </button>
        <button onClick={onClose} className="edms-nav-item" style={{ width: 26, height: 26, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-muted)' }}>
          <Icon.Close size={14} />
        </button>
      </div>

      <div
        style={{
          flex: 1,
          overflow: 'auto',
          ...(fullScreen
            ? {
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) minmax(340px, 400px)',
                gridTemplateRows: 'auto auto 1fr',
                columnGap: 28,
                padding: '20px 28px 40px',
                maxWidth: 1500,
                margin: '0 auto',
                width: '100%',
              }
            : {}),
        }}
      >
        <div style={{ padding: '14px 14px 0', ...(fullScreen ? { gridColumn: 1, gridRow: 1, padding: 0, marginBottom: 16 } : {}) }}>
          {viewingNonCurrent && selectedVersionFile && (
            <div
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                padding: '7px 10px', marginBottom: 8, borderRadius: 7,
                border: '1px solid color-mix(in oklch, var(--warn) 45%, var(--border))',
                background: 'var(--warn-soft)', color: 'var(--fg)', fontSize: 12,
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon.Branch size={12} /> Viendo versión v{selectedVersionFile.version_number} (no actual)
              </span>
              <button
                onClick={() => setViewVersionId(null)}
                className="edms-button"
                style={{ ...btnStyleGhost, padding: '3px 8px', fontSize: 11 }}
              >
                Ver actual
              </button>
            </div>
          )}
          <div
            style={{
              ...(fullScreen ? { height: '78vh', minHeight: 460 } : { aspectRatio: '8.5 / 11' }),
              borderRadius: 8,
              overflow: 'hidden',
              background: previewFile ? 'var(--bg-elev-2)' : `linear-gradient(135deg, color-mix(in oklch, ${kind.tone} 16%, var(--bg-elev-2)), var(--bg-elev-2))`,
              border: '1px solid var(--border)',
              position: 'relative',
              padding: previewFile ? 0 : 18,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {previewFile ? (
              activePreview?.url ? (
                previewFile.mime_type?.startsWith('image/') ? (
                  <img
                    src={activePreview.url}
                    alt={`Vista previa de ${previewFile.original_filename ?? doc.name}`}
                    style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#05070a' }}
                  />
                ) : (
                  <iframe
                    src={activePreview.url}
                    title={`Vista previa de ${previewFile.original_filename ?? doc.name}`}
                    style={{ width: '100%', height: '100%', border: 0, background: '#05070a' }}
                  />
                )
              ) : (
                <div style={{ padding: 18, textAlign: 'center', color: activePreview?.error ? 'var(--danger)' : 'var(--fg-muted)', fontSize: 12.5 }}>
                  {activePreview?.error ?? 'Cargando vista previa...'}
                </div>
              )
            ) : (
              <>
                <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, opacity: 0.4 }}>
                  <defs>
                    <pattern id={`stripes-dr-${doc.id}`} patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
                      <line x1="0" y1="0" x2="0" y2="8" stroke={kind.tone} strokeWidth="1" opacity="0.3" />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill={`url(#stripes-dr-${doc.id})`} />
                </svg>
                <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
                  <div style={{ height: 8, width: '75%', background: 'color-mix(in oklch, currentColor 35%, transparent)', borderRadius: 2, color: kind.tone }} />
                  <div style={{ height: 4, width: '55%', background: 'color-mix(in oklch, currentColor 25%, transparent)', borderRadius: 1, color: kind.tone, marginBottom: 10 }} />
                  {Array.from({ length: 8 }).map((_, index) => (
                    <div
                      key={index}
                      style={{
                        height: 4,
                        width: `${85 - (index % 3) * 10}%`,
                        background: 'color-mix(in oklch, currentColor 16%, transparent)',
                        borderRadius: 1,
                        color: kind.tone,
                      }}
                    />
                  ))}
                </div>
                <div
                  style={{
                    position: 'absolute',
                    bottom: 10,
                    right: 12,
                    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                    fontSize: 10,
                    color: kind.tone,
                    opacity: 0.6,
                  }}
                >
                  Vista previa · Sin archivo principal
                </div>
              </>
            )}
          </div>
        </div>

        <div style={{ padding: '14px', ...(fullScreen ? { gridColumn: 1, gridRow: 2, padding: '0 0 8px' } : {}) }}>
          <div style={{ fontSize: fullScreen ? 22 : 15, fontWeight: 600, color: 'var(--fg)', marginBottom: 6, lineHeight: 1.3 }}>{doc.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <StatusPill status={doc.status} />
            <span style={{ color: 'var(--fg-dim)', fontSize: 11 }}>·</span>
            <span style={{ color: 'var(--fg-muted)', fontSize: 12, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{versionLabel}</span>
            <span style={{ color: 'var(--fg-dim)', fontSize: 11 }}>·</span>
            <span style={{ color: 'var(--fg-muted)', fontSize: 12 }}>{doc.modified}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 14 }}>
            <button className="edms-button edms-button-primary" style={btnStylePrimary} onClick={onToggleFull}>
              <Icon.Eye size={13} /> {fullScreen ? 'Cerrar vista' : 'Abrir'}
            </button>
            <button className="edms-button" style={btnStyleGhost} onClick={() => onEditMetadata(doc)} disabled={!canEditMetadata}>
              <Icon.File size={13} /> Editar
            </button>
            <button className="edms-button" style={btnStyleGhost} disabled={!canDownloadFile || downloadingFileId === currentFile?.file_id} onClick={handleDownloadCurrentFile}>
              <Icon.Download size={13} /> {downloadingFileId === currentFile?.file_id ? 'Descargando' : 'Descargar'}
            </button>
            <button
              className="edms-button"
              style={btnStyleGhost}
              disabled={versionUploading || (permissions ? !permissions.can_upload_version : false)}
              onClick={handleUploadVersionClick}
              title="Sube un archivo nuevo como versión vigente; el historial anterior se conserva"
            >
              <Icon.Upload size={13} /> {versionUploading ? 'Subiendo...' : 'Subir versión'}
            </button>
            <input
              ref={versionFileInputRef}
              type="file"
              style={{ display: 'none' }}
              onChange={handleVersionFileChange}
            />
            {/* US-016 / US-017: aprobar y rechazar son acciones formales que
                solo aparecen cuando el usuario tiene permiso `approve`. */}
            {canApprove && onApproveDoc && (
              <button
                className="edms-button"
                style={{
                  ...btnStyleGhost,
                  color: 'var(--ok)',
                  borderColor: 'color-mix(in oklch, var(--ok) 60%, var(--border))',
                }}
                disabled={approvalBusy !== null || doc.status === 'aprobado'}
                onClick={handleApproveClick}
                title={doc.status === 'aprobado' ? 'El documento ya está aprobado' : 'Aprobar este documento'}
              >
                <Icon.Check size={13} /> {approvalBusy === 'approve' ? 'Aprobando...' : 'Aprobar'}
              </button>
            )}
            {canApprove && onRejectDoc && (
              <button
                className="edms-button"
                style={{
                  ...btnStyleGhost,
                  color: 'var(--danger)',
                  borderColor: 'color-mix(in oklch, var(--danger) 60%, var(--border))',
                }}
                disabled={approvalBusy !== null || doc.status === 'rechazado'}
                onClick={handleRejectClick}
                title={doc.status === 'rechazado' ? 'El documento ya está rechazado' : 'Rechazar este documento (motivo obligatorio)'}
              >
                <Icon.Close size={13} /> {approvalBusy === 'reject' ? 'Rechazando...' : 'Rechazar'}
              </button>
            )}
          </div>

          {approvalError && (
            <div
              style={{
                border: '1px solid color-mix(in oklch, var(--danger) 55%, var(--border))',
                background: 'color-mix(in oklch, var(--danger) 10%, var(--bg-elev-2))',
                color: 'var(--danger)',
                borderRadius: 8,
                padding: '8px 10px',
                marginBottom: 12,
                fontSize: 12,
              }}
            >
              {approvalError}
            </div>
          )}

          {versionUploadError && (
            <div
              style={{
                border: '1px solid color-mix(in oklch, var(--danger) 55%, var(--border))',
                background: 'color-mix(in oklch, var(--danger) 10%, var(--bg-elev-2))',
                color: 'var(--danger)',
                borderRadius: 8,
                padding: '8px 10px',
                marginBottom: 12,
                fontSize: 12,
              }}
            >
              {versionUploadError}
            </div>
          )}

          {(loading || error) && (
            <div
              style={{
                border: `1px solid ${error ? 'color-mix(in oklch, var(--danger) 55%, var(--border))' : 'var(--border)'}`,
                background: error ? 'color-mix(in oklch, var(--danger) 10%, var(--bg-elev-2))' : 'var(--bg-elev-2)',
                color: error ? 'var(--danger)' : 'var(--fg-muted)',
                borderRadius: 8,
                padding: '9px 10px',
                marginBottom: 12,
                fontSize: 12,
              }}
            >
              {error ?? 'Cargando detalle consolidado...'}
            </div>
          )}

          <div style={{ border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-elev-2)', padding: '10px 12px', marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--fg-dim)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon.Users size={11} /> Personas asignadas
              </div>
              {canManageAssignments && !addingAssignment && (
                <button
                  type="button"
                  onClick={() => setAddingAssignment(true)}
                  className="edms-button"
                  style={{ ...btnStyleGhost, padding: '3px 8px', fontSize: 11 }}
                >
                  <Icon.Plus size={11} /> Agregar
                </button>
              )}
            </div>

            {assignments.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {assignments.map((assignment) => {
                  const isOwner = assignment.role_code === 'encargado'
                  const removeBusy = assignmentBusy === `remove-${assignment.id}`
                  const roleBusy = assignmentBusy === `role-${assignment.id}`
                  return (
                    <div key={assignment.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12.5 }}>
                      <OwnerAvatar userId={assignment.user_id} size={20} />
                      <span style={{ color: 'var(--fg)', flex: 1, minWidth: 0 }}>{userLabel(assignment.user_id)}</span>
                      {canManageAssignments && !isOwner ? (
                        <select
                          value={assignment.role_code}
                          disabled={roleBusy}
                          onChange={(e) => handleUpdateAssignmentRole(assignment.id, e.target.value)}
                          style={{
                            fontSize: 11.5, padding: '2px 6px', borderRadius: 4,
                            background: 'var(--bg-elev)', color: 'var(--fg)',
                            border: '1px solid var(--border)', cursor: 'pointer',
                          }}
                        >
                          {nonOwnerRoleOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      ) : (
                        <span style={{
                          color: isOwner ? 'var(--accent)' : 'var(--fg-muted)',
                          background: isOwner ? 'var(--accent-soft)' : 'var(--bg-elev)',
                          border: `1px solid ${isOwner ? 'var(--accent)' : 'var(--border)'}`,
                          borderRadius: 999, padding: '1px 8px', fontSize: 11, fontWeight: 500,
                        }}>
                          {roleLabel(assignment.role_code)}
                        </span>
                      )}
                      {canManageAssignments && !isOwner && (
                        <button
                          type="button"
                          onClick={() => handleRemoveAssignment(assignment.id)}
                          disabled={removeBusy}
                          title="Quitar asignacion"
                          className="edms-nav-item"
                          style={{
                            width: 22, height: 22, borderRadius: 4,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'var(--fg-muted)', background: 'transparent', border: 'none',
                            cursor: removeBusy ? 'wait' : 'pointer',
                          }}
                        >
                          <Icon.Close size={12} />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div style={{ color: 'var(--fg-muted)', fontSize: 12 }}>Sin personas asignadas todavia.</div>
            )}

            {canManageAssignments && addingAssignment && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '6px 0 0', borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', paddingTop: 6 }}>
                  <select
                    value={addAssignUser}
                    onChange={(e) => setAddAssignUser(e.target.value)}
                    style={{
                      flex: 1, minWidth: 140, fontSize: 12, padding: '4px 6px', borderRadius: 4,
                      background: 'var(--bg-elev)', color: 'var(--fg)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <option value="">Selecciona usuario...</option>
                    {availableUsersForNewAssignment.map(([id, label]) => (
                      <option key={id} value={id}>{label}</option>
                    ))}
                  </select>
                  <select
                    value={addAssignRole}
                    onChange={(e) => setAddAssignRole(e.target.value)}
                    style={{
                      fontSize: 12, padding: '4px 6px', borderRadius: 4,
                      background: 'var(--bg-elev)', color: 'var(--fg)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    {nonOwnerRoleOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    onClick={handleAddAssignment}
                    disabled={assignmentBusy === 'add' || !addAssignUser}
                    className="edms-button edms-button-primary"
                    style={{ ...btnStylePrimary, padding: '5px 10px', fontSize: 12 }}
                  >
                    {assignmentBusy === 'add' ? 'Agregando...' : 'Agregar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAddingAssignment(false); setAssignmentError(null); setAddAssignUser('') }}
                    className="edms-button"
                    style={{ ...btnStyleGhost, padding: '5px 10px', fontSize: 12 }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {!canManageAssignments && assignments.some((a) => a.role_code !== 'encargado') && (
              <div style={{ color: 'var(--fg-dim)', fontSize: 11.5, fontStyle: 'italic' }}>
                Solo el encargado puede gestionar las personas asignadas.
              </div>
            )}
            {!canManageAssignments && assignments.length <= 1 && canAssignAssignee === false && (
              <div style={{ color: 'var(--fg-dim)', fontSize: 11.5, fontStyle: 'italic' }}>
                Solo el encargado puede agregar o quitar personas.
              </div>
            )}
            {assignmentError && (
              <div style={{ color: 'var(--danger)', fontSize: 11.5 }}>{assignmentError}</div>
            )}
          </div>

          {(canManagePermissions || grants.length > 0) && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-elev-2)', padding: '10px 12px', marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--fg-dim)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon.Lock size={11} /> Permisos
                </div>
                {canManagePermissions && !addingGrant && (
                  <button
                    type="button"
                    onClick={() => setAddingGrant(true)}
                    className="edms-button"
                    style={{ ...btnStyleGhost, padding: '3px 8px', fontSize: 11 }}
                  >
                    <Icon.Plus size={11} /> Otorgar
                  </button>
                )}
              </div>

              {!grantsLoaded ? (
                <div style={{ color: 'var(--fg-muted)', fontSize: 12 }}>Cargando permisos...</div>
              ) : grants.length === 0 ? (
                <div style={{ color: 'var(--fg-muted)', fontSize: 12 }}>Sin permisos otorgados todavia.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {grants.map((grant) => {
                    const removeBusy = grantBusy === `remove-${grant.id}`
                    const expired = Boolean(grant.is_expired)
                    return (
                      <div key={grant.id} style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12.5 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <OwnerAvatar userId={grant.grantee_user_id} size={20} />
                          <span style={{ color: 'var(--fg)', flex: 1, minWidth: 0 }}>{userLabel(grant.grantee_user_id)}</span>
                          <span style={{
                            fontSize: 11, padding: '1px 8px', borderRadius: 999,
                            background: 'var(--accent-soft)', color: 'var(--accent)',
                            border: '1px solid var(--accent)', fontWeight: 500,
                            opacity: expired ? 0.55 : 1,
                          }}>
                            {grant.permission_code}
                          </span>
                          {expired && (
                            <span style={{
                              fontSize: 10, padding: '1px 6px', borderRadius: 999,
                              background: 'var(--warn-soft)', color: 'var(--warn)',
                              border: '1px solid var(--warn)', fontWeight: 600,
                              textTransform: 'uppercase', letterSpacing: '0.04em',
                            }}>
                              Expirado
                            </span>
                          )}
                          {canManagePermissions && (
                            <button
                              type="button"
                              onClick={() => handleRevokePermission(grant.id)}
                              disabled={removeBusy}
                              title="Revocar permiso"
                              className="edms-nav-item"
                              style={{
                                width: 22, height: 22, borderRadius: 4,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: 'var(--fg-muted)', background: 'transparent', border: 'none',
                                cursor: removeBusy ? 'wait' : 'pointer',
                              }}
                            >
                              <Icon.Close size={12} />
                            </button>
                          )}
                        </div>
                        {grant.expires_at && (
                          <div style={{ fontSize: 11, color: expired ? 'var(--warn)' : 'var(--fg-muted)', marginLeft: 28 }}>
                            {expired ? 'Expiró el ' : 'Vence el '}
                            {formatDocumentDate(grant.expires_at)}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {canManagePermissions && addingGrant && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '6px 0 0', borderTop: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', paddingTop: 6 }}>
                    <select
                      value={grantUserDraft}
                      onChange={(e) => setGrantUserDraft(e.target.value)}
                      style={{
                        flex: 1, minWidth: 140, fontSize: 12, padding: '4px 6px', borderRadius: 4,
                        background: 'var(--bg-elev)', color: 'var(--fg)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <option value="">Selecciona usuario...</option>
                      {assigneeOptions.map(([id, label]) => (
                        <option key={id} value={id}>{label}</option>
                      ))}
                    </select>
                    <select
                      value={grantCodeDraft}
                      onChange={(e) => setGrantCodeDraft(e.target.value)}
                      style={{
                        fontSize: 12, padding: '4px 6px', borderRadius: 4,
                        background: 'var(--bg-elev)', color: 'var(--fg)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      {PERMISSION_CODES.map((code) => (
                        <option key={code} value={code}>{code}</option>
                      ))}
                    </select>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--fg-muted)' }}>
                    <span style={{ minWidth: 90 }}>Vence (opcional)</span>
                    <input
                      type="datetime-local"
                      value={grantExpiresDraft}
                      onChange={(e) => setGrantExpiresDraft(e.target.value)}
                      style={{
                        flex: 1, fontSize: 12, padding: '4px 6px', borderRadius: 4,
                        background: 'var(--bg-elev)', color: 'var(--fg)',
                        border: '1px solid var(--border)',
                      }}
                    />
                  </label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      onClick={handleGrantPermission}
                      disabled={grantBusy === 'add' || !grantUserDraft}
                      className="edms-button edms-button-primary"
                      style={{ ...btnStylePrimary, padding: '5px 10px', fontSize: 12 }}
                    >
                      {grantBusy === 'add' ? 'Otorgando...' : 'Otorgar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setAddingGrant(false); setGrantError(null); setGrantUserDraft(''); setGrantExpiresDraft('') }}
                      className="edms-button"
                      style={{ ...btnStyleGhost, padding: '5px 10px', fontSize: 12 }}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {grantError && (
                <div style={{ color: 'var(--danger)', fontSize: 11.5 }}>{grantError}</div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {[
              ['Autor', <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><OwnerAvatar userId={doc.owner} size={18} /><span>{owner?.name ?? userLabel(doc.owner)}</span></div>],
              ['Encargado', assigneeField],
              ['Estado workflow', <StateBadge state={workflow?.state_code ?? detail?.document.workflow_state_code} />],
              ['Expediente', (() => {
                if (doc.folder === 'root' || !doc.folder) {
                  return <span style={{ color: 'var(--fg-dim)' }}>Sin expediente</span>
                }
                const exp = expedients.find((item) => item.id === doc.folder)
                if (exp && onOpenExpedient) {
                  return (
                    <button
                      onClick={() => onOpenExpedient(exp.id)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, fontSize: 'inherit' }}
                    >
                      <Icon.Folder size={12} />
                      {exp.code ? `${exp.name} (${exp.code})` : exp.name}
                    </button>
                  )
                }
                return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon.Folder size={12} style={{ color: 'var(--fg-dim)' }} />{exp?.name ?? doc.folder}</span>
              })()],
              ['Tipo documental', doc.documentTypeId ?? kind.label],
              ['Confidencialidad', confidentialityLabel(doc.confidentialityLevel)],
              ['Vence', doc.dueDate ? (() => {
                const urg = dueUrgency(doc.dueDate)
                return (
                  <span
                    style={{
                      color: urg.color,
                      background: urg.soft,
                      border: `1px solid ${urg.color}`,
                      borderRadius: 999,
                      padding: '2px 9px',
                      fontSize: 11.5,
                      fontWeight: 500,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                    }}
                  >
                    <Icon.Clock size={12} />
                    {dueDateLabel(doc.dueDate)}{urg.label ? ` · ${urg.label}` : ''}
                  </span>
                )
              })() : <span style={{ color: 'var(--fg-dim)' }}>Sin fecha</span>],
              ['Descripcion', doc.description || <span style={{ color: 'var(--fg-dim)' }}>—</span>],
              ['Archivo', currentFile?.original_filename ?? <span style={{ color: 'var(--fg-dim)' }}>Sin archivo principal</span>],
              ['Tamaño', currentFile?.size_bytes ? formatFileSize(currentFile.size_bytes) : doc.size],
              ['Tipo', currentFile?.mime_type ? fileKindLabel(currentFile.mime_type) : kind.label],
              [doc.pages ? 'Páginas' : 'Filas', doc.pages ?? doc.rows?.toLocaleString('es-ES') ?? '—'],
              ['Compartido', doc.shared.length > 0 ? <AvatarStack ids={doc.shared} max={5} /> : <span style={{ color: 'var(--fg-dim)' }}>Solo tú</span>],
              ['Etiquetas', doc.tags.length > 0 ? <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{doc.tags.map((tag) => <TagChip key={tag} id={tag} tags={tags} />)}</div> : <span style={{ color: 'var(--fg-dim)' }}>—</span>],
            ].map(([label, value], index) => (
              <div
                key={String(label)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '7px 0',
                  borderTop: index === 0 ? 'none' : '1px solid var(--border)',
                  fontSize: 12.5,
                }}
              >
                <span style={{ width: 88, color: 'var(--fg-dim)', flexShrink: 0 }}>{label}</span>
                <span style={{ color: 'var(--fg)', flex: 1, minWidth: 0 }}>{value as ReactNode}</span>
              </div>
            ))}
          </div>
        </div>

        <div
          style={
            fullScreen
              ? {
                  gridColumn: 2,
                  gridRow: '1 / 4',
                  alignSelf: 'start',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16,
                  minWidth: 0,
                }
              : { padding: '0 14px 14px' }
          }
        >
          <div
            style={
              fullScreen
                ? {
                    height: '78vh',
                    minHeight: 460,
                    background: 'var(--bg-elev-2)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: '14px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                  }
                : undefined
            }
          >
            <div style={{ fontSize: 11, color: 'var(--fg-dim)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <Icon.Clock size={11} /> Comentarios
            </div>

            {detail?.permissions?.can_comment !== false && (
              <div style={{ position: 'relative', display: 'flex', gap: 6, marginBottom: 10, flexShrink: 0 }}>
                <textarea
                  ref={commentRef}
                  value={commentText}
                  onChange={(e) => handleCommentChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
                  placeholder="Escribe un comentario... usa @ para mencionar"
                  rows={2}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape' && mention) { setMention(null); return }
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSubmitComment()
                  }}
                  style={{
                    flex: 1, resize: 'none', fontSize: 12, padding: '6px 8px',
                    borderRadius: 6, border: '1px solid var(--border)',
                    background: 'var(--bg-elev-2)', color: 'var(--fg)',
                    outline: 'none', fontFamily: 'inherit',
                  }}
                />
                <button
                  onClick={handleSubmitComment}
                  disabled={commentSending || !commentText.trim()}
                  style={{
                    padding: '6px 10px', borderRadius: 6, fontSize: 12, alignSelf: 'flex-end',
                    background: 'var(--accent)', color: '#fff', border: 'none',
                    cursor: commentSending || !commentText.trim() ? 'default' : 'pointer',
                    opacity: commentSending || !commentText.trim() ? 0.5 : 1,
                  }}
                >
                  {commentSending ? '…' : 'Enviar'}
                </button>
                {mention && mentionMatches.length > 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      marginTop: 4,
                      minWidth: 200,
                      maxWidth: 280,
                      background: 'var(--bg-elev)',
                      border: '1px solid var(--border-strong)',
                      borderRadius: 8,
                      boxShadow: 'var(--shadow)',
                      zIndex: 60,
                      overflow: 'hidden',
                    }}
                  >
                    {mentionMatches.map(([userId, label]) => (
                      <button
                        key={userId}
                        type="button"
                        className="edms-nav-item"
                        onClick={() => applyMention(label)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                          padding: '7px 10px', background: 'transparent', border: 'none',
                          color: 'var(--fg)', fontSize: 12, cursor: 'pointer', textAlign: 'left',
                        }}
                      >
                        <span style={{ color: 'var(--accent)', fontWeight: 600 }}>@</span>
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div style={fullScreen ? { flex: 1, overflowY: 'auto', minHeight: 0 } : undefined}>
              {(detail?.comments ?? []).length > 0 ? (
                <div style={{ marginBottom: 8 }}>
                  {detail!.comments.map((item) => {
                    const override = commentResolutionOverrides[item.id]
                    const resolvedAt = override ? override.resolved_at : (item.resolved_at ?? null)
                    const resolvedBy = override ? override.resolved_by_user_id : (item.resolved_by_user_id ?? null)
                    const isResolved = Boolean(resolvedAt)
                    const canToggle = item.actor_user_id === currentUserId || (detail?.permissions?.can_comment ?? false)
                    const busy = commentResolveBusy === item.id
                    return (
                      <div key={item.id} style={{ padding: '7px 0', borderTop: '1px solid var(--border)', fontSize: 12, opacity: isResolved ? 0.7 : 1 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                          <div style={{ color: 'var(--fg)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', flex: 1, textDecoration: isResolved ? 'line-through' : 'none' }}>
                            {renderCommentBody(item.body ?? '')}
                          </div>
                          {isResolved && (
                            <span style={{
                              fontSize: 10, padding: '1px 6px', borderRadius: 999,
                              background: 'var(--ok-soft)', color: 'var(--ok)',
                              border: '1px solid var(--ok)', fontWeight: 600,
                              textTransform: 'uppercase', letterSpacing: '0.04em',
                              flexShrink: 0,
                            }}>
                              Resuelto
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--fg-dim)', fontSize: 11, marginTop: 2 }}>
                          <span>{userLabel(item.actor_user_id)} · {formatDocumentDate(item.created_at)}</span>
                          {isResolved && resolvedBy && (
                            <span>· resuelto por {userLabel(resolvedBy)}</span>
                          )}
                          {canToggle && (
                            <button
                              type="button"
                              onClick={() => handleToggleResolveComment(item.id, isResolved)}
                              disabled={busy}
                              style={{
                                marginLeft: 'auto', background: 'none', border: 'none', padding: 0,
                                color: 'var(--accent)', fontSize: 11, cursor: busy ? 'wait' : 'pointer',
                              }}
                            >
                              {busy ? '…' : isResolved ? 'Reabrir' : 'Marcar resuelto'}
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div style={{ color: 'var(--fg-muted)', fontSize: 12, padding: '6px 0 4px' }}>Sin comentarios aún.</div>
              )}
            </div>
          </div>

          {historyItems.length > 0 && (
            <div
              style={
                fullScreen
                  ? {
                      background: 'var(--bg-elev-2)',
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      padding: '14px 16px',
                      display: 'flex',
                      flexDirection: 'column',
                      maxHeight: '40vh',
                    }
                  : undefined
              }
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, margin: fullScreen ? '0 0 6px' : '10px 0 6px', flexShrink: 0 }}>
                <div style={{ fontSize: 11, color: 'var(--fg-dim)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon.Clock size={11} /> Actividad del documento
                </div>
                <select
                  value={timelineFilter}
                  onChange={(e) => setTimelineFilter(e.target.value as typeof timelineFilter)}
                  title="Filtrar por tipo de evento"
                  style={{
                    fontSize: 11, padding: '2px 5px', borderRadius: 4,
                    background: 'var(--bg-elev)', color: 'var(--fg)',
                    border: '1px solid var(--border)', cursor: 'pointer',
                  }}
                >
                  <option value="todos">Todos</option>
                  <option value="estado">Estado</option>
                  <option value="asignaciones">Asignaciones</option>
                  <option value="permisos">Permisos</option>
                  <option value="versiones">Versiones</option>
                  <option value="metadata">Metadata</option>
                </select>
              </div>
              {(() => {
                const filtered = timelineFilter === 'todos'
                  ? historyItems
                  : historyItems.filter((item) => timelineCategory(item.action) === timelineFilter)
                const visible = showFullTimeline ? filtered : filtered.slice(0, 5)
                return (
                  <div style={fullScreen ? { flex: 1, overflowY: 'auto', minHeight: 0 } : undefined}>
                    {visible.length === 0 && (
                      <div style={{ color: 'var(--fg-muted)', fontSize: 12, padding: '6px 0 4px' }}>Sin eventos para este filtro.</div>
                    )}
                    {visible.map((item) => (
                      <div key={item.id} style={{ padding: '7px 0', borderTop: '1px solid var(--border)', fontSize: 12 }}>
                        <div style={{ color: 'var(--fg)' }}>{timelineLabel(item)}</div>
                        <div style={{ color: 'var(--fg-dim)', fontSize: 11 }}>
                          {formatDocumentDate(item.created_at)} · {userLabel(item.actor_user_id)}
                        </div>
                      </div>
                    ))}
                    {filtered.length > 5 && (
                      <button
                        onClick={() => setShowFullTimeline((v) => !v)}
                        style={{ marginTop: 6, fontSize: 11.5, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                      >
                        {showFullTimeline ? 'Ver menos' : `Ver todos (${filtered.length})`}
                      </button>
                    )}
                  </div>
                )
              })()}
            </div>
          )}
        </div>

        <div style={{ padding: '0 14px 14px', ...(fullScreen ? { gridColumn: 1, gridRow: 3, padding: '8px 0 0', alignSelf: 'start' } : {}) }}>
          <div style={{ fontSize: 11, color: 'var(--fg-dim)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon.Branch size={11} /> Historial de versiones
          </div>
          {effectiveVersion === 0 && (
            <div style={{ color: 'var(--fg-muted)', fontSize: 12, padding: '7px 0' }}>
              Aun no hay archivo principal ni versiones registradas.
            </div>
          )}
          {(detail?.files ?? []).slice(0, fullScreen ? 50 : 4).map((file, index) => {
            const isPreviewed = previewFile?.id === file.id
            const isDownloading = downloadingFileId === file.file_id
            return (
              <div
                key={file.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 8px',
                  borderTop: index === 0 ? 'none' : '1px solid var(--border)',
                  background: isPreviewed ? 'var(--accent-soft)' : 'transparent',
                  color: 'var(--fg)',
                }}
              >
                <button
                  type="button"
                  onClick={() => setViewVersionId(file.is_current ? null : file.id)}
                  className="edms-nav-item"
                  title={file.is_current ? 'Ver versión actual' : `Previsualizar v${file.version_number}`}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: 0,
                    background: 'transparent', border: 'none', textAlign: 'left',
                    cursor: 'pointer', color: 'inherit', minWidth: 0,
                  }}
                >
                  <span
                    style={{
                      width: 28,
                      height: 18,
                      borderRadius: 4,
                      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                      fontSize: 10.5,
                      fontWeight: 600,
                      background: file.is_current ? 'var(--accent-soft)' : 'var(--bg-elev-2)',
                      color: file.is_current ? 'var(--accent)' : 'var(--fg-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    v{file.version_number}
                  </span>
                  <div style={{ flex: 1, fontSize: 12, minWidth: 0 }}>
                    <div style={{ color: 'var(--fg)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {file.is_current ? 'actual' : file.original_filename ?? 'version anterior'}
                      {isPreviewed && !file.is_current && (
                        <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600 }}>· en vista previa</span>
                      )}
                    </div>
                    <div style={{ color: 'var(--fg-dim)', fontSize: 11 }}>
                      {formatDocumentDate(file.created_at)} · {userLabel(file.uploaded_by_user_id)}
                      {file.size_bytes ? ` · ${formatFileSize(file.size_bytes)}` : ''}
                    </div>
                    {file.version_comment && (
                      <div style={{ color: 'var(--fg-muted)', fontSize: 11, marginTop: 2, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        "{file.version_comment}"
                      </div>
                    )}
                  </div>
                </button>
                {canDownloadFile && (
                  <button
                    type="button"
                    onClick={() => handleDownloadVersion(file)}
                    disabled={isDownloading}
                    title={`Descargar v${file.version_number}`}
                    className="edms-nav-item"
                    style={{
                      width: 26, height: 26, borderRadius: 5,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--fg-muted)', background: 'transparent', border: 'none',
                      cursor: isDownloading ? 'wait' : 'pointer', flexShrink: 0,
                    }}
                  >
                    <Icon.Download size={13} />
                  </button>
                )}
              </div>
            )
          })}
          {!detail && Array.from({ length: Math.min(doc.version, 4) }).map((_, index) => {
            const version = doc.version - index
            const labels = ['actual', 'hace 1 día', 'hace 3 días', 'hace 1 semana']
            return (
              <div key={version} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderTop: index === 0 ? 'none' : '1px solid var(--border)' }}>
                <span
                  style={{
                    width: 28,
                    height: 18,
                    borderRadius: 4,
                    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                    fontSize: 10.5,
                    fontWeight: 600,
                    background: index === 0 ? 'var(--accent-soft)' : 'var(--bg-elev-2)',
                    color: index === 0 ? 'var(--accent)' : 'var(--fg-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  v{version}
                </span>
                <div style={{ flex: 1, fontSize: 12 }}>
                  <div style={{ color: 'var(--fg)' }}>{labels[index] ?? `hace ${index} semanas`}</div>
                  <div style={{ color: 'var(--fg-dim)', fontSize: 11 }}>por {dashboardData.users[index % dashboardData.users.length].name.split(' ')[0]}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </aside>
  )
}

const btnStylePrimary: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  padding: '8px 12px',
  borderRadius: 6,
  fontSize: 12.5,
  fontWeight: 500,
  background: 'var(--accent)',
  color: 'var(--accent-fg)',
  border: '1px solid var(--accent)',
}

const btnStyleGhost: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  padding: '8px 12px',
  borderRadius: 6,
  fontSize: 12.5,
  fontWeight: 500,
  background: 'var(--bg-elev-2)',
  color: 'var(--fg)',
  border: '1px solid var(--border)',
}

function FileDetailDrawer({
  file,
  busy,
  uploaderLabel,
  onClose,
  onTrash,
  onCreateDocument,
  onAssignDocument,
}: {
  file: StoredFileItem | null
  busy: boolean
  uploaderLabel: string
  onClose: () => void
  onTrash: (file: StoredFileItem) => void
  onCreateDocument: (file: StoredFileItem) => void
  onAssignDocument: (file: StoredFileItem) => void
}) {
  const [preview, setPreview] = useState<{
    fileId: string
    url?: string
    error?: string
  } | null>(null)

  useEffect(() => {
    if (!file) return
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [file, onClose])

  useEffect(() => {
    if (!file) return
    const controller = new AbortController()
    let objectUrl: string | null = null

    getFileContent(file.id, controller.signal)
      .then((response) => {
        objectUrl = URL.createObjectURL(response.data)
        setPreview({ fileId: file.id, url: objectUrl })
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setPreview({ fileId: file.id, error: 'No se pudo cargar la vista previa' })
        }
      })

    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [file])

  if (!file) return null

  const label = fileKindLabel(file.mime_type)
  const tone = fileTone(file.mime_type)
  const uploadedAt = formatUploadedAt(file.uploaded_at)
  const activePreview = preview?.fileId === file.id ? preview : null

  return (
    <aside
      style={{
        width: 380,
        height: '100%',
        flexShrink: 0,
        background: 'var(--bg-elev)',
        borderLeft: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        animation: 'edms-slide-in 0.18s ease-out',
      }}
    >
      <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border)' }}>
        <span
          style={{
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 10,
            fontWeight: 700,
            padding: '3px 7px',
            borderRadius: 5,
            color: tone,
            background: `color-mix(in oklch, ${tone} 16%, var(--bg-elev-2))`,
          }}
        >
          {label}
        </span>
        <span style={{ flex: 1, fontSize: 12, color: 'var(--fg-muted)' }}>Archivo sin asignar</span>
        <button className="edms-nav-item" title="Vista previa" style={{ width: 26, height: 26, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-muted)' }}>
          <Icon.Eye size={14} />
        </button>
        <button onClick={onClose} className="edms-nav-item" title="Cerrar" style={{ width: 26, height: 26, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-muted)' }}>
          <Icon.Close size={14} />
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ padding: '14px 14px 0' }}>
          <div
            style={{
              aspectRatio: file.mime_type.startsWith('image/') ? '16 / 10' : '8.5 / 11',
              borderRadius: 9,
              overflow: 'hidden',
              background: 'var(--bg-elev-2)',
              border: '1px solid var(--border)',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {activePreview?.url ? (
              file.mime_type.startsWith('image/') ? (
                <img
                  src={activePreview.url}
                  alt={`Vista previa de ${file.original_filename}`}
                  style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#05070a' }}
                />
              ) : (
                <iframe
                  src={activePreview.url}
                  title={`Vista previa de ${file.original_filename}`}
                  style={{ width: '100%', height: '100%', border: 0, background: '#05070a' }}
                />
              )
            ) : (
              <div style={{ padding: 18, textAlign: 'center', color: activePreview?.error ? 'var(--danger)' : 'var(--fg-muted)', fontSize: 12.5 }}>
                {activePreview?.error ?? 'Cargando vista previa...'}
              </div>
            )}
          </div>
        </div>

        <div style={{ padding: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg)', marginBottom: 6, lineHeight: 1.3, wordBreak: 'break-word' }}>
            {file.original_filename}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ color: 'var(--fg-muted)', fontSize: 12 }}>Sin documento asociado</span>
            <span style={{ color: 'var(--fg-dim)', fontSize: 11 }}>·</span>
            <span style={{ color: 'var(--fg-muted)', fontSize: 12 }}>{uploadedAt}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 14 }}>
            <button
              className="edms-button edms-button-primary"
              disabled={busy}
              onClick={() => onCreateDocument(file)}
              style={{ ...btnStylePrimary, opacity: busy ? 0.7 : 1 }}
            >
              <Icon.File size={13} /> Crear documento
            </button>
            <button
              className="edms-button"
              disabled={busy}
              onClick={() => onAssignDocument(file)}
              style={{ ...btnStyleGhost, opacity: busy ? 0.7 : 1 }}
            >
              <Icon.Move size={13} /> Asignar
            </button>
            <button
              className="edms-button"
              disabled={busy}
              onClick={() => onTrash(file)}
              style={{ ...btnStyleGhost, color: 'var(--danger)', opacity: busy ? 0.7 : 1 }}
            >
              <Icon.Trash size={13} /> Papelera
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {[
              ['Subido por', uploaderLabel],
              ['Formato', label],
              ['Tamaño', formatFileSize(file.size_bytes)],
              ['Fecha de carga', uploadedAt],
            ].map(([labelText, value], index) => (
              <div
                key={String(labelText)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '8px 0',
                  borderTop: index === 0 ? 'none' : '1px solid var(--border)',
                  fontSize: 12.5,
                }}
              >
                <span style={{ width: 96, color: 'var(--fg-dim)', flexShrink: 0 }}>{labelText}</span>
                <span style={{ color: 'var(--fg)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{value as ReactNode}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: '0 14px 16px' }}>
          <div style={{ fontSize: 11, color: 'var(--fg-dim)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon.Branch size={11} /> Siguiente paso
          </div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-elev-2)', padding: 11, color: 'var(--fg-muted)', fontSize: 12.5, lineHeight: 1.5 }}>
            Este archivo esta guardado en MinIO, pero todavia no forma parte del expediente documental. Puedes crear un documento desde este archivo, asignarlo a un documento existente o enviarlo a papelera si fue una carga equivocada.
          </div>
        </div>
      </div>
    </aside>
  )
}

function ContextMenu({
  ctx,
  onClose,
  onAction,
}: {
  ctx: ContextMenuState | null
  onClose: () => void
  onAction: (action: string, docId?: string) => void | Promise<void>
}) {
  useEffect(() => {
    if (!ctx) return
    function handleClose() {
      onClose()
    }

    const timer = setTimeout(() => {
      document.addEventListener('click', handleClose)
      document.addEventListener('contextmenu', handleClose)
    }, 0)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('click', handleClose)
      document.removeEventListener('contextmenu', handleClose)
    }
  }, [ctx, onClose])

  if (!ctx) return null

  const items: Array<MenuItem | null> = [
    { id: 'open', icon: <Icon.Eye size={13} />, label: 'Abrir' },
    { id: 'preview', icon: <Icon.Panel size={13} />, label: 'Vista previa', shortcut: 'Espacio' },
    null,
    { id: 'share', icon: <Icon.Share size={13} />, label: 'Compartir…', shortcut: '⌘⇧S' },
    { id: 'sign', icon: <Icon.Signature size={13} />, label: 'Solicitar firma' },
    { id: 'download', icon: <Icon.Download size={13} />, label: 'Descargar', shortcut: '⌘D' },
    null,
    { id: 'edit-metadata', icon: <Icon.File size={13} />, label: 'Editar metadata', shortcut: 'F2' },
    { id: 'move', icon: <Icon.Move size={13} />, label: 'Mover a…' },
    { id: 'tag', icon: <Icon.Tag size={13} />, label: 'Añadir etiqueta' },
    { id: 'star', icon: <Icon.Star size={13} />, label: 'Marcar favorito' },
    null,
    { id: 'trash', icon: <Icon.Trash size={13} />, label: 'Mover a papelera', danger: true, shortcut: '⌫' },
  ] as const

  const x = Math.min(ctx.x, window.innerWidth - 230)
  const y = Math.min(ctx.y, window.innerHeight - 370)

  return (
    <div
      onClick={(event) => event.stopPropagation()}
      style={{
        position: 'fixed',
        top: y,
        left: x,
        zIndex: 100,
        background: 'var(--bg-elev)',
        border: '1px solid var(--border-strong)',
        borderRadius: 8,
        boxShadow: 'var(--shadow)',
        padding: 4,
        minWidth: 210,
      }}
    >
      {items.map((item, index) =>
        item === null ? (
          <div key={`divider-${index}`} style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
        ) : (
          <button
            key={item.id}
            onClick={() => {
              onAction(item.id, ctx.docId)
              onClose()
            }}
            className="edms-nav-item"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              width: '100%',
              padding: '6px 10px',
              borderRadius: 5,
              fontSize: 12.5,
              color: item.danger ? 'var(--danger)' : 'var(--fg)',
            }}
          >
            <span style={{ color: item.danger ? 'var(--danger)' : 'var(--fg-muted)' }}>{item.icon}</span>
            <span style={{ flex: 1, textAlign: 'left' }}>{item.label}</span>
            {item.shortcut && (
              <span style={{ fontSize: 10.5, color: 'var(--fg-dim)', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
                {item.shortcut}
              </span>
            )}
          </button>
        ),
      )}
    </div>
  )
}

function notifIcon(type: string) {
  if (type === 'nuevo_comentario') return <Icon.Comment size={13} style={{ color: 'var(--accent)' }} />
  if (type === 'mencion') return <Icon.AtSign size={13} style={{ color: 'var(--accent)' }} />
  return <Icon.Users size={13} style={{ color: 'var(--accent)' }} />
}

function NotifPopover({
  open,
  onClose,
  items,
  onMarkRead,
  onMarkAllRead,
  onOpenDoc,
  onSeeAll,
  bellRef,
}: {
  open: boolean
  onClose: () => void
  items: NotificationItem[]
  onMarkRead: (id: string) => void
  onMarkAllRead: () => void
  onOpenDoc: (id: string) => void
  onSeeAll: () => void
  bellRef: React.RefObject<HTMLButtonElement | null>
}) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)

  // useLayoutEffect: medir y posicionar ANTES del paint para que no haya
  // un salto visible desde la posicion de fallback a la correcta.
  useLayoutEffect(() => {
    if (!open) return
    function compute() {
      const rect = bellRef.current?.getBoundingClientRect()
      if (rect) {
        setPos({
          top: Math.round(rect.bottom + 6),
          right: Math.max(8, Math.round(window.innerWidth - rect.right)),
        })
      }
    }
    compute()
    window.addEventListener('resize', compute)
    window.addEventListener('scroll', compute, true)
    return () => {
      window.removeEventListener('resize', compute)
      window.removeEventListener('scroll', compute, true)
    }
  }, [open, bellRef])

  if (!open) return null

  const hasUnread = items.some((item) => !item.is_read)

  function handleItemClick(item: NotificationItem) {
    if (!item.is_read) onMarkRead(item.id)
    if (item.document_id) {
      onOpenDoc(item.document_id)
      onClose()
    }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000 }} />
      <div
        style={{
          position: 'fixed',
          top: pos?.top ?? 56,
          right: pos?.right ?? 16,
          width: 340,
          background: 'var(--bg-elev)',
          border: '1px solid var(--border-strong)',
          borderRadius: 10,
          boxShadow: 'var(--shadow)',
          zIndex: 1001,
          opacity: pos ? 1 : 0,
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Notificaciones</span>
          <button
            onClick={onMarkAllRead}
            disabled={!hasUnread}
            style={{ fontSize: 11, color: hasUnread ? 'var(--accent)' : 'var(--fg-dim)', cursor: hasUnread ? 'pointer' : 'default' }}
          >
            Marcar todo leído
          </button>
        </div>
        {items.length === 0 && (
          <div style={{ padding: '20px 14px', fontSize: 12, color: 'var(--fg-muted)', textAlign: 'center' }}>
            No tienes notificaciones
          </div>
        )}
        <div style={{ maxHeight: 380, overflowY: 'auto' }}>
          {items.map((item, index) => (
            <div
              key={item.id}
              className="edms-nav-item"
              onClick={() => handleItemClick(item)}
              style={{
                padding: '10px 14px',
                borderBottom: index !== items.length - 1 ? '1px solid var(--border)' : 'none',
                display: 'flex',
                gap: 10,
                cursor: 'pointer',
                background: item.is_read ? 'transparent' : 'color-mix(in oklch, var(--accent) 7%, transparent)',
              }}
            >
              <div style={{ width: 24, height: 24, borderRadius: 12, background: 'var(--bg-elev-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {notifIcon(item.type)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, color: 'var(--fg)', fontWeight: item.is_read ? 400 : 600, marginBottom: 2 }}>{item.title}</div>
                {item.body && (
                  <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.body}</div>
                )}
              </div>
              <span style={{ fontSize: 10.5, color: 'var(--fg-dim)', flexShrink: 0 }}>{notifTimeAgo(item.created_at)}</span>
            </div>
          ))}
        </div>
        <button
          onClick={onSeeAll}
          className="edms-nav-item"
          style={{
            width: '100%',
            padding: '10px 14px',
            borderTop: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--accent)',
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
            textAlign: 'center',
          }}
        >
          Ver todas
        </button>
      </div>
    </>
  )
}

function NotificationsModal({
  open,
  onClose,
  items,
  onMarkRead,
  onMarkAllRead,
  onOpenDoc,
}: {
  open: boolean
  onClose: () => void
  items: NotificationItem[]
  onMarkRead: (id: string) => void
  onMarkAllRead: () => void
  onOpenDoc: (id: string) => void
}) {
  if (!open) return null

  const hasUnread = items.some((item) => !item.is_read)

  function handleItemClick(item: NotificationItem) {
    if (!item.is_read) onMarkRead(item.id)
    if (item.document_id) {
      onOpenDoc(item.document_id)
      onClose()
    }
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-elev)',
          border: '1px solid var(--border-strong)',
          borderRadius: 12,
          width: 560,
          maxWidth: '92vw',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 15 }}>Todas las notificaciones</h3>
            <p style={{ margin: '4px 0 0', color: 'var(--fg-muted)', fontSize: 12 }}>
              {items.length} en total{hasUnread ? ` · ${items.filter((i) => !i.is_read).length} sin leer` : ''}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={onMarkAllRead}
              disabled={!hasUnread}
              style={{ fontSize: 12, color: hasUnread ? 'var(--accent)' : 'var(--fg-dim)', cursor: hasUnread ? 'pointer' : 'default' }}
            >
              Marcar todo leído
            </button>
            <button
              onClick={onClose}
              className="edms-nav-item"
              style={{ width: 28, height: 28, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-muted)', cursor: 'pointer' }}
              aria-label="Cerrar"
            >
              <Icon.Close size={15} />
            </button>
          </div>
        </div>

        {items.length === 0 ? (
          <div style={{ padding: '40px 20px', fontSize: 13, color: 'var(--fg-muted)', textAlign: 'center' }}>
            No tienes notificaciones
          </div>
        ) : (
          <div style={{ overflowY: 'auto', padding: '6px 0' }}>
            {items.map((item) => (
              <div
                key={item.id}
                className="edms-nav-item"
                onClick={() => handleItemClick(item)}
                style={{
                  padding: '12px 20px',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  gap: 12,
                  cursor: item.document_id ? 'pointer' : 'default',
                  background: item.is_read ? 'transparent' : 'color-mix(in oklch, var(--accent) 7%, transparent)',
                }}
              >
                <div style={{ width: 28, height: 28, borderRadius: 14, background: 'var(--bg-elev-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {notifIcon(item.type)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <span style={{ fontSize: 13, color: 'var(--fg)', fontWeight: item.is_read ? 400 : 600 }}>{item.title}</span>
                    <span style={{ fontSize: 11, color: 'var(--fg-dim)', flexShrink: 0 }}>{notifTimeAgo(item.created_at)}</span>
                  </div>
                  {item.body && (
                    <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 3, lineHeight: 1.4 }}>{item.body}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function DropZoneOverlay({ active }: { active: boolean }) {
  if (!active) return null
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        background: 'color-mix(in oklch, var(--accent) 12%, transparent)',
        backdropFilter: 'blur(2px)',
        border: '3px dashed var(--accent)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          background: 'var(--bg-elev)',
          padding: '18px 28px',
          borderRadius: 12,
          boxShadow: 'var(--shadow)',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}
      >
        <Icon.Upload size={28} style={{ color: 'var(--accent)' }} />
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg)' }}>Suelta para subir</div>
          <div style={{ fontSize: 12.5, color: 'var(--fg-muted)' }}>Podras revisarlos antes de confirmar la carga</div>
        </div>
      </div>
    </div>
  )
}

function UploadFileModal({
  initialFiles,
  onClose,
  onUploaded,
}: {
  initialFiles: File[]
  onClose: () => void
  onUploaded: (message: string) => void
}) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>(initialFiles)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submitLabel = selectedFiles.length === 0
    ? 'Subir archivos'
    : `Subir ${selectedFiles.length} archivo${selectedFiles.length === 1 ? '' : 's'}`

  function appendFiles(files: FileList | File[]) {
    const incoming = Array.from(files)
    setSelectedFiles((current) => {
      const existing = new Set(current.map((file) => `${file.name}-${file.size}-${file.lastModified}`))
      return [
        ...current,
        ...incoming.filter((file) => !existing.has(`${file.name}-${file.size}-${file.lastModified}`)),
      ]
    })
    setError(null)
  }

  function removeFile(index: number) {
    setSelectedFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (selectedFiles.length === 0) {
      setError('Selecciona uno o mas archivos para subir')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      for (const file of selectedFiles) {
        await uploadDocumentFile({ file })
      }
      onUploaded(`${selectedFiles.length} archivo${selectedFiles.length === 1 ? '' : 's'} subido${selectedFiles.length === 1 ? '' : 's'}`)
      onClose()
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudieron subir los archivos'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div
        onClick={() => !submitting && onClose()}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1100,
          background: 'oklch(0 0 0 / 0.56)',
          backdropFilter: 'blur(10px)',
          pointerEvents: 'auto',
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1101,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          pointerEvents: 'none',
        }}
      >
        <form
          onSubmit={handleSubmit}
          style={{
            width: 'min(560px, 100%)',
            background: 'var(--bg-elev)',
            border: '1px solid var(--border-strong)',
            borderRadius: 14,
            boxShadow: 'var(--shadow)',
            overflow: 'hidden',
            pointerEvents: 'auto',
          }}
        >
          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg)', marginBottom: 4 }}>Cargar archivo</div>
            <div style={{ fontSize: 12.5, color: 'var(--fg-muted)' }}>
              Selecciona uno o mas archivos. Puedes quitar cualquiera antes de subir.
            </div>
          </div>

          <div style={{ padding: 18, display: 'grid', gap: 14 }}>
            <label
              style={{
                display: 'grid',
                gap: 10,
                border: '1px dashed var(--border-strong)',
                borderRadius: 12,
                background: 'var(--bg-elev-2)',
                padding: 16,
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              <input
                type="file"
                multiple
                accept="application/pdf,image/png,image/jpeg"
                disabled={submitting}
                onChange={(event) => {
                  if (event.target.files?.length) appendFiles(event.target.files)
                  event.currentTarget.value = ''
                }}
                style={{ display: 'none' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    background: 'var(--accent-soft)',
                    color: 'var(--accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon.Upload size={18} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: 'var(--fg)', fontSize: 13.5, fontWeight: 600 }}>
                    Seleccionar archivos
                  </div>
                  <div style={{ color: 'var(--fg-muted)', fontSize: 12 }}>
                    PDF, PNG o JPG. Maximo 100 MB por archivo.
                  </div>
                </div>
              </div>
            </label>

            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: 10,
                background: 'var(--bg-elev-2)',
                overflow: 'hidden',
              }}
            >
              {selectedFiles.length === 0 ? (
                <div style={{ padding: 14, color: 'var(--fg-muted)', fontSize: 12.5 }}>
                  Aun no hay archivos seleccionados.
                </div>
              ) : (
                selectedFiles.map((file, index) => (
                  <div
                    key={`${file.name}-${file.size}-${file.lastModified}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 12px',
                      borderBottom: index === selectedFiles.length - 1 ? 'none' : '1px solid var(--border)',
                    }}
                  >
                    <div
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 8,
                        background: 'var(--accent-soft)',
                        color: 'var(--accent)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Icon.File size={14} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: 'var(--fg)', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {file.name}
                      </div>
                      <div style={{ color: 'var(--fg-muted)', fontSize: 11.5 }}>
                        {formatFileSize(file.size)}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="edms-button"
                      disabled={submitting}
                      onClick={() => removeFile(index)}
                      title="Quitar archivo"
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: 'transparent',
                        color: 'var(--danger)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Icon.Trash size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>

            {error && (
              <div
                style={{
                  borderRadius: 8,
                  border: '1px solid color-mix(in oklch, var(--danger) 55%, var(--border))',
                  background: 'color-mix(in oklch, var(--danger) 12%, var(--bg-elev))',
                  color: 'var(--danger)',
                  padding: '10px 12px',
                  fontSize: 12.5,
                }}
              >
                {error}
              </div>
            )}
          </div>

          <div
            style={{
              padding: '14px 18px',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 10,
            }}
          >
            <button
              type="button"
              onClick={onClose}
              className="edms-button"
              disabled={submitting}
              style={{
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--bg-elev-2)',
                color: 'var(--fg-muted)',
                padding: '9px 14px',
                fontSize: 12.5,
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="edms-button edms-button-primary"
              disabled={submitting || selectedFiles.length === 0}
              style={{
                borderRadius: 8,
                border: '1px solid color-mix(in oklch, var(--accent) 60%, transparent)',
                background: 'var(--accent)',
                color: 'var(--accent-fg)',
                padding: '9px 14px',
                fontSize: 12.5,
                fontWeight: 600,
                opacity: submitting || selectedFiles.length === 0 ? 0.7 : 1,
              }}
            >
              {submitting ? 'Subiendo...' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}

function CreateDocumentModal({
  initialUnassignedFile,
  unassignedFiles,
  assigneeOptions,
  expedients,
  onClose,
  onCreated,
}: {
  initialUnassignedFile?: StoredFileItem | null
  unassignedFiles: StoredFileItem[]
  assigneeOptions: [string, string][]
  expedients: ExpedientItem[]
  onClose: () => void
  onCreated: (document: DocumentItemResponse, attachment?: DocumentAttachmentResult) => void
}) {
  const [title, setTitle] = useState(() => initialUnassignedFile ? titleFromFilename(initialUnassignedFile.original_filename) : '')
  const [documentTypeId, setDocumentTypeId] = useState('contrato')
  const [confidentialityLevel, setConfidentialityLevel] = useState('publico_interno')
  const [assigneeUserId, setAssigneeUserId] = useState(() => assigneeOptions[0]?.[0] ?? '')
  const [dueDate, setDueDate] = useState('')
  const [description, setDescription] = useState('')
  const [expedientId, setExpedientId] = useState('')
  const [attachmentMode, setAttachmentMode] = useState<'none' | 'existing' | 'upload'>(() => initialUnassignedFile ? 'existing' : 'none')
  const [selectedUnassignedFileId, setSelectedUnassignedFileId] = useState(initialUnassignedFile?.id ?? '')
  const [newFile, setNewFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!title.trim()) {
      setError('Ingresa el titulo del documento')
      return
    }
    if (!documentTypeId.trim()) {
      setError('Selecciona el tipo documental')
      return
    }
    if (!description.trim()) {
      setError('Ingresa una descripcion breve')
      return
    }
    if (attachmentMode === 'existing' && !selectedUnassignedFileId) {
      setError('Selecciona un archivo sin asignar')
      return
    }
    if (attachmentMode === 'upload' && !newFile) {
      setError('Selecciona el archivo que quieres subir')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const { data } = await createDocument({
        title: title.trim(),
        document_type_id: documentTypeId,
        description: description.trim(),
        expedient_id: expedientId.trim() || null,
        confidentiality_level: confidentialityLevel,
        assignee_user_id: assigneeUserId.trim() || assigneeOptions[0]?.[0] || null,
        due_date: dueDate.trim() || null,
      })
      const attachment: DocumentAttachmentResult = {}
      if (attachmentMode === 'existing') {
        await assignFileToDocument(selectedUnassignedFileId, data.id, 'Archivo principal inicial')
        attachment.attachedUnassignedFileId = selectedUnassignedFileId
      }
      if (attachmentMode === 'upload' && newFile) {
        await uploadDocumentFile({
          file: newFile,
          document_id: data.id,
          version_comment: 'Archivo principal inicial',
        })
        attachment.uploadedFile = newFile
      }
      onCreated(data, attachment)
      onClose()
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudo crear el documento'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div
        onClick={() => !submitting && onClose()}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1100,
          background: 'oklch(0 0 0 / 0.56)',
          backdropFilter: 'blur(10px)',
          pointerEvents: 'auto',
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1101,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          pointerEvents: 'none',
        }}
      >
        <form
          onSubmit={handleSubmit}
          style={{
            width: 'min(560px, 100%)',
            background: 'var(--bg-elev)',
            border: '1px solid var(--border-strong)',
            borderRadius: 14,
            boxShadow: 'var(--shadow)',
            overflow: 'hidden',
            pointerEvents: 'auto',
          }}
        >
          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg)', marginBottom: 4 }}>Crear documento</div>
            <div style={{ fontSize: 12.5, color: 'var(--fg-muted)' }}>
              Crea la ficha documental inicial y, si quieres, deja asociado su archivo principal.
            </div>
          </div>

          <div style={{ padding: 18, display: 'grid', gap: 13 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ color: 'var(--fg-muted)', fontSize: 12 }}>Titulo</span>
              <input
                value={title}
                disabled={submitting}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ej: Contrato de servicios 2026"
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  background: 'var(--bg-elev-2)',
                  color: 'var(--fg)',
                  padding: '10px 11px',
                  fontSize: 13,
                  outline: 'none',
                }}
              />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ color: 'var(--fg-muted)', fontSize: 12 }}>Tipo documental</span>
                <select
                  value={documentTypeId}
                  disabled={submitting}
                  onChange={(event) => setDocumentTypeId(event.target.value)}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    background: 'var(--bg-elev-2)',
                    color: 'var(--fg)',
                    padding: '10px 11px',
                    fontSize: 13,
                    outline: 'none',
                  }}
                >
                  <option value="contrato">Contrato</option>
                  <option value="informe">Informe</option>
                  <option value="acta">Acta</option>
                  <option value="politica">Politica</option>
                  <option value="memorando">Memorando</option>
                  <option value="planilla">Planilla</option>
                </select>
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ color: 'var(--fg-muted)', fontSize: 12 }}>Confidencialidad</span>
                <select
                  value={confidentialityLevel}
                  disabled={submitting}
                  onChange={(event) => setConfidentialityLevel(event.target.value)}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    background: 'var(--bg-elev-2)',
                    color: 'var(--fg)',
                    padding: '10px 11px',
                    fontSize: 13,
                    outline: 'none',
                  }}
                >
                  <option value="publico_interno">Publico interno</option>
                  <option value="confidencial">Confidencial</option>
                  <option value="reservado">Reservado</option>
                </select>
              </label>
            </div>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ color: 'var(--fg-muted)', fontSize: 12 }}>Encargado inicial</span>
              <select
                value={assigneeUserId || assigneeOptions[0]?.[0] || ''}
                disabled={submitting || assigneeOptions.length === 0}
                onChange={(event) => setAssigneeUserId(event.target.value)}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  background: 'var(--bg-elev-2)',
                  color: 'var(--fg)',
                  padding: '10px 11px',
                  fontSize: 13,
                  outline: 'none',
                }}
              >
                {assigneeOptions.length === 0 ? (
                  <option value="">Sin usuarios disponibles</option>
                ) : (
                  assigneeOptions.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))
                )}
              </select>
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ color: 'var(--fg-muted)', fontSize: 12 }}>Expediente opcional</span>
                <select
                  value={expedientId}
                  disabled={submitting}
                  onChange={(event) => setExpedientId(event.target.value)}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    background: 'var(--bg-elev-2)',
                    color: 'var(--fg)',
                    padding: '10px 11px',
                    fontSize: 13,
                    outline: 'none',
                  }}
                >
                  <option value="">Sin expediente</option>
                  {expedients.map((exp) => (
                    <option key={exp.id} value={exp.id}>
                      {exp.code ? `${exp.name} (${exp.code})` : exp.name}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ color: 'var(--fg-muted)', fontSize: 12 }}>Fecha de vencimiento</span>
                <input
                  type="date"
                  value={dueDate}
                  disabled={submitting}
                  onChange={(event) => setDueDate(event.target.value)}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    background: 'var(--bg-elev-2)',
                    color: 'var(--fg)',
                    padding: '10px 11px',
                    fontSize: 13,
                    outline: 'none',
                  }}
                />
              </label>
            </div>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ color: 'var(--fg-muted)', fontSize: 12 }}>Descripcion</span>
              <textarea
                value={description}
                disabled={submitting}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Describe para que se usara este documento"
                rows={4}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  background: 'var(--bg-elev-2)',
                  color: 'var(--fg)',
                  padding: '10px 11px',
                  fontSize: 13,
                  outline: 'none',
                  resize: 'vertical',
                  minHeight: 96,
                }}
              />
            </label>

            <div style={{ display: 'grid', gap: 8 }}>
              <span style={{ color: 'var(--fg-muted)', fontSize: 12 }}>Archivo principal</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {[
                  ['none', 'Sin archivo'],
                  ['existing', 'Usar sin asignar'],
                  ['upload', 'Subir nuevo'],
                ].map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    className="edms-button"
                    disabled={submitting}
                    onClick={() => {
                      setAttachmentMode(mode as 'none' | 'existing' | 'upload')
                      setError(null)
                    }}
                    style={{
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: attachmentMode === mode ? 'var(--bg-active)' : 'var(--bg-elev-2)',
                      color: attachmentMode === mode ? 'var(--fg)' : 'var(--fg-muted)',
                      padding: '9px 10px',
                      fontSize: 12.5,
                      fontWeight: attachmentMode === mode ? 600 : 500,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {attachmentMode === 'existing' && (
                <select
                  value={selectedUnassignedFileId}
                  disabled={submitting || unassignedFiles.length === 0}
                  onChange={(event) => setSelectedUnassignedFileId(event.target.value)}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    background: 'var(--bg-elev-2)',
                    color: 'var(--fg)',
                    padding: '10px 11px',
                    fontSize: 13,
                    outline: 'none',
                  }}
                >
                  <option value="">Selecciona un archivo</option>
                  {unassignedFiles.map((file) => (
                    <option key={file.id} value={file.id}>
                      {file.original_filename} · {formatFileSize(file.size_bytes)}
                    </option>
                  ))}
                </select>
              )}

              {attachmentMode === 'upload' && (
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    border: '1px dashed var(--border-strong)',
                    borderRadius: 10,
                    background: 'var(--bg-elev-2)',
                    padding: 12,
                    cursor: submitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  <input
                    type="file"
                    accept="application/pdf,image/png,image/jpeg"
                    disabled={submitting}
                    onChange={(event) => {
                      setNewFile(event.target.files?.[0] ?? null)
                      event.currentTarget.value = ''
                    }}
                    style={{ display: 'none' }}
                  />
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: 'var(--accent-soft)',
                      color: 'var(--accent)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Icon.Upload size={15} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: 'var(--fg)', fontSize: 12.5, fontWeight: 600 }}>
                      {newFile ? newFile.name : 'Seleccionar archivo'}
                    </div>
                    <div style={{ color: 'var(--fg-muted)', fontSize: 11.5 }}>
                      {newFile ? formatFileSize(newFile.size) : 'PDF, PNG o JPG. Maximo 100 MB.'}
                    </div>
                  </div>
                </label>
              )}
            </div>

            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: 10,
                background: 'var(--bg-elev-2)',
                padding: '10px 12px',
                color: 'var(--fg-muted)',
                fontSize: 12,
                lineHeight: 1.45,
              }}
            >
              Al crear, el sistema registra tu usuario como creador, deja el documento en estado Borrador y asigna el encargado inicial que selecciones.
            </div>

            {error && (
              <div
                style={{
                  borderRadius: 8,
                  border: '1px solid color-mix(in oklch, var(--danger) 55%, var(--border))',
                  background: 'color-mix(in oklch, var(--danger) 12%, var(--bg-elev))',
                  color: 'var(--danger)',
                  padding: '10px 12px',
                  fontSize: 12.5,
                }}
              >
                {error}
              </div>
            )}
          </div>

          <div
            style={{
              padding: '14px 18px',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 10,
            }}
          >
            <button
              type="button"
              onClick={onClose}
              className="edms-button"
              disabled={submitting}
              style={{
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--bg-elev-2)',
                color: 'var(--fg-muted)',
                padding: '9px 14px',
                fontSize: 12.5,
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="edms-button edms-button-primary"
              disabled={submitting}
              style={{
                borderRadius: 8,
                border: '1px solid color-mix(in oklch, var(--accent) 60%, transparent)',
                background: 'var(--accent)',
                color: 'var(--accent-fg)',
                padding: '9px 14px',
                fontSize: 12.5,
                fontWeight: 600,
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting ? 'Creando...' : 'Crear documento'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}

function EditMetadataModal({
  document,
  unassignedFiles,
  assigneeOptions,
  expedients,
  onClose,
  onUpdated,
  onAssignAssignee,
}: {
  document: DocumentItem
  unassignedFiles: StoredFileItem[]
  assigneeOptions: [string, string][]
  expedients: ExpedientItem[]
  onClose: () => void
  onUpdated: (document: DocumentItemResponse, attachment?: DocumentAttachmentResult) => void
  onAssignAssignee: (documentId: string, userId: string) => Promise<void>
}) {
  const currentAssigneeId = document.assignee ?? document.owner
  const assigneeChoices = currentAssigneeId && !assigneeOptions.some(([value]) => value === currentAssigneeId)
    ? [[currentAssigneeId, currentAssigneeId] as [string, string], ...assigneeOptions]
    : assigneeOptions
  const [title, setTitle] = useState(document.name)
  const [documentTypeId, setDocumentTypeId] = useState(document.documentTypeId ?? 'contrato')
  const [description, setDescription] = useState(document.description ?? '')
  const [expedientId, setExpedientId] = useState(document.folder === 'root' ? '' : document.folder)
  const [confidentialityLevel, setConfidentialityLevel] = useState(document.confidentialityLevel ?? 'publico_interno')
  const [dueDate, setDueDate] = useState(document.dueDate ? document.dueDate.slice(0, 10) : '')
  const [assigneeUserId, setAssigneeUserId] = useState(currentAssigneeId ?? '')
  const [attachmentMode, setAttachmentMode] = useState<'none' | 'existing' | 'upload'>('none')
  const [selectedUnassignedFileId, setSelectedUnassignedFileId] = useState('')
  const [newFile, setNewFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!title.trim()) {
      setError('Ingresa un titulo')
      return
    }
    if (!documentTypeId.trim()) {
      setError('Selecciona un tipo documental')
      return
    }
    if (!description.trim()) {
      setError('Ingresa una descripcion breve')
      return
    }
    if (attachmentMode === 'existing' && !selectedUnassignedFileId) {
      setError('Selecciona un archivo sin asignar')
      return
    }
    if (attachmentMode === 'upload' && !newFile) {
      setError('Selecciona el archivo que quieres subir')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const { data } = await updateDocumentMetadata(document.id, {
        title: title.trim(),
        document_type_id: documentTypeId,
        description: description.trim(),
        expedient_id: expedientId.trim() || null,
        confidentiality_level: confidentialityLevel,
        due_date: dueDate.trim() || null,
      })
      const attachment: DocumentAttachmentResult = {}
      if (attachmentMode === 'existing') {
        const selectedFile = unassignedFiles.find((file) => file.id === selectedUnassignedFileId)
        await assignFileToDocument(selectedUnassignedFileId, document.id, 'Archivo asociado desde edicion')
        attachment.attachedUnassignedFileId = selectedUnassignedFileId
        if (selectedFile) attachment.attachedUnassignedFile = selectedFile
      }
      if (attachmentMode === 'upload' && newFile) {
        await uploadDocumentFile({
          file: newFile,
          document_id: document.id,
          version_comment: 'Archivo asociado desde edicion',
        })
        attachment.uploadedFile = newFile
      }
      onUpdated(data, attachment)
      if (assigneeUserId && assigneeUserId !== currentAssigneeId) {
        await onAssignAssignee(document.id, assigneeUserId)
      }
      onClose()
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudo actualizar la metadata'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div
        onClick={() => !submitting && onClose()}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1100,
          background: 'oklch(0 0 0 / 0.56)',
          backdropFilter: 'blur(10px)',
          pointerEvents: 'auto',
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1101,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          pointerEvents: 'none',
        }}
      >
        <form
          onSubmit={handleSubmit}
          style={{
            width: 'min(560px, 100%)',
            background: 'var(--bg-elev)',
            border: '1px solid var(--border-strong)',
            borderRadius: 14,
            boxShadow: 'var(--shadow)',
            overflow: 'hidden',
            pointerEvents: 'auto',
          }}
        >
          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg)', marginBottom: 4 }}>Editar metadata</div>
            <div style={{ fontSize: 12.5, color: 'var(--fg-muted)' }}>
              Actualiza datos descriptivos, archivo y encargado del documento.
            </div>
          </div>

          <div style={{ padding: 18, display: 'grid', gap: 13 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ color: 'var(--fg-muted)', fontSize: 12 }}>Titulo</span>
              <input
                value={title}
                disabled={submitting}
                onChange={(event) => setTitle(event.target.value)}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  background: 'var(--bg-elev-2)',
                  color: 'var(--fg)',
                  padding: '10px 11px',
                  fontSize: 13,
                  outline: 'none',
                }}
              />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ color: 'var(--fg-muted)', fontSize: 12 }}>Tipo documental</span>
                <select
                  value={documentTypeId}
                  disabled={submitting}
                  onChange={(event) => setDocumentTypeId(event.target.value)}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    background: 'var(--bg-elev-2)',
                    color: 'var(--fg)',
                    padding: '10px 11px',
                    fontSize: 13,
                    outline: 'none',
                  }}
                >
                  <option value="contrato">Contrato</option>
                  <option value="informe">Informe</option>
                  <option value="politica">Politica</option>
                  <option value="factura">Factura</option>
                  <option value="planilla">Planilla</option>
                  <option value="presentacion">Presentacion</option>
                </select>
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ color: 'var(--fg-muted)', fontSize: 12 }}>Confidencialidad</span>
                <select
                  value={confidentialityLevel}
                  disabled={submitting}
                  onChange={(event) => setConfidentialityLevel(event.target.value)}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    background: 'var(--bg-elev-2)',
                    color: 'var(--fg)',
                    padding: '10px 11px',
                    fontSize: 13,
                    outline: 'none',
                  }}
                >
                  <option value="publico_interno">Publico interno</option>
                  <option value="confidencial">Confidencial</option>
                  <option value="reservado">Reservado</option>
                </select>
              </label>
            </div>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ color: 'var(--fg-muted)', fontSize: 12 }}>Expediente</span>
              <select
                value={expedientId}
                disabled={submitting}
                onChange={(event) => setExpedientId(event.target.value)}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  background: 'var(--bg-elev-2)',
                  color: 'var(--fg)',
                  padding: '10px 11px',
                  fontSize: 13,
                  outline: 'none',
                }}
              >
                <option value="">Sin expediente</option>
                {/* Si el documento referencia un expediente que no esta en la lista
                    (eliminado o creado externamente), mantenemos la opcion vigente
                    para no perderla en el guardado. */}
                {expedientId && !expedients.some((exp) => exp.id === expedientId) && (
                  <option value={expedientId}>{expedientId}</option>
                )}
                {expedients.map((exp) => (
                  <option key={exp.id} value={exp.id}>
                    {exp.code ? `${exp.name} (${exp.code})` : exp.name}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ color: 'var(--fg-muted)', fontSize: 12 }}>Fecha de vencimiento (opcional)</span>
              <input
                type="date"
                value={dueDate}
                disabled={submitting}
                onChange={(event) => setDueDate(event.target.value)}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  background: 'var(--bg-elev-2)',
                  color: 'var(--fg)',
                  padding: '10px 11px',
                  fontSize: 13,
                  outline: 'none',
                  colorScheme: 'dark',
                }}
              />
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ color: 'var(--fg-muted)', fontSize: 12 }}>Encargado</span>
              <select
                value={assigneeUserId}
                disabled={submitting || assigneeChoices.length === 0}
                onChange={(event) => setAssigneeUserId(event.target.value)}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  background: 'var(--bg-elev-2)',
                  color: 'var(--fg)',
                  padding: '10px 11px',
                  fontSize: 13,
                  outline: 'none',
                }}
              >
                {assigneeChoices.length === 0 ? (
                  <option value="">Sin usuarios disponibles</option>
                ) : (
                  assigneeChoices.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))
                )}
              </select>
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ color: 'var(--fg-muted)', fontSize: 12 }}>Descripcion</span>
              <textarea
                value={description}
                disabled={submitting}
                onChange={(event) => setDescription(event.target.value)}
                rows={4}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  background: 'var(--bg-elev-2)',
                  color: 'var(--fg)',
                  padding: '10px 11px',
                  fontSize: 13,
                  outline: 'none',
                  resize: 'vertical',
                }}
              />
            </label>

            <div style={{ display: 'grid', gap: 8 }}>
              <span style={{ color: 'var(--fg-muted)', fontSize: 12 }}>Archivo del documento</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {[
                  ['none', 'No cambiar'],
                  ['existing', 'Usar sin asignar'],
                  ['upload', 'Subir nuevo'],
                ].map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    className="edms-button"
                    disabled={submitting}
                    onClick={() => {
                      setAttachmentMode(mode as 'none' | 'existing' | 'upload')
                      setError(null)
                    }}
                    style={{
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: attachmentMode === mode ? 'var(--bg-active)' : 'var(--bg-elev-2)',
                      color: attachmentMode === mode ? 'var(--fg)' : 'var(--fg-muted)',
                      padding: '9px 10px',
                      fontSize: 12.5,
                      fontWeight: attachmentMode === mode ? 600 : 500,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {attachmentMode === 'existing' && (
                <select
                  value={selectedUnassignedFileId}
                  disabled={submitting || unassignedFiles.length === 0}
                  onChange={(event) => setSelectedUnassignedFileId(event.target.value)}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    background: 'var(--bg-elev-2)',
                    color: 'var(--fg)',
                    padding: '10px 11px',
                    fontSize: 13,
                    outline: 'none',
                  }}
                >
                  <option value="">
                    {unassignedFiles.length === 0 ? 'No hay archivos sin asignar' : 'Selecciona un archivo'}
                  </option>
                  {unassignedFiles.map((file) => (
                    <option key={file.id} value={file.id}>
                      {file.original_filename} · {formatFileSize(file.size_bytes)}
                    </option>
                  ))}
                </select>
              )}

              {attachmentMode === 'upload' && (
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    border: '1px dashed var(--border-strong)',
                    borderRadius: 10,
                    background: 'var(--bg-elev-2)',
                    padding: 12,
                    cursor: submitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  <input
                    type="file"
                    accept="application/pdf,image/png,image/jpeg"
                    disabled={submitting}
                    onChange={(event) => {
                      setNewFile(event.target.files?.[0] ?? null)
                      event.currentTarget.value = ''
                    }}
                    style={{ display: 'none' }}
                  />
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: 'var(--accent-soft)',
                      color: 'var(--accent)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Icon.Upload size={15} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: 'var(--fg)', fontSize: 12.5, fontWeight: 600 }}>
                      {newFile ? newFile.name : 'Seleccionar archivo'}
                    </div>
                    <div style={{ color: 'var(--fg-muted)', fontSize: 11.5 }}>
                      {newFile ? formatFileSize(newFile.size) : 'PDF, PNG o JPG. Maximo 100 MB.'}
                    </div>
                  </div>
                </label>
              )}
            </div>

            {error && (
              <div
                style={{
                  borderRadius: 8,
                  border: '1px solid color-mix(in oklch, var(--danger) 55%, var(--border))',
                  background: 'color-mix(in oklch, var(--danger) 12%, var(--bg-elev))',
                  color: 'var(--danger)',
                  padding: '10px 12px',
                  fontSize: 12.5,
                }}
              >
                {error}
              </div>
            )}
          </div>

          <div
            style={{
              padding: '14px 18px',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 10,
            }}
          >
            <button
              type="button"
              onClick={onClose}
              className="edms-button"
              disabled={submitting}
              style={{
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--bg-elev-2)',
                color: 'var(--fg-muted)',
                padding: '9px 14px',
                fontSize: 12.5,
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="edms-button edms-button-primary"
              disabled={submitting}
              style={{
                borderRadius: 8,
                border: '1px solid color-mix(in oklch, var(--accent) 60%, transparent)',
                background: 'var(--accent)',
                color: 'var(--accent-fg)',
                padding: '9px 14px',
                fontSize: 12.5,
                fontWeight: 600,
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting ? 'Guardando...' : 'Guardar metadata'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}

function AssignFileToDocumentModal({
  file,
  documents,
  onClose,
  onAssigned,
}: {
  file: StoredFileItem
  documents: DocumentItem[]
  onClose: () => void
  onAssigned: (file: StoredFileItem, documentId: string) => void
}) {
  const [selectedDocumentId, setSelectedDocumentId] = useState(documents[0]?.id ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedDocumentId) {
      setError('Selecciona un documento real')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await assignFileToDocument(file.id, selectedDocumentId, 'Archivo principal inicial')
      onAssigned(file, selectedDocumentId)
      onClose()
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudo asignar el archivo al documento'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div
        onClick={() => !submitting && onClose()}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1100,
          background: 'oklch(0 0 0 / 0.56)',
          backdropFilter: 'blur(10px)',
          pointerEvents: 'auto',
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1101,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          pointerEvents: 'none',
        }}
      >
        <form
          onSubmit={handleSubmit}
          style={{
            width: 'min(520px, 100%)',
            background: 'var(--bg-elev)',
            border: '1px solid var(--border-strong)',
            borderRadius: 14,
            boxShadow: 'var(--shadow)',
            overflow: 'hidden',
            pointerEvents: 'auto',
          }}
        >
          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg)', marginBottom: 4 }}>Asignar a documento</div>
            <div style={{ fontSize: 12.5, color: 'var(--fg-muted)' }}>
              El archivo quedara como version del documento seleccionado.
            </div>
          </div>

          <div style={{ padding: 18, display: 'grid', gap: 13 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                border: '1px solid var(--border)',
                borderRadius: 10,
                background: 'var(--bg-elev-2)',
                padding: '10px 12px',
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: 'var(--accent-soft)',
                  color: 'var(--accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Icon.File size={14} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: 'var(--fg)', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {file.original_filename}
                </div>
                <div style={{ color: 'var(--fg-muted)', fontSize: 11.5 }}>{formatFileSize(file.size_bytes)}</div>
              </div>
            </div>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ color: 'var(--fg-muted)', fontSize: 12 }}>Documento destino</span>
              <select
                value={selectedDocumentId}
                disabled={submitting || documents.length === 0}
                onChange={(event) => setSelectedDocumentId(event.target.value)}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  background: 'var(--bg-elev-2)',
                  color: 'var(--fg)',
                  padding: '10px 11px',
                  fontSize: 13,
                  outline: 'none',
                }}
              >
                {documents.length === 0 ? (
                  <option value="">No hay documentos creados en el sistema</option>
                ) : (
                  documents.map((document) => (
                    <option key={document.id} value={document.id}>
                      {document.name}
                    </option>
                  ))
                )}
              </select>
            </label>

            {error && (
              <div
                style={{
                  borderRadius: 8,
                  border: '1px solid color-mix(in oklch, var(--danger) 55%, var(--border))',
                  background: 'color-mix(in oklch, var(--danger) 12%, var(--bg-elev))',
                  color: 'var(--danger)',
                  padding: '10px 12px',
                  fontSize: 12.5,
                }}
              >
                {error}
              </div>
            )}
          </div>

          <div
            style={{
              padding: '14px 18px',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 10,
            }}
          >
            <button
              type="button"
              onClick={onClose}
              className="edms-button"
              disabled={submitting}
              style={{
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--bg-elev-2)',
                color: 'var(--fg-muted)',
                padding: '9px 14px',
                fontSize: 12.5,
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="edms-button edms-button-primary"
              disabled={submitting || documents.length === 0}
              style={{
                borderRadius: 8,
                border: '1px solid color-mix(in oklch, var(--accent) 60%, transparent)',
                background: 'var(--accent)',
                color: 'var(--accent-fg)',
                padding: '9px 14px',
                fontSize: 12.5,
                fontWeight: 600,
                opacity: submitting || documents.length === 0 ? 0.7 : 1,
              }}
            >
              {submitting ? 'Asignando...' : 'Asignar archivo'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}

function FileRow({
  file,
  busy,
  active,
  onSelect,
  onTrash,
  onCreateDocument,
  onAssignDocument,
}: {
  file: StoredFileItem
  busy?: boolean
  active?: boolean
  onSelect?: (file: StoredFileItem) => void
  onTrash?: (file: StoredFileItem) => void
  onCreateDocument?: (file: StoredFileItem) => void
  onAssignDocument?: (file: StoredFileItem) => void
}) {
  const tone = fileTone(file.mime_type)

  return (
    <div
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={onSelect ? () => onSelect(file) : undefined}
      onKeyDown={onSelect ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(file)
        }
      } : undefined}
      className={onSelect ? 'edms-nav-item' : undefined}
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(240px, 1.4fr) minmax(110px, 0.5fr) minmax(130px, 0.6fr) auto',
        alignItems: 'center',
        gap: 12,
        padding: '11px 14px',
        borderTop: '1px solid var(--border)',
        background: active ? 'var(--bg-active)' : 'transparent',
        cursor: onSelect ? 'pointer' : 'default',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            background: `color-mix(in oklch, ${tone} 16%, var(--bg-elev-2))`,
            color: tone,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 9,
            fontWeight: 700,
          }}
        >
          {fileKindLabel(file.mime_type)}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: 'var(--fg)', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {file.original_filename}
          </div>
          <div style={{ color: 'var(--fg-muted)', fontSize: 11.5 }}>
            Sin documento asociado
          </div>
        </div>
      </div>

      <div style={{ color: 'var(--fg-muted)', fontSize: 12 }}>{formatFileSize(file.size_bytes)}</div>
      <div style={{ color: 'var(--fg-muted)', fontSize: 12 }}>{formatUploadedAt(file.uploaded_at)}</div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {onCreateDocument && (
          <button
            type="button"
            className="edms-button edms-button-primary"
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation()
              onCreateDocument(file)
            }}
            style={{
              borderRadius: 8,
              border: '1px solid color-mix(in oklch, var(--accent) 60%, transparent)',
              background: 'var(--accent)',
              color: 'var(--accent-fg)',
              padding: '7px 10px',
              fontSize: 12,
              fontWeight: 600,
              opacity: busy ? 0.7 : 1,
            }}
          >
            Crear documento
          </button>
        )}
        {onAssignDocument && (
          <button
            type="button"
            className="edms-button"
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation()
              onAssignDocument(file)
            }}
            style={{
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg-elev-2)',
              color: 'var(--fg)',
              padding: '7px 10px',
              fontSize: 12,
              fontWeight: 600,
              opacity: busy ? 0.7 : 1,
            }}
          >
            Asignar
          </button>
        )}
        {onTrash && (
          <button
            type="button"
            className="edms-button"
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation()
              onTrash(file)
            }}
            title="Enviar a papelera"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--danger)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: busy ? 0.7 : 1,
            }}
          >
            <Icon.Trash size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

function UnassignedFilesPanel({
  files,
  loading,
  busyFileId,
  selectedFileId,
  onSelect,
  onTrash,
  onCreateDocument,
  onAssignDocument,
}: {
  files: StoredFileItem[]
  loading: boolean
  busyFileId: string | null
  selectedFileId: string | null
  onSelect: (file: StoredFileItem) => void
  onTrash: (file: StoredFileItem) => void
  onCreateDocument: (file: StoredFileItem) => void
  onAssignDocument: (file: StoredFileItem) => void
}) {
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '14px 18px 24px' }}>
      <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: 'var(--fg)' }}>
                <Icon.File size={15} />
                Archivos sin asignar
              </div>
              <div style={{ marginTop: 3, fontSize: 12, color: 'var(--fg-muted)' }}>
                Archivos cargados que aun no pertenecen a un documento.
              </div>
            </div>
            <span style={{ color: 'var(--fg-dim)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
              {files.length} pendiente{files.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>
        {loading ? (
          <div style={{ padding: 14, borderTop: '1px solid var(--border)', color: 'var(--fg-muted)', fontSize: 12.5 }}>Cargando archivos...</div>
        ) : files.length === 0 ? (
          <div style={{ padding: 14, borderTop: '1px solid var(--border)', color: 'var(--fg-muted)', fontSize: 12.5 }}>
            No hay archivos sueltos. Cuando subas archivos sin documento apareceran aqui.
          </div>
        ) : (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(240px, 1.4fr) minmax(110px, 0.5fr) minmax(130px, 0.6fr) auto',
                gap: 12,
                padding: '8px 14px',
                borderTop: '1px solid var(--border)',
                color: 'var(--fg-dim)',
                fontSize: 11,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              <span>Archivo</span>
              <span>Tamaño</span>
              <span>Cargado</span>
              <span style={{ width: 154 }}>Acciones</span>
            </div>
            {files.map((file) => (
              <FileRow
                key={file.id}
                file={file}
                busy={busyFileId === file.id}
                active={selectedFileId === file.id}
                onSelect={onSelect}
                onTrash={onTrash}
                onCreateDocument={onCreateDocument}
                onAssignDocument={onAssignDocument}
              />
            ))}
          </>
        )}
      </div>
    </div>
  )
}

function TrashFileRow({
  file,
  busy,
  selecting,
  selected,
  onToggleSelected,
  onRestore,
  onDelete,
}: {
  file: StoredFileItem
  busy: boolean
  selecting: boolean
  selected: boolean
  onToggleSelected: (file: StoredFileItem) => void
  onRestore: (file: StoredFileItem) => void
  onDelete: (file: StoredFileItem) => void
}) {
  const tone = fileTone(file.mime_type)

  return (
    <div
      role={selecting ? 'button' : undefined}
      tabIndex={selecting ? 0 : undefined}
      onClick={selecting ? () => onToggleSelected(file) : undefined}
      onKeyDown={selecting ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onToggleSelected(file)
        }
      } : undefined}
      className={selecting ? 'edms-nav-item' : undefined}
      style={{
        display: 'grid',
        gridTemplateColumns: selecting
          ? 'auto minmax(240px, 1.4fr) minmax(110px, 0.5fr) minmax(130px, 0.6fr) auto'
          : 'minmax(240px, 1.4fr) minmax(110px, 0.5fr) minmax(130px, 0.6fr) auto',
        alignItems: 'center',
        gap: 12,
        padding: '11px 14px',
        borderTop: '1px solid var(--border)',
        background: selected ? 'var(--bg-active)' : 'transparent',
        cursor: selecting ? 'pointer' : 'default',
      }}
    >
      {selecting && (
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelected(file)}
          onClick={(event) => event.stopPropagation()}
        />
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            background: `color-mix(in oklch, ${tone} 16%, var(--bg-elev-2))`,
            color: tone,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 9,
            fontWeight: 700,
          }}
        >
          {fileKindLabel(file.mime_type)}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: 'var(--fg)', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {file.original_filename}
          </div>
          <div style={{ color: 'var(--fg-muted)', fontSize: 11.5 }}>
            En papelera
          </div>
        </div>
      </div>

      <div style={{ color: 'var(--fg-muted)', fontSize: 12 }}>{formatFileSize(file.size_bytes)}</div>
      <div style={{ color: 'var(--fg-muted)', fontSize: 12 }}>{formatUploadedAt(file.uploaded_at)}</div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          className="edms-button"
          disabled={busy}
          onClick={(event) => {
            event.stopPropagation()
            onRestore(file)
          }}
          style={{
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--bg-elev-2)',
            color: 'var(--fg)',
            padding: '7px 10px',
            fontSize: 12,
            fontWeight: 600,
            opacity: busy ? 0.7 : 1,
          }}
        >
          Restaurar
        </button>
        <button
          type="button"
          className="edms-button"
          disabled={busy}
          onClick={(event) => {
            event.stopPropagation()
            onDelete(file)
          }}
          style={{
            borderRadius: 8,
            border: '1px solid color-mix(in oklch, var(--danger) 35%, var(--border))',
            background: 'transparent',
            color: 'var(--danger)',
            padding: '7px 10px',
            fontSize: 12,
            fontWeight: 600,
            opacity: busy ? 0.7 : 1,
          }}
        >
          Eliminar
        </button>
      </div>
    </div>
  )
}

function TrashDocumentRow({
  document,
  busy,
  onRestore,
  onDelete,
}: {
  document: DocumentItem
  busy: boolean
  onRestore: (document: DocumentItem) => void
  onDelete: (document: DocumentItem) => void
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(240px, 1.4fr) minmax(110px, 0.5fr) minmax(130px, 0.6fr) auto',
        alignItems: 'center',
        gap: 12,
        padding: '11px 14px',
        borderTop: '1px solid var(--border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <KindBadge kind={document.kind} />
        <div style={{ minWidth: 0 }}>
          <div style={{ color: 'var(--fg)', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {document.name}
          </div>
          <div style={{ color: 'var(--fg-muted)', fontSize: 11.5 }}>
            Documento en papelera
          </div>
        </div>
      </div>

      <div style={{ color: 'var(--fg-muted)', fontSize: 12 }}>{document.size}</div>
      <div style={{ color: 'var(--fg-muted)', fontSize: 12 }}>{document.modified}</div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          className="edms-button"
          disabled={busy}
          onClick={() => onRestore(document)}
          style={{
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--bg-elev-2)',
            color: 'var(--fg)',
            padding: '7px 10px',
            fontSize: 12,
            fontWeight: 600,
            opacity: busy ? 0.7 : 1,
          }}
        >
          Restaurar
        </button>
        <button
          type="button"
          className="edms-button"
          disabled={busy}
          onClick={() => onDelete(document)}
          style={{
            borderRadius: 8,
            border: '1px solid color-mix(in oklch, var(--danger) 35%, var(--border))',
            background: 'transparent',
            color: 'var(--danger)',
            padding: '7px 10px',
            fontSize: 12,
            fontWeight: 600,
            opacity: busy ? 0.7 : 1,
          }}
        >
          Eliminar
        </button>
      </div>
    </div>
  )
}

function TrashedFilesPanel({
  files,
  documents,
  loading,
  busy,
  busyFileId,
  selecting,
  selectedIds,
  onToggleSelecting,
  onToggleSelected,
  onSelectAll,
  onRestore,
  onDelete,
  onRestoreSelected,
  onDeleteSelected,
  onRestoreAll,
  onDeleteAll,
  onRestoreDocument,
  onDeleteDocument,
}: {
  files: StoredFileItem[]
  documents: DocumentItem[]
  loading: boolean
  busy: boolean
  busyFileId: string | null
  selecting: boolean
  selectedIds: Set<string>
  onToggleSelecting: () => void
  onToggleSelected: (file: StoredFileItem) => void
  onSelectAll: () => void
  onRestore: (file: StoredFileItem) => void
  onDelete: (file: StoredFileItem) => void
  onRestoreSelected: () => void
  onDeleteSelected: () => void
  onRestoreAll: () => void
  onDeleteAll: () => void
  onRestoreDocument: (document: DocumentItem) => void
  onDeleteDocument: (document: DocumentItem) => void
}) {
  const selectedCount = selectedIds.size
  const hasFiles = files.length > 0
  const hasDocuments = documents.length > 0
  const hasItems = hasFiles || hasDocuments

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '14px 18px 24px' }}>
      <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg)' }}>Papelera</div>
            <div style={{ marginTop: 3, fontSize: 12, color: 'var(--fg-muted)' }}>
              Documentos y archivos enviados a papelera.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="edms-button"
              disabled={loading || !hasFiles || busy}
              onClick={onToggleSelecting}
              style={{ ...btnStyleGhost, padding: '7px 10px', opacity: loading || !hasFiles || busy ? 0.7 : 1 }}
            >
              {selecting ? 'Cancelar seleccion' : 'Seleccionar'}
            </button>
            <button
              type="button"
              className="edms-button"
              disabled={loading || !hasItems || busy}
              onClick={onRestoreAll}
              style={{ ...btnStyleGhost, padding: '7px 10px', opacity: loading || !hasItems || busy ? 0.7 : 1 }}
            >
              Restaurar todo
            </button>
            <button
              type="button"
              className="edms-button"
              disabled={loading || !hasItems || busy}
              onClick={onDeleteAll}
              style={{ ...btnStyleGhost, padding: '7px 10px', color: 'var(--danger)', opacity: loading || !hasItems || busy ? 0.7 : 1 }}
            >
              Eliminar todo
            </button>
          </div>
        </div>

        {selecting && hasFiles && (
          <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'var(--bg-elev-2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button type="button" className="edms-button" disabled={busy} onClick={onSelectAll} style={{ ...btnStyleGhost, padding: '6px 9px', opacity: busy ? 0.7 : 1 }}>
                {selectedCount === files.length ? 'Quitar seleccion' : 'Seleccionar todo'}
              </button>
              <span style={{ color: 'var(--fg-muted)', fontSize: 12 }}>
                {selectedCount} seleccionado{selectedCount === 1 ? '' : 's'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button type="button" className="edms-button" disabled={busy || selectedCount === 0} onClick={onRestoreSelected} style={{ ...btnStyleGhost, padding: '6px 9px', opacity: busy || selectedCount === 0 ? 0.7 : 1 }}>
                Restaurar seleccionados
              </button>
              <button type="button" className="edms-button" disabled={busy || selectedCount === 0} onClick={onDeleteSelected} style={{ ...btnStyleGhost, padding: '6px 9px', color: 'var(--danger)', opacity: busy || selectedCount === 0 ? 0.7 : 1 }}>
                Eliminar seleccionados
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ padding: 14, borderTop: '1px solid var(--border)', color: 'var(--fg-muted)', fontSize: 12.5 }}>Cargando papelera...</div>
        ) : !hasItems ? (
          <div style={{ padding: 14, borderTop: '1px solid var(--border)', color: 'var(--fg-muted)', fontSize: 12.5 }}>La papelera esta vacia.</div>
        ) : (
          <>
            {hasDocuments && (
              <>
                <div style={{ padding: '11px 14px', borderTop: '1px solid var(--border)', color: 'var(--fg-muted)', fontSize: 12, fontWeight: 600 }}>
                  Documentos
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(240px, 1.4fr) minmax(110px, 0.5fr) minmax(130px, 0.6fr) auto',
                    gap: 12,
                    padding: '8px 14px',
                    borderTop: '1px solid var(--border)',
                    color: 'var(--fg-dim)',
                    fontSize: 11,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  <span>Documento</span>
                  <span>Tamaño</span>
                  <span>Enviado</span>
                  <span style={{ width: 190 }}>Acciones</span>
                </div>
                {documents.map((document) => (
                  <TrashDocumentRow
                    key={document.id}
                    document={document}
                    busy={busy || busyFileId === `doc:${document.id}`}
                    onRestore={onRestoreDocument}
                    onDelete={onDeleteDocument}
                  />
                ))}
              </>
            )}
            {hasFiles && (
              <>
                <div style={{ padding: '11px 14px', borderTop: '1px solid var(--border)', color: 'var(--fg-muted)', fontSize: 12, fontWeight: 600 }}>
                  Archivos
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: selecting
                      ? 'auto minmax(240px, 1.4fr) minmax(110px, 0.5fr) minmax(130px, 0.6fr) auto'
                      : 'minmax(240px, 1.4fr) minmax(110px, 0.5fr) minmax(130px, 0.6fr) auto',
                    gap: 12,
                    padding: '8px 14px',
                    borderTop: '1px solid var(--border)',
                    color: 'var(--fg-dim)',
                    fontSize: 11,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  {selecting && <span />}
                  <span>Archivo</span>
                  <span>Tamaño</span>
                  <span>Enviado</span>
                  <span style={{ width: 190 }}>Acciones</span>
                </div>
                {files.map((file) => (
                  <TrashFileRow
                    key={file.id}
                    file={file}
                    busy={busy || busyFileId === file.id}
                    selecting={selecting}
                    selected={selectedIds.has(file.id)}
                    onToggleSelected={onToggleSelected}
                    onRestore={onRestore}
                    onDelete={onDelete}
                  />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function TeamManagerModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (userName: string) => void
}) {
  const [roles, setRoles] = useState<RoleItem[]>([])
  const [users, setUsers] = useState<UserMe[]>([])
  const [loadingTeam, setLoadingTeam] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [savingRoleUserId, setSavingRoleUserId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    role_id: '',
    status: 'active' as 'active' | 'inactive' | 'blocked',
  })

  useEffect(() => {
    Promise.all([listRoles(), listUsers()])
      .then(([rolesResponse, usersResponse]) => {
        setRoles(rolesResponse.data)
        setUsers(usersResponse.data)
        setForm((current) => ({
          ...current,
          role_id: current.role_id || rolesResponse.data[0]?.id || '',
        }))
      })
      .catch((err) => setError(getApiErrorMessage(err, 'No se pudo cargar el equipo')))
      .finally(() => setLoadingTeam(false))
  }, [])

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !submitting) onClose()
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onClose, submitting])

  function getPrimaryRoleId(item: UserMe) {
    const primaryRole = item.roles[0]
    return roles.find((role) => role.code === primaryRole)?.id ?? ''
  }

  async function handleRoleChange(userId: string, roleId: string) {
    setSavingRoleUserId(userId)
    setError(null)
    setNotice(null)

    try {
      const { data } = await assignRole({ user_id: userId, role_id: roleId })
      setUsers((current) => current.map((item) => (item.id === data.id ? data : item)))
      setNotice(`Rol actualizado para ${userLabelFromAuth(data.first_name, data.last_name, data.email)}`)
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudo actualizar el rol'))
    } finally {
      setSavingRoleUserId(null)
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    setNotice(null)

    try {
      const payload = {
        ...form,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
      }
      const { data } = await createUser(payload)
      setUsers((current) => [data, ...current.filter((item) => item.id !== data.id)])
      onCreated(userLabelFromAuth(data.first_name, data.last_name, data.email))
      setForm({
        first_name: '',
        last_name: '',
        email: '',
        password: '',
        role_id: roles[0]?.id ?? '',
        status: 'active',
      })
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudo crear el usuario'))
    } finally {
      setSubmitting(false)
    }
  }

  const fieldStyle: CSSProperties = {
    width: '100%',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--bg-elev-2)',
    color: 'var(--fg)',
    padding: '10px 12px',
    fontSize: 13,
    outline: 'none',
  }

  return (
    <>
      <div
        onClick={() => !submitting && onClose()}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1100,
          background: 'rgba(3, 6, 12, 0.62)',
          backdropFilter: 'blur(6px)',
        }}
      />
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1102,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          pointerEvents: 'none',
        }}
      >
        <form
          onSubmit={handleSubmit}
          style={{
            width: 'min(880px, 100%)',
            background: 'var(--bg-elev)',
            border: '1px solid var(--border-strong)',
            borderRadius: 14,
            boxShadow: 'var(--shadow)',
            overflow: 'hidden',
            pointerEvents: 'auto',
            maxHeight: 'calc(100vh - 48px)',
            overflowY: 'auto',
          }}
        >
          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg)', marginBottom: 4 }}>Gestionar equipo</div>
            <div style={{ fontSize: 12.5, color: 'var(--fg-muted)' }}>
              Administra usuarios y roles globales del sistema.
            </div>
          </div>

          <div style={{ padding: 18, display: 'grid', gap: 14 }}>
            <section style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--fg)' }}>Usuarios registrados</div>
                  <div style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>
                    {loadingTeam ? 'Cargando equipo...' : `${users.length} usuarios`}
                  </div>
                </div>
              </div>

              <div
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  overflow: 'hidden',
                  background: 'var(--bg-elev-2)',
                }}
              >
                {loadingTeam ? (
                  <div style={{ padding: 14, fontSize: 12.5, color: 'var(--fg-muted)' }}>Cargando usuarios...</div>
                ) : users.length === 0 ? (
                  <div style={{ padding: 14, fontSize: 12.5, color: 'var(--fg-muted)' }}>No hay usuarios creados.</div>
                ) : (
                  users.map((item) => {
                    const label = userLabelFromAuth(item.first_name, item.last_name, item.email)
                    const roleId = getPrimaryRoleId(item)
                    const isSaving = savingRoleUserId === item.id

                    return (
                      <div
                        key={item.id}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'minmax(220px, 1fr) 120px 220px',
                          alignItems: 'center',
                          gap: 12,
                          padding: '10px 12px',
                          borderBottom: item === users[users.length - 1] ? 'none' : '1px solid var(--border)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          <div
                            style={{
                              width: 30,
                              height: 30,
                              borderRadius: 15,
                              background: item.color ?? actorColorFromId(item.id),
                              color: '#0e0f12',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 11,
                              fontWeight: 700,
                              flexShrink: 0,
                            }}
                          >
                            {initialsFromLabel(label)}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ color: 'var(--fg)', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {label}
                            </div>
                            <div style={{ color: 'var(--fg-dim)', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {item.email}
                            </div>
                          </div>
                        </div>

                        <span
                          style={{
                            justifySelf: 'start',
                            borderRadius: 999,
                            border: '1px solid var(--border)',
                            padding: '3px 8px',
                            color: item.status === 'active' ? 'var(--ok)' : item.status === 'blocked' ? 'var(--danger)' : 'var(--fg-muted)',
                            fontSize: 11,
                            fontWeight: 600,
                          }}
                        >
                          {item.status}
                        </span>

                        <select
                          value={roleId}
                          disabled={isSaving || roles.length === 0}
                          onChange={(event) => handleRoleChange(item.id, event.target.value)}
                          style={{
                            ...fieldStyle,
                            padding: '8px 10px',
                            fontSize: 12.5,
                            opacity: isSaving ? 0.7 : 1,
                          }}
                        >
                          {roles.map((role) => (
                            <option key={role.id} value={role.id}>
                              {isSaving ? 'Actualizando...' : role.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )
                  })
                )}
              </div>
            </section>

            <div style={{ height: 1, background: 'var(--border)' }} />

            <section style={{ display: 'grid', gap: 14 }}>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--fg)' }}>Nuevo usuario</div>
                <div style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>
                  Crea una cuenta con rol global y estado inicial.
                </div>
              </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12.5, color: 'var(--fg-muted)' }}>Nombre</span>
                <input
                  required
                  value={form.first_name}
                  onChange={(event) => setForm((current) => ({ ...current, first_name: event.target.value }))}
                  style={fieldStyle}
                  placeholder="Laura"
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12.5, color: 'var(--fg-muted)' }}>Apellido</span>
                <input
                  required
                  value={form.last_name}
                  onChange={(event) => setForm((current) => ({ ...current, last_name: event.target.value }))}
                  style={fieldStyle}
                  placeholder="Ibáñez"
                />
              </label>
            </div>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 12.5, color: 'var(--fg-muted)' }}>Correo electrónico</span>
              <input
                required
                type="email"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                style={fieldStyle}
                placeholder="usuario@dominio.cl"
              />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12.5, color: 'var(--fg-muted)' }}>Contraseña inicial</span>
                <input
                  required
                  minLength={8}
                  type="password"
                  value={form.password}
                  onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                  style={fieldStyle}
                  placeholder="********"
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12.5, color: 'var(--fg-muted)' }}>Rol</span>
                  <select
                    required
                    disabled={loadingTeam}
                    value={form.role_id}
                    onChange={(event) => setForm((current) => ({ ...current, role_id: event.target.value }))}
                    style={fieldStyle}
                >
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12.5, color: 'var(--fg-muted)' }}>Estado</span>
                <select
                  value={form.status}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      status: event.target.value as 'active' | 'inactive' | 'blocked',
                    }))
                  }
                  style={fieldStyle}
                >
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                  <option value="blocked">Bloqueado</option>
                </select>
              </label>
            </div>
            </section>

            <div
              style={{
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'var(--bg-elev-2)',
                padding: '10px 12px',
                fontSize: 12,
                color: 'var(--fg-muted)',
              }}
            >
              El usuario creado solo podrá iniciar sesión si queda en estado <strong style={{ color: 'var(--fg)' }}>Activo</strong>.
            </div>

            {notice && (
              <div
                style={{
                  borderRadius: 8,
                  border: '1px solid color-mix(in oklch, var(--ok) 55%, var(--border))',
                  background: 'color-mix(in oklch, var(--ok) 10%, var(--bg-elev))',
                  color: 'var(--fg)',
                  padding: '10px 12px',
                  fontSize: 12.5,
                }}
              >
                {notice}
              </div>
            )}

            {error && (
              <div
                style={{
                  borderRadius: 8,
                  border: '1px solid color-mix(in oklch, var(--danger) 55%, var(--border))',
                  background: 'color-mix(in oklch, var(--danger) 10%, var(--bg-elev))',
                  color: 'var(--fg)',
                  padding: '10px 12px',
                  fontSize: 12.5,
                }}
              >
                {error}
              </div>
            )}
          </div>

          <div
            style={{
              padding: '14px 18px',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 10,
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              style={{
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--fg)',
                padding: '9px 14px',
                fontSize: 12.5,
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || loadingTeam || !form.role_id}
              style={{
                borderRadius: 8,
                border: '1px solid color-mix(in oklch, var(--accent) 60%, transparent)',
                background: 'var(--accent)',
                color: '#fff',
                padding: '9px 14px',
                fontSize: 12.5,
                fontWeight: 600,
                opacity: submitting || loadingTeam || !form.role_id ? 0.7 : 1,
              }}
            >
              {submitting ? 'Creando...' : 'Crear usuario'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}

function Toast({ toast, onClose }: { toast: string | null; onClose: () => void }) {
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(onClose, 2600)
    return () => window.clearTimeout(timer)
  }, [toast, onClose])

  if (!toast) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 18,
        right: 18,
        zIndex: 200,
        background: 'var(--bg-elev)',
        border: '1px solid var(--border-strong)',
        borderRadius: 8,
        boxShadow: 'var(--shadow)',
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        animation: 'edms-slide-in 0.2s ease-out',
      }}
    >
      <Icon.Check size={14} style={{ color: 'var(--ok)' }} />
      <span style={{ fontSize: 12.5, color: 'var(--fg)' }}>{toast}</span>
    </div>
  )
}

function StateChangeCommentModal({
  stateLabel,
  onConfirm,
  onCancel,
}: {
  stateLabel: string
  onConfirm: (comment: string) => void
  onCancel: () => void
}) {
  const [comment, setComment] = useState('')
  const trimmed = comment.trim()

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--border-strong)', borderRadius: 12, width: 420, boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>Mover a {stateLabel}</h3>
          <p style={{ margin: '6px 0 0', color: 'var(--fg-muted)', fontSize: 12.5 }}>
            Esta transición requiere un comentario obligatorio explicando el motivo.
          </p>
        </div>
        <div style={{ padding: 16 }}>
          <textarea
            autoFocus
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Describe el motivo del cambio…"
            rows={4}
            style={{
              width: '100%',
              resize: 'vertical',
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid var(--border-strong)',
              background: 'var(--bg-elev-2)',
              color: 'var(--fg)',
              fontSize: 13,
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />
        </div>
        <div style={{ padding: 16, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            onClick={onCancel}
            className="edms-nav-item"
            style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--fg)', fontSize: 13, cursor: 'pointer' }}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!trimmed}
            onClick={() => onConfirm(trimmed)}
            style={{
              padding: '7px 14px',
              borderRadius: 7,
              border: '1px solid var(--accent)',
              background: trimmed ? 'var(--accent)' : 'var(--bg-elev-2)',
              color: trimmed ? 'var(--accent-fg)' : 'var(--fg-dim)',
              fontSize: 13,
              cursor: trimmed ? 'pointer' : 'default',
              fontWeight: 500,
            }}
          >
            Confirmar cambio
          </button>
        </div>
      </div>
    </div>
  )
}

function DocumentTagAssignmentModal({
  count,
  tags,
  selectedTagIds,
  saving,
  bulkMode,
  onToggleTag,
  onCreateTag,
  onClose,
  onSave,
}: {
  count: number
  tags: ApiTag[]
  selectedTagIds: Set<string>
  saving: boolean
  bulkMode: boolean
  onToggleTag: (tagId: string) => void
  onCreateTag: () => void
  onClose: () => void
  onSave: () => void
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--border-strong)', borderRadius: 12, width: 380, boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>{count === 1 ? 'Etiquetar documento' : `Etiquetar ${count} documentos`}</h3>
          <p style={{ margin: '6px 0 0', color: 'var(--fg-muted)', fontSize: 12.5 }}>
            {bulkMode
              ? 'Las etiquetas seleccionadas se agregan a todos los documentos sin quitar las que ya tengan.'
              : 'Selecciona las etiquetas que debe tener este documento.'}
          </p>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 340, overflowY: 'auto' }}>
          {tags.length === 0 ? (
            <div style={{ border: '1px dashed var(--border-strong)', borderRadius: 10, padding: 14, color: 'var(--fg-muted)', fontSize: 12.5 }}>
              Aun no hay etiquetas creadas. Crea una para poder asignarla al documento.
            </div>
          ) : tags.map((tag) => {
            const checked = selectedTagIds.has(tag.id)
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => onToggleTag(tag.id)}
                className="edms-nav-item"
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 10px',
                  borderRadius: 9,
                  border: `1px solid ${checked ? tag.color : 'var(--border)'}`,
                  background: checked ? `color-mix(in oklch, ${tag.color} 12%, var(--bg-active))` : 'var(--bg-elev-2)',
                  color: 'var(--fg)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 5,
                    border: `1.4px solid ${checked ? tag.color : 'var(--border-strong)'}`,
                    background: checked ? tag.color : 'transparent',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {checked && <Icon.Check size={11} stroke={3} style={{ color: '#0e0f12' }} />}
                </span>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: tag.color, flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 500 }}>{tag.label}</span>
              </button>
            )
          })}
        </div>

        <div style={{ padding: 16, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <button
            type="button"
            onClick={onCreateTag}
            className="edms-nav-item"
            style={{ padding: '7px 12px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--fg)', fontSize: 13, cursor: 'pointer' }}
          >
            Nueva etiqueta
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="edms-nav-item"
              style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--fg)', fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="edms-button-primary"
              style={{ padding: '7px 14px', borderRadius: 7, border: 0, background: 'var(--accent)', color: 'var(--accent-fg)', fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.65 : 1 }}
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { user, logout } = useAuth()
  const [tweaks, setTweaks] = useState(initialTweaks)
  const [selectedView, setSelectedView] = useState<SelectedView>('inicio')
  const [selectedFolder, setSelectedFolder] = useState('root')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<DocumentItem[] | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [filters, setFilters] = useState<FiltersState>(initialFilters)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [openDocId, setOpenDocId] = useState<string | null>(null)
  // Qué documento está en pantalla completa. Derivado: si openDocId cambia,
  // fullScreen deja de aplicar sin necesidad de un efecto que haga setState.
  const [fullDocId, setFullDocId] = useState<string | null>(null)
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifsModalOpen, setNotifsModalOpen] = useState(false)
  const bellRef = useRef<HTMLButtonElement>(null)
  const [stateCommentPrompt, setStateCommentPrompt] = useState<{
    stateLabel: string
    resolve: (comment: string) => void
    reject: () => void
  } | null>(null)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [notifUnread, setNotifUnread] = useState(0)
  const [recentActivity, setRecentActivity] = useState<RecentActivityItem[]>([])
  const [dueSoonDocs, setDueSoonDocs] = useState<DocumentItem[]>([])
  const [teamModalOpen, setTeamModalOpen] = useState(false)
  const [createDocumentModalOpen, setCreateDocumentModalOpen] = useState(false)
  const [editingMetadataDocId, setEditingMetadataDocId] = useState<string | null>(null)
  const [createDocumentInitialFile, setCreateDocumentInitialFile] = useState<StoredFileItem | null>(null)
  const [assignFileModalFile, setAssignFileModalFile] = useState<StoredFileItem | null>(null)
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [uploadInitialFiles, setUploadInitialFiles] = useState<File[]>([])
  const [unassignedFiles, setUnassignedFiles] = useState<StoredFileItem[]>([])
  const [trashedFiles, setTrashedFiles] = useState<StoredFileItem[]>([])
  const [trashedDocs, setTrashedDocs] = useState<DocumentItem[]>([])
  const [selectedUnassignedFileId, setSelectedUnassignedFileId] = useState<string | null>(null)
  const [selectingTrashFiles, setSelectingTrashFiles] = useState(false)
  const [selectedTrashFileIds, setSelectedTrashFileIds] = useState<Set<string>>(new Set())
  const [createdDocs, setCreatedDocs] = useState<DocumentItem[]>([])
  const [assignmentCounts, setAssignmentCounts] = useState<Record<string, number>>({})
  const [workspaceUsers, setWorkspaceUsers] = useState<UserMe[]>([])
  const [workspaceUserCount, setWorkspaceUserCount] = useState<number | null>(null)
  const [documentDetails, setDocumentDetails] = useState<Record<string, DocumentDetailResponse>>({})
  const [detailLoadingDocId, setDetailLoadingDocId] = useState<string | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [loadingFileLists, setLoadingFileLists] = useState(true)
  const [busyFileId, setBusyFileId] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [storage, setStorage] = useState({ used: 0, total: 0 })
  const [metrics, setMetrics] = useState<DocumentMetricsResponse | null>(null)
  const [adminMetrics, setAdminMetrics] = useState<DocumentMetricsResponse | null>(null)
  const [tags, setTags] = useState<ApiTag[]>([])
  const [expedients, setExpedients] = useState<ExpedientItem[]>([])
  const [selectedExpedientId, setSelectedExpedientId] = useState<string | null>(null)
  const [expedientDetail, setExpedientDetail] = useState<ExpedientDetail | null>(null)
  const [expedientLoading, setExpedientLoading] = useState(false)
  const [expedientError, setExpedientError] = useState<string | null>(null)
  const [expedientModalOpen, setExpedientModalOpen] = useState(false)
  const [expedientForm, setExpedientForm] = useState<{ name: string; code: string; description: string }>({ name: '', code: '', description: '' })
  const [expedientFormBusy, setExpedientFormBusy] = useState(false)
  const [expedientFormError, setExpedientFormError] = useState<string | null>(null)
  const [attachDocsModalOpen, setAttachDocsModalOpen] = useState(false)
  const [attachDocsSelected, setAttachDocsSelected] = useState<Set<string>>(new Set())
  const [attachDocsBusy, setAttachDocsBusy] = useState(false)
  const [attachDocsError, setAttachDocsError] = useState<string | null>(null)
  const [attachDocsFilter, setAttachDocsFilter] = useState('')
  const [tagModalOpen, setTagModalOpen] = useState(false)
  const [editingTag, setEditingTag] = useState<ApiTag | null>(null)
  const [tagForm, setTagForm] = useState({ label: '', color: '#6366f1' })
  const [tagAssignmentDocIds, setTagAssignmentDocIds] = useState<string[]>([])
  const [tagAssignmentSelected, setTagAssignmentSelected] = useState<Set<string>>(new Set())
  const [savingTagAssignment, setSavingTagAssignment] = useState(false)
  const dragCounter = useRef(0)

  const currentUserLabel = user
    ? userLabelFromAuth(user.first_name, user.last_name, user.email)
    : 'Usuario actual'
  const currentUserInitials = user ? initialsFromLabel(currentUserLabel) : 'UA'
  const currentUserEmail = user?.email ?? ''
  const currentUserColor = user?.color ?? actorColorFromId(user?.id ?? null)
  const firstName = currentUserLabel.split(' ')[0]
  const allDocs = useMemo(() => [...createdDocs, ...dashboardData.docs], [createdDocs])
  const searchQuery = search.trim()
  const searchActive = searchQuery.length > 0
  const filtersActive = useMemo(() => Object.values(filters).some(Boolean), [filters])
  const serverListActive = searchActive || filtersActive
  const documentListParams = useMemo<ListDocumentsParams>(() => ({
    q: searchQuery,
    document_type_id: filters.documentType ?? undefined,
    state_code: statusToWorkflow(filters.status),
    assignee_user_id: filters.assignee ?? undefined,
    assigned_user_id: filters.assigned ?? undefined,
    date: filters.date ?? undefined,
  }), [filters.assignee, filters.assigned, filters.date, filters.documentType, filters.status, searchQuery])
  const searchDocs = useMemo(
    () => (serverListActive ? (searchResults ?? []) : allDocs),
    [allDocs, searchResults, serverListActive],
  )
  const editingMetadataDoc = useMemo(
    () => createdDocs.find((doc) => doc.id === editingMetadataDocId) ?? null,
    [createdDocs, editingMetadataDocId],
  )
  const selectedUnassignedFile = useMemo(
    () => unassignedFiles.find((file) => file.id === selectedUnassignedFileId) ?? null,
    [selectedUnassignedFileId, unassignedFiles],
  )
  const filterUserOptions = useMemo<[string, string][]>(() => {
    const seen = new Set<string>()
    const options: [string, string][] = []

    if (user) {
      options.push([user.id, currentUserLabel])
      seen.add(user.id)
    }

    workspaceUsers.forEach((item) => {
      if (seen.has(item.id)) return
      options.push([item.id, userLabelFromAuth(item.first_name, item.last_name, item.email)])
      seen.add(item.id)
    })

    return options
  }, [currentUserLabel, user, workspaceUsers])

  function labelForUserId(userId?: string | null) {
    if (!userId) return 'Sin asignar'
    const option = filterUserOptions.find(([id]) => id === userId)
    if (option) return option[1]
    const sampleUser = findUserById(userId)
    if (sampleUser) return sampleUser.name
    return 'Usuario sin nombre'
  }

  function initialsForUserId(userId?: string | null) {
    return initialsFromLabel(labelForUserId(userId))
  }

  function colorForUserId(userId?: string | null): string {
    if (!userId) return 'var(--bg-elev-2)'
    if (user?.id === userId && user.color) return user.color
    const real = workspaceUsers.find((u) => u.id === userId)
    if (real?.color) return real.color
    const mock = findUserById(userId)
    if (mock?.color) return mock.color
    return actorColorFromId(userId)
  }

  const refreshNotifications = useCallback(async () => {
    try {
      const data = await getNotifications()
      setNotifications(data.items)
      setNotifUnread(data.unread_count)
    } catch {
      /* notificaciones no disponibles: se reintenta en el próximo ciclo */
    }
  }, [])

  const refreshActivity = useCallback(async () => {
    try {
      setRecentActivity(await getRecentActivity())
    } catch {
      /* actividad no disponible: se reintenta en el próximo ciclo */
    }
  }, [])

  const refreshDueSoon = useCallback(async () => {
    try {
      const { data } = await listDocuments({ due_soon: true })
      setDueSoonDocs(data.map(documentResponseToItem).slice(0, 8))
    } catch {
      /* vencimientos no disponibles: se reintenta en el próximo ciclo */
    }
  }, [])

  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      void refreshNotifications()
    }, 0)
    const timer = window.setInterval(refreshNotifications, 60000)
    return () => {
      window.clearTimeout(initialTimer)
      window.clearInterval(timer)
    }
  }, [refreshNotifications])

  useEffect(() => {
    if (!notifOpen) return
    const timer = window.setTimeout(() => {
      void refreshNotifications()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [notifOpen, refreshNotifications])

  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      void refreshActivity()
    }, 0)
    const timer = window.setInterval(refreshActivity, 60000)
    return () => {
      window.clearTimeout(initialTimer)
      window.clearInterval(timer)
    }
  }, [refreshActivity])

  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      void refreshDueSoon()
    }, 0)
    const timer = window.setInterval(refreshDueSoon, 120000)
    return () => {
      window.clearTimeout(initialTimer)
      window.clearInterval(timer)
    }
  }, [refreshDueSoon])

  async function handleMarkNotificationRead(id: string) {
    setNotifications((current) =>
      current.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
    )
    setNotifUnread((current) => Math.max(0, current - 1))
    try {
      await markNotificationRead(id)
    } catch {
      refreshNotifications()
    }
  }

  async function handleMarkAllNotificationsRead() {
    setNotifications((current) => current.map((n) => ({ ...n, is_read: true })))
    setNotifUnread(0)
    try {
      await markAllNotificationsRead()
    } catch {
      refreshNotifications()
    }
  }

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', tweaks.theme)
    document.documentElement.style.setProperty('--accent', `oklch(0.72 0.13 ${tweaks.accentHue})`)
    document.documentElement.style.setProperty('--accent-soft', `oklch(0.35 0.08 ${tweaks.accentHue} / 0.22)`)

    if (tweaks.theme === 'light') {
      document.documentElement.style.setProperty('--accent', `oklch(0.5 0.15 ${tweaks.accentHue})`)
      document.documentElement.style.setProperty('--accent-soft', `oklch(0.5 0.15 ${tweaks.accentHue} / 0.12)`)
    }
  }, [tweaks])

  useEffect(() => {
    let mounted = true
    fetchFileLists()
      .then(({ unassignedFiles: pendingFiles, trashedFiles: deletedFiles }) => {
        if (!mounted) return
        setUnassignedFiles(pendingFiles)
        setTrashedFiles(deletedFiles)
      })
      .catch(() => {
        if (mounted) setToast('No se pudieron cargar los archivos sin asignar')
      })
      .finally(() => {
        if (mounted) setLoadingFileLists(false)
      })

    Promise.all([listDocuments(), listTrashedDocuments()])
      .then(async ([activeResponse, trashResponse]) => {
        const docs = await withDocumentTags(activeResponse.data.map(documentResponseToItem))
        if (!mounted) return
        setCreatedDocs(docs)
        setTrashedDocs(trashResponse.data.map(documentResponseToItem))
        const ids = docs.map((d) => d.id)
        getAssignmentCounts(ids)
          .then((counts) => { if (mounted) setAssignmentCounts(counts) })
          .catch(() => {})
      })
      .catch(() => {})

    listUsers()
      .then((response) => {
        if (!mounted) return
        setWorkspaceUsers(response.data)
        setWorkspaceUserCount(response.data.length)
      })
      .catch(() => {})

    fetchStorageSummaryGb()
      .then((summary) => {
        if (!mounted) return
        setStorage(summary)
      })
      .catch(() => {})

    getDocumentMetrics()
      .then((data) => { if (mounted) setMetrics(data) })
      .catch(() => {})

    if (user?.is_superuser) {
      getDocumentMetrics('all')
        .then((data) => { if (mounted) setAdminMetrics(data) })
        .catch(() => {})
    }

    listTags()
      .then((res) => { if (mounted) setTags(res.data) })
      .catch(() => {})

    listExpedients()
      .then((res) => { if (mounted) setExpedients(res.data) })
      .catch(() => {})

    return () => {
      mounted = false
    }
  }, [user?.is_superuser])

  // Cargar detalle del expediente seleccionado. El reset cuando se deselecciona
  // lo hacemos por handler (setSelectedExpedientId) — aqui solo respondemos a
  // ids con valor para evitar setState sincrono en el cuerpo del efecto.
  useEffect(() => {
    if (!selectedExpedientId) return
    let mounted = true
    queueMicrotask(() => {
      if (!mounted) return
      setExpedientLoading(true)
      setExpedientError(null)
    })
    getExpedient(selectedExpedientId)
      .then((res) => {
        if (!mounted) return
        setExpedientDetail(res.data)
      })
      .catch((err) => {
        if (!mounted) return
        setExpedientError(getApiErrorMessage(err, 'No se pudo cargar el expediente'))
      })
      .finally(() => {
        if (mounted) setExpedientLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [selectedExpedientId])

  useEffect(() => {
    if (selectedExpedientId) return
    let mounted = true
    queueMicrotask(() => {
      if (!mounted) return
      setExpedientDetail(null)
      setExpedientError(null)
      setExpedientLoading(false)
    })
    return () => {
      mounted = false
    }
  }, [selectedExpedientId])

  useEffect(() => {
    if (!serverListActive) {
      let mounted = true
      queueMicrotask(() => {
        if (!mounted) return
        setSearchResults(null)
        setSearchError(null)
        setSearchLoading(false)
      })
      return () => {
        mounted = false
      }
    }

    let mounted = true
    const handle = window.setTimeout(() => {
      setSearchLoading(true)
      setSearchError(null)
      listDocuments(documentListParams)
        .then(async (response) => {
          const docs = await withDocumentTags(response.data.map(documentResponseToItem))
          if (!mounted) return
          setSearchResults(docs)
        })
        .catch((err) => {
          if (!mounted) return
          setSearchResults([])
          setSearchError(getApiErrorMessage(err, 'No se pudo buscar documentos'))
        })
        .finally(() => {
          if (mounted) setSearchLoading(false)
        })
    }, 300)

    return () => {
      mounted = false
      window.clearTimeout(handle)
    }
  }, [documentListParams, serverListActive])

  useEffect(() => {
    const backendDoc = openDocId ? createdDocs.some((doc) => doc.id === openDocId) : false
    if (!openDocId || !backendDoc) {
      return
    }
    if (documentDetails[openDocId]) return

    let mounted = true
    queueMicrotask(() => {
      if (!mounted) return
      setDetailLoadingDocId(openDocId)
      setDetailError(null)
    })
    getDocumentDetail(openDocId)
      .then((response) => {
        if (!mounted) return
        setDocumentDetails((current) => ({ ...current, [openDocId]: response.data }))
      })
      .catch((err) => {
        if (!mounted) return
        setDetailError(getApiErrorMessage(err, 'No se pudo cargar el detalle del documento'))
      })
      .finally(() => {
        if (mounted) setDetailLoadingDocId(null)
      })

    return () => {
      mounted = false
    }
  }, [createdDocs, documentDetails, openDocId])

  const visibleDocs = useMemo(() => {
    let list = serverListActive ? searchDocs : allDocs

    if (!serverListActive) {
      if (selectedView === 'favoritos') list = list.filter((doc) => doc.starred)
      else if (selectedView === 'compartidos') list = list.filter((doc) => doc.shared.length > 0 && doc.owner !== 'u1')
      else if (selectedView === 'aprobaciones') list = list.filter((doc) => doc.status === 'pendiente-firma' || doc.status === 'revision')
      else if (selectedView === 'archivos-sin-asignar') list = []
      else if (selectedView === 'papelera') list = []
      else if (selectedView === 'recientes') list = [...list].sort((a, b) => a.modified.localeCompare(b.modified))
      else if (selectedView === 'carpeta' && selectedFolder !== 'root') list = list.filter((doc) => doc.folder === selectedFolder)
    }

    if (selectedTag) list = list.filter((doc) => doc.tags.includes(selectedTag))
    if (filters.documentType) list = list.filter((doc) => doc.documentTypeId === filters.documentType)
    if (filters.status) list = list.filter((doc) => doc.status === filters.status)
    if (filters.assignee) list = list.filter((doc) => (doc.assignee ?? doc.owner) === filters.assignee)
    if (filters.assigned) {
      list = list.filter((doc) => Boolean(doc.assignedUserIds?.includes(filters.assigned as string)))
    }
    if (filters.date) list = list.filter((doc) => documentMatchesDateFilter(doc, filters.date))

    return list
  }, [allDocs, serverListActive, searchDocs, selectedView, selectedFolder, selectedTag, filters])

  const breadcrumb = useMemo(() => {
    if (selectedView === 'inicio') return [{ id: 'inicio', label: 'Inicio' }]
    if (selectedView === 'kanban') return [{ id: 'kanban', label: 'Pipeline' }]
    if (selectedView === 'archivos-sin-asignar') return [{ id: 'archivos-sin-asignar', label: 'Archivos sin asignar' }]
    if (selectedView === 'recientes') return [{ id: 'recientes', label: 'Recientes' }]
    if (selectedView === 'compartidos') return [{ id: 'compartidos', label: 'Compartidos conmigo' }]
    if (selectedView === 'favoritos') return [{ id: 'favoritos', label: 'Favoritos' }]
    if (selectedView === 'aprobaciones') return [{ id: 'aprobaciones', label: 'Aprobaciones' }]
    if (selectedView === 'papelera') return [{ id: 'papelera', label: 'Papelera' }]
    if (selectedView === 'expediente') {
      const exp = expedients.find((item) => item.id === selectedExpedientId)
      const name = expedientDetail?.name ?? exp?.name ?? 'Expediente'
      return [{ id: 'expedientes', label: 'Expedientes' }, { id: selectedExpedientId ?? 'expediente', label: name }]
    }
    const path = getFolderPath(dashboardData.folders, selectedFolder)
    return path ? path.map((node) => ({ id: node.id, label: node.name })) : [{ id: 'root', label: 'Archivo' }]
  }, [selectedView, selectedFolder, selectedExpedientId, expedientDetail?.name, expedients])

  const openDocObj = openDocId ? allDocs.find((doc) => doc.id === openDocId) ?? null : null
  const openDocDetail = openDocId ? documentDetails[openDocId] ?? null : null
  const isOpenDocFromBackend = openDocId ? createdDocs.some((doc) => doc.id === openDocId) : false
  const allSelected = visibleDocs.length > 0 && visibleDocs.every((doc) => selected.has(doc.id))
  const showAdminPanel = selectedView === 'admin' && Boolean(user?.is_superuser)
  const showDashboard =
    (selectedView === 'inicio' || showAdminPanel) &&
    search.trim() === '' &&
    !filtersActive &&
    !selectedTag
  const dashboardMetrics = showAdminPanel ? adminMetrics : metrics
  const showKanban = selectedView === 'kanban'
  const kanbanDocs = useMemo(
    () => visibleDocs.filter((doc) => createdDocs.some((createdDoc) => createdDoc.id === doc.id)),
    [createdDocs, visibleDocs],
  )

  function toggleSelect(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  function selectAll() {
    if (selected.size === visibleDocs.length) {
      setSelected(new Set())
      return
    }
    setSelected(new Set(visibleDocs.map((doc) => doc.id)))
  }

  function clearSelection() {
    setSelected(new Set())
  }

  function updateDocumentTagsInState(tagsByDocument: Map<string, string[]>) {
    const applyTags = (doc: DocumentItem) => {
      const tagIds = tagsByDocument.get(doc.id)
      return tagIds ? { ...doc, tags: tagIds } : doc
    }

    setCreatedDocs((current) => current.map(applyTags))
    setSearchResults((current) => current ? current.map(applyTags) : current)
  }

  function openTagAssignment(docIds: string[]) {
    const uniqueDocIds = Array.from(new Set(docIds)).filter(Boolean)
    const backendDocIds = uniqueDocIds.filter((docId) => createdDocs.some((doc) => doc.id === docId))

    if (backendDocIds.length === 0) {
      setToast('Solo los documentos reales del sistema pueden recibir etiquetas')
      return
    }

    if (backendDocIds.length < uniqueDocIds.length) {
      setToast('Se ignoraron documentos de ejemplo que no existen en backend')
    }

    const selectedDocs = backendDocIds
      .map((docId) => allDocs.find((doc) => doc.id === docId))
      .filter((doc): doc is DocumentItem => Boolean(doc))

    const commonTagIds = new Set<string>()
    const [firstDoc, ...restDocs] = selectedDocs
    firstDoc?.tags.forEach((tagId) => {
      if (restDocs.every((doc) => doc.tags.includes(tagId))) commonTagIds.add(tagId)
    })

    setTagAssignmentDocIds(backendDocIds)
    setTagAssignmentSelected(commonTagIds)
  }

  function closeTagAssignment() {
    if (savingTagAssignment) return
    setTagAssignmentDocIds([])
    setTagAssignmentSelected(new Set())
  }

  function toggleTagAssignment(tagId: string) {
    setTagAssignmentSelected((current) => {
      const next = new Set(current)
      if (next.has(tagId)) next.delete(tagId)
      else next.add(tagId)
      return next
    })
  }

  async function saveTagAssignment() {
    const targetDocIds = tagAssignmentDocIds.filter((docId) => createdDocs.some((doc) => doc.id === docId))
    if (targetDocIds.length === 0) {
      setToast('No hay documentos validos para etiquetar')
      closeTagAssignment()
      return
    }

    const docsById = new Map(allDocs.map((doc) => [doc.id, doc]))
    const selectedTagIds = Array.from(tagAssignmentSelected)
    const bulkMode = targetDocIds.length > 1
    const nextTagsByDocument = new Map<string, string[]>()
    const operations: Array<Promise<unknown>> = []

    targetDocIds.forEach((docId) => {
      const currentTags = new Set(docsById.get(docId)?.tags ?? [])
      const nextTags = bulkMode ? new Set([...currentTags, ...selectedTagIds]) : new Set(selectedTagIds)

      Array.from(nextTags)
        .filter((tagId) => !currentTags.has(tagId))
        .forEach((tagId) => operations.push(assignTagToDocument(docId, tagId)))

      if (!bulkMode) {
        Array.from(currentTags)
          .filter((tagId) => !nextTags.has(tagId))
          .forEach((tagId) => operations.push(removeTagFromDocument(docId, tagId)))
      }

      nextTagsByDocument.set(docId, Array.from(nextTags))
    })

    setSavingTagAssignment(true)
    try {
      await Promise.all(operations)
      updateDocumentTagsInState(nextTagsByDocument)
      setDocumentDetails((current) => {
        const next = { ...current }
        targetDocIds.forEach((docId) => {
          delete next[docId]
        })
        return next
      })
      setTagAssignmentDocIds([])
      setTagAssignmentSelected(new Set())
      setToast(targetDocIds.length === 1 ? 'Etiquetas del documento actualizadas' : 'Etiquetas agregadas a los documentos')
    } catch (err) {
      setToast(getApiErrorMessage(err, 'No se pudieron actualizar las etiquetas'))
    } finally {
      setSavingTagAssignment(false)
    }
  }

  function clearTrashSelection() {
    setSelectedTrashFileIds(new Set())
    setSelectingTrashFiles(false)
  }

  function openDoc(id: string) {
    setOpenDocId(id)
  }

  const KANBAN_COL_TO_STATE: Record<string, string> = {
    borrador: 'borrador',
    revision: 'en_revision',
    observado: 'observado',
    'pendiente-firma': 'pendiente_firma',
    aprobado: 'aprobado',
    rechazado: 'rechazado',
  }

  const STATES_REQUIRING_COMMENT = new Set(['observado', 'rechazado'])
  const STATE_LABELS: Record<string, string> = {
    borrador: 'Borrador',
    en_revision: 'En revisión',
    observado: 'Observado',
    pendiente_firma: 'Pendiente de firma',
    aprobado: 'Aprobado',
    rechazado: 'Rechazado',
  }

  function requestStateComment(stateCode: string): Promise<string> {
    return new Promise((resolve, reject) => {
      setStateCommentPrompt({
        stateLabel: STATE_LABELS[stateCode] ?? stateCode,
        resolve: (comment) => {
          setStateCommentPrompt(null)
          resolve(comment)
        },
        reject: () => {
          setStateCommentPrompt(null)
          reject(new Error('Cambio de estado cancelado'))
        },
      })
    })
  }

  async function handleKanbanStateChange(docId: string, newColId: string) {
    const newStateCode = KANBAN_COL_TO_STATE[newColId]
    if (!newStateCode) throw new Error('Estado desconocido')
    let comment: string | undefined
    if (STATES_REQUIRING_COMMENT.has(newStateCode)) {
      comment = await requestStateComment(newStateCode)
    }
    await changeDocumentState(docId, newStateCode, comment)
    setCreatedDocs((prev) => prev.map((d) =>
      d.id === docId ? { ...d, status: statusFromWorkflow(newStateCode) } : d,
    ))
    setDocumentDetails((current) => {
      if (!current[docId]) return current
      const next = { ...current }
      delete next[docId]
      return next
    })
  }

  function openContextMenu(event: React.MouseEvent, docId: string) {
    setCtxMenu({ x: event.clientX, y: event.clientY, docId })
  }

  async function refreshStorageSummary() {
    try {
      setStorage(await fetchStorageSummaryGb())
    } catch {
      // La cuota es informacion de apoyo; si falla, no bloquea la accion principal.
    }
  }

  async function refreshFileLists(showLoading = false) {
    if (showLoading) setLoadingFileLists(true)
    try {
      const { unassignedFiles: pendingFiles, trashedFiles: deletedFiles } = await fetchFileLists()
      setUnassignedFiles(pendingFiles)
      setTrashedFiles(deletedFiles)
      setSelectedTrashFileIds((current) => new Set([...current].filter((id) => deletedFiles.some((file) => file.id === id))))
    } catch {
      setToast('No se pudieron cargar los archivos sin asignar')
    } finally {
      if (showLoading) setLoadingFileLists(false)
    }
  }

  async function handleTrashFile(file: StoredFileItem) {
    setBusyFileId(file.id)
    try {
      const { data } = await moveFileToTrash(file.id)
      setUnassignedFiles((current) => current.filter((item) => item.id !== file.id))
      setTrashedFiles((current) => [data, ...current.filter((item) => item.id !== data.id)])
      if (selectedUnassignedFileId === file.id) setSelectedUnassignedFileId(null)
      setToast(`${file.original_filename} enviado a papelera`)
    } catch (err) {
      setToast(getApiErrorMessage(err, 'No se pudo enviar el archivo a papelera'))
    } finally {
      setBusyFileId(null)
    }
  }

  async function handleTrashDocument(documentId: string) {
    const document = createdDocs.find((item) => item.id === documentId)
    if (!document) {
      setToast('Solo los documentos creados en el sistema se pueden enviar a papelera')
      return
    }

    setBusyFileId(`doc:${documentId}`)
    try {
      const { data } = await moveDocumentToTrash(documentId)
      const trashedDocument = documentResponseToItem(data)
      setCreatedDocs((current) => current.filter((item) => item.id !== documentId))
      setTrashedDocs((current) => [trashedDocument, ...current.filter((item) => item.id !== documentId)])
      setDocumentDetails((current) => {
        const next = { ...current }
        delete next[documentId]
        return next
      })
      setSelected((current) => {
        const next = new Set(current)
        next.delete(documentId)
        return next
      })
      if (openDocId === documentId) setOpenDocId(null)
      setToast(`"${data.title}" enviado a papelera`)
    } catch (err) {
      setToast(getApiErrorMessage(err, 'No se pudo enviar el documento a papelera'))
    } finally {
      setBusyFileId(null)
    }
  }

  function removeTrashSelection(fileIds: string[]) {
    const removed = new Set(fileIds)
    setSelectedTrashFileIds((current) => new Set([...current].filter((id) => !removed.has(id))))
  }

  function toggleTrashSelectionMode() {
    if (selectingTrashFiles) {
      setSelectedTrashFileIds(new Set())
      setSelectingTrashFiles(false)
      return
    }
    setSelectingTrashFiles(true)
  }

  function toggleTrashFileSelection(file: StoredFileItem) {
    setSelectedTrashFileIds((current) => {
      const next = new Set(current)
      if (next.has(file.id)) next.delete(file.id)
      else next.add(file.id)
      return next
    })
  }

  function toggleAllTrashFilesSelection() {
    setSelectedTrashFileIds((current) => {
      if (current.size === trashedFiles.length) return new Set()
      return new Set(trashedFiles.map((file) => file.id))
    })
  }

  async function handleRestoreTrashedFile(file: StoredFileItem) {
    setBusyFileId(file.id)
    try {
      const { data } = await restoreFileFromTrash(file.id)
      setTrashedFiles((current) => current.filter((item) => item.id !== file.id))
      setUnassignedFiles((current) => [data, ...current.filter((item) => item.id !== data.id)])
      removeTrashSelection([file.id])
      setToast(`${file.original_filename} restaurado`)
    } catch (err) {
      setToast(getApiErrorMessage(err, 'No se pudo restaurar el archivo'))
    } finally {
      setBusyFileId(null)
    }
  }

  async function handleDeleteTrashedFile(file: StoredFileItem) {
    setBusyFileId(file.id)
    try {
      await permanentlyDeleteFile(file.id)
      setTrashedFiles((current) => current.filter((item) => item.id !== file.id))
      removeTrashSelection([file.id])
      void refreshStorageSummary()
      setToast(`${file.original_filename} eliminado definitivamente`)
    } catch (err) {
      setToast(getApiErrorMessage(err, 'No se pudo eliminar definitivamente el archivo'))
    } finally {
      setBusyFileId(null)
    }
  }

  async function handleRestoreTrashedDocument(document: DocumentItem) {
    setBusyFileId(`doc:${document.id}`)
    try {
      const { data } = await restoreDocumentFromTrash(document.id)
      const restoredDocument = documentResponseToItem(data)
      setTrashedDocs((current) => current.filter((item) => item.id !== document.id))
      setCreatedDocs((current) => [restoredDocument, ...current.filter((item) => item.id !== document.id)])
      setToast(`"${data.title}" restaurado`)
    } catch (err) {
      setToast(getApiErrorMessage(err, 'No se pudo restaurar el documento'))
    } finally {
      setBusyFileId(null)
    }
  }

  async function handleDeleteTrashedDocument(document: DocumentItem) {
    setBusyFileId(`doc:${document.id}`)
    try {
      await permanentlyDeleteDocument(document.id)
      setTrashedDocs((current) => current.filter((item) => item.id !== document.id))
      setToast(`"${document.name}" eliminado definitivamente`)
    } catch (err) {
      setToast(getApiErrorMessage(err, 'No se pudo eliminar definitivamente el documento'))
    } finally {
      setBusyFileId(null)
    }
  }

  async function handleRestoreSelectedTrashedFiles() {
    const selectedIds = [...selectedTrashFileIds]
    if (selectedIds.length === 0) return

    setBusyFileId('__trash-bulk__')
    try {
      const { data } = await restoreFilesFromTrash(selectedIds)
      const restoredIds = new Set(data.map((file) => file.id))
      setTrashedFiles((current) => current.filter((file) => !restoredIds.has(file.id)))
      setUnassignedFiles((current) => [...data, ...current.filter((file) => !restoredIds.has(file.id))])
      clearTrashSelection()
      setToast(`${data.length} archivo${data.length === 1 ? '' : 's'} restaurado${data.length === 1 ? '' : 's'}`)
    } catch (err) {
      setToast(getApiErrorMessage(err, 'No se pudieron restaurar los archivos seleccionados'))
    } finally {
      setBusyFileId(null)
    }
  }

  async function handleDeleteSelectedTrashedFiles() {
    const selectedIds = [...selectedTrashFileIds]
    if (selectedIds.length === 0) return

    setBusyFileId('__trash-bulk__')
    try {
      const { data } = await permanentlyDeleteFiles(selectedIds)
      const deletedIds = new Set(selectedIds)
      setTrashedFiles((current) => current.filter((file) => !deletedIds.has(file.id)))
      clearTrashSelection()
      void refreshStorageSummary()
      setToast(`${data.deleted_count} archivo${data.deleted_count === 1 ? '' : 's'} eliminado${data.deleted_count === 1 ? '' : 's'} definitivamente`)
    } catch (err) {
      setToast(getApiErrorMessage(err, 'No se pudieron eliminar los archivos seleccionados'))
    } finally {
      setBusyFileId(null)
    }
  }

  async function handleRestoreAllTrashedFiles() {
    if (trashedFiles.length === 0 && trashedDocs.length === 0) return

    setBusyFileId('__trash-bulk__')
    try {
      const restoredFiles = trashedFiles.length > 0
        ? (await restoreAllTrashedFiles()).data
        : []
      const restoredDocuments = await Promise.all(
        trashedDocs.map((document) => restoreDocumentFromTrash(document.id).then((response) => documentResponseToItem(response.data))),
      )
      const restoredIds = new Set(restoredFiles.map((file) => file.id))
      setTrashedFiles((current) => current.filter((file) => !restoredIds.has(file.id)))
      setUnassignedFiles((current) => [...restoredFiles, ...current.filter((file) => !restoredIds.has(file.id))])
      setTrashedDocs([])
      setCreatedDocs((current) => [...restoredDocuments, ...current.filter((document) => !restoredDocuments.some((restored) => restored.id === document.id))])
      clearTrashSelection()
      const total = restoredFiles.length + restoredDocuments.length
      setToast(`${total} elemento${total === 1 ? '' : 's'} restaurado${total === 1 ? '' : 's'}`)
    } catch (err) {
      setToast(getApiErrorMessage(err, 'No se pudo restaurar toda la papelera'))
    } finally {
      setBusyFileId(null)
    }
  }

  async function handleDeleteAllTrashedFiles() {
    if (trashedFiles.length === 0 && trashedDocs.length === 0) return

    setBusyFileId('__trash-bulk__')
    try {
      const deletedFiles = trashedFiles.length > 0
        ? (await permanentlyDeleteAllTrashedFiles()).data.deleted_count
        : 0
      await Promise.all(trashedDocs.map((document) => permanentlyDeleteDocument(document.id)))
      setTrashedFiles([])
      setTrashedDocs([])
      clearTrashSelection()
      void refreshStorageSummary()
      const total = deletedFiles + trashedDocs.length
      setToast(`${total} elemento${total === 1 ? '' : 's'} eliminado${total === 1 ? '' : 's'} definitivamente`)
    } catch (err) {
      setToast(getApiErrorMessage(err, 'No se pudo eliminar toda la papelera'))
    } finally {
      setBusyFileId(null)
    }
  }

  function markUnassignedFileAsUsed(fileId: string) {
    setUnassignedFiles((current) => current.filter((item) => item.id !== fileId))
    if (selectedUnassignedFileId === fileId) setSelectedUnassignedFileId(null)
  }

  function markDocumentHasFile(documentId: string, file: StoredFileItem) {
    setDocumentDetails((current) => {
      const next = { ...current }
      delete next[documentId]
      return next
    })
    setCreatedDocs((current) => current.map((doc) => (
      doc.id === documentId
        ? {
            ...doc,
            kind: docKindFromMime(file.mime_type),
            size: formatFileSize(file.size_bytes),
            modified: 'ahora',
            version: Math.max(1, doc.version + 1),
          }
        : doc
    )))
  }

  function handleCreateDocumentFromFile(file: StoredFileItem) {
    setCreateDocumentInitialFile(file)
    setCreateDocumentModalOpen(true)
  }

  function handleAssignFileToDocument(file: StoredFileItem) {
    setAssignFileModalFile(file)
  }

  function openMetadataEditor(documentId: string) {
    if (!createdDocs.some((doc) => doc.id === documentId)) {
      setToast('Solo se puede editar metadata de documentos creados en el sistema')
      return
    }
    setEditingMetadataDocId(documentId)
  }

  function handleMetadataUpdated(document: DocumentItemResponse, attachment?: DocumentAttachmentResult) {
    const updated = documentResponseToItem(document)
    const attachedFile = attachment?.attachedUnassignedFile
    const uploadedFile = attachment?.uploadedFile
    setDocumentDetails((current) => {
      const next = { ...current }
      delete next[document.id]
      return next
    })
    setCreatedDocs((current) => current.map((item) => (
      item.id === updated.id
        ? (() => {
            const base = {
              ...item,
              name: updated.name,
              kind: updated.kind,
              description: updated.description,
              documentTypeId: updated.documentTypeId,
              confidentialityLevel: updated.confidentialityLevel,
              metadataActivity: updated.metadataActivity,
              folder: updated.folder,
              owner: updated.owner,
              modified: 'ahora',
              status: updated.status,
            }

            if (attachedFile) {
              return {
                ...base,
                kind: docKindFromMime(attachedFile.mime_type),
                size: formatFileSize(attachedFile.size_bytes),
                version: Math.max(1, item.version + 1),
              }
            }

            if (uploadedFile) {
              return {
                ...base,
                kind: docKindFromMime(uploadedFile.type),
                size: formatFileSize(uploadedFile.size),
                version: Math.max(1, item.version + 1),
              }
            }

            return base
          })()
        : item
    )))
    if (attachment?.attachedUnassignedFileId) markUnassignedFileAsUsed(attachment.attachedUnassignedFileId)
    if (uploadedFile) void refreshStorageSummary()
    void getRecentActivity().then(setRecentActivity).catch(() => undefined)
    setToast(
      attachment?.attachedUnassignedFileId || uploadedFile
        ? `Documento "${document.title}" actualizado con archivo`
        : `Metadata de "${document.title}" actualizada`,
    )
  }

  async function handleAssignAssignee(documentId: string, userId: string) {
    const assignment = await assignDocumentAssignee(documentId, userId)
    const detailResponse = await getDocumentDetail(documentId)
    const detailData = detailResponse.data
    const updatedDocument = detailData.document
    const assignedUserIds = updatedDocument.assigned_user_ids ?? [assignment.assignee_user_id]

    setDocumentDetails((current) => ({ ...current, [documentId]: detailData }))

    const updateDoc = (doc: DocumentItem) => doc.id === documentId
      ? {
          ...doc,
          assignee: assignment.assignee_user_id,
          assignedUserIds,
          shared: assignedUserIds.filter((assignedId) => assignedId !== doc.owner),
          status: statusFromWorkflow(updatedDocument.workflow_state_code),
          modified: 'ahora',
          updatedAt: updatedDocument.updated_at,
        }
      : doc

    setCreatedDocs((current) => current.map(updateDoc))
    setSearchResults((current) => current ? current.map(updateDoc) : current)

    try {
      const counts = await getAssignmentCounts([documentId])
      setAssignmentCounts((current) => ({ ...current, ...counts }))
    } catch {
      setAssignmentCounts((current) => ({ ...current, [documentId]: assignedUserIds.length }))
    }

    const assigneeLabel = filterUserOptions.find(([value]) => value === assignment.assignee_user_id)?.[1]
      ?? assignment.assignee_user_id
    setToast(`Encargado actualizado: ${assigneeLabel}`)
  }

  async function refreshDetailAndCounts(documentId: string) {
    const detailResponse = await getDocumentDetail(documentId)
    const detailData = detailResponse.data
    setDocumentDetails((current) => ({ ...current, [documentId]: detailData }))
    const assignedUserIds = detailData.document.assigned_user_ids ?? []

    const updateDoc = (doc: DocumentItem) => doc.id === documentId
      ? {
          ...doc,
          assignedUserIds,
          shared: assignedUserIds.filter((assignedId) => assignedId !== doc.owner),
          updatedAt: detailData.document.updated_at,
          modified: 'ahora',
        }
      : doc
    setCreatedDocs((current) => current.map(updateDoc))
    setSearchResults((current) => current ? current.map(updateDoc) : current)

    try {
      const counts = await getAssignmentCounts([documentId])
      setAssignmentCounts((current) => ({ ...current, ...counts }))
    } catch {
      setAssignmentCounts((current) => ({ ...current, [documentId]: assignedUserIds.length }))
    }
  }

  async function handleAddAssignment(documentId: string, userId: string, roleCode: string) {
    await addDocumentAssignment(documentId, userId, roleCode)
    await refreshDetailAndCounts(documentId)
    const label = filterUserOptions.find(([value]) => value === userId)?.[1] ?? userId
    setToast(`Asignacion agregada: ${label} (${roleCode})`)
  }

  async function handleRemoveAssignment(documentId: string, assignmentId: string) {
    await removeDocumentAssignment(documentId, assignmentId)
    await refreshDetailAndCounts(documentId)
    setToast('Asignacion quitada')
  }

  async function handleUpdateAssignmentRole(documentId: string, assignmentId: string, roleCode: string) {
    await updateDocumentAssignmentRole(documentId, assignmentId, roleCode)
    await refreshDetailAndCounts(documentId)
    setToast(`Rol actualizado: ${roleCode}`)
  }

  async function handleVersionUploaded(documentId: string) {
    await refreshDetailAndCounts(documentId)
    setToast('Nueva versión registrada')
  }

  async function handleAction(action: string, docId?: string) {
    if (action === 'team') {
      if (!user?.is_superuser) {
        setToast('Solo administradores pueden gestionar usuarios')
        return
      }
      setTeamModalOpen(true)
      return
    }

    if (action === 'upload') {
      void docId
      setUploadInitialFiles([])
      setUploadModalOpen(true)
      return
    }

    if (action === 'new') {
      void docId
      setCreateDocumentInitialFile(null)
      setCreateDocumentModalOpen(true)
      return
    }

    if (action === 'trash' && docId) {
      await handleTrashDocument(docId)
      return
    }

    if (action === 'edit-metadata' && docId) {
      openMetadataEditor(docId)
      return
    }

    if (action === 'tag' && docId) {
      openTagAssignment([docId])
      return
    }

    const messages: Record<string, string> = {
      download: 'Descarga iniciada',
      share: 'Enlace copiado al portapapeles',
      sign: 'Solicitud de firma enviada',
      trash: 'Movido a papelera',
      move: 'Selecciona destino…',
      tag: 'Selecciona uno o mas documentos para etiquetar',
      star: 'Añadido a favoritos',
      rename: 'Renombrar — modo edición',
      open: 'Abriendo documento…',
      preview: 'Vista previa activada',
      fullscreen: 'Abriendo completo…',
      'new-folder': 'Nueva carpeta creada',
      scan: 'Escaneo OCR iniciado',
    }

    setToast(messages[action] ?? `Acción: ${action}`)

    if ((action === 'open' || action === 'preview' || action === 'fullscreen') && docId) {
      setOpenDocId(docId)
    }
  }

  useEffect(() => {
    function onEnter(event: DragEvent) {
      event.preventDefault()
      dragCounter.current += 1
      if (event.dataTransfer?.types?.includes('Files')) setDragging(true)
    }

    function onOver(event: DragEvent) {
      event.preventDefault()
    }

    function onLeave(event: DragEvent) {
      event.preventDefault()
      dragCounter.current -= 1
      if (dragCounter.current <= 0) {
        dragCounter.current = 0
        setDragging(false)
      }
    }

    function onDrop(event: DragEvent) {
      event.preventDefault()
      dragCounter.current = 0
      setDragging(false)
      if (event.dataTransfer?.files?.length) {
        setUploadInitialFiles(Array.from(event.dataTransfer.files))
        setUploadModalOpen(true)
      }
    }

    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragover', onOver)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('drop', onDrop)

    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setSelected(new Set())
        setOpenDocId(null)
        setCtxMenu(null)
      }

      if (
        event.key === ' ' &&
        selected.size === 1 &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement)
      ) {
        event.preventDefault()
        setOpenDocId([...selected][0] ?? null)
      }

      if (
        event.key === 'F2' &&
        selected.size === 1 &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement)
      ) {
        event.preventDefault()
        const selectedId = [...selected][0] ?? ''
        if (!createdDocs.some((doc) => doc.id === selectedId)) {
          setToast('Solo se puede editar metadata de documentos creados en el sistema')
          return
        }
        setEditingMetadataDocId(selectedId)
      }
    }

    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [createdDocs, selected])

  const usersDirectory = useMemo<UsersDirectoryValue>(() => {
    const lookupLabel = (userId?: string | null): string => {
      if (!userId) return 'Sin asignar'
      if (user?.id === userId) return userLabelFromAuth(user.first_name, user.last_name, user.email)
      const real = workspaceUsers.find((u) => u.id === userId)
      if (real) return userLabelFromAuth(real.first_name, real.last_name, real.email)
      const mock = findUserById(userId)
      if (mock) return mock.name
      return 'Usuario sin nombre'
    }
    const lookupColor = (userId?: string | null): string => {
      if (!userId) return 'var(--bg-elev-2)'
      if (user?.id === userId && user.color) return user.color
      const real = workspaceUsers.find((u) => u.id === userId)
      if (real?.color) return real.color
      const mock = findUserById(userId)
      if (mock?.color) return mock.color
      return actorColorFromId(userId)
    }
    return {
      resolveColor: lookupColor,
      resolveInitials: (userId) => initialsFromLabel(lookupLabel(userId)),
      resolveLabel: lookupLabel,
    }
  }, [user, workspaceUsers])

  return (
    <UsersDirectoryContext.Provider value={usersDirectory}>
    <div className="edms-dashboard" style={{ display: 'flex', height: '100vh', width: '100vw', position: 'relative', background: 'var(--bg)' }}>
      <Sidebar
        collapsed={tweaks.sidebarCollapsed}
        selectedView={selectedView}
        onSelectView={(view) => {
          setSelectedView(view)
          setSelected(new Set())
          setSearch('')
          if (view !== 'archivos-sin-asignar') setSelectedUnassignedFileId(null)
          if (view !== 'papelera') clearTrashSelection()
        }}
        selectedTag={selectedTag}
        onSelectTag={setSelectedTag}
        unassignedCount={unassignedFiles.length}
        onToggleCollapsed={() => setTweaks((current) => ({ ...current, sidebarCollapsed: !current.sidebarCollapsed }))}
        storage={storage}
        tags={tags}
        onCreateTag={() => { setEditingTag(null); setTagForm({ label: '', color: '#6366f1' }); setTagModalOpen(true) }}
        onEditTag={(tag) => { setEditingTag(tag); setTagForm({ label: tag.label, color: tag.color }); setTagModalOpen(true) }}
        userCount={workspaceUserCount}
        isAdmin={Boolean(user?.is_superuser)}
        onDeleteTag={async (tagId) => {
          await deleteTag(tagId)
          setTags((prev) => prev.filter((t) => t.id !== tagId))
          if (selectedTag === tagId) setSelectedTag(null)
        }}
        expedients={expedients}
        selectedExpedientId={selectedExpedientId}
        onSelectExpedient={(expedientId) => {
          setSelectedExpedientId(expedientId)
          setSelectedView('expediente')
          setSelected(new Set())
          setSearch('')
        }}
        onCreateExpedient={() => {
          setExpedientForm({ name: '', code: '', description: '' })
          setExpedientFormError(null)
          setExpedientModalOpen(true)
        }}
      />

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative' }}>
        <Topbar
          breadcrumb={breadcrumb}
          onCrumbClick={(crumb) => {
            const folderExists = dashboardData.folders.some((folder) => folder.id === crumb.id) || Boolean(getFolderPath(dashboardData.folders, crumb.id))
            if (folderExists) {
              setSelectedView('carpeta')
              setSelectedFolder(crumb.id)
            }
          }}
          search={search}
          onSearch={(value) => {
            setSearch(value)
            setSelected(new Set())
          }}
          searchDocs={searchDocs}
          searchLoading={searchActive && (searchLoading || searchResults === null)}
          searchError={searchError}
          viewMode={viewMode}
          onViewMode={setViewMode}
          onAction={handleAction}
          onSelectResult={openDoc}
          onOpenNotifs={() => setNotifOpen(true)}
          notifCount={notifUnread}
          bellRef={bellRef}
          userLabel={currentUserLabel}
          userInitials={currentUserInitials}
          userEmail={currentUserEmail}
          userColor={currentUserColor}
          onLogout={logout}
        />

        <div style={{ padding: '18px 18px 8px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 2px', letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: 10 }}>
              {searchActive
                ? 'Resultados de búsqueda'
                : showAdminPanel
                  ? 'Panel administrador'
                  : showDashboard
                    ? `Buenos días, ${firstName}`
                    : breadcrumb[breadcrumb.length - 1]?.label}
              {showAdminPanel && (
                <span style={{
                  fontSize: 10.5, padding: '2px 8px', borderRadius: 999,
                  background: 'var(--warn-soft)', color: 'var(--warn)',
                  border: '1px solid var(--warn)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
                }}>
                  vista global
                </span>
              )}
            </h1>
            <div style={{ fontSize: 12.5, color: 'var(--fg-muted)' }}>
              {showAdminPanel
                ? `Métricas globales del workspace · ${adminMetrics ? `${adminMetrics.total} documento${adminMetrics.total === 1 ? '' : 's'} activo${adminMetrics.total === 1 ? '' : 's'}` : 'cargando...'}`
                : showDashboard
                ? 'Tienes 3 documentos que requieren tu firma hoy.'
                : showKanban
                  ? `${kanbanDocs.length} documento${kanbanDocs.length !== 1 ? 's' : ''} en el pipeline · arrastra para cambiar estado`
                : selectedView === 'archivos-sin-asignar'
                  ? `${unassignedFiles.length} archivo${unassignedFiles.length === 1 ? '' : 's'} pendiente${unassignedFiles.length === 1 ? '' : 's'} por convertir en documento`
                  : selectedView === 'papelera'
                    ? `${trashedFiles.length + trashedDocs.length} elemento${trashedFiles.length + trashedDocs.length === 1 ? '' : 's'} en papelera`
                  : searchActive
                    ? searchLoading || searchResults === null
                      ? `Buscando “${searchQuery}”…`
                      : `${visibleDocs.length} resultado${visibleDocs.length === 1 ? '' : 's'} para “${searchQuery}”`
                  : filtersActive
                    ? `${visibleDocs.length} documento${visibleDocs.length === 1 ? '' : 's'} con filtros activos`
                  : `${visibleDocs.length} documentos${selectedTag ? ` · etiqueta "${findTag(tags, selectedTag)?.label}"` : ''}`}
            </div>
          </div>

          {!showDashboard && !showKanban && selectedView !== 'archivos-sin-asignar' && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => handleAction('new-folder')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-elev)',
                  color: 'var(--fg)',
                  fontSize: 12.5,
                }}
              >
                <Icon.Folder size={13} /> Nueva carpeta
              </button>
              <button
                onClick={() => handleAction('scan')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-elev)',
                  color: 'var(--fg)',
                  fontSize: 12.5,
                }}
              >
                <Icon.Scan size={13} /> Escanear (OCR)
              </button>
            </div>
          )}
        </div>

        {selectedView === 'expediente' ? (
          <ExpedientDetailView
            expedient={expedientDetail}
            loading={expedientLoading}
            error={expedientError}
            userLabel={labelForUserId}
            onOpenDoc={openDoc}
            onAddDocument={() => {
              setAttachDocsSelected(new Set())
              setAttachDocsFilter('')
              setAttachDocsError(null)
              setAttachDocsModalOpen(true)
            }}
          />
        ) : showKanban ? (
          <>
            <FiltersRow
              filters={filters}
              userOptions={filterUserOptions}
              onFilters={setFilters}
              onClear={() => setFilters(initialFilters)}
            />
            <KanbanView
              docs={kanbanDocs.map((doc) => ({
                id: doc.id,
                name: doc.name,
                kind: doc.kind,
                status: doc.status,
                owner: doc.owner,
                version: doc.version,
                tags: doc.tags,
                assignedCount: assignmentCounts[doc.id] ?? 0,
                assigneeLabel: labelForUserId(doc.assignee ?? doc.owner),
                assigneeInitials: initialsForUserId(doc.assignee ?? doc.owner),
                dueDate: doc.dueDate ?? null,
              }))}
              tags={tags}
              onOpen={openDoc}
              onStateChange={handleKanbanStateChange}
            />
          </>
        ) : showDashboard ? (
          <div style={{ flex: 1, overflow: 'auto' }}>
            <OverviewCards storage={storage} metrics={dashboardMetrics} />
            <div style={{ padding: '14px 18px 10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Recientes</h2>
                <button onClick={() => setSelectedView('recientes')} style={{ fontSize: 12, color: 'var(--fg-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                  Ver todos <Icon.Arrow size={11} />
                </button>
              </div>
              <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 0 }}>
                  {allDocs.slice(0, 6).map((doc, index) => {
                    const kind = findKind(doc.kind)
                    return (
                      <button
                        key={doc.id}
                        onClick={() => openDoc(doc.id)}
                        className="edms-nav-item"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '12px 14px',
                          borderRight: index % 3 !== 2 ? '1px solid var(--border)' : 'none',
                          borderBottom: index < 3 ? '1px solid var(--border)' : 'none',
                          background: 'transparent',
                          color: 'var(--fg)',
                          textAlign: 'left',
                        }}
                      >
                        <div
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 6,
                            flexShrink: 0,
                            background: `color-mix(in oklch, ${kind.tone} 16%, var(--bg-elev-2))`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: kind.tone,
                            fontSize: 9,
                            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                            fontWeight: 600,
                          }}
                        >
                          {kind.label}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 2 }}>
                            {doc.name}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
                            {doc.modified} · v{doc.version}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 12, padding: '4px 18px 12px' }}>
              <ApprovalsPanel onOpenDoc={openDoc} />
              <ActivityPanel items={recentActivity} onOpenDoc={openDoc} userLabel={labelForUserId} userColor={colorForUserId} />
            </div>

            <div style={{ padding: '4px 18px 24px', display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 12 }}>
              <DueSoonPanel docs={dueSoonDocs} onOpenDoc={openDoc} userLabel={labelForUserId} />
              <StateBreakdownPanel metrics={dashboardMetrics} userLabel={labelForUserId} userColor={colorForUserId} />
            </div>

          </div>
        ) : (
          <>
            {selectedView === 'archivos-sin-asignar' && !searchActive ? (
              <UnassignedFilesPanel
                files={unassignedFiles}
                loading={loadingFileLists}
                busyFileId={busyFileId}
                selectedFileId={selectedUnassignedFileId}
                onSelect={(file) => setSelectedUnassignedFileId(file.id)}
                onTrash={handleTrashFile}
                onCreateDocument={handleCreateDocumentFromFile}
                onAssignDocument={handleAssignFileToDocument}
              />
            ) : (
              <FiltersRow
                filters={filters}
                userOptions={filterUserOptions}
                onFilters={setFilters}
                onClear={() => setFilters(initialFilters)}
              />
            )}
            {selectedView === 'archivos-sin-asignar' && !searchActive ? null : selectedView === 'papelera' && !searchActive ? (
              <TrashedFilesPanel
                files={trashedFiles}
                documents={trashedDocs}
                loading={loadingFileLists}
                busy={busyFileId === '__trash-bulk__'}
                busyFileId={busyFileId}
                selecting={selectingTrashFiles}
                selectedIds={selectedTrashFileIds}
                onToggleSelecting={toggleTrashSelectionMode}
                onToggleSelected={toggleTrashFileSelection}
                onSelectAll={toggleAllTrashFilesSelection}
                onRestore={handleRestoreTrashedFile}
                onDelete={handleDeleteTrashedFile}
                onRestoreSelected={handleRestoreSelectedTrashedFiles}
                onDeleteSelected={handleDeleteSelectedTrashedFiles}
                onRestoreAll={handleRestoreAllTrashedFiles}
                onDeleteAll={handleDeleteAllTrashedFiles}
                onRestoreDocument={handleRestoreTrashedDocument}
                onDeleteDocument={handleDeleteTrashedDocument}
              />
            ) : viewMode === 'list' ? (
              <ListView
                docs={visibleDocs}
                selected={selected}
                onToggleSelect={toggleSelect}
                onSelectAll={selectAll}
                allSelected={allSelected}
                onOpenDoc={openDoc}
                onContextMenu={openContextMenu}
                tags={tags}
                emptyTitle={serverListActive ? (searchActive ? `Sin resultados para “${searchQuery}”` : 'Sin documentos para esos filtros') : undefined}
                emptySubtitle={
                  serverListActive
                    ? (searchLoading || searchResults === null ? 'Buscando documentos autorizados…' : searchError ?? 'Prueba con otro título o código interno.')
                    : undefined
                }
              />
            ) : (
              <GridView
                docs={visibleDocs}
                selected={selected}
                onToggleSelect={toggleSelect}
                onOpenDoc={openDoc}
                onContextMenu={openContextMenu}
                emptyTitle={serverListActive ? (searchActive ? `Sin resultados para “${searchQuery}”` : 'Sin documentos para esos filtros') : undefined}
                emptySubtitle={
                  serverListActive
                    ? (searchLoading || searchResults === null ? 'Buscando documentos autorizados…' : searchError ?? 'Prueba con otro título o código interno.')
                    : undefined
                }
              />
            )}
          </>
        )}

        <BulkBar
          count={selected.size}
          onClear={clearSelection}
          onAction={(action) => {
            if (action === 'tag') {
              openTagAssignment(Array.from(selected))
              clearSelection()
              return
            }
            handleAction(action)
            clearSelection()
          }}
        />
      </main>

      <DetailDrawer
        doc={openDocObj}
        onClose={() => setOpenDocId(null)}
        tags={tags}
        onEditMetadata={(doc) => openMetadataEditor(doc.id)}
        detail={openDocDetail}
        loading={Boolean(openDocId && detailLoadingDocId === openDocId)}
        error={openDocId && isOpenDocFromBackend ? detailError : null}
        currentUserId={user?.id}
        currentUserLabel={currentUserLabel}
        assigneeOptions={filterUserOptions}
        onAssignAssignee={handleAssignAssignee}
        onAddAssignment={handleAddAssignment}
        onRemoveAssignment={handleRemoveAssignment}
        onUpdateAssignmentRole={handleUpdateAssignmentRole}
        onVersionUploaded={handleVersionUploaded}
        expedients={expedients}
        onOpenExpedient={(expedientId) => {
          setSelectedExpedientId(expedientId)
          setSelectedView('expediente')
          setOpenDocId(null)
          setFullDocId(null)
        }}
        onApproveDoc={async (docId) => {
          await changeDocumentState(docId, 'aprobado')
          setCreatedDocs((prev) => prev.map((d) =>
            d.id === docId ? { ...d, status: statusFromWorkflow('aprobado') } : d,
          ))
          setDocumentDetails((current) => {
            if (!current[docId]) return current
            const next = { ...current }
            delete next[docId]
            return next
          })
          setToast('Documento aprobado')
        }}
        onRejectDoc={async (docId) => {
          const motivo = await requestStateComment('rechazado')
          await changeDocumentState(docId, 'rechazado', motivo)
          setCreatedDocs((prev) => prev.map((d) =>
            d.id === docId ? { ...d, status: statusFromWorkflow('rechazado') } : d,
          ))
          setDocumentDetails((current) => {
            if (!current[docId]) return current
            const next = { ...current }
            delete next[docId]
            return next
          })
          setToast('Documento rechazado')
        }}
        onCommentPosted={(item) => {
          if (!openDocId) return
          setDocumentDetails((current) => {
            const existing = current[openDocId]
            if (!existing) return current
            return {
              ...current,
              [openDocId]: {
                ...existing,
                comments: [item, ...existing.comments],
                history: [item, ...existing.history.filter((historyItem) => historyItem.id !== item.id)],
              },
            }
          })
        }}
        fullScreen={fullDocId !== null && fullDocId === openDocId}
        onToggleFull={() =>
          setFullDocId((current) => (current && current === openDocId ? null : openDocId))
        }
      />
      <FileDetailDrawer
        file={selectedView === 'archivos-sin-asignar' ? selectedUnassignedFile : null}
        busy={selectedUnassignedFile ? busyFileId === selectedUnassignedFile.id : false}
        uploaderLabel={currentUserLabel}
        onClose={() => setSelectedUnassignedFileId(null)}
        onTrash={handleTrashFile}
        onCreateDocument={handleCreateDocumentFromFile}
        onAssignDocument={handleAssignFileToDocument}
      />
      <ContextMenu ctx={ctxMenu} onClose={() => setCtxMenu(null)} onAction={handleAction} />
      <NotifPopover
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        items={notifications}
        onMarkRead={handleMarkNotificationRead}
        onMarkAllRead={handleMarkAllNotificationsRead}
        onOpenDoc={openDoc}
        onSeeAll={() => { setNotifOpen(false); setNotifsModalOpen(true) }}
        bellRef={bellRef}
      />
      <NotificationsModal
        open={notifsModalOpen}
        onClose={() => setNotifsModalOpen(false)}
        items={notifications}
        onMarkRead={handleMarkNotificationRead}
        onMarkAllRead={handleMarkAllNotificationsRead}
        onOpenDoc={openDoc}
      />
      <DropZoneOverlay active={dragging} />

      {stateCommentPrompt && (
        <StateChangeCommentModal
          stateLabel={stateCommentPrompt.stateLabel}
          onConfirm={stateCommentPrompt.resolve}
          onCancel={stateCommentPrompt.reject}
        />
      )}

      {tagAssignmentDocIds.length > 0 && (
        <DocumentTagAssignmentModal
          count={tagAssignmentDocIds.length}
          tags={tags}
          selectedTagIds={tagAssignmentSelected}
          saving={savingTagAssignment}
          bulkMode={tagAssignmentDocIds.length > 1}
          onToggleTag={toggleTagAssignment}
          onClose={closeTagAssignment}
          onSave={() => { void saveTagAssignment() }}
          onCreateTag={() => {
            setEditingTag(null)
            setTagForm({ label: '', color: '#6366f1' })
            setTagModalOpen(true)
          }}
        />
      )}

      {tagModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg-elev)', borderRadius: 12, padding: 24, width: 320, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>{editingTag ? 'Editar etiqueta' : 'Nueva etiqueta'}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontSize: 12, color: 'var(--fg-muted)' }}>Nombre</label>
              <input
                autoFocus
                value={tagForm.label}
                onChange={(e) => setTagForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="Ej: Urgente"
                style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--fg)', fontSize: 13 }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontSize: 12, color: 'var(--fg-muted)' }}>Color</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="color"
                  value={tagForm.color}
                  onChange={(e) => setTagForm((f) => ({ ...f, color: e.target.value }))}
                  style={{ width: 36, height: 36, borderRadius: 7, border: '1px solid var(--border)', padding: 2, cursor: 'pointer' }}
                />
                <span style={{ fontSize: 13, color: 'var(--fg-muted)' }}>{tagForm.color}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setTagModalOpen(false)} style={{ padding: '7px 16px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--fg)', fontSize: 13, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button
                disabled={!tagForm.label.trim()}
                onClick={async () => {
                  if (editingTag) {
                    const res = await updateTag(editingTag.id, tagForm.label.trim(), tagForm.color)
                    setTags((prev) => prev.map((t) => t.id === editingTag.id ? res.data : t))
                  } else {
                    const res = await createTag(tagForm.label.trim(), tagForm.color)
                    setTags((prev) => [...prev, res.data])
                    if (tagAssignmentDocIds.length > 0) {
                      setTagAssignmentSelected((current) => new Set(current).add(res.data.id))
                    }
                  }
                  setTagModalOpen(false)
                }}
                style={{ padding: '7px 16px', borderRadius: 7, background: 'var(--accent)', color: 'var(--accent-fg)', fontSize: 13, cursor: 'pointer', opacity: tagForm.label.trim() ? 1 : 0.5 }}
              >
                {editingTag ? 'Guardar' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}

      {expedientModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg-elev)', borderRadius: 12, padding: 24, width: 380, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>Nuevo expediente</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, color: 'var(--fg-muted)' }}>Nombre</label>
              <input
                autoFocus
                value={expedientForm.name}
                disabled={expedientFormBusy}
                onChange={(e) => setExpedientForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ej: Contratos 2026"
                style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--fg)', fontSize: 13 }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, color: 'var(--fg-muted)' }}>Código (opcional, único)</label>
              <input
                value={expedientForm.code}
                disabled={expedientFormBusy}
                onChange={(e) => setExpedientForm((f) => ({ ...f, code: e.target.value }))}
                placeholder="Ej: EXP-2026-001"
                style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--fg)', fontSize: 13, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, color: 'var(--fg-muted)' }}>Descripción (opcional)</label>
              <textarea
                value={expedientForm.description}
                disabled={expedientFormBusy}
                onChange={(e) => setExpedientForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
                placeholder="Resumen del agrupador"
                style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--fg)', fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>
            {expedientFormError && (
              <div style={{ color: 'var(--danger)', fontSize: 12 }}>{expedientFormError}</div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setExpedientModalOpen(false)}
                disabled={expedientFormBusy}
                style={{ padding: '7px 16px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--fg)', fontSize: 13, cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                disabled={!expedientForm.name.trim() || expedientFormBusy}
                onClick={async () => {
                  setExpedientFormBusy(true)
                  setExpedientFormError(null)
                  try {
                    const res = await createExpedient({
                      name: expedientForm.name.trim(),
                      code: expedientForm.code.trim() || null,
                      description: expedientForm.description.trim() || null,
                    })
                    setExpedients((prev) => [res.data, ...prev])
                    setExpedientModalOpen(false)
                    setSelectedExpedientId(res.data.id)
                    setSelectedView('expediente')
                    setToast(`Expediente "${res.data.name}" creado`)
                  } catch (err) {
                    setExpedientFormError(getApiErrorMessage(err, 'No se pudo crear el expediente'))
                  } finally {
                    setExpedientFormBusy(false)
                  }
                }}
                style={{ padding: '7px 16px', borderRadius: 7, background: 'var(--accent)', color: 'var(--accent-fg)', fontSize: 13, cursor: 'pointer', opacity: expedientForm.name.trim() && !expedientFormBusy ? 1 : 0.5 }}
              >
                {expedientFormBusy ? 'Creando...' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}

      {attachDocsModalOpen && expedientDetail && (() => {
        const expId = expedientDetail.id
        const filterText = attachDocsFilter.trim().toLowerCase()
        const eligible = allDocs.filter((doc) => doc.folder !== expId && doc.folder !== `__archived__`)
        const visible = filterText
          ? eligible.filter((doc) =>
              doc.name.toLowerCase().includes(filterText) ||
              (doc.code ?? '').toLowerCase().includes(filterText),
            )
          : eligible
        const toggle = (id: string) => {
          setAttachDocsSelected((current) => {
            const next = new Set(current)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
          })
        }
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: 'var(--bg-elev)', borderRadius: 12, padding: 22, width: 520, maxHeight: '80vh', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 15 }}>Agregar documentos a {expedientDetail.name}</h3>
                <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 4 }}>
                  Marca los documentos que quieras asociar. Solo se enlazarán aquellos sobre los que tengas permiso para editar metadata.
                </div>
              </div>
              <input
                value={attachDocsFilter}
                onChange={(e) => setAttachDocsFilter(e.target.value)}
                placeholder="Buscar por nombre o código"
                style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--fg)', fontSize: 13 }}
              />
              <div style={{ flex: 1, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                {visible.length === 0 ? (
                  <div style={{ padding: '24px 14px', fontSize: 12, color: 'var(--fg-muted)', textAlign: 'center' }}>
                    {eligible.length === 0
                      ? 'Todos tus documentos ya están en este expediente.'
                      : 'No hay coincidencias para tu búsqueda.'}
                  </div>
                ) : (
                  visible.map((doc, index) => {
                    const checked = attachDocsSelected.has(doc.id)
                    return (
                      <label
                        key={doc.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '10px 12px',
                          borderBottom: index < visible.length - 1 ? '1px solid var(--border)' : 'none',
                          background: checked ? 'var(--bg-active)' : 'transparent',
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(doc.id)}
                          style={{ width: 16, height: 16, accentColor: 'var(--accent)' }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {doc.name}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--fg-dim)', display: 'flex', gap: 8 }}>
                            <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{doc.code ?? doc.id}</span>
                            {doc.folder && doc.folder !== 'root' && (
                              <>
                                <span>·</span>
                                <span>
                                  {expedients.find((exp) => exp.id === doc.folder)?.name ?? doc.folder}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </label>
                    )
                  })
                )}
              </div>
              {attachDocsError && (
                <div style={{ color: 'var(--danger)', fontSize: 12 }}>{attachDocsError}</div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
                  {attachDocsSelected.size} seleccionado{attachDocsSelected.size === 1 ? '' : 's'}
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => setAttachDocsModalOpen(false)}
                    disabled={attachDocsBusy}
                    style={{ padding: '7px 16px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--fg)', fontSize: 13, cursor: 'pointer' }}
                  >
                    Cancelar
                  </button>
                  <button
                    disabled={attachDocsSelected.size === 0 || attachDocsBusy}
                    onClick={async () => {
                      setAttachDocsBusy(true)
                      setAttachDocsError(null)
                      try {
                        const ids = Array.from(attachDocsSelected)
                        const res = await attachDocumentsToExpedient(expId, ids)
                        // Refresca detalle + lista local de docs.
                        const detail = await getExpedient(expId)
                        setExpedientDetail(detail.data)
                        if (res.data.attached.length > 0) {
                          setCreatedDocs((current) =>
                            current.map((doc) =>
                              res.data.attached.includes(doc.id)
                                ? { ...doc, folder: expId, updatedAt: new Date().toISOString(), modified: 'ahora' }
                                : doc,
                            ),
                          )
                        }
                        setAttachDocsModalOpen(false)
                        const okCount = res.data.attached.length
                        const skipCount = res.data.skipped.length
                        if (skipCount === 0) {
                          setToast(`${okCount} documento${okCount === 1 ? '' : 's'} asociado${okCount === 1 ? '' : 's'} al expediente`)
                        } else {
                          setToast(`Asociados ${okCount}; ${skipCount} omitidos por permisos`)
                        }
                      } catch (err) {
                        setAttachDocsError(getApiErrorMessage(err, 'No se pudieron asociar los documentos'))
                      } finally {
                        setAttachDocsBusy(false)
                      }
                    }}
                    style={{
                      padding: '7px 16px',
                      borderRadius: 7,
                      background: 'var(--accent)',
                      color: 'var(--accent-fg)',
                      fontSize: 13,
                      cursor: 'pointer',
                      opacity: attachDocsSelected.size === 0 || attachDocsBusy ? 0.5 : 1,
                    }}
                  >
                    {attachDocsBusy ? 'Asociando...' : 'Agregar al expediente'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {teamModalOpen && (
        <TeamManagerModal
          onClose={() => setTeamModalOpen(false)}
          onCreated={(userName) => {
            setTeamModalOpen(false)
            setToast(`Usuario ${userName} creado`)
          }}
        />
      )}
      {createDocumentModalOpen && (
        <CreateDocumentModal
          initialUnassignedFile={createDocumentInitialFile}
          unassignedFiles={unassignedFiles}
          assigneeOptions={filterUserOptions}
          expedients={expedients}
          onClose={() => {
            setCreateDocumentModalOpen(false)
            setCreateDocumentInitialFile(null)
          }}
          onCreated={(document, attachment) => {
            const created = documentResponseToItem(document)
            const attachedFile = attachment?.attachedUnassignedFileId
              ? unassignedFiles.find((file) => file.id === attachment.attachedUnassignedFileId)
              : null
            const createdWithFile = attachedFile
              ? {
                  ...created,
                  kind: docKindFromMime(attachedFile.mime_type),
                  size: formatFileSize(attachedFile.size_bytes),
                  version: 1,
                }
              : attachment?.uploadedFile
                ? {
                    ...created,
                    kind: docKindFromMime(attachment.uploadedFile.type),
                    size: formatFileSize(attachment.uploadedFile.size),
                    version: 1,
                  }
                : created
            setCreatedDocs((current) => [createdWithFile, ...current.filter((item) => item.id !== created.id)])
            if (attachment?.attachedUnassignedFileId) markUnassignedFileAsUsed(attachment.attachedUnassignedFileId)
            if (attachment?.uploadedFile) void refreshStorageSummary()
            setOpenDocId(created.id)
            setToast(`Documento "${document.title}" creado`)
          }}
        />
      )}
      {editingMetadataDoc && (
        <EditMetadataModal
          document={editingMetadataDoc}
          unassignedFiles={unassignedFiles}
          assigneeOptions={filterUserOptions}
          expedients={expedients}
          onClose={() => setEditingMetadataDocId(null)}
          onUpdated={handleMetadataUpdated}
          onAssignAssignee={handleAssignAssignee}
        />
      )}
      {assignFileModalFile && (
        <AssignFileToDocumentModal
          file={assignFileModalFile}
          documents={createdDocs}
          onClose={() => setAssignFileModalFile(null)}
          onAssigned={(file, documentId) => {
            markUnassignedFileAsUsed(file.id)
            markDocumentHasFile(documentId, file)
            setToast(`${file.original_filename} asignado al documento`)
          }}
        />
      )}
      {uploadModalOpen && (
        <UploadFileModal
          initialFiles={uploadInitialFiles}
          onClose={() => {
            setUploadModalOpen(false)
            setUploadInitialFiles([])
          }}
          onUploaded={(message) => {
            setToast(message)
            void refreshFileLists()
            void refreshStorageSummary()
          }}
        />
      )}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
    </UsersDirectoryContext.Provider>
  )
}
