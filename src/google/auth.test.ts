import { describe, expect, it, vi } from 'vitest'
import { connectGoogle } from './auth'

describe('Google browser authorization', () => {
  it('registers the callback before requesting a token and reads the stable account ID', async () => {
    const requestAccessToken = vi.fn()
    const initTokenClient = vi.fn((config: { callback: (response: object) => void }) => ({
      requestAccessToken: () => {
        requestAccessToken()
        config.callback({ access_token: 'temporary-token', expires_in: 3600 })
      },
    }))
    vi.stubGlobal('window', {
      google: {
        accounts: {
          oauth2: {
            initTokenClient,
            hasGrantedAllScopes: () => true,
          },
        },
      },
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ sub: 'stable-sub', email: 'me@example.test' }), {
            status: 200,
          }),
      ),
    )
    try {
      const connection = await connectGoogle('public-client-id')
      expect(initTokenClient).toHaveBeenCalledOnce()
      expect(requestAccessToken).toHaveBeenCalledOnce()
      expect(connection.subject).toBe('stable-sub')
      expect(connection.token).toBe('temporary-token')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
