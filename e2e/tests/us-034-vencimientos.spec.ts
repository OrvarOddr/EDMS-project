import { test, expect, type APIRequestContext } from '@playwright/test'

/**
 * US-034 (DoD): "el flujo funciona entre frontend, gateway y servicios
 * consultados". Via nginx: crear documento, definir vencimiento próximo y
 * verificar que aparece en el listado filtrado por proximidad. Sin mocks.
 */

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@edms.dev'
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'e2e-admin-pass-123456'

async function login(request: APIRequestContext): Promise<string> {
  const res = await request.post('/api/auth/login', {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  })
  expect(res.status(), await res.text()).toBe(200)
  return (await res.json()).access_token as string
}

function isoInDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

test('US-034: documento con vencimiento próximo aparece en el listado filtrado', async ({ request }) => {
  const token = await login(request)
  const auth = { Authorization: `Bearer ${token}` }

  const created = await request.post('/api/documents', {
    headers: auth,
    data: { title: 'E2E US-034 vence pronto', document_type_id: 'tipo-e2e', description: 'x' },
  })
  expect(created.status(), await created.text()).toBe(201)
  const doc = await created.json()

  const patched = await request.patch(`/api/documents/${doc.id}/metadata`, {
    headers: auth,
    data: {
      title: 'E2E US-034 vence pronto',
      document_type_id: 'tipo-e2e',
      description: 'x',
      confidentiality_level: 'publico_interno',
      due_date: isoInDays(5),
    },
  })
  expect(patched.status(), await patched.text()).toBe(200)

  const soon = await request.get('/api/documents?due_within_days=14', { headers: auth })
  expect(soon.status()).toBe(200)
  const ids = (await soon.json()).map((d: { id: string }) => d.id)
  expect(ids).toContain(doc.id)
})

test('US-034: due_within_days inválido devuelve 422', async ({ request }) => {
  const token = await login(request)
  const res = await request.get('/api/documents?due_within_days=0', {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(res.status()).toBe(422)
})
