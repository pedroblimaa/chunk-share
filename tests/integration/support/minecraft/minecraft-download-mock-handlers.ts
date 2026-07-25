import { createHash } from 'crypto'
import { HttpResponse, http, type HttpHandler } from 'msw'

export const TEST_MINECRAFT_VERSION = '1.21.8'
export const TEST_MINECRAFT_METADATA_URL = 'https://minecraft.test/versions/1.21.8.json'

const TEST_MINECRAFT_JAR_URL = 'https://minecraft.test/server.jar'
const TEST_MINECRAFT_JAR = Buffer.from('integration-test-minecraft-server')

export function createMinecraftDownloadMockHandlers(): HttpHandler[] {
  return [
    http.get(TEST_MINECRAFT_METADATA_URL, () =>
      HttpResponse.json({
        downloads: {
          server: {
            sha1: createHash('sha1').update(TEST_MINECRAFT_JAR).digest('hex'),
            size: TEST_MINECRAFT_JAR.length,
            url: TEST_MINECRAFT_JAR_URL
          }
        }
      })
    ),
    http.get(TEST_MINECRAFT_JAR_URL, () => new HttpResponse(TEST_MINECRAFT_JAR))
  ]
}
