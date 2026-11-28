import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  trailingSlash: true,
  basePath: process.env.NEXT_BASE_PATH || undefined,
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  agentRules: false,
  turbopack: { root: process.cwd() },
}

export default withPayload(nextConfig)
