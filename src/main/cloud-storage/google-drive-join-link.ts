import { GoogleDriveError } from './google-drive-error'
import type { GoogleDriveWorldReference } from '../../shared/cloud-storage.model'

const JOIN_LINK_PROTOCOL = 'chunkshare:'
const JOIN_LINK_HOST = 'join'
const JOIN_LINK_VERSION = '1'
const GOOGLE_DRIVE_ID_PATTERN = /^[A-Za-z0-9_-]+$/
const JOIN_LINK_PARAMETERS = new Set(['controlFileId', 'folderId', 'v', 'worldFileId'])

export type GoogleDriveJoinTarget = GoogleDriveWorldReference

let pendingJoinLink: string | null = null

export function parseGoogleDriveJoinLink(value: unknown): GoogleDriveJoinTarget {
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
  const controlFileIds = joinUrl.searchParams.getAll('controlFileId')
  const worldFileIds = joinUrl.searchParams.getAll('worldFileId')
  const folderId = folderIds[0]
  const controlFileId = controlFileIds[0]
  const worldFileId = worldFileIds[0]

  if (
    versions.length !== 1 ||
    versions[0] !== JOIN_LINK_VERSION ||
    folderIds.length !== 1 ||
    controlFileIds.length !== 1 ||
    worldFileIds.length !== 1 ||
    !isGoogleDriveId(folderId) ||
    !isGoogleDriveId(controlFileId) ||
    !isGoogleDriveId(worldFileId) ||
    new Set([folderId, controlFileId, worldFileId]).size !== 3
  ) {
    throw new GoogleDriveError('This ChunkShare join link is invalid or unsupported.')
  }

  return { folderId, controlFileId, worldFileId }
}

export function createGoogleDriveJoinLink(target: GoogleDriveJoinTarget): string {
  const searchParams = new URLSearchParams({
    v: JOIN_LINK_VERSION,
    folderId: target.folderId,
    controlFileId: target.controlFileId,
    worldFileId: target.worldFileId
  })

  return `chunkshare://join?${searchParams.toString()}`
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

function isGoogleDriveId(value: string | undefined): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 200 &&
    GOOGLE_DRIVE_ID_PATTERN.test(value)
  )
}
