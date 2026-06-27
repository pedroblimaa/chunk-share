import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerAuthIpcHandlers } from './ipc/auth-ipc'
import { registerDashboardIpcHandlers } from './ipc/dashboard-ipc'
import { registerServerRuntimeIpcHandlers } from './ipc/server-runtime-ipc'
import { registerServerSetupIpcHandlers } from './ipc/server-setup-ipc'
import { registerStorageIpcHandlers } from './ipc/storage-ipc'
import { isServerActiveStatus } from '../shared/server-runtime'
import {
  getServerRuntimeSnapshot,
  initializeServerRuntime,
  shutdownMinecraftServer
} from './server-runtime/server-runtime-service'

let shutdownIsRunning = false
let shutdownIsComplete = false

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerDashboardIpcHandlers()
  registerAuthIpcHandlers()
  registerStorageIpcHandlers()
  registerServerSetupIpcHandlers()
  registerServerRuntimeIpcHandlers()

  createWindow()
  void initializeServerRuntime()

  app.on('activate', function () {
    // macOS keeps the app alive after closing all windows.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', (event) => {
  if (shutdownIsComplete || !isServerActiveStatus(getServerRuntimeSnapshot().status)) {
    return
  }

  event.preventDefault()

  if (shutdownIsRunning) {
    return
  }

  shutdownIsRunning = true

  void shutdownMinecraftServer()
    .then(() => {
      shutdownIsComplete = true
      app.quit()
    })
    .catch((error: unknown) => {
      shutdownIsRunning = false
      console.error('Unable to finish Minecraft server shutdown.', error)
    })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
