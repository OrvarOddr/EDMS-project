import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./client', () => ({
  default: { get: vi.fn() },
}))

import client from './client'
import { getRecentActivity } from './activity'

const mocked = client as unknown as { get: ReturnType<typeof vi.fn> }

describe('api/activity', () => {
  beforeEach(() => {
    mocked.get.mockReset()
  })

  it('getRecentActivity consulta el endpoint con limit por defecto', async () => {
    mocked.get.mockResolvedValue({ data: { items: [] } })
    const res = await getRecentActivity()
    expect(mocked.get).toHaveBeenCalledWith('/collaboration/activity', { params: { limit: 15 } })
    expect(res).toEqual([])
  })

  it('getRecentActivity respeta el limit indicado y devuelve items', async () => {
    const items = [{ id: 'a', actor_user_id: 'u', document_id: 'd', type: 'cambio_estado', title: 'X', body: null, created_at: '2026-05-18T00:00:00Z' }]
    mocked.get.mockResolvedValue({ data: { items } })
    const res = await getRecentActivity(5)
    expect(mocked.get).toHaveBeenCalledWith('/collaboration/activity', { params: { limit: 5 } })
    expect(res).toEqual(items)
  })
})
