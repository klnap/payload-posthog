import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(fileURLToPath(new URL('../../../..', import.meta.url)))

export default {
  cacheComponents: process.env.PH_CACHE_COMPONENTS !== '0',
  partialPrefetching: process.env.PH_PARTIAL_PREFETCHING !== '0',
  distDir: `.next-${process.env.PH_CACHE_COMPONENTS ?? '1'}-${process.env.PH_PARTIAL_PREFETCHING ?? '1'}`,
  agentRules: false,
  turbopack: { root: projectRoot },
}
