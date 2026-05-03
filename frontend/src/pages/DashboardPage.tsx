import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import logo from '../assets/logo.png'
import { useAuth } from '../context/AuthContext'
import { assignRole, createUser, listRoles, listUsers, type RoleItem, type UserMe } from '../api/auth'
import {
  createDocument,
  listDocuments,
  listTrashedDocuments,
  moveDocumentToTrash,
  permanentlyDeleteDocument,
  restoreDocumentFromTrash,
  type DocumentItemResponse,
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

type ViewMode = 'list' | 'grid'
type DocKind = 'pdf' | 'doc' | 'sheet' | 'slide' | 'image' | 'sig'
type SelectedView =
  | 'inicio'
  | 'archivos-sin-asignar'
  | 'recientes'
  | 'compartidos'
  | 'favoritos'
  | 'aprobaciones'
  | 'papelera'
  | 'carpeta'

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
  name: string
  kind: DocKind
  folder: string
  owner: string
  size: string
  modified: string
  version: number
  tags: string[]
  shared: string[]
  status: 'borrador' | 'revision' | 'pendiente-firma' | 'publicado' | 'firmado' | 'archivado'
  pages?: number
  rows?: number
  starred?: boolean
  locked?: boolean
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
  kind: string | null
  owner: string | null
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
    { id: 'd02', name: 'NDA Mútuo — Klarva Labs', kind: 'pdf', folder: 'nda', owner: 'u3', size: '312 KB', modified: 'hace 2 h', version: 3, tags: ['confidencial'], shared: ['u1'], status: 'firmado', pages: 6 },
    { id: 'd03', name: 'Política de tratamiento de datos 2026', kind: 'doc', folder: 'compliance', owner: 'u1', size: '640 KB', modified: 'ayer', version: 8, tags: ['aprobado'], shared: ['u2', 'u4', 'u5'], status: 'publicado', pages: 18, starred: true },
    { id: 'd04', name: 'Análisis financiero Q1 — Borrador', kind: 'sheet', folder: 'auditoria', owner: 'u5', size: '2.8 MB', modified: 'hace 3 h', version: 6, tags: ['revision'], shared: ['u1', 'u2'], status: 'borrador', rows: 4821 },
    { id: 'd05', name: 'PRD — Motor de búsqueda semántica', kind: 'doc', folder: 'prds', owner: 'u3', size: '420 KB', modified: 'hace 1 d', version: 4, tags: [], shared: ['u2', 'u4'], status: 'publicado', pages: 11 },
    { id: 'd06', name: 'Presentación All-Hands abril', kind: 'slide', folder: 'roadmap', owner: 'u2', size: '14.2 MB', modified: 'hace 2 d', version: 2, tags: ['revision'], shared: ['u1', 'u3', 'u4', 'u5'], status: 'borrador', pages: 38 },
    { id: 'd07', name: 'Nómina — marzo 2026 (cifrado)', kind: 'sheet', folder: 'rrhh', owner: 'u4', size: '890 KB', modified: 'hace 3 d', version: 1, tags: ['confidencial'], shared: [], status: 'archivado', rows: 214, locked: true },
    { id: 'd08', name: 'Plan de investigación — Onboarding B2B', kind: 'doc', folder: 'research', owner: 'u3', size: '1.1 MB', modified: 'hace 4 d', version: 9, tags: ['aprobado'], shared: ['u1', 'u2'], status: 'publicado', pages: 32 },
    { id: 'd09', name: 'Wireframes — Pantalla de cobro', kind: 'image', folder: 'producto', owner: 'u2', size: '5.4 MB', modified: 'hace 5 d', version: 3, tags: [], shared: ['u3', 'u4'], status: 'borrador' },
    { id: 'd10', name: 'Memorando fiscal — Operaciones México', kind: 'pdf', folder: 'impuestos', owner: 'u5', size: '720 KB', modified: 'hace 6 d', version: 2, tags: ['confidencial', 'aprobado'], shared: ['u1'], status: 'publicado', pages: 14 },
    { id: 'd11', name: 'Contrato laboral — Plantilla 2026', kind: 'doc', folder: 'contratacion', owner: 'u4', size: '380 KB', modified: 'hace 1 sem', version: 5, tags: ['aprobado'], shared: ['u1'], status: 'publicado', pages: 9 },
    { id: 'd12', name: 'Factura FE-2026-01842 — Klarva Labs', kind: 'pdf', folder: 'facturas', owner: 'u5', size: '210 KB', modified: 'hace 1 sem', version: 1, tags: [], shared: [], status: 'publicado', pages: 2 },
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
  kind: null,
  owner: null,
  status: null,
  date: null,
}

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
  if (stateCode === 'pendiente_firma') return 'pendiente-firma'
  if (stateCode === 'aprobado') return 'publicado'
  if (stateCode === 'firmado') return 'firmado'
  if (stateCode === 'archivado') return 'archivado'
  return 'borrador'
}

function documentResponseToItem(document: DocumentItemResponse): DocumentItem {
  return {
    id: document.id,
    name: document.title,
    kind: docKindFromType(document.document_type_id),
    folder: document.expedient_id || 'root',
    owner: document.owner_user_id,
    size: 'Sin archivo',
    modified: formatDocumentDate(document.archived_at ?? document.created_at),
    version: 0,
    tags: [],
    shared: [],
    status: statusFromWorkflow(document.workflow_state_code),
  }
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

function findDocById(docId: string) {
  return dashboardData.docs.find((doc) => doc.id === docId) ?? null
}

function findKind(kindId: DocKind) {
  return dashboardData.kinds[kindId]
}

function findTag(tagId: string) {
  return dashboardData.tags.find((tag) => tag.id === tagId) ?? null
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
  Panel: (props: Partial<Parameters<typeof Ic>[0]>) => <Ic {...props} d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5zM10 3v18" />,
  Close: (props: Partial<Parameters<typeof Ic>[0]>) => <Ic {...props} d="M18 6L6 18M6 6l12 12" />,
  Eye: (props: Partial<Parameters<typeof Ic>[0]>) => <Ic {...props} d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />,
  Lock: (props: Partial<Parameters<typeof Ic>[0]>) => <Ic {...props} d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" />,
  Branch: (props: Partial<Parameters<typeof Ic>[0]>) => <Ic {...props} d="M6 3v12M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a9 9 0 0 0 9-9" />,
  Home: (props: Partial<Parameters<typeof Ic>[0]>) => <Ic {...props} d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2V9z" />,
  Arrow: (props: Partial<Parameters<typeof Ic>[0]>) => <Ic {...props} d="M5 12h14M13 5l7 7-7 7" />,
} as const

function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 14px 6px',
        color: 'var(--fg-dim)',
        fontSize: 10.5,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        fontWeight: 600,
      }}
    >
      <span>{children}</span>
      {action}
    </div>
  )
}

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

function OwnerAvatar({ userId, size = 20 }: { userId: string; size?: number }) {
  const user = findUserById(userId)
  if (!user) return null
  return (
    <span
      title={user.name}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        background: user.color,
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
      {user.initials}
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

function TagChip({ id }: { id: string }) {
  const tag = findTag(id)
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
    borrador: { label: 'Borrador', color: 'var(--fg-dim)' },
    revision: { label: 'En revisión', color: 'oklch(0.72 0.13 255)' },
    'pendiente-firma': { label: 'Pendiente firma', color: 'oklch(0.78 0.14 75)' },
    publicado: { label: 'Publicado', color: 'oklch(0.75 0.14 155)' },
    firmado: { label: 'Firmado', color: 'oklch(0.75 0.14 155)' },
    archivado: { label: 'Archivado', color: 'var(--fg-dim)' },
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

function SearchField({
  value,
  onChange,
  onSelectResult,
}: {
  value: string
  onChange: (value: string) => void
  onSelectResult: (docId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  const query = value.trim().toLowerCase()
  const hits = query.length > 0 ? dashboardData.docs.filter((doc) => doc.name.toLowerCase().includes(query)).slice(0, 6) : []
  const folderHits =
    query.length > 0
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
    <div ref={ref} style={{ position: 'relative', flex: 1, maxWidth: 560 }}>
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
            zIndex: 50,
            maxHeight: 400,
            overflow: 'auto',
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
                { q: 'contratos vencidos', icon: <Icon.File size={13} /> },
                { q: 'tag:confidencial', icon: <Icon.Tag size={13} /> },
                { q: 'owner:Laura tipo:pdf', icon: <Icon.Users size={13} /> },
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
                Carpetas
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
                Documentos
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
                  <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {highlight(doc.name, query)}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{doc.modified}</span>
                </button>
              ))}
            </>
          )}

          {query.length > 0 && hits.length === 0 && folderHits.length === 0 && (
            <div style={{ padding: '18px 14px', fontSize: 13, color: 'var(--fg-dim)', textAlign: 'center' }}>
              Sin resultados para “{query}”
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
  onOpenNotifs,
  onAction,
  onLogout,
}: {
  userLabel: string
  userEmail: string
  userInitials: string
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
            background: 'oklch(0.7 0.14 30)',
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
                background: 'oklch(0.7 0.14 30)',
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
  viewMode,
  onViewMode,
  onAction,
  onSelectResult,
  onOpenNotifs,
  notifCount,
  userLabel,
  userInitials,
  userEmail,
  onLogout,
}: {
  breadcrumb: { id: string; label: string }[]
  onCrumbClick: (crumb: { id: string; label: string }) => void
  search: string
  onSearch: (value: string) => void
  viewMode: ViewMode
  onViewMode: (mode: ViewMode) => void
  onAction: (action: string) => void
  onSelectResult: (docId: string) => void
  onOpenNotifs: () => void
  notifCount: number
  userLabel: string
  userInitials: string
  userEmail: string
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
        <SearchField value={search} onChange={onSearch} onSelectResult={onSelectResult} />
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

function FolderNode({
  node,
  depth,
  selectedFolder,
  onSelect,
  expanded,
  onToggle,
}: {
  node: FolderItem
  depth: number
  selectedFolder: string
  onSelect: (id: string) => void
  expanded: Set<string>
  onToggle: (id: string) => void
}) {
  const open = expanded.has(node.id)
  const hasKids = Boolean(node.children?.length)
  const active = selectedFolder === node.id

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, margin: '0 6px' }}>
        {hasKids ? (
          <button
            onClick={() => onToggle(node.id)}
            style={{
              width: 18,
              height: 22,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginLeft: depth * 14,
              color: 'var(--fg-dim)',
              borderRadius: 4,
            }}
          >
            <Icon.Chev
              size={11}
              stroke={2}
              style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.12s' }}
            />
          </button>
        ) : (
          <span style={{ width: 18, marginLeft: depth * 14 }} />
        )}
        <button
          onClick={() => onSelect(node.id)}
          data-active={active || undefined}
          className="edms-nav-item"
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 10px',
            borderRadius: 6,
            color: active ? 'var(--fg)' : 'var(--fg-muted)',
            background: active ? 'var(--bg-active)' : 'transparent',
            fontSize: 13,
            textAlign: 'left',
            fontWeight: active ? 500 : 400,
          }}
        >
          {open && hasKids ? (
            <Icon.FolderOpen size={14} />
          ) : node.icon === 'Home' ? (
            <Icon.Home size={14} />
          ) : (
            <Icon.Folder size={14} />
          )}
          <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.name}</span>
          {node.shared && <Icon.Users size={11} style={{ color: 'var(--fg-dim)' }} />}
          {node.count != null && (
            <span style={{ fontSize: 11, color: 'var(--fg-dim)', fontVariantNumeric: 'tabular-nums' }}>{node.count}</span>
          )}
        </button>
      </div>
      {open &&
        hasKids &&
        node.children?.map((child) => (
          <FolderNode
            key={child.id}
            node={child}
            depth={depth + 1}
            selectedFolder={selectedFolder}
            onSelect={onSelect}
            expanded={expanded}
            onToggle={onToggle}
          />
        ))}
    </div>
  )
}

function Sidebar({
  collapsed,
  selectedView,
  onSelectView,
  selectedFolder,
  onSelectFolder,
  selectedTag,
  onSelectTag,
  unassignedCount,
  onToggleCollapsed,
  storage,
}: {
  collapsed: boolean
  selectedView: SelectedView
  onSelectView: (view: SelectedView) => void
  selectedFolder: string
  onSelectFolder: (folderId: string) => void
  selectedTag: string | null
  onSelectTag: (tagId: string | null) => void
  unassignedCount: number
  onToggleCollapsed: () => void
  storage: { used: number; total: number }
}) {
  const [expanded, setExpanded] = useState(new Set(['root', 'legal', 'finanzas', 'producto']))

  function toggleFolder(id: string) {
    const next = new Set(expanded)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setExpanded(next)
  }

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
          <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>Workspace · 42 personas</div>
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
        </div>

        <SectionLabel
          action={
            <button
              title="Nueva carpeta"
              style={{
                color: 'var(--fg-dim)',
                width: 18,
                height: 18,
                borderRadius: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon.Plus size={12} />
            </button>
          }
        >
          Carpetas
        </SectionLabel>

        {dashboardData.folders.map((folder) => (
          <FolderNode
            key={folder.id}
            node={folder}
            depth={0}
            selectedFolder={selectedFolder}
            onSelect={(id) => {
              onSelectFolder(id)
              onSelectView('carpeta')
            }}
            expanded={expanded}
            onToggle={toggleFolder}
          />
        ))}

        <SectionLabel>Etiquetas</SectionLabel>
        <div style={{ padding: '0 6px' }}>
          {dashboardData.tags.map((tag) => (
            <button
              key={tag.id}
              onClick={() => onSelectTag(selectedTag === tag.id ? null : tag.id)}
              className="edms-nav-item"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                width: '100%',
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
          ))}
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
  onFilters,
  onClear,
}: {
  filters: FiltersState
  onFilters: (filters: FiltersState) => void
  onClear: () => void
}) {
  const [openKey, setOpenKey] = useState<string | null>(null)

  const pills: FilterPill[] = [
    { key: 'kind', label: 'Tipo', options: [['pdf', 'PDF'], ['doc', 'Documento'], ['sheet', 'Hoja'], ['slide', 'Slide'], ['image', 'Imagen']] },
    { key: 'owner', label: 'Autor', options: dashboardData.users.map((user) => [user.id, user.name]) },
    { key: 'status', label: 'Estado', options: [['borrador', 'Borrador'], ['revision', 'En revisión'], ['pendiente-firma', 'Pendiente firma'], ['publicado', 'Publicado'], ['firmado', 'Firmado'], ['archivado', 'Archivado']] },
    { key: 'date', label: 'Fecha', options: [['hoy', 'Hoy'], ['semana', 'Últimos 7 días'], ['mes', 'Último mes'], ['ano', 'Este año']] },
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
                  zIndex: 20,
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
}: {
  docs: DocumentItem[]
  selected: Set<string>
  onToggleSelect: (id: string) => void
  onSelectAll: () => void
  allSelected: boolean
  onOpenDoc: (docId: string) => void
  onContextMenu: (event: React.MouseEvent, docId: string) => void
}) {
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '0 8px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 2 }}>
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
                    <span
                      style={{
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
                  </div>
                </td>
                <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {doc.tags.map((tag) => (
                      <TagChip key={tag} id={tag} />
                    ))}
                  </div>
                </td>
                <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', color: 'var(--fg-muted)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <OwnerAvatar userId={doc.owner} size={18} />
                    <span>{findUserById(doc.owner)?.name.split(' ')[0]}</span>
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
          <div style={{ fontSize: 14, marginBottom: 4 }}>Sin documentos</div>
          <div style={{ fontSize: 12 }}>Ajusta los filtros o arrastra archivos aquí para subirlos.</div>
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
}: {
  docs: DocumentItem[]
  selected: Set<string>
  onToggleSelect: (id: string) => void
  onOpenDoc: (docId: string) => void
  onContextMenu: (event: React.MouseEvent, docId: string) => void
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
    </div>
  )
}

function OverviewCards({ storage }: { storage: { used: number; total: number } }) {
  const cards = [
    { label: 'Documentos totales', value: dashboardData.stats.total.toLocaleString('es-ES'), delta: `+${dashboardData.stats.deltaWeek} esta semana`, deltaTone: 'var(--ok)' },
    { label: 'Pendientes de firma', value: dashboardData.stats.pendientes, delta: '3 vencen hoy', deltaTone: 'var(--warn)' },
    { label: 'Compartidos externos', value: dashboardData.stats.compartidos, delta: '12 con acceso expirado', deltaTone: 'var(--fg-dim)' },
    { label: 'Almacenamiento', value: `${storage.used} GB`, delta: `${storage.total > 0 ? Math.round((storage.used / storage.total) * 100) : 0}% usado`, deltaTone: 'var(--fg-dim)' },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, padding: '16px 18px 4px' }}>
      {cards.map((card) => (
        <div key={card.label} style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 11.5, color: 'var(--fg-dim)', letterSpacing: '0.02em', marginBottom: 6 }}>{card.label}</div>
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

function ActivityPanel() {
  return (
    <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon.Clock size={14} style={{ color: 'var(--fg-muted)' }} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>Actividad reciente</span>
        </div>
      </div>
      <div style={{ padding: '6px 0' }}>
        {dashboardData.activity.map((item) => {
          const doc = findDocById(item.doc)
          const user = findUserById(item.who)
          return (
            <div key={item.id} style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
              <OwnerAvatar userId={item.who} size={22} />
              <div style={{ flex: 1, minWidth: 0, color: 'var(--fg-muted)' }}>
                <b style={{ color: 'var(--fg)', fontWeight: 500 }}>{user?.name.split(' ')[0]}</b> {item.what}{' '}
                <span
                  style={{
                    color: 'var(--fg)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: 'inline-block',
                    maxWidth: 240,
                    verticalAlign: 'bottom',
                  }}
                >
                  {doc?.name}
                </span>
              </div>
              <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{item.at}</span>
            </div>
          )
        })}
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
}: {
  doc: DocumentItem | null
  onClose: () => void
}) {
  useEffect(() => {
    if (!doc) return
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [doc, onClose])

  if (!doc) return null

  const owner = findUserById(doc.owner)
  const kind = findKind(doc.kind)
  const versionLabel = doc.version > 0 ? `v${doc.version}` : 'Sin archivo'

  return (
    <aside
      style={{
        width: 360,
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
        <KindBadge kind={doc.kind} />
        <span style={{ flex: 1, fontSize: 12, color: 'var(--fg-muted)' }}>Detalles</span>
        <button className="edms-nav-item" title="Abrir completo" style={{ width: 26, height: 26, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-muted)' }}>
          <Icon.Eye size={14} />
        </button>
        <button onClick={onClose} className="edms-nav-item" style={{ width: 26, height: 26, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-muted)' }}>
          <Icon.Close size={14} />
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ padding: '14px 14px 0' }}>
          <div
            style={{
              aspectRatio: '8.5 / 11',
              borderRadius: 8,
              overflow: 'hidden',
              background: `linear-gradient(135deg, color-mix(in oklch, ${kind.tone} 16%, var(--bg-elev-2)), var(--bg-elev-2))`,
              border: '1px solid var(--border)',
              position: 'relative',
              padding: 18,
            }}
          >
            <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, opacity: 0.4 }}>
              <defs>
                <pattern id={`stripes-dr-${doc.id}`} patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
                  <line x1="0" y1="0" x2="0" y2="8" stroke={kind.tone} strokeWidth="1" opacity="0.3" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill={`url(#stripes-dr-${doc.id})`} />
            </svg>
            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 6 }}>
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
              Vista previa · {doc.pages ? `pág. 1 de ${doc.pages}` : doc.rows ? `${doc.rows.toLocaleString('es-ES')} filas` : '—'}
            </div>
          </div>
        </div>

        <div style={{ padding: '14px' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg)', marginBottom: 6, lineHeight: 1.3 }}>{doc.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <StatusPill status={doc.status} />
            <span style={{ color: 'var(--fg-dim)', fontSize: 11 }}>·</span>
            <span style={{ color: 'var(--fg-muted)', fontSize: 12, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{versionLabel}</span>
            <span style={{ color: 'var(--fg-dim)', fontSize: 11 }}>·</span>
            <span style={{ color: 'var(--fg-muted)', fontSize: 12 }}>{doc.modified}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 14 }}>
            <button style={btnStylePrimary}>
              <Icon.Eye size={13} /> Abrir
            </button>
            <button style={btnStyleGhost}>
              <Icon.Share size={13} /> Compartir
            </button>
            <button style={btnStyleGhost}>
              <Icon.Download size={13} /> Descargar
            </button>
            <button style={btnStyleGhost}>
              <Icon.Signature size={13} /> Firmar
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {[
              ['Autor', <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><OwnerAvatar userId={doc.owner} size={18} /><span>{owner?.name ?? 'Usuario autenticado'}</span></div>],
              ['Carpeta', <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon.Folder size={12} style={{ color: 'var(--fg-dim)' }} />{doc.folder}</span>],
              ['Tamaño', doc.size],
              ['Tipo', kind.label],
              [doc.pages ? 'Páginas' : 'Filas', doc.pages ?? doc.rows?.toLocaleString('es-ES') ?? '—'],
              ['Compartido', doc.shared.length > 0 ? <AvatarStack ids={doc.shared} max={5} /> : <span style={{ color: 'var(--fg-dim)' }}>Solo tú</span>],
              ['Etiquetas', doc.tags.length > 0 ? <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{doc.tags.map((tag) => <TagChip key={tag} id={tag} />)}</div> : <span style={{ color: 'var(--fg-dim)' }}>—</span>],
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

        <div style={{ padding: '0 14px 14px' }}>
          <div style={{ fontSize: 11, color: 'var(--fg-dim)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon.Branch size={11} /> Historial de versiones
          </div>
          {doc.version === 0 && (
            <div style={{ color: 'var(--fg-muted)', fontSize: 12, padding: '7px 0' }}>
              Aun no hay archivo principal ni versiones registradas.
            </div>
          )}
          {Array.from({ length: Math.min(doc.version, 4) }).map((_, index) => {
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
                {index > 0 && <button style={{ fontSize: 11, color: 'var(--accent)' }}>Restaurar</button>}
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
    { id: 'rename', icon: <Icon.File size={13} />, label: 'Renombrar', shortcut: 'F2' },
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

function NotifPopover({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null

  const items = [
    { icon: <Icon.Signature size={13} style={{ color: 'var(--warn)' }} />, title: 'Firma pendiente — Contrato Acme', desc: 'Vence hoy a las 18:00', at: '8 min' },
    { icon: <Icon.Users size={13} style={{ color: 'var(--accent)' }} />, title: 'Bafora Consulting te compartió un documento', desc: 'Contrato SaaS — Bafora Consulting', at: '2 h' },
    { icon: <Icon.Check size={13} style={{ color: 'var(--ok)' }} />, title: 'Política de datos aprobada', desc: 'Laura I. aprobó la versión final', at: 'ayer' },
    { icon: <Icon.Branch size={13} style={{ color: 'var(--fg-muted)' }} />, title: 'Nueva versión en PRD búsqueda', desc: 'Pablo Q. subió v4', at: 'ayer' },
  ]

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
      <div
        style={{
          position: 'absolute',
          top: 56,
          right: 108,
          width: 340,
          background: 'var(--bg-elev)',
          border: '1px solid var(--border-strong)',
          borderRadius: 10,
          boxShadow: 'var(--shadow)',
          zIndex: 50,
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Notificaciones</span>
          <button style={{ fontSize: 11, color: 'var(--fg-muted)' }}>Marcar todo leído</button>
        </div>
        {items.map((item) => (
          <div
            key={item.title}
            className="edms-nav-item"
            style={{
              padding: '10px 14px',
              borderBottom: item !== items[items.length - 1] ? '1px solid var(--border)' : 'none',
              display: 'flex',
              gap: 10,
              cursor: 'pointer',
            }}
          >
            <div style={{ width: 24, height: 24, borderRadius: 12, background: 'var(--bg-elev-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {item.icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, color: 'var(--fg)', fontWeight: 500, marginBottom: 2 }}>{item.title}</div>
              <div style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>{item.desc}</div>
            </div>
            <span style={{ fontSize: 10.5, color: 'var(--fg-dim)', flexShrink: 0 }}>{item.at}</span>
          </div>
        ))}
      </div>
    </>
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
          zIndex: 120,
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
          zIndex: 121,
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
  onClose,
  onCreated,
}: {
  initialUnassignedFile?: StoredFileItem | null
  unassignedFiles: StoredFileItem[]
  onClose: () => void
  onCreated: (document: DocumentItemResponse, attachment?: { attachedUnassignedFileId?: string; uploadedFile?: File }) => void
}) {
  const [title, setTitle] = useState(() => initialUnassignedFile ? titleFromFilename(initialUnassignedFile.original_filename) : '')
  const [documentTypeId, setDocumentTypeId] = useState('contrato')
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
      })
      const attachment: { attachedUnassignedFileId?: string; uploadedFile?: File } = {}
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
          zIndex: 120,
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
          zIndex: 121,
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
                <span style={{ color: 'var(--fg-muted)', fontSize: 12 }}>Expediente opcional</span>
                <input
                  value={expedientId}
                  disabled={submitting}
                  onChange={(event) => setExpedientId(event.target.value)}
                  placeholder="Ej: legal"
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
              Al crear, el sistema registra tu usuario como creador y deja el documento en estado Borrador con encargado inicial igual al creador.
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
          zIndex: 120,
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
          zIndex: 121,
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
          zIndex: 120,
          background: 'rgba(3, 6, 12, 0.62)',
          backdropFilter: 'blur(6px)',
        }}
      />
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 130,
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
                              background: item.is_superuser ? 'oklch(0.7 0.14 30)' : 'var(--bg-active)',
                              color: item.is_superuser ? '#fff' : 'var(--fg)',
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

export default function DashboardPage() {
  const { user, logout } = useAuth()
  const [tweaks, setTweaks] = useState(initialTweaks)
  const [selectedView, setSelectedView] = useState<SelectedView>('inicio')
  const [selectedFolder, setSelectedFolder] = useState('root')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [filters, setFilters] = useState<FiltersState>(initialFilters)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [openDocId, setOpenDocId] = useState<string | null>(null)
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null)
  const [notifOpen, setNotifOpen] = useState(false)
  const [teamModalOpen, setTeamModalOpen] = useState(false)
  const [createDocumentModalOpen, setCreateDocumentModalOpen] = useState(false)
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
  const [loadingFileLists, setLoadingFileLists] = useState(true)
  const [busyFileId, setBusyFileId] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [storage, setStorage] = useState({ used: 0, total: 0 })
  const dragCounter = useRef(0)

  const currentUserLabel = user
    ? userLabelFromAuth(user.first_name, user.last_name, user.email)
    : 'Laura Ibáñez'
  const currentUserInitials = user ? initialsFromLabel(currentUserLabel) : 'LI'
  const currentUserEmail = user?.email ?? 'laura@nimbera.com'
  const firstName = currentUserLabel.split(' ')[0]
  const allDocs = useMemo(() => [...createdDocs, ...dashboardData.docs], [createdDocs])
  const selectedUnassignedFile = useMemo(
    () => unassignedFiles.find((file) => file.id === selectedUnassignedFileId) ?? null,
    [selectedUnassignedFileId, unassignedFiles],
  )

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
      .then(([activeResponse, trashResponse]) => {
        if (!mounted) return
        setCreatedDocs(activeResponse.data.map(documentResponseToItem))
        setTrashedDocs(trashResponse.data.map(documentResponseToItem))
      })
      .catch(() => {})

    fetchStorageSummaryGb()
      .then((summary) => {
        if (!mounted) return
        setStorage(summary)
      })
      .catch(() => {})

    return () => {
      mounted = false
    }
  }, [])

  const visibleDocs = useMemo(() => {
    let list = allDocs

    if (selectedView === 'favoritos') list = list.filter((doc) => doc.starred)
    else if (selectedView === 'compartidos') list = list.filter((doc) => doc.shared.length > 0 && doc.owner !== 'u1')
    else if (selectedView === 'aprobaciones') list = list.filter((doc) => doc.status === 'pendiente-firma' || doc.status === 'revision')
    else if (selectedView === 'archivos-sin-asignar') list = []
    else if (selectedView === 'papelera') list = []
    else if (selectedView === 'recientes') list = [...list].sort((a, b) => a.modified.localeCompare(b.modified))
    else if (selectedView === 'carpeta' && selectedFolder !== 'root') list = list.filter((doc) => doc.folder === selectedFolder)

    if (selectedTag) list = list.filter((doc) => doc.tags.includes(selectedTag))
    if (filters.kind) list = list.filter((doc) => doc.kind === filters.kind)
    if (filters.owner) list = list.filter((doc) => doc.owner === filters.owner)
    if (filters.status) list = list.filter((doc) => doc.status === filters.status)
    if (search.trim()) {
      const query = search.trim().toLowerCase()
      list = list.filter((doc) => doc.name.toLowerCase().includes(query))
    }

    return list
  }, [allDocs, selectedView, selectedFolder, selectedTag, filters, search])

  const breadcrumb = useMemo(() => {
    if (selectedView === 'inicio') return [{ id: 'inicio', label: 'Inicio' }]
    if (selectedView === 'archivos-sin-asignar') return [{ id: 'archivos-sin-asignar', label: 'Archivos sin asignar' }]
    if (selectedView === 'recientes') return [{ id: 'recientes', label: 'Recientes' }]
    if (selectedView === 'compartidos') return [{ id: 'compartidos', label: 'Compartidos conmigo' }]
    if (selectedView === 'favoritos') return [{ id: 'favoritos', label: 'Favoritos' }]
    if (selectedView === 'aprobaciones') return [{ id: 'aprobaciones', label: 'Aprobaciones' }]
    if (selectedView === 'papelera') return [{ id: 'papelera', label: 'Papelera' }]
    const path = getFolderPath(dashboardData.folders, selectedFolder)
    return path ? path.map((node) => ({ id: node.id, label: node.name })) : [{ id: 'root', label: 'Archivo' }]
  }, [selectedView, selectedFolder])

  const openDocObj = openDocId ? allDocs.find((doc) => doc.id === openDocId) ?? null : null
  const allSelected = visibleDocs.length > 0 && visibleDocs.every((doc) => selected.has(doc.id))
  const showDashboard =
    selectedView === 'inicio' &&
    search.trim() === '' &&
    !filters.kind &&
    !filters.owner &&
    !filters.status &&
    !filters.date &&
    !selectedTag

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

  function clearTrashSelection() {
    setSelectedTrashFileIds(new Set())
    setSelectingTrashFiles(false)
  }

  function openDoc(id: string) {
    setOpenDocId(id)
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

    const messages: Record<string, string> = {
      download: 'Descarga iniciada',
      share: 'Enlace copiado al portapapeles',
      sign: 'Solicitud de firma enviada',
      trash: 'Movido a papelera',
      move: 'Selecciona destino…',
      tag: 'Etiquetas actualizadas',
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
    }

    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [selected])

  return (
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
        selectedFolder={selectedFolder}
        onSelectFolder={setSelectedFolder}
        selectedTag={selectedTag}
        onSelectTag={setSelectedTag}
        unassignedCount={unassignedFiles.length}
        onToggleCollapsed={() => setTweaks((current) => ({ ...current, sidebarCollapsed: !current.sidebarCollapsed }))}
        storage={storage}
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
          onSearch={setSearch}
          viewMode={viewMode}
          onViewMode={setViewMode}
          onAction={handleAction}
          onSelectResult={openDoc}
          onOpenNotifs={() => setNotifOpen(true)}
          notifCount={4}
          userLabel={currentUserLabel}
          userInitials={currentUserInitials}
          userEmail={currentUserEmail}
          onLogout={logout}
        />

        <div style={{ padding: '18px 18px 8px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 2px', letterSpacing: '-0.01em' }}>
              {showDashboard ? `Buenos días, ${firstName}` : breadcrumb[breadcrumb.length - 1]?.label}
            </h1>
            <div style={{ fontSize: 12.5, color: 'var(--fg-muted)' }}>
              {showDashboard
                ? 'Tienes 3 documentos que requieren tu firma hoy.'
                : selectedView === 'archivos-sin-asignar'
                  ? `${unassignedFiles.length} archivo${unassignedFiles.length === 1 ? '' : 's'} pendiente${unassignedFiles.length === 1 ? '' : 's'} por convertir en documento`
                  : selectedView === 'papelera'
                    ? `${trashedFiles.length + trashedDocs.length} elemento${trashedFiles.length + trashedDocs.length === 1 ? '' : 's'} en papelera`
                  : `${visibleDocs.length} documentos${selectedTag ? ` · etiqueta "${findTag(selectedTag)?.label}"` : ''}`}
            </div>
          </div>

          {!showDashboard && selectedView !== 'archivos-sin-asignar' && (
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

        {showDashboard ? (
          <div style={{ flex: 1, overflow: 'auto' }}>
            <OverviewCards storage={storage} />
            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 12, padding: '14px 18px' }}>
              <ApprovalsPanel onOpenDoc={openDoc} />
              <ActivityPanel />
            </div>

            <div style={{ padding: '4px 18px 24px' }}>
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

          </div>
        ) : (
          <>
            {selectedView === 'archivos-sin-asignar' ? (
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
              <FiltersRow filters={filters} onFilters={setFilters} onClear={() => setFilters(initialFilters)} />
            )}
            {selectedView === 'archivos-sin-asignar' ? null : selectedView === 'papelera' ? (
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
              />
            ) : (
              <GridView
                docs={visibleDocs}
                selected={selected}
                onToggleSelect={toggleSelect}
                onOpenDoc={openDoc}
                onContextMenu={openContextMenu}
              />
            )}
          </>
        )}

        <BulkBar
          count={selected.size}
          onClear={clearSelection}
          onAction={(action) => {
            handleAction(action)
            clearSelection()
          }}
        />
      </main>

      <DetailDrawer doc={openDocObj} onClose={() => setOpenDocId(null)} />
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
      <NotifPopover open={notifOpen} onClose={() => setNotifOpen(false)} />
      <DropZoneOverlay active={dragging} />
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
  )
}
