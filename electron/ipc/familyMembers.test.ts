import { describe, expect, it, vi } from 'vitest'

// The assert is pure, but importing the module evaluates its `import { prisma }
// from '../db.ts'`, which would migrate the dev database. Stand it in.
vi.mock('../db.ts', () => ({ prisma: {} }))

const { assertValidFamilyMemberInput } = await import('./familyMembers.ts')

describe('assertValidFamilyMemberInput', () => {
  it('rejects blank names but accepts real ones', () => {
    expect(() => assertValidFamilyMemberInput({ firstName: '', lastName: 'Chen' })).toThrow(/First name/)
    expect(() => assertValidFamilyMemberInput({ firstName: 'Leo', lastName: '  ' })).toThrow(/Last name/)
    expect(() => assertValidFamilyMemberInput({ firstName: 'Leo', lastName: 'Chen' })).not.toThrow()
  })

  it('ignores names absent from a partial update', () => {
    expect(() => assertValidFamilyMemberInput({ rank: 'Yellow' })).not.toThrow()
  })
})
