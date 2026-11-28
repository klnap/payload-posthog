import { describe, expect, it } from 'bun:test'
import { resolvePersonProperties, resolvePersonProperty } from './person-properties'

const user = {
  id: 123,
  email: 'editor@example.test',
  profile: { fullName: 'Ada Editor', department: { name: 'Content' } },
  organization: { id: 'org-1', name: 'Acme' },
  roles: ['admin', 'editor'],
  active: true,
  score: 4.5,
  password: 'secret-value',
  hash: 'abc',
  apiKey: 'key',
}

describe('resolvePersonProperty', () => {
  it('resolves dotted scalar paths', () => {
    expect(resolvePersonProperty(user, 'profile.fullName')).toBe('Ada Editor')
    expect(resolvePersonProperty(user, 'profile.department.name')).toBe('Content')
    expect(resolvePersonProperty(user, 'organization.id')).toBe('org-1')
  })

  it('supports finite numbers and booleans', () => {
    expect(resolvePersonProperty(user, 'active')).toBe(true)
    expect(resolvePersonProperty(user, 'score')).toBe(4.5)
    expect(resolvePersonProperty({ n: Number.NaN }, 'n')).toBeUndefined()
    expect(resolvePersonProperty({ n: Infinity }, 'n')).toBeUndefined()
  })

  it('keeps primitive arrays, including empty ones', () => {
    expect(resolvePersonProperty(user, 'roles')).toEqual(['admin', 'editor'])
    expect(resolvePersonProperty({ roles: [] }, 'roles')).toEqual([])
  })

  it('projects populated relationship arrays', () => {
    const source = {
      roles: [
        { id: '1', name: 'Admin' },
        { id: '2', name: 'Editor' },
      ],
    }
    expect(resolvePersonProperty(source, 'roles[].name')).toEqual(['Admin', 'Editor'])
    expect(resolvePersonProperty(source, 'roles[].id')).toEqual(['1', '2'])
  })

  it('projects nested arrays by flattening', () => {
    const source = { groups: [{ roles: [{ name: 'a' }] }, { roles: [{ name: 'b' }] }] }
    expect(resolvePersonProperty(source, 'groups[].roles[].name')).toEqual(['a', 'b'])
  })

  it('skips unresolved items of partially populated arrays deterministically', () => {
    const source = { roles: [{ id: '1', name: 'Admin' }, '2', { id: '3' }] }
    expect(resolvePersonProperty(source, 'roles[].name')).toEqual(['Admin'])
  })

  it('does not treat an unresolved nonempty relationship array as empty', () => {
    expect(resolvePersonProperty({ roles: [{ id: '1' }, { id: '2' }] }, 'roles[].name')).toBe(
      undefined
    )
    expect(resolvePersonProperty({ roles: ['1', '2'] }, 'roles')).toEqual(['1', '2'])
  })

  it('omits a populated document passed without projection', () => {
    expect(resolvePersonProperty({ roles: [{ id: '1', name: 'Admin' }] }, 'roles')).toBe(undefined)
  })

  it('omits missing, null, and non-primitive values', () => {
    expect(resolvePersonProperty(user, 'profile.missing')).toBeUndefined()
    expect(resolvePersonProperty({ a: null }, 'a')).toBeUndefined()
    expect(resolvePersonProperty({ a: { b: 1 } }, 'a')).toBeUndefined()
    expect(resolvePersonProperty(user, 'roles[].name')).toBeUndefined()
  })

  it('does not traverse prototype properties', () => {
    expect(resolvePersonProperty({}, 'constructor')).toBeUndefined()
    expect(resolvePersonProperty({}, 'toString')).toBeUndefined()
    expect(resolvePersonProperty({}, '__proto__.polluted')).toBeUndefined()
    expect(resolvePersonProperty({ a: 'x' }, 'a.length')).toBeUndefined()
  })

  it('never resolves credential-like paths', () => {
    expect(resolvePersonProperty(user, 'password')).toBeUndefined()
    expect(resolvePersonProperty(user, 'hash')).toBeUndefined()
    expect(resolvePersonProperty(user, 'apiKey')).toBeUndefined()
    expect(
      resolvePersonProperty({ auth: { resetPasswordToken: 'x' } }, 'auth.resetPasswordToken')
    ).toBeUndefined()
  })
})

describe('resolvePersonProperties', () => {
  it('resolves only configured properties and omits missing ones', () => {
    expect(
      resolvePersonProperties(user, {
        email: 'email',
        name: 'profile.fullName',
        organization_id: 'organization.id',
        department: 'profile.department.name',
        missing: 'nope',
        roles: 'roles',
      })
    ).toEqual({
      email: 'editor@example.test',
      name: 'Ada Editor',
      organization_id: 'org-1',
      department: 'Content',
      roles: ['admin', 'editor'],
    })
  })

  it('never serializes whole documents', () => {
    expect(resolvePersonProperties(user, { profile: 'profile', org: 'organization' })).toEqual({})
  })
})
