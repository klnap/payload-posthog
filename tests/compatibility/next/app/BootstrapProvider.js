import { PostHogAdminProvider } from '@klnap/payload-posthog/admin'
import { Suspense } from 'react'

export function BootstrapProvider({ children, bootstrapFlags }) {
  return (
    <Suspense fallback={<p>admin-shell-fallback</p>}>
      <PostHogAdminProvider
        apiKey='phc_fixture_key'
        bootstrapFlags={bootstrapFlags}
        serverOptions={{
          host: process.env.POSTHOG_TEST_HOST,
          requestTimeout: 500,
          featureFlagsRequestTimeoutMs: 1_000,
          featureFlagsRequestMaxRetries: 0,
        }}
        identityCollection=''
        identityCollections={[]}
        identify={null}
        conversations={null}
      >
        {children}
      </PostHogAdminProvider>
    </Suspense>
  )
}
