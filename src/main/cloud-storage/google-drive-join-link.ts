import { GoogleDriveError } from './google-drive-error'

const JOIN_LINK_PROTOCOL = 'chunkshare:'
const JOIN_LINK_HOST = 'join'
const JOIN_LINK_VERSION = '1'
const GOOGLE_DRIVE_FOLDER_ID_PATTERN = /^[A-Za-z0-9_-]+$/
const JOIN_LINK_PARAMETERS = new Set(['folderId', 'v'])

let pendingJoinLink: string | null = null

export function parseGoogleDriveJoinLink(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new GoogleDriveError('Paste a valid ChunkShare join link.')
  }

  const joinUrl = parseUrl(value.trim())
  if (!isGoogleDriveJoinRoute(joinUrl) || joinUrl.username || joinUrl.password || joinUrl.hash) {
    throw new GoogleDriveError('This ChunkShare join link is invalid.')
  }

  const parameterNames = [...joinUrl.searchParams.keys()]
  if (parameterNames.some((name) => !JOIN_LINK_PARAMETERS.has(name))) {
    throw new GoogleDriveError('This ChunkShare join link contains unsupported information.')
  }

  const versions = joinUrl.searchParams.getAll('v')
  const folderIds = joinUrl.searchParams.getAll('folderId')
  const folderId = folderIds[0]

  if (
    versions.length !== 1 ||
    versions[0] !== JOIN_LINK_VERSION ||
    folderIds.length !== 1 ||
    !folderId ||
    folderId.length > 200 ||
    !GOOGLE_DRIVE_FOLDER_ID_PATTERN.test(folderId)
  ) {
    throw new GoogleDriveError('This ChunkShare join link is invalid or unsupported.')
  }

  return folderId
}

export function findGoogleDriveJoinLink(argumentsList: string[]): string | null {
  return argumentsList.find(isGoogleDriveJoinLinkCandidate) ?? null
}

export function setPendingGoogleDriveJoinLink(value: string): boolean {
  if (!isGoogleDriveJoinLinkCandidate(value)) {
    return false
  }

  pendingJoinLink = value
  return true
}

export function consumePendingGoogleDriveJoinLink(): string | null {
  const joinLink = pendingJoinLink
  pendingJoinLink = null

  return joinLink
}

function isGoogleDriveJoinLinkCandidate(value: string): boolean {
  try {
    return isGoogleDriveJoinRoute(new URL(value))
  } catch {
    return false
  }
}

function isGoogleDriveJoinRoute(joinUrl: URL): boolean {
  return (
    joinUrl.protocol === JOIN_LINK_PROTOCOL &&
    joinUrl.hostname === JOIN_LINK_HOST &&
    (joinUrl.pathname === '' || joinUrl.pathname === '/')
  )
}

function parseUrl(value: string): URL {
  try {
    return new URL(value)
  } catch {
    throw new GoogleDriveError('This ChunkShare join link is invalid.')
  }
}
