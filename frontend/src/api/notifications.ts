import client from './client'

export interface NotificationItem {
  id: string
  recipient_user_id: string
  actor_user_id: string | null
  document_id: string | null
  source_id: string | null
  type: string
  title: string
  body: string | null
  is_read: boolean
  created_at: string
  read_at: string | null
}

export interface NotificationList {
  items: NotificationItem[]
  unread_count: number
}

export async function getNotifications(): Promise<NotificationList> {
  const { data } = await client.get<NotificationList>('/collaboration/notifications')
  return data
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  await client.post(`/collaboration/notifications/${notificationId}/read`)
}

export async function markAllNotificationsRead(): Promise<void> {
  await client.post('/collaboration/notifications/read-all')
}
