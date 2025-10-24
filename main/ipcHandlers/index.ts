import type { IpcMain } from 'electron';
import { KeyringManager } from '../keyring/KeyringManager';

const keyringManager = new KeyringManager();

export const registerIpcHandlers = (ipcMain: IpcMain) => {
  ipcMain.handle('keyring:list', async () => {
    return keyringManager.listEntries();
  });

  ipcMain.handle('keyring:add', async (_event, payload: { alias: string; secret: string }) => {
    await keyringManager.addEntry(payload.alias, payload.secret);
    return true;
  });

  ipcMain.handle('keyring:get', async (_event, payload: { alias: string }) => {
    return keyringManager.getEntry(payload.alias);
  });

  ipcMain.handle('keyring:delete', async (_event, payload: { alias: string }) => {
    await keyringManager.deleteEntry(payload.alias);
    return true;
  });
};
