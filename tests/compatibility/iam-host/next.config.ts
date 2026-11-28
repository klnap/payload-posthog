import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'

const config: NextConfig = {
  poweredByHeader: false,
  transpilePackages: ['@klnap/payload-iam'],
  turbopack: { root: process.cwd() },
}

export default withPayload(config)
