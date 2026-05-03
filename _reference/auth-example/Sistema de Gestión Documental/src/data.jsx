/* Mock data — empresa tech ficticia "Nimbera" */

const users = [
  { id: "u1", name: "Laura Ibáñez", initials: "LI", color: "oklch(0.7 0.14 30)" },
  { id: "u2", name: "Martín Solé", initials: "MS", color: "oklch(0.68 0.13 180)" },
  { id: "u3", name: "Pablo Quirós", initials: "PQ", color: "oklch(0.7 0.14 290)" },
  { id: "u4", name: "Eva Restrepo", initials: "ER", color: "oklch(0.7 0.14 130)" },
  { id: "u5", name: "Diego Manrique", initials: "DM", color: "oklch(0.72 0.12 55)" },
  { id: "u6", name: "Consultora externa — Bafora", initials: "BF", color: "oklch(0.7 0.13 340)" },
];

const folders = [
  { id: "root", name: "Archivo", icon: "Home", children: [
    { id: "legal", name: "Legal", count: 142, children: [
      { id: "contratos", name: "Contratos", count: 64, children: [
        { id: "vigentes", name: "Vigentes", count: 41 },
        { id: "vencidos", name: "Vencidos", count: 23 },
      ]},
      { id: "compliance", name: "Compliance", count: 28 },
      { id: "nda", name: "NDAs", count: 50 },
    ]},
    { id: "finanzas", name: "Finanzas", count: 317, children: [
      { id: "facturas", name: "Facturas 2026", count: 204 },
      { id: "impuestos", name: "Impuestos", count: 51 },
      { id: "auditoria", name: "Auditoría Q1", count: 62 },
    ]},
    { id: "rrhh", name: "RR.HH.", count: 89, children: [
      { id: "contratacion", name: "Contratación", count: 34 },
      { id: "politicas", name: "Políticas internas", count: 12 },
    ]},
    { id: "producto", name: "Producto", count: 208, children: [
      { id: "prds", name: "PRDs", count: 47 },
      { id: "research", name: "Research", count: 63 },
      { id: "roadmap", name: "Roadmap", count: 8 },
    ]},
    { id: "clientes", name: "Clientes (externo)", count: 74, shared: true },
  ]}
];

const tags = [
  { id: "confidencial", label: "Confidencial", color: "oklch(0.7 0.17 25)" },
  { id: "urgente", label: "Urgente", color: "oklch(0.78 0.14 75)" },
  { id: "aprobado", label: "Aprobado", color: "oklch(0.75 0.14 155)" },
  { id: "revision", label: "En revisión", color: "oklch(0.72 0.13 255)" },
  { id: "externo", label: "Compartido externo", color: "oklch(0.72 0.14 300)" },
];

const kinds = {
  pdf:   { label: "PDF",   tone: "oklch(0.7 0.17 25)" },
  doc:   { label: "DOC",   tone: "oklch(0.72 0.13 255)" },
  sheet: { label: "HOJA",  tone: "oklch(0.75 0.14 155)" },
  slide: { label: "SLIDE", tone: "oklch(0.78 0.14 55)" },
  image: { label: "IMG",   tone: "oklch(0.72 0.14 300)" },
  sig:   { label: "FIRMA", tone: "oklch(0.7 0.13 200)" },
};

const docs = [
  { id: "d01", name: "Contrato de servicios — Acme Logística v4.2", kind: "pdf",   folder: "contratos",   owner: "u1", size: "1.4 MB", modified: "hace 14 min", version: 12, tags: ["revision", "urgente"], shared: ["u2","u3","u6"], status: "pendiente-firma", pages: 24, starred: true },
  { id: "d02", name: "NDA Mútuo — Klarva Labs",                     kind: "pdf",   folder: "nda",          owner: "u3", size: "312 KB", modified: "hace 2 h",   version: 3,  tags: ["confidencial"],            shared: ["u1"],              status: "firmado",    pages: 6 },
  { id: "d03", name: "Política de tratamiento de datos 2026",       kind: "doc",   folder: "compliance",  owner: "u1", size: "640 KB", modified: "ayer",      version: 8,  tags: ["aprobado"],                shared: ["u2","u4","u5"],    status: "publicado",  pages: 18, starred: true },
  { id: "d04", name: "Análisis financiero Q1 — Borrador",            kind: "sheet", folder: "auditoria",   owner: "u5", size: "2.8 MB", modified: "hace 3 h",   version: 6,  tags: ["revision"],               shared: ["u1","u2"],         status: "borrador",   rows: 4821 },
  { id: "d05", name: "PRD — Motor de búsqueda semántica",            kind: "doc",   folder: "prds",        owner: "u3", size: "420 KB", modified: "hace 1 d",  version: 4,  tags: [],                          shared: ["u2","u4"],         status: "publicado",  pages: 11 },
  { id: "d06", name: "Presentación All-Hands abril",                 kind: "slide", folder: "roadmap",     owner: "u2", size: "14.2 MB",modified: "hace 2 d",  version: 2,  tags: ["revision"],               shared: ["u1","u3","u4","u5"],status: "borrador", pages: 38 },
  { id: "d07", name: "Nómina — marzo 2026 (cifrado)",                kind: "sheet", folder: "rrhh",        owner: "u4", size: "890 KB", modified: "hace 3 d",  version: 1,  tags: ["confidencial"],            shared: [],                  status: "archivado",  rows: 214, locked: true },
  { id: "d08", name: "Plan de investigación — Onboarding B2B",       kind: "doc",   folder: "research",    owner: "u3", size: "1.1 MB", modified: "hace 4 d",  version: 9,  tags: ["aprobado"],                shared: ["u1","u2"],         status: "publicado",  pages: 32 },
  { id: "d09", name: "Wireframes — Pantalla de cobro",               kind: "image", folder: "producto",    owner: "u2", size: "5.4 MB", modified: "hace 5 d",  version: 3,  tags: [],                          shared: ["u3","u4"],         status: "borrador" },
  { id: "d10", name: "Memorando fiscal — Operaciones México",        kind: "pdf",   folder: "impuestos",   owner: "u5", size: "720 KB", modified: "hace 6 d",  version: 2,  tags: ["confidencial","aprobado"],shared: ["u1"],              status: "publicado",  pages: 14 },
  { id: "d11", name: "Contrato laboral — Plantilla 2026",            kind: "doc",   folder: "contratacion",owner: "u4", size: "380 KB", modified: "hace 1 sem",version: 5,  tags: ["aprobado"],                shared: ["u1"],              status: "publicado",  pages: 9 },
  { id: "d12", name: "Factura FE-2026-01842 — Klarva Labs",          kind: "pdf",   folder: "facturas",    owner: "u5", size: "210 KB", modified: "hace 1 sem",version: 1,  tags: [],                          shared: [],                  status: "publicado",  pages: 2 },
  { id: "d13", name: "Contrato SaaS — Bafora Consulting",            kind: "pdf",   folder: "clientes",    owner: "u6", size: "980 KB", modified: "hace 9 d",  version: 7,  tags: ["externo","revision"],     shared: ["u1","u3","u6"],    status: "pendiente-firma", pages: 22, starred: true },
  { id: "d14", name: "Auditoría de accesos — Plataforma",            kind: "sheet", folder: "auditoria",   owner: "u2", size: "3.2 MB", modified: "hace 11 d", version: 2,  tags: ["confidencial"],            shared: ["u1"],              status: "borrador",   rows: 12090 },
];

const approvals = [
  { id: "a1", docId: "d01", title: "Firma — Contrato Acme Logística", requester: "u1", due: "hoy, 18:00", priority: "alta" },
  { id: "a2", docId: "d13", title: "Firma — SaaS Bafora",              requester: "u6", due: "mañana",    priority: "media" },
  { id: "a3", docId: "d04", title: "Revisión — Análisis Q1",           requester: "u5", due: "24 abr",    priority: "media" },
];

const activity = [
  { id:"ac1", who:"u2", what:"comentó en",   doc:"d01", at:"hace 8 min" },
  { id:"ac2", who:"u4", what:"subió v9 de",  doc:"d08", at:"hace 42 min"},
  { id:"ac3", who:"u6", what:"solicitó firma en", doc:"d13", at:"hace 2 h" },
  { id:"ac4", who:"u3", what:"compartió",    doc:"d05", at:"hace 3 h" },
  { id:"ac5", who:"u1", what:"aprobó",       doc:"d03", at:"ayer" },
];

const stats = {
  total: 1830,
  deltaWeek: +42,
  storage: { used: 68.4, total: 200 }, // GB
  pendientes: 7,
  compartidos: 312,
};

window.APP_DATA = { users, folders, tags, kinds, docs, approvals, activity, stats };
