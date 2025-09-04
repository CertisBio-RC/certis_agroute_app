'use client'

import React from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  // show the error in console too
  if (typeof window !== 'undefined') {
    // eslint-disable-next-line no-console
    console.error('Route error boundary caught:', error)
  }

  return (
    <main style={{ padding: 24, color: '#fff', background: '#111', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>Something went wrong</h1>
      <p style={{ opacity: 0.8, marginBottom: 16 }}>
        The UI caught a client-side exception and prevented a crash.
      </p>
      <pre style={{ whiteSpace: 'pre-wrap', background: '#222', padding: 12, borderRadius: 8 }}>
        {String(error?.message || error)}
      </pre>
      {error?.digest && (
        <p style={{ opacity: 0.6, marginTop: 8 }}>
          digest: <code>{error.digest}</code>
        </p>
      )}
      <button
        onClick={() => reset()}
        style={{
          marginTop: 16,
          background: '#2dd4bf',
          color: '#111',
          padding: '8px 12px',
          borderRadius: 8,
          border: 0,
          cursor: 'pointer',
        }}
      >
        Try again
      </button>
    </main>
  )
}
