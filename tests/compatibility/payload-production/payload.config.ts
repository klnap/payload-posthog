import { postHog } from '@klnap/payload-posthog'
import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { buildConfig } from 'payload'

const plugins =
  process.env.PH_PLUGIN === '0'
    ? []
    : [
        postHog({
          // Runtime switches (read at server start): PH_KEYLESS=1 omits the key; PH_DEBUG=1 enables diagnostics.
          apiKey: process.env.PH_KEYLESS === '1' ? undefined : 'phc_fixture_key',
          debug: process.env.PH_DEBUG === '1',
          clientOptions: {
            api_host: process.env.PH_LOCAL_HOST,
            opt_out_useragent_filter: true,
          },
          bootstrapFlags:
            process.env.PH_BOOTSTRAP === 'true'
              ? true
              : process.env.PH_BOOTSTRAP === 'false'
                ? false
                : undefined,
          serverOptions: {
            host: process.env.PH_LOCAL_HOST,
            requestTimeout: 1_000,
            featureFlagsRequestTimeoutMs: 1_000,
            featureFlagsRequestMaxRetries: 0,
          },
          payload: {
            identify: { properties: { name: 'name', roles: 'roles[].name' } },
            conversations: {
              secret: 'synthetic-conversations-secret-1234567890',
              launcher: process.env.PH_LAUNCHER === 'hidden' ? 'hidden' : 'visible',
            },
          },
        }),
      ]

export default buildConfig({
  admin: {
    user: 'users',
    importMap: { baseDir: process.cwd() },
    components: {
      afterDashboard: ['./components/PostHogProbe#PostHogProbe'],
      views: {
        customSynthetic: {
          Component: './components/CustomView#CustomView',
          path: '/custom-view',
        },
      },
    },
    // Renamed native reset route for runtime verification (defaults to /reset).
    routes: { reset: (process.env.PH_RESET_ROUTE || '/reset') as `/${string}` },
  },
  collections: [
    {
      slug: 'users',
      auth: { useAPIKey: { reveal: true } },
      fields: [{ name: 'name', type: 'text' }],
    },
    {
      slug: 'posts',
      fields: [{ name: 'title', type: 'text', required: true }],
      hooks: {
        afterChange: [
          ({ doc }) => {
            if (doc.title === 'Synthetic rollback canary') {
              throw new Error('synthetic-operation-failure')
            }
          },
        ],
      },
      versions: {
        drafts: {
          autosave: { interval: 700, showSaveDraftButton: true },
          schedulePublish: true,
          validate: true,
        },
      },
    },
  ],
  globals: [
    {
      slug: 'settings',
      fields: [{ name: 'title', type: 'text' }],
      versions: {
        drafts: {
          autosave: { interval: 700, showSaveDraftButton: true },
          schedulePublish: true,
        },
      },
    },
  ],
  db: sqliteAdapter({
    client: { url: process.env.DATABASE_URL ?? 'file:./payload.sqlite' },
    idType: 'uuid',
    push: true,
  }),
  plugins,
  secret: 'payload-production-fixture-secret-at-least-32-characters',
  typescript: { outputFile: `${process.cwd()}/payload-types.ts` },
})
