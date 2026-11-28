import { bootstrapRoot, type PayloadWithIam } from '@klnap/payload-iam'
import { getPayload } from 'payload'
import config from '../payload.config'

const payload = await getPayload({ config })
const iamPayload = payload as PayloadWithIam
const root = await bootstrapRoot(payload, {
  email: 'e2e-root@stolbek.test',
  fullName: 'Qualification Root',
  password: 'E2e-Root-9x!Secure',
})

const roles = new Map<string, string>()
for (const [name, permissions] of [
  [
    'E2E Reader',
    {
      collections: { projects: { read: true }, invitations: { read: true, create: true } },
      globals: {},
      register: {},
    },
  ],
  [
    'E2E Writer',
    {
      collections: { projects: { read: true, create: true, update: true } },
      globals: {},
      register: {},
    },
  ],
  ['E2E No Roles', { collections: {}, globals: {}, register: {} }],
] as const) {
  const role = await payload.create({
    collection: 'roles',
    data: { name, permissions },
    overrideAccess: true,
  })
  roles.set(name, String(role.id))
}

const seedUser = async (email: string, roleName: string, fullName: string) => {
  const created = await iamPayload.iam.api.createSharedUser({
    email,
    fullName,
    roleIds: [roles.get(roleName)!],
    actor: { type: 'system', reason: 'release-qualification-fixture' },
    idempotencyKey: `release-qualification:${email}`,
    skipInvite: true,
  })
  if (!('id' in created)) throw new Error('Expected direct user creation')
  await iamPayload.iam.api.setPassword({ userId: created.id, password: 'E2e-Fixture-9x!' })
}

await seedUser('e2e-reader@stolbek.test', 'E2E Reader', 'Qualification Reader')
await seedUser('e2e-junior@stolbek.test', 'E2E Reader', 'Qualification Junior')
await seedUser('e2e-writer@stolbek.test', 'E2E Writer', 'Qualification Writer')
await seedUser('e2e-noroles@stolbek.test', 'E2E No Roles', 'Qualification No Roles')
await payload.db.destroy?.()
console.log(`Seeded root and ${roles.size} roles with 4 active test users.`)
console.log(`Root user id present=${Boolean(root.userId)}`)
process.exit(0)
