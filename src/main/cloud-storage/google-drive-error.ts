import { GoogleDriveErrorCode } from './google-drive.model'

export class GoogleDriveError extends Error {
  constructor(
    message: string,
    public readonly code: GoogleDriveErrorCode = GoogleDriveErrorCode.RequestFailed
  ) {
    super(message)
    this.name = 'GoogleDriveError'
  }
}
