import { HttpResponse, http, type HttpHandler } from 'msw'
import { GOOGLE_DRIVE_API_BASE_URL } from '../../../../src/main/cloud-storage/google-drive.model'
import {
  GOOGLE_TEST_IDS,
  googleDriveTestEnvironment,
  type GoogleTestAccountName
} from '../../../support/google-drive/google-drive-test-environment'

interface CreatePermissionBody {
  emailAddress?: string
  role?: string
  type?: string
}

interface CreateFileBody {
  mimeType?: string
  name?: string
  parents?: string[]
}

export function createGoogleDriveMockHandlers(): HttpHandler[] {
  return [
    http.get(`${GOOGLE_DRIVE_API_BASE_URL}/files`, ({ request }) => {
      const accountName = requireAccount(request)
      if (!accountName) {
        return permissionDenied()
      }

      const query = new URL(request.url).searchParams.get('q')
      const files = googleDriveTestEnvironment.listWorldFiles(
        accountName,
        getRequestedParentFolderId(query),
        getRequestedFileName(query)
      )
      return files ? HttpResponse.json({ files }) : permissionDenied()
    }),

    http.post(`${GOOGLE_DRIVE_API_BASE_URL}/files`, async ({ request }) => {
      const accountName = requireAccount(request)
      const body = (await request.json()) as CreateFileBody

      if (!accountName || !body.name || !body.mimeType) {
        return invalidRequest()
      }

      const file = googleDriveTestEnvironment.createFile(accountName, {
        mimeType: body.mimeType,
        name: body.name,
        parents: body.parents
      })

      return file ? HttpResponse.json(file) : permissionDenied()
    }),

    http.get(`${GOOGLE_DRIVE_API_BASE_URL}/files/:fileId/permissions`, ({ request }) => {
      const accountName = requireAccount(request)
      const permissions = accountName ? googleDriveTestEnvironment.listPermissions(accountName) : null

      return permissions ? HttpResponse.json({ permissions }) : permissionDenied()
    }),

    http.post(`${GOOGLE_DRIVE_API_BASE_URL}/files/:fileId/permissions`, async ({ params, request }) => {
      const accountName = requireAccount(request)
      const body = (await request.json()) as CreatePermissionBody
      const notificationEnabled = new URL(request.url).searchParams.get('sendNotificationEmail') !== 'false'

      if (
        params.fileId !== GOOGLE_TEST_IDS.folder ||
        !accountName ||
        body.type !== 'user' ||
        body.role !== 'writer' ||
        !body.emailAddress
      ) {
        return invalidRequest()
      }

      const permission = googleDriveTestEnvironment.createWriterPermission(
        accountName,
        body.emailAddress,
        notificationEnabled
      )

      return permission ? HttpResponse.json(permission) : permissionDenied()
    }),

    http.patch(
      `${GOOGLE_DRIVE_API_BASE_URL}/files/:fileId/permissions/:permissionId`,
      async ({ params, request }) => {
        const accountName = requireAccount(request)
        const body = (await request.json()) as { role?: string }
        const permission =
          params.fileId === GOOGLE_TEST_IDS.folder && accountName && body.role === 'writer'
            ? googleDriveTestEnvironment.updatePermissionToWriter(accountName, String(params.permissionId))
            : null

        return permission ? HttpResponse.json(permission) : permissionDenied()
      }
    ),

    http.delete(
      `${GOOGLE_DRIVE_API_BASE_URL}/files/:fileId/permissions/:permissionId`,
      ({ params, request }) => {
        const accountName = requireAccount(request)
        const wasDeleted =
          params.fileId === GOOGLE_TEST_IDS.folder &&
          Boolean(accountName) &&
          googleDriveTestEnvironment.deletePermission(
            accountName as GoogleTestAccountName,
            String(params.permissionId)
          )

        return wasDeleted ? new HttpResponse(null, { status: 204 }) : permissionDenied()
      }
    ),

    http.patch(`${GOOGLE_DRIVE_API_BASE_URL}/files/:fileId`, async ({ params, request }) => {
      const accountName = requireAccount(request)

      if (params.fileId !== GOOGLE_TEST_IDS.folder || accountName !== 'owner') {
        return permissionDenied()
      }

      const body = (await request.json()) as { writersCanShare?: boolean }
      if (typeof body.writersCanShare !== 'boolean') {
        return invalidRequest()
      }

      googleDriveTestEnvironment.writersCanShare = body.writersCanShare
      return HttpResponse.json(
        googleDriveTestEnvironment.getFileMetadata(accountName, GOOGLE_TEST_IDS.folder)
      )
    }),

    http.patch('https://www.googleapis.com/upload/drive/v3/files/:fileId', async ({ params, request }) => {
      const accountName = requireAccount(request)
      if (!accountName) {
        return permissionDenied()
      }

      const fileId = String(params.fileId)
      const contentType = request.headers.get('content-type')
      const content = contentType?.startsWith('application/json')
        ? await request.text()
        : new Uint8Array(await request.arrayBuffer())
      const keepRevisionForever = new URL(request.url).searchParams.get('keepRevisionForever') === 'true'
      const wasUploaded = googleDriveTestEnvironment.uploadFile(
        accountName,
        fileId,
        content,
        keepRevisionForever
      )

      return wasUploaded ? HttpResponse.json({ id: fileId }) : permissionDenied()
    }),

    http.get(`${GOOGLE_DRIVE_API_BASE_URL}/files/:fileId/revisions/:revisionId`, ({ params, request }) => {
      const accountName = requireAccount(request)
      if (!accountName || new URL(request.url).searchParams.get('alt') !== 'media') {
        return invalidRequest()
      }

      const content = googleDriveTestEnvironment.getFileContent(
        accountName,
        String(params.fileId),
        String(params.revisionId)
      )

      return content === null ? permissionDenied() : new HttpResponse(content)
    }),

    http.get(`${GOOGLE_DRIVE_API_BASE_URL}/files/:fileId/revisions`, ({ params, request }) => {
      const accountName = requireAccount(request)
      const revisions = accountName
        ? googleDriveTestEnvironment.listRevisions(accountName, String(params.fileId))
        : null

      return revisions ? HttpResponse.json({ revisions }) : permissionDenied()
    }),

    http.delete(`${GOOGLE_DRIVE_API_BASE_URL}/files/:fileId/revisions/:revisionId`, ({ params, request }) => {
      const accountName = requireAccount(request)
      const wasDeleted =
        Boolean(accountName) &&
        googleDriveTestEnvironment.deleteRevision(
          accountName as GoogleTestAccountName,
          String(params.fileId),
          String(params.revisionId)
        )

      return wasDeleted ? new HttpResponse(null, { status: 204 }) : permissionDenied()
    }),

    http.get(`${GOOGLE_DRIVE_API_BASE_URL}/files/:fileId`, ({ params, request }) => {
      const accountName = requireAccount(request)
      if (!accountName) {
        return permissionDenied()
      }

      const fileId = String(params.fileId)
      const requestUrl = new URL(request.url)

      if (requestUrl.searchParams.get('alt') === 'media') {
        const content = googleDriveTestEnvironment.getFileContent(accountName, fileId)
        return content === null ? permissionDenied() : new HttpResponse(content)
      }

      const file = googleDriveTestEnvironment.getFileMetadata(accountName, fileId)
      return file ? HttpResponse.json(file) : permissionDenied()
    }),

    http.delete(`${GOOGLE_DRIVE_API_BASE_URL}/files/:fileId`, ({ params, request }) => {
      const accountName = requireAccount(request)
      const wasDeleted =
        Boolean(accountName) &&
        googleDriveTestEnvironment.deleteFile(accountName as GoogleTestAccountName, String(params.fileId))

      return wasDeleted ? new HttpResponse(null, { status: 204 }) : permissionDenied()
    })
  ]
}

function getRequestedFileName(query: string | null): string | undefined {
  return query?.match(/name = '([^']+)'/)?.[1]
}

function getRequestedParentFolderId(query: string | null): string | undefined {
  return query?.match(/'([^']+)' in parents/)?.[1]
}

function requireAccount(request: Request): GoogleTestAccountName | null {
  return googleDriveTestEnvironment.resolveAccount(request)
}

function permissionDenied(): HttpResponse<{ error: { message: string } }> {
  return HttpResponse.json({ error: { message: 'File not found.' } }, { status: 404 })
}

function invalidRequest(): HttpResponse<{ error: { message: string } }> {
  return HttpResponse.json({ error: { message: 'Invalid request.' } }, { status: 400 })
}
