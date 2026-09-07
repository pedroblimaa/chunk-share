const MAX_IMAGE_LOAD_ATTEMPTS = 2
const RETRY_QUERY_PARAMETER = 'chunkshare-avatar-retry'

export function getAvatarImageSource(imageUrl: string | null | undefined, attempt: number): string | null {
  if (!imageUrl || attempt >= MAX_IMAGE_LOAD_ATTEMPTS) {
    return null
  }

  if (attempt === 0) {
    return imageUrl
  }

  try {
    const retryUrl = new URL(imageUrl)
    retryUrl.searchParams.set(RETRY_QUERY_PARAMETER, String(attempt))
    return retryUrl.toString()
  } catch {
    return null
  }
}

export function getNextAvatarImageAttempt(attempt: number): number {
  return Math.min(attempt + 1, MAX_IMAGE_LOAD_ATTEMPTS)
}
