import { describe, expect, it } from 'bun:test'
import { type PayloadClientRoutes, resolvePayloadRoutes } from './payload-routes-resolve'

const config: PayloadClientRoutes = {
  routes: { admin: '/' },
  admin: {
    routes: {
      account: '/account',
      createFirstUser: '/create-first-user',
      forgot: '/forgot',
      inactivity: '/logout-inactivity',
      login: '/login',
      logout: '/logout',
      reset: '/reset',
      unauthorized: '/unauthorized',
    },
  },
}

describe('resolvePayloadRoutes', () => {
  it('reads public auth routes from the live Admin config and excludes authenticated routes', () => {
    const { adminPath, guestPaths } = resolvePayloadRoutes(config, [])

    expect(adminPath).toBe('/')
    expect(guestPaths).toEqual([
      '/create-first-user',
      '/forgot',
      '/logout-inactivity',
      '/login',
      '/logout',
      '/reset',
      '/unauthorized',
    ])
    expect(guestPaths).not.toContain('/account')
  })

  it('appends host guest paths after the native routes', () => {
    const { guestPaths } = resolvePayloadRoutes(config, ['/accept-invitation'])

    expect(guestPaths.at(-1)).toBe('/accept-invitation')
    expect(guestPaths).toHaveLength(8)
  })
})
