const SCOPE = 'openid email https://www.googleapis.com/auth/drive.appdata'
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata'

type TokenResponse = {
  access_token?: string
  expires_in?: number
  error?: string
  scope?: string
}
type TokenClient = {
  requestAccessToken: (options?: { prompt?: string }) => void
}
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (options: {
            client_id: string
            scope: string
            callback: (response: TokenResponse) => void
            error_callback?: (error: unknown) => void
          }) => TokenClient
          hasGrantedAllScopes: (response: TokenResponse, ...scopes: string[]) => boolean
        }
      }
    }
  }
}

export interface GoogleConnection {
  token: string
  expiresAt: number
  subject: string
  email: string
}

let scriptPromise: Promise<void> | undefined

function loadGoogleScript(): Promise<void> {
  if (window.google) return Promise.resolve()
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () =>
      window.google ? resolve() : reject(new Error('Google sign-in did not load.'))
    script.onerror = () => reject(new Error('Google sign-in could not load on this network.'))
    document.head.append(script)
  }).catch((error) => {
    scriptPromise = undefined
    throw error
  })
  return scriptPromise
}

export async function connectGoogle(clientId: string): Promise<GoogleConnection> {
  if (!clientId) throw new Error('Set VITE_GOOGLE_CLIENT_ID before connecting Google Drive.')
  if (!window.google) throw new Error('Google sign-in is still loading. Try again in a moment.')
  const response = await new Promise<TokenResponse>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: resolve,
      error_callback: () => reject(new Error('Google sign-in was cancelled or blocked.')),
    })
    client.requestAccessToken({ prompt: '' })
  })
  if (response.error || !response.access_token) {
    throw new Error(response.error || 'Google did not return an access token.')
  }
  if (
    !window.google.accounts.oauth2.hasGrantedAllScopes(response, DRIVE_SCOPE, 'openid', 'email')
  ) {
    throw new Error('Google Drive and identity permissions are required for sync.')
  }
  const info = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${response.access_token}` },
  })
  if (!info.ok) throw new Error('Could not confirm the connected Google account.')
  const user = (await info.json()) as { sub?: string; email?: string }
  if (!user.sub) throw new Error('Google did not return a stable account ID.')
  return {
    token: response.access_token,
    expiresAt: Date.now() + Math.max(0, (response.expires_in ?? 3600) - 60) * 1000,
    subject: user.sub,
    email: user.email || 'Connected Google account',
  }
}

export function prepareGoogle(): Promise<void> {
  return loadGoogleScript()
}
