import client from './client'

export async function getAssignmentCounts(documentIds: string[]): Promise<Record<string, number>> {
  if (documentIds.length === 0) return {}
  const { data } = await client.post<{ counts: Record<string, number> }>(
    '/workflow/documents/assignment-counts',
    { document_ids: documentIds },
  )
  return data.counts
}
