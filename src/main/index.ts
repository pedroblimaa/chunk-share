import { app, shell, BrowserWindow } from 'electron'
import { join, resolve } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { DRIVE_JOIN_LINK_AVAILABLE_CHANNEL } from '../shared/ipc-channels'
import {
  findGoogleDriveJoinLink,
  setPendingGoogleDriveJoinLink
} from './cloud-storage/google-drive-join-link'
import { registerIpcHandlers } from './ipc/register-ipc-handlers'
import { sendIpcEvent } from './ipc/typed-ipc'

const CHUNKSHARE_PROTOCOL = 'chunkshare'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1100,
    minWidth: 1100,
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
  mainWindow = window

  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null
    }
  })

  window.on('ready-to-show', () => {
    window.show()
  })

  window.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerDeepLinkEvents(): void {
  app.on('second-instance', (_, commandLine) => {
    openJoinLink(findGoogleDriveJoinLink(commandLine))
  })

  app.on('open-url', (event, url) => {
    event.preventDefault()
    openJoinLink(url)
  })
}

function registerProtocolClient(): void {
  const developmentAppPath = process.argv[1]

  if (process.defaultApp && developmentAppPath) {
    app.setAsDefaultProtocolClient(CHUNKSHARE_PROTOCOL, process.execPath, [resolve(developmentAppPath)])
    return
  }

  app.setAsDefaultProtocolClient(CHUNKSHARE_PROTOCOL)
}

function openJoinLink(joinLink: string | null): void {
  if (!joinLink || !setPendingGoogleDriveJoinLink(joinLink)) {
    return
  }

  if (!mainWindow) {
    if (app.isReady()) {
      createWindow()
    }

    return
  }

  sendIpcEvent(mainWindow.webContents, DRIVE_JOIN_LINK_AVAILABLE_CHANNEL)

  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }

  mainWindow.show()
  mainWindow.focus()
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  registerDeepLinkEvents()
  openJoinLink(findGoogleDriveJoinLink(process.argv))

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.electron')
    registerProtocolClient()

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    registerIpcHandlers()

    createWindow()

    app.on('activate', function () {
      // macOS keeps the app alive after closing all windows.
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
