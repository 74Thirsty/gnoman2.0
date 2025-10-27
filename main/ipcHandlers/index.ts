import type { IpcMain } from 'electron';
import keyringManager from '../../src/core/keyringManager';

export const registerIpcHandlers = (ipcMain: IpcMain) => {
  ipcMain.handle('keyring:list', async () => {
    const secrets = await keyringManager.list();
    return Object.keys(secrets).map((key) => ({ alias: key }));
  });

  ipcMain.handle('keyring:add', async (_event, payload: { alias: string; secret: string }) => {
    await keyringManager.set(payload.alias, payload.secret);
    return true;
  });

  ipcMain.handle('keyring:get', async (_event, payload: { alias: string }) => {
    return keyringManager.get(payload.alias);
  });

  ipcMain.handle('keyring:delete', async (_event, payload: { alias: string }) => {
    await keyringManager.delete(payload.alias);
    return true;
  });
};
