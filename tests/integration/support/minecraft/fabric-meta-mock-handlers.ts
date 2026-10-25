import { HttpResponse, http, type HttpHandler } from 'msw'
import type { FabricRuntime } from '../../../../src/shared/fabric'
import {
  FABRIC_META_URL,
  getFabricLauncherUrl
} from '../../../../src/main/server-setup/fabric-version-resolver'
import { TEST_MINECRAFT_VERSION } from './minecraft-download-mock-handlers'

export const TEST_FABRIC_RUNTIME: FabricRuntime = {
  loaderVersion: '0.17.2',
  installerVersion: '1.1.0'
}

export const LATEST_FABRIC_RUNTIME: FabricRuntime = {
  loaderVersion: '0.18.0',
  installerVersion: '1.2.0'
}

const ZIP_FILE_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04])
const TEST_FABRIC_LAUNCHER = Buffer.concat([ZIP_FILE_SIGNATURE, Buffer.from('fabric-launcher')])

let launcherDownloadCount = 0

export function getFabricLauncherDownloadCount(): number {
  return launcherDownloadCount
}

export function resetFabricLauncherDownloadCount(): void {
  launcherDownloadCount = 0
}

export function createFabricMetaMockHandlers(): HttpHandler[] {
  return [
    http.get(`${FABRIC_META_URL}/game`, () =>
      HttpResponse.json([{ version: TEST_MINECRAFT_VERSION, stable: true }])
    ),
    http.get(`${FABRIC_META_URL}/loader/${TEST_MINECRAFT_VERSION}`, () =>
      HttpResponse.json([
        { loader: { version: LATEST_FABRIC_RUNTIME.loaderVersion, stable: true } },
        { loader: { version: '0.18.0-beta.1', stable: false } },
        { loader: { version: TEST_FABRIC_RUNTIME.loaderVersion, stable: false } },
        { loader: { version: '0.11.7', stable: false } }
      ])
    ),
    http.get(`${FABRIC_META_URL}/installer`, () =>
      HttpResponse.json([
        { version: LATEST_FABRIC_RUNTIME.installerVersion, stable: true },
        { version: TEST_FABRIC_RUNTIME.installerVersion, stable: false }
      ])
    ),
    http.get(getFabricLauncherUrl(TEST_MINECRAFT_VERSION, TEST_FABRIC_RUNTIME), () => {
      launcherDownloadCount += 1
      return new HttpResponse(TEST_FABRIC_LAUNCHER)
    })
  ]
}
