import type { ElectronApplication } from '@playwright/test'
import type { GoogleAuthTokens } from '../../../src/main/auth/auth-model'
import type { Player } from '../../../src/shared/domain'
import type { GoogleTestAccountName } from '../../support/google-drive/google-drive-test-environment'

const GOOGLE_USER_INFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo'
const E2E_AUTHORIZATION_CODE = 'e2e-authorization-code'

interface InstallGoogleE2EMocksInput {
  accountName: GoogleTestAccountName | null
  driveMockUrl: string | null
  player: Player
  tokens: GoogleAuthTokens
}

interface GoogleRequestOptions {
  body?: unknown
  data?: unknown
  headers?: Record<string, string>
  method?: string
  responseType?: string
}

export async function installGoogleE2EMocks(
  electronApp: ElectronApplication,
  input: InstallGoogleE2EMocksInput
): Promise<void> {
  await installGoogleNetworkMock(electronApp, input)
  await installGoogleOAuthClientMock(electronApp, input.tokens)
  await installGoogleAuthorizationMock(electronApp, input)
}

function installGoogleNetworkMock(
  electronApp: ElectronApplication,
  input: InstallGoogleE2EMocksInput
): Promise<void> {
  return electronApp.evaluate(
    async (_electronModule, fixture) => {
      const nativeFetch = globalThis.fetch

      globalThis.fetch = async (requestInput, requestOptions): Promise<Response> => {
        const requestUrl = getRequestUrl(requestInput)
        const parsedRequestUrl = new URL(requestUrl)

        if (parsedRequestUrl.href === fixture.userInfoEndpoint) {
          return Response.json({
            email: fixture.player.email,
            name: fixture.player.displayName,
            picture: fixture.player.avatarUrl,
            sub: fixture.player.id
          })
        }

        if (fixture.driveMockUrl && parsedRequestUrl.origin === 'https://www.googleapis.com') {
          return forwardDriveRequest(requestInput, requestOptions, parsedRequestUrl)
        }

        if (fixture.driveMockUrl && parsedRequestUrl.origin === fixture.driveMockUrl) {
          return nativeFetch(requestInput, requestOptions)
        }

        throw new Error(`Unexpected E2E main-process request: ${requestUrl}`)
      }

      function getRequestUrl(requestInput: RequestInfo | URL): string {
        return typeof requestInput === 'string'
          ? requestInput
          : requestInput instanceof URL
            ? requestInput.href
            : requestInput.url
      }

      async function forwardDriveRequest(
        requestInput: RequestInfo | URL,
        requestOptions: RequestInit | undefined,
        requestUrl: URL
      ): Promise<Response> {
        const request = new Request(requestInput, requestOptions)
        const body =
          request.method === 'GET' || request.method === 'HEAD'
            ? undefined
            : new Uint8Array(await request.arrayBuffer())
        const proxyUrl = `${fixture.driveMockUrl}${requestUrl.pathname}${requestUrl.search}`

        return nativeFetch(proxyUrl, {
          ...(body ? { body } : {}),
          headers: request.headers,
          method: request.method
        })
      }
    },
    {
      driveMockUrl: input.driveMockUrl,
      player: input.player,
      userInfoEndpoint: GOOGLE_USER_INFO_ENDPOINT
    }
  )
}

function installGoogleOAuthClientMock(
  electronApp: ElectronApplication,
  tokens: GoogleAuthTokens
): Promise<void> {
  return electronApp.evaluate(async (_electronModule, fixture) => {
    const module = process.getBuiltinModule('node:module')
    const path = process.getBuiltinModule('node:path')
    const stream = process.getBuiltinModule('node:stream')
    const requireFromApp = module.createRequire(path.join(process.cwd(), 'package.json'))
    const { OAuth2Client } = requireFromApp('google-auth-library')

    Object.defineProperty(OAuth2Client.prototype, 'getToken', {
      configurable: true,
      value: async () => ({
        tokens: {
          access_token: fixture.accessToken,
          expiry_date: Date.parse(fixture.expiresAt),
          refresh_token: fixture.refreshToken,
          scope: fixture.scope
        }
      })
    })

    Object.defineProperty(OAuth2Client.prototype, 'fetch', {
      configurable: true,
      value: (requestUrl: string, options?: GoogleRequestOptions) => runGoogleRequest(requestUrl, options)
    })

    Object.defineProperty(OAuth2Client.prototype, 'request', {
      configurable: true,
      value: (options: GoogleRequestOptions & { url: string }) => runGoogleRequest(options.url, options)
    })

    async function runGoogleRequest(
      requestUrl: string,
      options: GoogleRequestOptions = {}
    ): Promise<{ data: unknown; headers: Headers; status: number }> {
      const body = await readRequestBody(options.body ?? options.data)
      const headers = new Headers(options.headers)
      headers.set('Authorization', `Bearer ${fixture.accessToken}`)

      const response = await fetch(requestUrl, {
        ...(body ? { body } : {}),
        headers,
        method: options.method ?? 'GET'
      })
      const responseData = await readResponseData(response, options.responseType)

      if (!response.ok) {
        const error = new Error(`Google request failed with HTTP ${response.status}.`) as Error & {
          response?: { data: unknown; status: number }
        }
        error.response = { data: responseData, status: response.status }
        throw error
      }

      return {
        data: responseData,
        headers: response.headers,
        status: response.status
      }
    }

    async function readRequestBody(body: unknown): Promise<BodyInit | undefined> {
      if (body === undefined || body === null) {
        return undefined
      }

      if (typeof body === 'string') {
        return body
      }

      if (body instanceof Uint8Array) {
        return new Blob([Uint8Array.from(body)])
      }

      if (
        typeof body === 'object' &&
        Symbol.asyncIterator in body &&
        typeof body[Symbol.asyncIterator] === 'function'
      ) {
        const chunks: Uint8Array[] = []
        for await (const chunk of body as AsyncIterable<Uint8Array | string>) {
          chunks.push(Buffer.from(chunk))
        }
        return new Blob([Uint8Array.from(Buffer.concat(chunks))])
      }

      throw new Error('Unsupported E2E Google request body.')
    }

    async function readResponseData(response: Response, responseType?: string): Promise<unknown> {
      if (response.status === 204) {
        return null
      }

      if (responseType === 'stream') {
        return stream.Readable.from(Buffer.from(await response.arrayBuffer()))
      }

      return response.headers.get('content-type')?.includes('application/json')
        ? response.json()
        : Buffer.from(await response.arrayBuffer())
    }
  }, tokens)
}

function installGoogleAuthorizationMock(
  electronApp: ElectronApplication,
  input: InstallGoogleE2EMocksInput
): Promise<void> {
  return electronApp.evaluate(
    async ({ shell }, fixture) => {
      const http = process.getBuiltinModule('node:http')

      Object.defineProperty(shell, 'openExternal', {
        configurable: true,
        value: completeAuthorization
      })

      async function completeAuthorization(authorizationUrl: string): Promise<void> {
        const googleAuthorizationUrl = new URL(authorizationUrl)
        const redirectUri = googleAuthorizationUrl.searchParams.get('redirect_uri')
        const state = googleAuthorizationUrl.searchParams.get('state')

        if (!redirectUri || !state) {
          throw new Error('Google authorization URL is missing the E2E callback parameters.')
        }

        const callbackUrl = new URL(redirectUri)
        await applyPickerResult(googleAuthorizationUrl, callbackUrl)

        if (!callbackUrl.searchParams.has('error')) {
          callbackUrl.searchParams.set('code', fixture.authorizationCode)
        }
        callbackUrl.searchParams.set('state', state)

        await sendAuthorizationCallback(callbackUrl)
      }

      async function applyPickerResult(authorizationUrl: URL, callbackUrl: URL): Promise<void> {
        const requestedFileIds =
          authorizationUrl.searchParams.get('file_ids')?.split(',').filter(Boolean) ?? []

        if (!requestedFileIds.length) {
          return
        }

        if (!fixture.driveMockUrl || !fixture.accountName) {
          throw new Error('The E2E Picker requires a Drive mock and a named Google account.')
        }

        const pickerUrl = new URL('/test/picker', fixture.driveMockUrl)
        pickerUrl.searchParams.set('account', fixture.accountName)
        pickerUrl.searchParams.set('fileIds', requestedFileIds.join(','))
        const pickerResponse = await fetch(pickerUrl)

        if (!pickerResponse.ok) {
          callbackUrl.searchParams.set('error', 'access_denied')
          return
        }

        const pickerResult = (await pickerResponse.json()) as { pickedFileIds: string[] }
        callbackUrl.searchParams.set('picked_file_ids', pickerResult.pickedFileIds.join(','))
      }

      function sendAuthorizationCallback(callbackUrl: URL): Promise<void> {
        return new Promise((resolve, reject) => {
          const request = http.get(callbackUrl, (response) => {
            response.resume()
            response.once('end', resolve)
          })
          request.once('error', reject)
        })
      }
    },
    {
      accountName: input.accountName,
      authorizationCode: E2E_AUTHORIZATION_CODE,
      driveMockUrl: input.driveMockUrl
    }
  )
}
