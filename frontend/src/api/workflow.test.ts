import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./client', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}))

import client from './client'
import {
  changeDocumentState,
  assignDocumentAssignee,
  getAssignmentCounts,
} from './workflow'

const mocked = client as unknown as {
  post: ReturnType<typeof vi.fn>
  patch: ReturnType<typeof vi.fn>
}

describe('api/workflow', () => {
  beforeEach(() => {
    mocked.post.mockReset()
    mocked.patch.mockReset()
  })

  it('getAssignmentCounts sin ids no llama al backend', async () => {
    const res = await getAssignmentCounts([])
    expect(res).toEqual({})
    expect(mocked.post).not.toHaveBeenCalled()
  })

  it('getAssignmentCounts con ids consulta el backend', async () => {
    mocked.post.mockResolvedValue({ data: { counts: { d1: 2 } } })
    const res = await getAssignmentCounts(['d1'])
    expect(mocked.post).toHaveBeenCalledWith('/workflow/documents/assignment-counts', {
      document_ids: ['d1'],
    })
    expect(res).toEqual({ d1: 2 })
  })

  it('changeDocumentState envia estado y comentario', async () => {
    mocked.patch.mockResolvedValue({ data: { document_id: 'd1', new_state_code: 'observado' } })
    await changeDocumentState('d1', 'observado', 'faltan firmas')
    expect(mocked.patch).toHaveBeenCalledWith('/workflow/documents/d1/state', {
      new_state_code: 'observado',
      comment: 'faltan firmas',
    })
  })

  it('changeDocumentState sin comentario manda null', async () => {
    mocked.patch.mockResolvedValue({ data: {} })
    await changeDocumentState('d1', 'en_revision')
    expect(mocked.patch).toHaveBeenCalledWith('/workflow/documents/d1/state', {
      new_state_code: 'en_revision',
      comment: null,
    })
  })

  it('assignDocumentAssignee pega al endpoint con user_id', async () => {
    mocked.patch.mockResolvedValue({ data: {} })
    await assignDocumentAssignee('d1', 'u2')
    expect(mocked.patch).toHaveBeenCalledWith('/workflow/documents/d1/assignee', {
      user_id: 'u2',
    })
  })
})
