import { ipcRenderer } from 'electron'
import type { IpcEventContract, IpcInvokeContract } from '../shared/ipc-channels'

export function invokeIpc<TChannel extends keyof IpcInvokeContract>(
  channel: TChannel,
  ...args: IpcInvokeContract[TChannel]['args']
): Promise<IpcInvokeContract[TChannel]['result']> {
  return ipcRenderer.invoke(channel, ...args)
}

export function subscribeToIpcEvent<TChannel extends keyof IpcEventContract>(
  channel: TChannel,
  listener: (...args: IpcEventContract[TChannel]) => void
): () => void {
  const ipcListener = (_event: Electron.IpcRendererEvent, ...args: IpcEventContract[TChannel]): void => {
    listener(...args)
  }

  ipcRenderer.on(channel, ipcListener)

  return () => ipcRenderer.removeListener(channel, ipcListener)
}
