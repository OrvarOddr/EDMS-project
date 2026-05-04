import client from './client'

export async function getAssignmentCounts(documentIds: string[]): Promise<Record<string, number>> {
  if (documentIds.length === 0) return {}
  const { data } = await client.post<{ counts: Record<string, number> }>(
    '/workflow/documents/assignment-counts',
    { document_ids: documentIds },
  )
  return data.counts
}

export interface ChangeStateResponse {
  document_id: string
  previous_state_code: string | null
  new_state_code: string
  changed_by_user_id: string
  changed_at: string
}

export async function changeDocumentState(
  documentId: string,
  newStateCode: string,
  comment?: string,
): Promise<ChangeStateResponse> {
  const { data } = await client.patch<ChangeStateResponse>(
    `/workflow/documents/${documentId}/state`,
    { new_state_code: newStateCode, comment: comment ?? null },
  )
  return data
}
