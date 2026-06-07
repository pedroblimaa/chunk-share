import type { ChunkShareApi } from './index'

declare global {
  interface Window {
    chunkShare: ChunkShareApi
  }
}
