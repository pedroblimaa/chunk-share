import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    main: {
      define: {
        'process.env.CHUNKSHARE_GOOGLE_CLIENT_ID': JSON.stringify(env.CHUNKSHARE_GOOGLE_CLIENT_ID ?? ''),
        'process.env.CHUNKSHARE_GOOGLE_CLIENT_SECRET': JSON.stringify(
          env.CHUNKSHARE_GOOGLE_CLIENT_SECRET ?? ''
        )
      }
    },
    preload: {},
    renderer: {
      resolve: {
        alias: {
          '@renderer': resolve('src/renderer/src')
        }
      },
      plugins: [react()]
    }
  }
})
