import { test, expect, type APIRequestContext } from '@playwright/test'

/**
 * US-028 (DoD): "el flujo funciona entre frontend, gateway y
 * collaboration-service". Verifica en vivo, a traves de nginx -> api-gateway
 * (JWT) -> collaboration-service, que el feed de actividad responde con el
 * contrato esperado y respeta autenticacion.
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

test('US-028: actividad reciente requiere autenticacion', async ({ request }) => {
  const res = await request.get('/api/collaboration/activity')
  expect(res.status()).toBe(401)
})

test('US-028: actividad reciente responde con el contrato esperado', async ({ request }) => {
  const token = await login(request)
  const res = await request.get('/api/collaboration/activity?limit=10', {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(res.status(), await res.text()).toBe(200)
  const body = await res.json()
  expect(Array.isArray(body.items)).toBe(true)
})
