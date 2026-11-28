import { BootstrapProvider } from '../BootstrapProvider'

export default function Page() {
  return (
    <BootstrapProvider bootstrapFlags={false}>
      <main id='admin-content'>admin-ready</main>
    </BootstrapProvider>
  )
}
