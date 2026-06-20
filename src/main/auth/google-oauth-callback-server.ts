import { createServer, type Server, type ServerResponse } from 'http'
import checkIconSvg from './callback-page/oauth-callback-check.svg?raw'
import errorIconSvg from './callback-page/oauth-callback-error.svg?raw'
import callbackPageHtmlTemplate from './callback-page/oauth-callback-page.html?raw'
import {
  GOOGLE_CALLBACK_ERROR_CODES,
  GOOGLE_CALLBACK_FAILURES,
  GOOGLE_CALLBACK_PATH,
  GOOGLE_CALLBACK_SUCCESS_PAGE,
  GOOGLE_CALLBACK_TIMEOUT_MS
} from './auth-constants'
import { AuthError } from './auth-error'
import {
  AuthErrorCode,
  type GoogleAuthorizationCodeResult,
  type GoogleAuthorizationServer,
  type GoogleAuthorizationServerInput,
  type GoogleCallbackRequestHandlerInput,
  type GoogleCallbackResult
} from './auth-model'

export async function createGoogleAuthorizationServer({
  expectedState
}: GoogleAuthorizationServerInput): Promise<GoogleAuthorizationServer> {
  const { callbackServer, waitForCode } = createCallbackServer(expectedState)

  await startCallbackServer(callbackServer)

  return {
    redirectUri: getRedirectUri(callbackServer),
    waitForCode,
    close: () => closeCallbackServer(callbackServer)
  }
}

function createCallbackServer(expectedState: string): {
  callbackServer: Server
  waitForCode: Promise<GoogleAuthorizationCodeResult>
} {
  let callbackServer: Server

  const waitForCode = new Promise<GoogleAuthorizationCodeResult>((resolve, reject) => {
    const timeout = createCallbackTimeout(reject)

    callbackServer = createServer((request, response) => {
      handleGoogleCallbackRequest({
        callbackServer,
        expectedState,
        reject,
        request,
        resolve,
        response,
        timeout
      })
    })
  })

  return {
    callbackServer: callbackServer!,
    waitForCode
  }
}

function startCallbackServer(callbackServer: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    callbackServer.listen(0, '127.0.0.1', resolve)
    callbackServer.once('error', reject)
  })
}

function closeCallbackServer(callbackServer: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    callbackServer.close((error) => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })
}

function createCallbackTimeout(reject: (error: Error) => void): NodeJS.Timeout {
  return setTimeout(() => {
    reject(new AuthError('Google sign-in timed out. Try signing in again.', AuthErrorCode.TimedOut))
  }, GOOGLE_CALLBACK_TIMEOUT_MS)
}

function getRedirectUri(callbackServer: Server): string {
  const address = callbackServer.address()

  if (!address || typeof address === 'string') {
    throw new AuthError(
      'Unable to start Google sign-in callback server.',
      AuthErrorCode.InvalidCallback
    )
  }

  return `http://127.0.0.1:${address.port}${GOOGLE_CALLBACK_PATH}`
}

function handleGoogleCallbackRequest(input: GoogleCallbackRequestHandlerInput): void {
  const requestUrl = new URL(input.request.url ?? '/', getRedirectUri(input.callbackServer))
  const callbackResult = parseGoogleCallback(requestUrl, input.expectedState)

  if (callbackResult.type === 'ignored') {
    respondNotFound(input.response)
    return
  }

  clearTimeout(input.timeout)

  if (callbackResult.type === 'failure') {
    respondWithCallbackPage(input.response, callbackResult.pageTitle, callbackResult.pageMessage)
    input.reject(new AuthError(callbackResult.errorMessage, callbackResult.errorCode))
    return
  }

  respondWithCallbackPage(
    input.response,
    GOOGLE_CALLBACK_SUCCESS_PAGE.pageTitle,
    GOOGLE_CALLBACK_SUCCESS_PAGE.pageMessage
  )

  input.resolve({
    code: callbackResult.code,
    redirectUri: getRedirectUri(input.callbackServer)
  })
}

function respondNotFound(response: ServerResponse): void {
  response.writeHead(404)
  response.end()
}

function respondWithCallbackPage(
  response: ServerResponse,
  pageTitle: string,
  pageMessage: string
): void {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  response.end(createCallbackPage(pageTitle, pageMessage))
}

function parseGoogleCallback(requestUrl: URL, expectedState: string): GoogleCallbackResult {
  if (requestUrl.pathname !== GOOGLE_CALLBACK_PATH) {
    return {
      type: 'ignored'
    }
  }

  const error = requestUrl.searchParams.get('error')
  if (error) {
    return createFailureCallbackResult('cancelled', error)
  }

  if (requestUrl.searchParams.get('state') !== expectedState) {
    return createFailureCallbackResult('invalid-state')
  }

  const code = requestUrl.searchParams.get('code')
  if (!code) {
    return createFailureCallbackResult('missing-code')
  }

  return {
    type: 'success',
    code
  }
}

function createFailureCallbackResult(
  reason: keyof typeof GOOGLE_CALLBACK_FAILURES,
  googleError?: string
): GoogleCallbackResult {
  const failure = GOOGLE_CALLBACK_FAILURES[reason]

  return {
    type: 'failure',
    pageTitle: failure.pageTitle,
    pageMessage: failure.pageMessage,
    errorCode: GOOGLE_CALLBACK_ERROR_CODES[reason],
    errorMessage: googleError ? `${failure.errorMessage} (${googleError})` : failure.errorMessage
  }
}

function createCallbackPage(title: string, message: string): string {
  const isSuccess = title === GOOGLE_CALLBACK_SUCCESS_PAGE.pageTitle
  const replacements: Record<string, string> = {
    HINT: isSuccess
      ? 'ChunkShare is finishing sign-in in the app.'
      : 'You can try signing in again from ChunkShare.',
    ICON_SVG: isSuccess ? checkIconSvg : errorIconSvg,
    MESSAGE: escapeHtml(message),
    META_ICON_SVG: checkIconSvg,
    META_TEXT: isSuccess ? 'Google account verified' : 'Sign-in was not completed',
    STATE_CLASS: isSuccess ? 'is-success' : 'is-error',
    TITLE: escapeHtml(title)
  }

  return Object.entries(replacements).reduce(
    (page, [token, value]) => page.replaceAll(`{{${token}}}`, value),
    callbackPageHtmlTemplate
  )
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
