import { describe, expect, it } from 'vitest'
import {
  getSessionDisplayTitle,
  removeSessionFromList,
  renameSessionInList,
} from '../../../web/src/components/session-list-utils.js'

describe('session list helpers', () => {
  it('chooses a readable title fallback', () => {
    expect(getSessionDisplayTitle({ id: '20260531010101999', title: 'Named' })).toBe('Named')
    expect(getSessionDisplayTitle({ id: '20260531010101999', goal: 'Fix tests' })).toBe('Fix tests')
    expect(getSessionDisplayTitle({ id: '20260531010101999', goal: '(no goal)' })).toBe('202605310101...')
  })

  it('renames and removes sessions without mutating the input list', () => {
    const sessions = [
      { id: 'a', title: 'A' },
      { id: 'b', title: 'B' },
    ]

    const renamed = renameSessionInList(sessions, 'b', 'Beta')
    expect(renamed).toEqual([{ id: 'a', title: 'A' }, { id: 'b', title: 'Beta' }])
    expect(sessions[1]?.title).toBe('B')

    expect(removeSessionFromList(renamed, 'a')).toEqual([{ id: 'b', title: 'Beta' }])
  })
})
