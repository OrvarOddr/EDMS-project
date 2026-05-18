import { test, expect, type APIRequestContext } from '@playwright/test'

/**
 * US-033 (DoD): "el flujo funciona entre frontend, gateway, document-service
 * y collaboration-service". Via nginx: crear documento, definir fecha de
 * vencimiento y verificar que persiste y se devuelve. Sin mocks.
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

test('US-033: definir fecha de vencimiento persiste y se refleja', async ({ request }) => {
  const token = await login(request)
  const auth = { Authorization: `Bearer ${token}` }

  const created = await request.post('/api/documents', {
    headers: auth,
    data: {
      title: 'E2E US-033 vencimiento',
      document_type_id: 'tipo-e2e',
      description: 'doc para fecha de vencimiento',
    },
  })
  expect(created.status(), await created.text()).toBe(201)
  const doc = await created.json()
  expect(doc.due_date ?? null).toBeNull()

  const patched = await request.patch(`/api/documents/${doc.id}/metadata`, {
    headers: auth,
    data: {
      title: 'E2E US-033 vencimiento',
      document_type_id: 'tipo-e2e',
      description: 'doc para fecha de vencimiento',
      confidentiality_level: 'publico_interno',
      due_date: '2026-12-31',
    },
  })
  expect(patched.status(), await patched.text()).toBe(200)
  expect((await patched.json()).due_date).toContain('2026-12-31')

  // persiste en el detalle (document-service + servicios reales)
  const detail = await request.get(`/api/documents/${doc.id}`, { headers: auth })
  expect(detail.status()).toBe(200)
  expect((await detail.json()).document.due_date).toContain('2026-12-31')
})

test('US-033: fecha invalida es rechazada (422)', async ({ request }) => {
  const token = await login(request)
  const auth = { Authorization: `Bearer ${token}` }

  const created = await request.post('/api/documents', {
    headers: auth,
    data: { title: 'E2E US-033 invalida', document_type_id: 'tipo-e2e', description: 'x' },
  })
  expect(created.status()).toBe(201)
  const doc = await created.json()

  const bad = await request.patch(`/api/documents/${doc.id}/metadata`, {
    headers: auth,
    data: {
      title: 'E2E US-033 invalida',
      document_type_id: 'tipo-e2e',
      description: 'x',
      confidentiality_level: 'publico_interno',
      due_date: 'no-es-fecha',
    },
  })
  expect(bad.status()).toBe(422)
})
