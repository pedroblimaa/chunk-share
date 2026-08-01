import { ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron'
import type { IpcEventContract, IpcInvokeContract } from '../../shared/ipc-channels'

type IpcHandler<TChannel extends keyof IpcInvokeContract> = (
  event: IpcMainInvokeEvent,
  ...args: IpcInvokeContract[TChannel]['args']
) => IpcInvokeContract[TChannel]['result'] | Promise<IpcInvokeContract[TChannel]['result']>

export function handleIpc<TChannel extends keyof IpcInvokeContract>(
  channel: TChannel,
  handler: IpcHandler<TChannel>
): void {
  ipcMain.handle(channel, handler)
}

export function sendIpcEvent<TChannel extends keyof IpcEventContract>(
  webContents: WebContents,
  channel: TChannel,
  ...args: IpcEventContract[TChannel]
): void {
  webContents.send(channel, ...args)
}
