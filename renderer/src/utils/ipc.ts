export const ipc = <T = unknown>(channel: string, payload?: unknown): Promise<T> => {
  const invoke = window.gnoman?.invoke;
  if (!invoke) throw new Error('IPC unavailable — run inside Electron');
  return invoke<T>(channel, payload);
};
