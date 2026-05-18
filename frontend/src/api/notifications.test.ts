import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./client', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))

import client from './client'
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from './notifications'

const mocked = client as unknown as { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> }

describe('api/notifications', () => {
  beforeEach(() => {
    mocked.get.mockReset()
    mocked.post.mockReset()
  })

  it('getNotifications devuelve data del endpoint', async () => {
    mocked.get.mockResolvedValue({ data: { items: [], unread_count: 0 } })
    const res = await getNotifications()
    expect(mocked.get).toHaveBeenCalledWith('/collaboration/notifications')
    expect(res).toEqual({ items: [], unread_count: 0 })
  })

  it('markNotificationRead pega al endpoint correcto', async () => {
    mocked.post.mockResolvedValue({ data: {} })
    await markNotificationRead('n1')
    expect(mocked.post).toHaveBeenCalledWith('/collaboration/notifications/n1/read')
  })

  it('markAllNotificationsRead pega a read-all', async () => {
    mocked.post.mockResolvedValue({ data: {} })
    await markAllNotificationsRead()
    expect(mocked.post).toHaveBeenCalledWith('/collaboration/notifications/read-all')
  })
})
