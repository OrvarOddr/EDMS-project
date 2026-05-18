import client from './client'

export interface ActivityItem {
  id: string
  actor_user_id: string | null
  document_id: string | null
  type: string
  title: string
  body: string | null
  created_at: string
}

export async function getRecentActivity(limit = 15): Promise<ActivityItem[]> {
  const { data } = await client.get<{ items: ActivityItem[] }>('/collaboration/activity', {
    params: { limit },
  })
  return data.items
}
