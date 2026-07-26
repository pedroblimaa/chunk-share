import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import {
  GoogleDriveTestEnvironment,
  GOOGLE_TEST_ACCOUNTS,
  GOOGLE_TEST_IDS,
  type GoogleTestAccountName
} from '../../support/google-drive/google-drive-test-environment'

interface DriveRequestFailure {
  method: string
  pathname: string
  status: number
}

interface PermissionBody {
  emailAddress?: string
  role?: string
  type?: string
}

interface DriveFileBody {
  mimeType?: string
  name?: string
  parents?: string[]
}

export class GoogleDriveE2EMock {
  public readonly drive = new GoogleDriveTestEnvironment()

  private nextFailure: DriveRequestFailure | null = null
  private server: Server | null = null

  public async start(): Promise<void> {
    if (this.server) {
      return
    }

    this.drive.reset()
    this.server = createServer((request, response) => {
      void this.handleRequest(request, response)
    })

    await new Promise<void>((resolve, reject) => {
      this.server?.once('error', reject)
      this.server?.listen(0, '127.0.0.1', resolve)
    })
  }

  public async close(): Promise<void> {
    const server = this.server
    this.server = null
    this.nextFailure = null

    if (!server) {
      return
    }

    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }

  public get url(): string {
    if (!this.server) {
      throw new Error('The E2E Google Drive mock is not running.')
    }

    const address = this.server.address() as AddressInfo | null
    if (!address) {
      throw new Error('The E2E Google Drive mock has no listening address.')
    }

    return `http://127.0.0.1:${address.port}`
  }

  public failNextRequest(input: { method: string; pathname: string; status?: number }): void {
    this.nextFailure = {
      method: input.method.toUpperCase(),
      pathname: input.pathname,
      status: input.status ?? 500
    }
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const requestUrl = new URL(request.url ?? '/', this.url)
      const method = request.method?.toUpperCase() ?? 'GET'

      if (this.consumeFailure(method, requestUrl.pathname, response)) {
        return
      }

      if (requestUrl.pathname === '/test/picker') {
        await this.handlePicker(requestUrl, response)
        return
      }

      const accountName = resolveAccount(request)
      if (!accountName) {
        respondWithError(response, 401, 'Missing or invalid test authorization.')
        return
      }

      if (requestUrl.pathname === '/drive/v3/about' && method === 'GET') {
        respondWithJson(response, 200, {
          user: { emailAddress: GOOGLE_TEST_ACCOUNTS[accountName].session.player.email }
        })
        return
      }

      await this.handleDriveRequest(accountName, method, requestUrl, request, response)
    } catch (error) {
      respondWithError(response, 500, error instanceof Error ? error.message : 'Drive mock failed.')
    }
  }

  private consumeFailure(method: string, pathname: string, response: ServerResponse): boolean {
    if (!this.nextFailure || this.nextFailure.method !== method || this.nextFailure.pathname !== pathname) {
      return false
    }

    const failure = this.nextFailure
    this.nextFailure = null
    respondWithError(response, failure.status, 'Configured E2E Google Drive failure.')
    return true
  }

  private async handlePicker(requestUrl: URL, response: ServerResponse): Promise<void> {
    const accountName = toAccountName(requestUrl.searchParams.get('account'))
    const fileIds = requestUrl.searchParams.get('fileIds')?.split(',').filter(Boolean) ?? []

    if (!accountName) {
      respondWithError(response, 400, 'Picker request has an invalid test account.')
      return
    }

    try {
      await this.drive.authorizeGoogleDriveFilesForAccount(accountName, fileIds)
      respondWithJson(response, 200, { pickedFileIds: fileIds })
    } catch {
      respondWithJson(response, 403, { pickedFileIds: [] })
    }
  }

  private async handleDriveRequest(
    accountName: GoogleTestAccountName,
    method: string,
    requestUrl: URL,
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<void> {
    const path = requestUrl.pathname

    if (path === '/drive/v3/files' && method === 'GET') {
      const files = this.drive.listWorldFiles(
        accountName,
        getRequestedFileName(requestUrl.searchParams.get('q'))
      )
      files ? respondWithJson(response, 200, { files }) : respondNotFound(response)
      return
    }

    if (path === '/drive/v3/files' && method === 'POST') {
      const body = await readJsonBody<DriveFileBody>(request)
      const file =
        body.name && body.mimeType
          ? this.drive.createFile(accountName, {
              mimeType: body.mimeType,
              name: body.name,
              parents: body.parents
            })
          : null
      file ? respondWithJson(response, 200, file) : respondNotFound(response)
      return
    }

    const permissionMatch = path.match(/^\/drive\/v3\/files\/([^/]+)\/permissions(?:\/([^/]+))?$/)
    if (permissionMatch) {
      await this.handlePermissionRequest(
        accountName,
        method,
        decodeURIComponent(permissionMatch[1]),
        permissionMatch[2] ? decodeURIComponent(permissionMatch[2]) : null,
        requestUrl,
        request,
        response
      )
      return
    }

    const revisionMatch = path.match(/^\/drive\/v3\/files\/([^/]+)\/revisions(?:\/([^/]+))?$/)
    if (revisionMatch) {
      this.handleRevisionRequest(
        accountName,
        method,
        decodeURIComponent(revisionMatch[1]),
        revisionMatch[2] ? decodeURIComponent(revisionMatch[2]) : null,
        requestUrl,
        response
      )
      return
    }

    const uploadMatch = path.match(/^\/upload\/drive\/v3\/files\/([^/]+)$/)
    if (uploadMatch && method === 'PATCH') {
      const fileId = decodeURIComponent(uploadMatch[1])
      const body = await readBody(request)
      const content = request.headers['content-type']?.startsWith('application/json')
        ? body.toString('utf8')
        : new Uint8Array(body)
      const uploaded = this.drive.uploadFile(
        accountName,
        fileId,
        content,
        requestUrl.searchParams.get('keepRevisionForever') === 'true'
      )
      uploaded ? respondWithJson(response, 200, { id: fileId }) : respondNotFound(response)
      return
    }

    const fileMatch = path.match(/^\/drive\/v3\/files\/([^/]+)$/)
    if (fileMatch) {
      await this.handleFileRequest(
        accountName,
        method,
        decodeURIComponent(fileMatch[1]),
        requestUrl,
        request,
        response
      )
      return
    }

    respondWithError(response, 404, `Unhandled Drive mock request: ${method} ${path}`)
  }

  private async handlePermissionRequest(
    accountName: GoogleTestAccountName,
    method: string,
    fileId: string,
    permissionId: string | null,
    requestUrl: URL,
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<void> {
    if (fileId !== GOOGLE_TEST_IDS.folder) {
      respondNotFound(response)
      return
    }

    if (method === 'GET' && !permissionId) {
      const permissions = this.drive.listPermissions(accountName)
      permissions ? respondWithJson(response, 200, { permissions }) : respondNotFound(response)
      return
    }

    if (method === 'POST' && !permissionId) {
      const body = await readJsonBody<PermissionBody>(request)
      const permission =
        body.emailAddress && body.role === 'writer' && body.type === 'user'
          ? this.drive.createWriterPermission(
              accountName,
              body.emailAddress,
              requestUrl.searchParams.get('sendNotificationEmail') !== 'false'
            )
          : null
      permission ? respondWithJson(response, 200, permission) : respondNotFound(response)
      return
    }

    if (method === 'DELETE' && permissionId) {
      const deleted = this.drive.deletePermission(accountName, permissionId)
      deleted ? respondWithoutContent(response) : respondNotFound(response)
      return
    }

    if (method === 'PATCH' && permissionId) {
      const body = await readJsonBody<{ role?: string }>(request)
      const permission =
        body.role === 'writer' ? this.drive.updatePermissionToWriter(accountName, permissionId) : null
      permission ? respondWithJson(response, 200, permission) : respondNotFound(response)
      return
    }

    respondWithError(response, 400, 'Unsupported permission request.')
  }

  private handleRevisionRequest(
    accountName: GoogleTestAccountName,
    method: string,
    fileId: string,
    revisionId: string | null,
    requestUrl: URL,
    response: ServerResponse
  ): void {
    if (method === 'GET' && !revisionId) {
      const revisions = this.drive.listRevisions(accountName, fileId)
      revisions ? respondWithJson(response, 200, { revisions }) : respondNotFound(response)
      return
    }

    if (method === 'GET' && revisionId && requestUrl.searchParams.get('alt') === 'media') {
      const content = this.drive.getFileContent(accountName, fileId, revisionId)
      content === null ? respondNotFound(response) : respondWithContent(response, content)
      return
    }

    if (method === 'DELETE' && revisionId) {
      const deleted = this.drive.deleteRevision(accountName, fileId, revisionId)
      deleted ? respondWithoutContent(response) : respondNotFound(response)
      return
    }

    respondWithError(response, 400, 'Unsupported revision request.')
  }

  private async handleFileRequest(
    accountName: GoogleTestAccountName,
    method: string,
    fileId: string,
    requestUrl: URL,
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<void> {
    if (method === 'GET' && requestUrl.searchParams.get('alt') === 'media') {
      const content = this.drive.getFileContent(accountName, fileId)
      content === null ? respondNotFound(response) : respondWithContent(response, content)
      return
    }

    if (method === 'GET') {
      const file = this.drive.getFileMetadata(accountName, fileId)
      file ? respondWithJson(response, 200, file) : respondNotFound(response)
      return
    }

    if (method === 'PATCH' && fileId === GOOGLE_TEST_IDS.folder) {
      const body = await readJsonBody<{ writersCanShare?: boolean }>(request)
      if (accountName !== 'owner' || typeof body.writersCanShare !== 'boolean') {
        respondNotFound(response)
        return
      }

      this.drive.writersCanShare = body.writersCanShare
      respondWithJson(response, 200, this.drive.getFileMetadata(accountName, fileId))
      return
    }

    if (method === 'DELETE') {
      const deleted = this.drive.deleteFile(accountName, fileId)
      deleted ? respondWithoutContent(response) : respondNotFound(response)
      return
    }

    respondWithError(response, 400, 'Unsupported file request.')
  }
}

function resolveAccount(request: IncomingMessage): GoogleTestAccountName | null {
  const authorization = request.headers.authorization
  const token = authorization?.match(/^Bearer (.+)$/)?.[1]

  return (
    (Object.entries(GOOGLE_TEST_ACCOUNTS).find(([, account]) => account.token === token)?.[0] as
      | GoogleTestAccountName
      | undefined) ?? null
  )
}

function toAccountName(value: string | null): GoogleTestAccountName | null {
  return value === 'owner' || value === 'friend' || value === 'uninvited' ? value : null
}

function getRequestedFileName(query: string | null): string | undefined {
  return query?.match(/name = '([^']+)'/)?.[1]
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  return JSON.parse((await readBody(request)).toString('utf8')) as T
}

function readBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.once('end', () => resolve(Buffer.concat(chunks)))
    request.once('error', reject)
  })
}

function respondWithJson(response: ServerResponse, status: number, value: unknown): void {
  respondWithContent(response, JSON.stringify(value), status, 'application/json')
}

function respondWithContent(
  response: ServerResponse,
  content: string | Uint8Array,
  status = 200,
  contentType = 'application/octet-stream'
): void {
  response.writeHead(status, {
    Connection: 'close',
    'Content-Type': contentType
  })
  response.end(content)
}

function respondWithoutContent(response: ServerResponse): void {
  response.writeHead(204, { Connection: 'close' })
  response.end()
}

function respondNotFound(response: ServerResponse): void {
  respondWithError(response, 404, 'File not found.')
}

function respondWithError(response: ServerResponse, status: number, message: string): void {
  respondWithJson(response, status, { error: { message } })
}
