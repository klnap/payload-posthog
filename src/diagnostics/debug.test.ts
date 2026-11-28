import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { createIdentityDiagnosticsHook, logConversationsStatus } from './debug'

const SECRET_CANARY = 'synthetic-hash-canary-9f8e7d'
const mapping = {
  email: 'email',
  name: 'profile.fullName',
  roles: 'roles[].name',
  ids: 'roles[].id',
}

let logs: unknown[][] = []
let tables: unknown[] = []
const originalLog = console.log
const originalTable = console.table

beforeEach(() => {
  logs = []
  tables = []
  console.log = (...args: unknown[]) => void logs.push(args)
  console.table = (data: unknown) => void tables.push(data)
})
afterEach(() => {
  console.log = originalLog
  console.table = originalTable
})

const user = {
  id: 'u-1',
  email: 'ada@example.test',
  profile: { fullName: 'Ada Editor' },
  roles: [
    { id: 'r1', name: 'Admin' },
    { id: 'r2', name: 'Editor' },
  ],
  password: SECRET_CANARY,
  hash: SECRET_CANARY,
  apiKey: SECRET_CANARY,
}

function run(
  response: unknown,
  collection = { slug: 'users' },
  map: Record<string, string> | null = mapping
) {
  createIdentityDiagnosticsHook(
    map,
    'Identified in the browser when consent allows.'
  )({
    collection,
    response,
  } as never)
}

describe('identity diagnostics', () => {
  it('reports the namespaced distinct ID and the resolved mapping with real value types', () => {
    run({ collection: 'users', user })
    expect(logs[0]?.join(' ')).toContain('users:u-1')
    const rows = tables[0] as Array<{ property: string; value: unknown; status: string }>
    expect(rows.find((r) => r.property === 'roles')?.value).toEqual(['Admin', 'Editor'])
    expect(rows.find((r) => r.property === 'ids')?.value).toEqual(['r1', 'r2'])
    expect(rows.find((r) => r.property === 'name')?.value).toBe('Ada Editor')
    expect(rows.every((r) => r.status === 'resolved')).toBe(true)
  })

  it('marks missing and unsupported values as omitted instead of inventing them', () => {
    run({ collection: 'users', user: { id: 'u-2', roles: [{ id: 'r9' }] } }, undefined, {
      email: 'email',
      roles: 'roles[].name',
    })
    const rows = tables[0] as Array<{ property: string; status: string; value: unknown }>
    expect(rows.find((r) => r.property === 'email')).toMatchObject({
      status: 'omitted (missing or unsupported)',
      value: undefined,
    })
    expect(rows.find((r) => r.property === 'roles')?.status).toBe(
      'omitted (missing or unsupported)'
    )
  })

  it('never prints credentials, hashes, or the complete user object', () => {
    run({ collection: 'users', user })
    const printed = JSON.stringify([logs, tables])
    expect(printed).not.toContain(SECRET_CANARY)
    expect(printed).not.toContain('apiKey')
    expect(printed).not.toContain('"password"')
  })

  it('prints nothing again for an unchanged identity (repeated /me requests)', () => {
    // Distinct ID: the diagnostics module keeps its dedupe state for the process.
    const repeated = { ...user, id: 'u-repeat' }
    run({ collection: 'users', user: repeated })
    run({ collection: 'users', user: repeated })
    expect(logs).toHaveLength(1)
    expect(tables).toHaveLength(1)
  })
  it('contains diagnostic failures and keeps deduplication state bounded and value-free', () => {
    console.table = () => {
      throw new Error('synthetic console failure')
    }
    expect(() =>
      run({ collection: 'users', user: { ...user, id: 'u-console-failure' } })
    ).not.toThrow()

    for (let index = 0; index < 100; index++) {
      logConversationsStatus('signed', `users:diagnostic-${index}`)
    }
    const reported = (globalThis as Record<string, unknown>).__payloadPosthogDebugReported as Map<
      string,
      string
    >
    expect(reported.size).toBeLessThanOrEqual(64)
    expect(JSON.stringify([...reported])).not.toContain('diagnostic-')
    expect(JSON.stringify([...reported])).not.toContain('synthetic-hash-canary')
  })

  it('reports an anonymous request once without a distinct ID', () => {
    run({ user: null })
    run({ user: null })
    expect(logs).toHaveLength(1)
    expect(String(logs[0]?.[1] ?? logs[0]?.join(' '))).toContain('anonymous')
    expect(tables).toHaveLength(0)
  })

  it('prints only the distinct ID when no mapping is configured', () => {
    run({ collection: 'users', user }, undefined, null)
    expect(logs[0]?.join(' ')).toContain('users:u-1')
    expect(tables).toHaveLength(0)
  })
})
