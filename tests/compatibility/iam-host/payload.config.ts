import { appendFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { iam } from '@klnap/payload-iam'
import { postHog } from '@klnap/payload-posthog'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { buildConfig, type CollectionConfig, type EmailAdapter } from 'payload'

const dirname = path.dirname(fileURLToPath(import.meta.url))

const testEmailAdapter: EmailAdapter<void> = () => ({
  name: 'qualification-capture',
  defaultFromAddress: 'test@stolbek.test',
  defaultFromName: 'IAM Qualification',
  sendEmail: async (message) => {
    const body = [message.subject, message.text, message.html]
      .filter((part): part is string => typeof part === 'string')
      .join('\n')
    const otp = body.match(/(?<!\d)\d{6}(?!\d)/)?.[0]
    if (process.env.IAM_E2E_OTP_LOG) {
      const to = typeof message.to === 'string' ? message.to : 'test-recipient'
      appendFileSync(process.env.IAM_E2E_OTP_LOG, `[dev-mail] to=${to} otp=${otp ?? 'none'}\n`, {
        mode: 0o600,
      })
    }
  },
})

const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  fields: [{ name: 'fullName', type: 'text' }],
}

const Projects: CollectionConfig = {
  slug: 'projects',
  admin: { useAsTitle: 'title' },
  fields: [{ name: 'title', type: 'text', required: true }],
}

const Redirects: CollectionConfig = {
  slug: 'redirects',
  admin: { useAsTitle: 'title' },
  fields: [{ name: 'title', type: 'text', required: true }],
}

export default buildConfig({
  secret: process.env.PAYLOAD_SECRET!,
  email: testEmailAdapter,
  serverURL: process.env.SERVER_URL ?? 'http://localhost:8010',
  routes: { admin: '/', api: '/api' },
  admin: {
    user: 'users',
    avatar: { Component: './components/FixtureAvatar#FixtureAvatar' },
    components: {
      beforeDashboard: [
        './components/FixtureAdminMarker#FixtureAdminMarker',
        './components/SupportButton#SupportButton',
      ],
      graphics: { Logo: './components/FixtureLogo#FixtureLogo' },
      views: {
        fixtureHelp: {
          Component: './components/FixtureHelp#FixtureHelp',
          exact: true,
          path: '/fixture-help',
          meta: { title: 'Fixture help' },
        },
      },
    },
    importMap: {
      baseDir: dirname,
      importMapFile: path.resolve(dirname, 'app/importMap.js'),
    },
  },
  collections: [Users, Projects, Redirects],
  editor: lexicalEditor(),
  db: postgresAdapter({
    idType: 'uuid',
    allowIDOnCreate: true,
    push: true,
    pool: { connectionString: process.env.DATABASE_URL! },
  }),
  plugins: [
    (config) => ({
      ...config,
      custom: { ...config.custom, fixtureHostPlugin: true },
    }),
    iam({
      secret: process.env.AUTH_SECRET!,
      // OTP disabled: the email capture path did not write in this harness; password sign-in is used.
      methods: { emailAndPassword: { enabled: true, otp: { enabled: false } } },
      modules: { apiTokens: true },
      translations: { en: { rbac: { themeNav: 'Fixture theme' } } },
    }),
    postHog({
      apiKey: 'phc_fixture_key',
      clientOptions: { api_host: process.env.PH_LOCAL_HOST, opt_out_useragent_filter: true },
      serverOptions: { host: process.env.PH_LOCAL_HOST, requestTimeout: 1_000 },
      payload: {
        identify: { properties: { name: 'fullName' } },
        conversations: {
          secret: 'synthetic-conversations-secret-1234567890',
          launcher: process.env.PH_LAUNCHER === 'hidden' ? 'hidden' : 'visible',
        },
      },
    }),
  ],
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
})
