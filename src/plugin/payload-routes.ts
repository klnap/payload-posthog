'use client'

import { useConfig } from '@payloadcms/ui'
import { useMemo } from 'react'
import { resolvePayloadRoutes } from './payload-routes-resolve'

export function usePayloadRoutes(extraGuestPaths: readonly string[]) {
  const { config } = useConfig()
  return useMemo(() => resolvePayloadRoutes(config, extraGuestPaths), [config, extraGuestPaths])
}

/** Payload Admin route, read from the live client config. */
export function useAdminPath(): string {
  return useConfig().config.routes.admin
}
