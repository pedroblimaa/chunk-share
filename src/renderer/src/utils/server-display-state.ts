import type { ServerDisplayState } from '../../../shared/dashboard'

export function loadServerDisplayState(): Promise<ServerDisplayState> {
  return window.chunkShare.dashboard.getSnapshot()
}
