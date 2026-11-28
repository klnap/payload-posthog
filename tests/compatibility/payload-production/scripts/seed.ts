import { getPayload } from 'payload'
import config from '../payload.config'

const payload = await getPayload({ config })
await payload.create({
  collection: 'users',
  data: {
    email: 'admin@example.test',
    name: 'Synthetic Admin',
    password: 'synthetic-fixture-password',
  },
  overrideAccess: true,
})
await payload.updateGlobal({
  slug: 'settings',
  data: { title: 'Synthetic settings initial' },
  overrideAccess: true,
})
await payload.updateGlobal({
  slug: 'settings',
  data: { title: 'Synthetic settings revised' },
  overrideAccess: true,
})
const post = await payload.create({
  collection: 'posts',
  data: { title: 'Synthetic post initial' },
  overrideAccess: true,
})
await payload.update({
  collection: 'posts',
  id: post.id,
  data: { title: 'Synthetic post revised' },
  overrideAccess: true,
})
await payload.destroy()
