import { test, expect } from '@playwright/test'

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@edms.dev'
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'e2e-admin-pass-123456'

/**
 * Camino dorado de humo: login del admin sembrado ejercita toda la cadena
 * frontend -> nginx -> api-gateway -> auth-service -> postgres y el manejo
 * de JWT. Si esto pasa, el stack esta sano de punta a punta.
 */
test('el admin puede iniciar sesion y entrar al dashboard', async ({ page }) => {
  await page.goto('/login')

  await page.getByPlaceholder('usuario@dominio.cl').fill(ADMIN_EMAIL)
  await page.getByPlaceholder('••••••••').fill(ADMIN_PASSWORD)
  await page.locator('button[type="submit"]').click()

  // Tras autenticar, la SPA navega fuera de /login
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 })

  // El formulario de login ya no esta presente
  await expect(page.getByPlaceholder('usuario@dominio.cl')).toHaveCount(0)
})

test('ruta protegida sin sesion redirige a /login', async ({ page }) => {
  await page.context().clearCookies()
  await page.goto('/')
  await page.waitForURL(/\/login/, { timeout: 15_000 })
  await expect(page.getByPlaceholder('usuario@dominio.cl')).toBeVisible()
})
