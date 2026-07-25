import { createHash, randomUUID } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, relative, resolve } from 'node:path'
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import type { GoogleAuthTokens } from '../../../src/main/auth/auth-model'
import { GOOGLE_AUTH_TOKENS_FILE_NAME } from '../../../src/main/auth/auth-constants'
import { DEFAULT_LOCAL_STATE } from '../../../src/main/storage/core/support/storage-defaults'
import type { Player } from '../../../src/shared/domain'

const require = createRequire(__filename)
const PROJECT_ROOT = process.cwd()
const ELECTRON_EXECUTABLE_PATH = require('electron') as string
const VERSION_MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'
const VERSION_METADATA_URL = 'https://minecraft.e2e/version.json'
const SERVER_JAR_URL = 'https://minecraft.e2e/server.jar'
const SERVER_JAR_CONTENT = Buffer.from('chunkshare-e2e-server')

export const E2E_MINECRAFT_VERSION = '1.21.8-e2e'
export const E2E_SERVER_NAME = 'E2E Survival'
export const E2E_WORLD_DATA = 'chunkshare-e2e-world'

const E2E_PLAYER: Player = {
  id: 'e2e-player',
  displayName: 'E2E Player',
  email: 'e2e@example.com',
  avatarUrl: null,
  avatarInitials: 'EP'
}

const E2E_AUTH_TOKENS: GoogleAuthTokens = {
  accessToken: 'e2e-access-token',
  refreshToken: 'e2e-refresh-token',
  expiresAt: '2099-01-01T00:00:00.000Z',
  scope: 'openid email profile'
}

export interface ElectronE2EPaths {
  controlFile: string
  localStateFile: string
  root: string
  serverFolder: string
  userDataFolder: string
  worldFile: string
}

export interface LaunchChunkShareE2EAppOptions {
  authenticated?: boolean
}

export interface ChunkShareE2EApp {
  electronApp: ElectronApplication
  page: Page
  paths: ElectronE2EPaths
  close: () => Promise<void>
}

export async function launchChunkShareE2EApp(
  options: LaunchChunkShareE2EAppOptions = {}
): Promise<ChunkShareE2EApp> {
  const paths = createE2EPaths()
  const authenticated = options.authenticated ?? true
  await prepareE2EStorage(paths, authenticated)

  const electronApp = await electron.launch({
    args: [`--user-data-dir=${paths.userDataFolder}`, '--password-store=basic', PROJECT_ROOT],
    chromiumSandbox: false,
    cwd: PROJECT_ROOT,
    env: createE2EEnvironment(paths),
    executablePath: ELECTRON_EXECUTABLE_PATH
  })

  try {
    const page = await electronApp.firstWindow()
    await configureE2ESafeStorage(electronApp)
    await installMainProcessMocks(electronApp, paths)

    if (authenticated) {
      await seedAuthTokens(electronApp)
      await page.reload()
    } else {
      await installGoogleLoginMocks(electronApp)
    }

    return {
      electronApp,
      page,
      paths,
      close: createCloseApp(electronApp, paths.root)
    }
  } catch (error) {
    await electronApp.close().catch(() => undefined)
    await rm(paths.root, { force: true, recursive: true })
    throw error
  }
}

function createE2EPaths(): ElectronE2EPaths {
  const root = resolve(PROJECT_ROOT, '.test-data', 'e2e', `${process.pid}-${randomUUID()}`)
  const storageFolder = join(root, 'storage')

  return {
    controlFile: join(storageFolder, 'control.json'),
    localStateFile: join(root, 'localState.json'),
    root,
    serverFolder: join(root, 'server'),
    userDataFolder: join(root, 'user-data'),
    worldFile: join(storageFolder, 'world.zip')
  }
}

async function prepareE2EStorage(paths: ElectronE2EPaths, authenticated: boolean): Promise<void> {
  await mkdir(paths.root, { recursive: true })
  await writeFile(
    paths.localStateFile,
    JSON.stringify(
      {
        ...DEFAULT_LOCAL_STATE,
        player: authenticated ? E2E_PLAYER : null
      },
      null,
      2
    )
  )
}

function createE2EEnvironment(paths: ElectronE2EPaths): Record<string, string> {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)
  )
  const relativeRoot = relative(PROJECT_ROOT, paths.root)

  delete environment.ELECTRON_RUN_AS_NODE

  return {
    ...environment,
    CHUNK_SHARE_LOCAL_STORAGE_FOLDER: join(relativeRoot, 'storage'),
    CHUNK_SHARE_SERVER_FOLDER: join(relativeRoot, 'server'),
    CHUNK_SHARE_SERVER_BACKUPS_FOLDER: join(relativeRoot, 'backups'),
    CHUNK_SHARE_LOCAL_STATE_FILE: join(relativeRoot, 'localState.json'),
    CHUNK_SHARE_CLOUD_STORAGE_SETTINGS_FILE: join(relativeRoot, 'cloudStorageSettings.json'),
    CHUNKSHARE_GOOGLE_CLIENT_ID: 'e2e-google-client-id',
    CHUNKSHARE_GOOGLE_CLIENT_SECRET: 'e2e-google-client-secret'
  }
}

async function configureE2ESafeStorage(electronApp: ElectronApplication): Promise<void> {
  await electronApp.evaluate(({ safeStorage }) => {
    if (process.platform === 'linux') {
      safeStorage.setUsePlainTextEncryption(true)
    }
  })
}

async function installMainProcessMocks(
  electronApp: ElectronApplication,
  paths: ElectronE2EPaths
): Promise<void> {
  await electronApp.evaluate(
    async (_electronModule, fixture) => {
      const childProcess = process.getBuiltinModule('node:child_process')
      const events = process.getBuiltinModule('node:events')
      const fileSystem = process.getBuiltinModule('node:fs')
      const path = process.getBuiltinModule('node:path')
      const stream = process.getBuiltinModule('node:stream')

      globalThis.fetch = async (input): Promise<Response> => {
        const requestUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url

        if (requestUrl === fixture.versionManifestUrl) {
          return Response.json({
            versions: [
              {
                id: fixture.minecraftVersion,
                type: 'release',
                url: fixture.versionMetadataUrl
              }
            ]
          })
        }

        if (requestUrl === fixture.versionMetadataUrl) {
          return Response.json({
            downloads: {
              server: {
                sha1: fixture.serverJarSha1,
                size: fixture.serverJarSize,
                url: fixture.serverJarUrl
              }
            }
          })
        }

        if (requestUrl === fixture.serverJarUrl) {
          return new Response(Buffer.from(fixture.serverJarBase64, 'base64'))
        }

        throw new Error(`Unexpected E2E main-process request: ${requestUrl}`)
      }

      Object.defineProperty(childProcess, 'spawn', {
        configurable: true,
        value: (_command: string, _args: readonly string[], options: { cwd?: string }) => {
          const serverProcess = new events.EventEmitter()
          const stdout = new stream.PassThrough()
          const stderr = new stream.PassThrough()
          const stdin = new stream.Writable({
            write(chunk, _encoding, callback) {
              const command = chunk.toString()

              if (command === 'save-all flush\n') {
                const serverFolder = options.cwd ?? fixture.serverFolder
                const worldFolder = path.join(serverFolder, 'world')
                fileSystem.mkdirSync(worldFolder, { recursive: true })
                fileSystem.writeFileSync(path.join(worldFolder, 'level.dat'), fixture.worldData, 'utf8')
              }

              if (command === 'stop\n') {
                queueMicrotask(() => serverProcess.emit('close', 0))
              }

              callback()
            }
          })

          Object.assign(serverProcess, {
            connected: false,
            exitCode: null,
            killed: false,
            kill: () => {
              queueMicrotask(() => serverProcess.emit('close', 1))
              return true
            },
            pid: 12345,
            signalCode: null,
            spawnargs: [],
            spawnfile: 'java',
            stderr,
            stdin,
            stdio: [stdin, stdout, stderr],
            stdout
          })

          queueMicrotask(() => {
            stdout.write('[Server thread/INFO]: Done (1.000s)! For help, type "help"\n')
          })

          return serverProcess
        }
      })
    },
    {
      minecraftVersion: E2E_MINECRAFT_VERSION,
      serverFolder: paths.serverFolder,
      serverJarBase64: SERVER_JAR_CONTENT.toString('base64'),
      serverJarSha1: createHash('sha1').update(SERVER_JAR_CONTENT).digest('hex'),
      serverJarSize: SERVER_JAR_CONTENT.length,
      serverJarUrl: SERVER_JAR_URL,
      versionManifestUrl: VERSION_MANIFEST_URL,
      versionMetadataUrl: VERSION_METADATA_URL,
      worldData: E2E_WORLD_DATA
    }
  )
}

async function installGoogleLoginMocks(electronApp: ElectronApplication): Promise<void> {
  await electronApp.evaluate(
    async ({ shell }, fixture) => {
      const http = process.getBuiltinModule('node:http')
      const module = process.getBuiltinModule('node:module')
      const path = process.getBuiltinModule('node:path')
      const requireFromApp = module.createRequire(path.join(process.cwd(), 'package.json'))
      const { OAuth2Client } = requireFromApp('google-auth-library')

      Object.defineProperty(OAuth2Client.prototype, 'getToken', {
        configurable: true,
        value: async () => ({
          tokens: {
            access_token: fixture.accessToken,
            expiry_date: Date.parse(fixture.expiresAt),
            refresh_token: fixture.refreshToken,
            scope: fixture.scope
          }
        })
      })

      Object.defineProperty(OAuth2Client.prototype, 'fetch', {
        configurable: true,
        value: async (requestUrl: string) => {
          if (requestUrl === fixture.userInfoEndpoint) {
            return {
              data: {
                email: fixture.player.email,
                name: fixture.player.displayName,
                picture: fixture.player.avatarUrl,
                sub: fixture.player.id
              },
              status: 200
            }
          }

          if (requestUrl === fixture.driveAboutEndpoint) {
            return {
              data: {
                user: {
                  emailAddress: fixture.player.email
                }
              },
              status: 200
            }
          }

          throw new Error(`Unexpected E2E Google request: ${requestUrl}`)
        }
      })

      Object.defineProperty(shell, 'openExternal', {
        configurable: true,
        value: async (authorizationUrl: string) => {
          const googleAuthorizationUrl = new URL(authorizationUrl)
          const redirectUri = googleAuthorizationUrl.searchParams.get('redirect_uri')
          const state = googleAuthorizationUrl.searchParams.get('state')

          if (!redirectUri || !state) {
            throw new Error('Google authorization URL is missing the E2E callback parameters.')
          }

          const callbackUrl = new URL(redirectUri)
          callbackUrl.searchParams.set('code', fixture.authorizationCode)
          callbackUrl.searchParams.set('state', state)

          await new Promise<void>((resolve, reject) => {
            const request = http.get(callbackUrl, (response) => {
              response.resume()
              response.once('end', resolve)
            })
            request.once('error', reject)
          })
        }
      })
    },
    {
      accessToken: E2E_AUTH_TOKENS.accessToken,
      authorizationCode: 'e2e-authorization-code',
      driveAboutEndpoint: 'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)',
      expiresAt: E2E_AUTH_TOKENS.expiresAt,
      player: E2E_PLAYER,
      refreshToken: E2E_AUTH_TOKENS.refreshToken,
      scope: E2E_AUTH_TOKENS.scope,
      userInfoEndpoint: 'https://openidconnect.googleapis.com/v1/userinfo'
    }
  )
}

async function seedAuthTokens(electronApp: ElectronApplication): Promise<void> {
  await electronApp.evaluate(
    async ({ app, safeStorage }, fixture) => {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('Electron safeStorage is unavailable for the E2E session.')
      }

      const fileSystem = process.getBuiltinModule('node:fs')
      const path = process.getBuiltinModule('node:path')
      const tokenFilePath = path.join(app.getPath('userData'), fixture.tokenFileName)
      const encryptedTokens = safeStorage.encryptString(JSON.stringify(fixture.tokens)).toString('base64')

      await fileSystem.promises.mkdir(path.dirname(tokenFilePath), { recursive: true })
      await fileSystem.promises.writeFile(tokenFilePath, JSON.stringify({ encryptedTokens }, null, 2), 'utf8')
    },
    {
      tokenFileName: GOOGLE_AUTH_TOKENS_FILE_NAME,
      tokens: E2E_AUTH_TOKENS
    }
  )
}

function createCloseApp(electronApp: ElectronApplication, root: string): () => Promise<void> {
  let isClosed = false

  return async () => {
    if (isClosed) {
      return
    }

    isClosed = true

    try {
      await electronApp.close()
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  }
}
