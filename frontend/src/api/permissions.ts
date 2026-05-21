import client from './client'

export interface DocumentPermissionGrant {
  id: string
  document_id: string
  grantee_user_id: string
  permission_code: string
  granted_by_user_id: string
  granted_at: string
}

export const PERMISSION_CODES = [
  'view',
  'comment',
  'download',
  'edit_metadata',
  'upload_version',
  'move_state',
  'approve',
  'manage_permissions',
  'share',
] as const

export type PermissionCode = (typeof PERMISSION_CODES)[number]

export async function listDocumentPermissions(documentId: string): Promise<DocumentPermissionGrant[]> {
  const { data } = await client.get<{ grants: DocumentPermissionGrant[] }>(
    `/collaboration/documents/${documentId}/permissions`,
  )
  return data.grants
}

export async function grantDocumentPermission(
  documentId: string,
  granteeUserId: string,
  permissionCode: string,
): Promise<DocumentPermissionGrant> {
  const { data } = await client.post<DocumentPermissionGrant>(
    `/collaboration/documents/${documentId}/permissions`,
    { grantee_user_id: granteeUserId, permission_code: permissionCode },
  )
  return data
}

export async function revokeDocumentPermission(documentId: string, grantId: string): Promise<void> {
  await client.delete(`/collaboration/documents/${documentId}/permissions/${grantId}`)
}
