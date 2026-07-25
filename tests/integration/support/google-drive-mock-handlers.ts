import { HttpResponse, http, type HttpHandler } from 'msw'
import { GOOGLE_DRIVE_API_BASE_URL } from '../../../src/main/cloud-storage/google-drive.model'
import {
  GOOGLE_TEST_IDS,
  googleDriveTestEnvironment,
  type GoogleTestAccountName
} from './google-drive-test-environment'

interface CreatePermissionBody {
  emailAddress?: string
  role?: string
  type?: string
}

export function createGoogleDriveMockHandlers(): HttpHandler[] {
  return [
    http.get(`${GOOGLE_DRIVE_API_BASE_URL}/files`, ({ request }) => {
      const accountName = requireAccount(request)
      if (!accountName) {
        return permissionDenied()
      }

      const files = googleDriveTestEnvironment.listWorldFiles(accountName)
      return files ? HttpResponse.json({ files }) : permissionDenied()
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
    })
  ]
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
