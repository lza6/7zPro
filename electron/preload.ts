import { contextBridge, ipcRenderer } from 'electron';

// Expose secure API to renderer process via contextBridge
// This replaces the insecure nodeIntegration: true approach
contextBridge.exposeInMainWorld('electronAPI', {
    // Compression
    compress: (data: { files: string[]; archivePath: string; options: any; totalBytes?: number }) =>
        ipcRenderer.send('compress-start', data),

    // Extraction
    extract: (data: { archivePath: string; outputPath: string }) =>
        ipcRenderer.send('extract-start', data),

    // Progress listener with cleanup function (receives ProgressInfo)
    onProgress: (callback: (info: { percent: number; currentFile?: string; processedBytes?: number; speed?: number }) => void) => {
        const handler = (_event: Electron.IpcRendererEvent, value: any) => callback(value);
        ipcRenderer.on('compress-progress', handler);
        return () => ipcRenderer.removeListener('compress-progress', handler);
    },

    // Complete listener with cleanup function
    onComplete: (callback: () => void) => {
        const handler = () => callback();
        ipcRenderer.on('compress-complete', handler);
        return () => ipcRenderer.removeListener('compress-complete', handler);
    },

    // Error listener with cleanup function
    onError: (callback: (err: string) => void) => {
        const handler = (_event: Electron.IpcRendererEvent, err: string) => callback(err);
        ipcRenderer.on('compress-error', handler);
        return () => ipcRenderer.removeListener('compress-error', handler);
    },

    // Context menu file open listener
    onOpenDialog: (callback: (path: string) => void) => {
        const handler = (_event: Electron.IpcRendererEvent, path: string) => callback(path);
        ipcRenderer.on('open-compression-dialog', handler);
        return () => ipcRenderer.removeListener('open-compression-dialog', handler);
    },

    // Mini mode initialization listener (from right-click context menu)
    onMiniModeInit: (callback: (path: string) => void) => {
        const handler = (_event: Electron.IpcRendererEvent, path: string) => callback(path);
        ipcRenderer.on('mini-mode-init', handler);
        return () => ipcRenderer.removeListener('mini-mode-init', handler);
    },

    // Generic listener for various IPC events
    on: (channel: string, callback: (...args: any[]) => void) => {
        const subscription = (_event: any, ...args: any[]) => callback(...args);
        ipcRenderer.on(channel, subscription);
        return () => ipcRenderer.removeListener(channel, subscription);
    },

    // Quit the application (for mini mode after compression)
    quitApp: () => ipcRenderer.send('app-quit'),

    // Window controls
    windowControl: (action: 'minimize' | 'maximize' | 'close') =>
        ipcRenderer.send(`window-${action}`),

    // Register context menu
    registerMenu: () => ipcRenderer.send('register-context-menu'),

    // Unregister context menu
    unregisterMenu: () => ipcRenderer.send('unregister-context-menu'),

    // Get file statistics (async via invoke)
    getFileStat: (filePath: string): Promise<{ size: number; isDirectory: boolean }> =>
        ipcRenderer.invoke('get-file-stat', filePath),

    // Cancel current task
    cancelTask: () => ipcRenderer.send('task-cancel'),

    // Task cancelled event listener (cleanup completed, window can close)
    onTaskCancelled: (callback: () => void) => {
        const handler = () => callback();
        ipcRenderer.on('task-cancelled', handler);
        return () => ipcRenderer.removeListener('task-cancelled', handler);
    },

    // Toggle pause
    togglePauseTask: (paused: boolean) => ipcRenderer.send('task-pause', paused),

    // Show task queue dialog
    showQueueDialog: (message: string): Promise<'queue' | 'parallel' | 'cancel'> =>
        ipcRenderer.invoke('show-queue-dialog', message),

    // Get native file icon
    getFileIcon: (filePath: string): Promise<string> =>
        ipcRenderer.invoke('get-file-icon', filePath),
});
