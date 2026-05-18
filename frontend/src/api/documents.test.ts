import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./client', () => ({
  default: { patch: vi.fn() },
}))

import client from './client'
import { updateDocumentMetadata } from './documents'

const mocked = client as unknown as { patch: ReturnType<typeof vi.fn> }

describe('api/documents updateDocumentMetadata', () => {
  beforeEach(() => mocked.patch.mockReset())

  it('envia due_date al endpoint de metadata', async () => {
    mocked.patch.mockResolvedValue({ data: {} })
    await updateDocumentMetadata('doc-1', {
      title: 'T',
      document_type_id: 't1',
      description: 'd',
      confidentiality_level: 'publico_interno',
      due_date: '2026-12-31',
    })
    expect(mocked.patch).toHaveBeenCalledWith('/documents/doc-1/metadata', {
      title: 'T',
      document_type_id: 't1',
      description: 'd',
      confidentiality_level: 'publico_interno',
      due_date: '2026-12-31',
    })
  })

  it('permite limpiar la fecha con null', async () => {
    mocked.patch.mockResolvedValue({ data: {} })
    await updateDocumentMetadata('doc-1', {
      title: 'T',
      document_type_id: 't1',
      description: 'd',
      confidentiality_level: 'publico_interno',
      due_date: null,
    })
    expect(mocked.patch.mock.calls[0][1].due_date).toBeNull()
  })
})
