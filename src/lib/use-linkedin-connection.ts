import { useCallback, useEffect, useState } from 'react'

export function useLinkedInConnection(accessToken: string | null) {
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!accessToken) {
      setConnected(false)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/linkedin/status', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body?.error || 'Could not check LinkedIn connection status.')
        setLoading(false)
        return
      }
      setError(null)
      setConnected(Boolean(body.connected))
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [accessToken])

  useEffect(() => {
    refresh()
  }, [refresh])

  function connect() {
    if (!accessToken) return
    window.location.href = `/auth/linkedin/connect?token=${encodeURIComponent(accessToken)}`
  }

  return { connected, loading, error, connect, refresh }
}
