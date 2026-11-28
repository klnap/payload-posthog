import { BootstrapProvider } from '../BootstrapProvider'

export default function Page() {
  return (
    <BootstrapProvider bootstrapFlags>
      <main id='admin-content'>admin-ready</main>
    </BootstrapProvider>
  )
}
