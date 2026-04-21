import { PublicClientApplication, InteractionRequiredAuthError } from '@azure/msal-browser'

const CLIENT_ID = import.meta.env.VITE_MSAL_CLIENT_ID ?? ''
const TENANT_ID = import.meta.env.VITE_MSAL_TENANT_ID ?? 'common'

const MSAL_CONFIG = {
  auth: {
    clientId:    CLIENT_ID,
    authority:   `https://login.microsoftonline.com/${TENANT_ID}`,
    redirectUri: window.location.origin + import.meta.env.BASE_URL,
  },
  cache: { cacheLocation: 'localStorage', storeAuthStateInCookie: false },
}

const LOGIN_REQUEST = { scopes: ['Files.ReadWrite', 'User.Read'] }
const GRAPH         = 'https://graph.microsoft.com/v1.0'
const FOLDER        = '/me/drive/root:/Apps/planner'

let _msal        = null
let _initialized = false

async function getMsal() {
  if (!CLIENT_ID) throw new Error('no-config')
  if (!_msal) _msal = new PublicClientApplication(MSAL_CONFIG)
  if (!_initialized) {
    await _msal.initialize()
    await _msal.handleRedirectPromise().catch(() => {})
    _initialized = true
  }
  return _msal
}

async function getToken() {
  const msal     = await getMsal()
  const accounts = msal.getAllAccounts()
  if (!accounts.length) throw new Error('not-signed-in')
  try {
    const r = await msal.acquireTokenSilent({ ...LOGIN_REQUEST, account: accounts[0] })
    return r.accessToken
  } catch (e) {
    if (e instanceof InteractionRequiredAuthError) {
      const r = await msal.acquireTokenPopup({ ...LOGIN_REQUEST, account: accounts[0] })
      return r.accessToken
    }
    throw e
  }
}

export function isConfigured() {
  return !!CLIENT_ID
}

export async function initAuth() {
  try {
    const msal     = await getMsal()
    const accounts = msal.getAllAccounts()
    return accounts[0] ?? null
  } catch {
    return null
  }
}

export async function signIn() {
  const msal   = await getMsal()
  const result = await msal.loginPopup(LOGIN_REQUEST)
  return result.account
}

export async function signOut() {
  const msal     = await getMsal()
  const accounts = msal.getAllAccounts()
  if (accounts.length) await msal.logoutPopup({ account: accounts[0] })
}

export async function readFile(name) {
  const token = await getToken()
  const r = await fetch(`${GRAPH}${FOLDER}/${name}:/content`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (r.status === 404) return null
  if (!r.ok) throw new Error(`Graph ${r.status}`)
  return r.json()
}

export async function writeFile(name, content) {
  const token = await getToken()
  const r = await fetch(`${GRAPH}${FOLDER}/${name}:/content`, {
    method:  'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(content, null, 2),
  })
  if (!r.ok) throw new Error(`Graph write ${r.status}`)
}
