import { describe, it, expect, vi, afterEach } from 'vitest'

import { normalizeMentionToken, notifTimeAgo } from './text'

describe('normalizeMentionToken', () => {
  it('quita acentos, pasa a minuscula y descarta simbolos', () => {
    expect(normalizeMentionToken('José Pérez')).toBe('joseperez')
    expect(normalizeMentionToken('AnaMaría')).toBe('anamaria')
  })

  it('conserva guion y guion bajo', () => {
    expect(normalizeMentionToken('juan-soto_01')).toBe('juan-soto_01')
  })

  it('cadena vacia o solo simbolos => vacio', () => {
    expect(normalizeMentionToken('@@@')).toBe('')
    expect(normalizeMentionToken('')).toBe('')
  })
})

describe('notifTimeAgo', () => {
  afterEach(() => vi.useRealTimers())

  it('iso invalido => cadena vacia', () => {
    expect(notifTimeAgo('no-es-fecha')).toBe('')
  })

  it('calcula intervalos relativos', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-17T12:00:00Z'))
    expect(notifTimeAgo('2026-05-17T11:59:40Z')).toBe('ahora')
    expect(notifTimeAgo('2026-05-17T11:30:00Z')).toBe('30 min')
    expect(notifTimeAgo('2026-05-17T09:00:00Z')).toBe('3 h')
    expect(notifTimeAgo('2026-05-16T12:00:00Z')).toBe('ayer')
    expect(notifTimeAgo('2026-05-14T12:00:00Z')).toBe('3 d')
  })
})
