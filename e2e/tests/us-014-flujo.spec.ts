import { test, expect, type APIRequestContext } from '@playwright/test'

/**
 * US-014 (DoD): "el flujo funciona entre frontend, gateway,
 * workflow-service y collaboration-service".
 *
 * Se ejercita la cadena REAL a traves de nginx (puerto 8052) -> api-gateway
 * (valida JWT, inyecta X-User-*) -> document-service -> workflow-service ->
 * collaboration-service. No mockea nada: valida la integracion en vivo.
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

test('US-014: crear documento, mover a observado con comentario y verlo en el historial', async ({ request }) => {
  const token = await login(request)
  const auth = { Authorization: `Bearer ${token}` }

  // 1. Crear documento -> document-service dispara bootstrap en workflow-service
  const created = await request.post('/api/documents', {
    headers: auth,
    data: {
      title: 'E2E US-014 documento',
      document_type_id: 'tipo-e2e',
      description: 'Documento de prueba e2e para cambio de estado',
    },
  })
  expect(created.status(), await created.text()).toBe(201)
  const documentId = (await created.json()).id as string
  expect(documentId).toBeTruthy()

  // 2. Mover a "observado" SIN comentario -> regla de workflow-service: 422
  const sinComentario = await request.patch(`/api/workflow/documents/${documentId}/state`, {
    headers: auth,
    data: { new_state_code: 'observado' },
  })
  expect(sinComentario.status()).toBe(422)

  // 3. Mover a "observado" CON comentario -> 200
  const motivo = 'Faltan firmas en la pagina 2'
  const conComentario = await request.patch(`/api/workflow/documents/${documentId}/state`, {
    headers: auth,
    data: { new_state_code: 'observado', comment: motivo },
  })
  expect(conComentario.status(), await conComentario.text()).toBe(200)
  expect((await conComentario.json()).new_state_code).toBe('observado')

  // 4. El detalle (document-service agrega historial de workflow-service en vivo)
  //    refleja el nuevo estado y el comentario como `note`.
  const detail = await request.get(`/api/documents/${documentId}`, { headers: auth })
  expect(detail.status(), await detail.text()).toBe(200)
  const body = await detail.json()
  expect(body.workflow.state_code).toBe('observado')
  const cambios = body.history.filter(
    (h: { action: string; body?: string }) => h.action === 'state_change' && h.body === 'observado',
  )
  // No debe haber duplicados (regresion: document-service mezclaba el
  // historial de workflow dos veces).
  expect(cambios.length, 'el cambio a observado no debe duplicarse').toBe(1)
  expect(cambios[0].note).toBe(motivo)
})

test('US-014: comentar el documento ejercita collaboration-service en vivo', async ({ request }) => {
  const token = await login(request)
  const auth = { Authorization: `Bearer ${token}` }

  const created = await request.post('/api/documents', {
    headers: auth,
    data: {
      title: 'E2E US-014 comentario',
      document_type_id: 'tipo-e2e',
      description: 'Documento para validar collaboration-service',
    },
  })
  expect(created.status(), await created.text()).toBe(201)
  const documentId = (await created.json()).id as string

  // collaboration-service valida permiso contra document-service y consulta
  // asignaciones a workflow-service antes de crear el comentario.
  const comment = await request.post(`/api/collaboration/documents/${documentId}/comments`, {
    headers: auth,
    data: { body: 'Comentario e2e que cruza servicios' },
  })
  expect(comment.status(), await comment.text()).toBe(201)
  expect((await comment.json()).action).toBe('comment')
})
