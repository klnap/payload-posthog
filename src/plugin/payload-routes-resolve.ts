// Payload's public authentication routes, read from the live Admin config rather than hardcoded defaults.
const PUBLIC_AUTH_ROUTE_KEYS = [
  'createFirstUser',
  'forgot',
  'inactivity',
  'login',
  'logout',
  'reset',
  'unauthorized',
] as const

export type PayloadClientRoutes = {
  routes: { admin: string }
  admin: { routes: Record<(typeof PUBLIC_AUTH_ROUTE_KEYS)[number] | 'account', string> }
}

/** Admin route and guest paths for the current Payload client config. */
export function resolvePayloadRoutes(
  config: PayloadClientRoutes,
  extraGuestPaths: readonly string[]
) {
  return {
    adminPath: config.routes.admin,
    guestPaths: [
      ...PUBLIC_AUTH_ROUTE_KEYS.map((key) => config.admin.routes[key]),
      ...extraGuestPaths,
    ],
  }
}
