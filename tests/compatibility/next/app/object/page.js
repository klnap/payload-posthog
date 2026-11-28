import { BootstrapProvider } from '../BootstrapProvider'

export default function Page() {
  return (
    <BootstrapProvider
      bootstrapFlags={{
        flags: ['server-flag'],
        personProperties: { plan: 'enterprise' },
      }}
    >
      <main id='admin-content'>admin-ready</main>
    </BootstrapProvider>
  )
}
