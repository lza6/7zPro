"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
// Expose secure API to renderer process via contextBridge
// This replaces the insecure nodeIntegration: true approach
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    // Compression
    compress: (data) => electron_1.ipcRenderer.send('compress-start', data),
    // Extraction
    extract: (data) => electron_1.ipcRenderer.send('extract-start', data),
    // Progress listener with cleanup function (receives ProgressInfo)
    onProgress: (callback) => {
        const handler = (_event, value) => callback(value);
        electron_1.ipcRenderer.on('compress-progress', handler);
        return () => electron_1.ipcRenderer.removeListener('compress-progress', handler);
    },
    // Complete listener with cleanup function
    onComplete: (callback) => {
        const handler = () => callback();
        electron_1.ipcRenderer.on('compress-complete', handler);
        return () => electron_1.ipcRenderer.removeListener('compress-complete', handler);
    },
    // Error listener with cleanup function
    onError: (callback) => {
        const handler = (_event, err) => callback(err);
        electron_1.ipcRenderer.on('compress-error', handler);
        return () => electron_1.ipcRenderer.removeListener('compress-error', handler);
    },
    // Context menu file open listener
    onOpenDialog: (callback) => {
        const handler = (_event, path) => callback(path);
        electron_1.ipcRenderer.on('open-compression-dialog', handler);
        return () => electron_1.ipcRenderer.removeListener('open-compression-dialog', handler);
    },
    // Mini mode initialization listener (from right-click context menu)
    onMiniModeInit: (callback) => {
        const handler = (_event, path) => callback(path);
        electron_1.ipcRenderer.on('mini-mode-init', handler);
        return () => electron_1.ipcRenderer.removeListener('mini-mode-init', handler);
    },
    // Generic listener for various IPC events
    on: (channel, callback) => {
        const subscription = (_event, ...args) => callback(...args);
        electron_1.ipcRenderer.on(channel, subscription);
        return () => electron_1.ipcRenderer.removeListener(channel, subscription);
    },
    // Quit the application (for mini mode after compression)
    quitApp: () => electron_1.ipcRenderer.send('app-quit'),
    // Window controls
    windowControl: (action) => electron_1.ipcRenderer.send(`window-${action}`),
    // Register context menu
    registerMenu: () => electron_1.ipcRenderer.send('register-context-menu'),
    // Unregister context menu
    unregisterMenu: () => electron_1.ipcRenderer.send('unregister-context-menu'),
    // Get file statistics (async via invoke)
    getFileStat: (filePath) => electron_1.ipcRenderer.invoke('get-file-stat', filePath),
    // Cancel current task
    cancelTask: () => electron_1.ipcRenderer.send('task-cancel'),
    // Task cancelled event listener (cleanup completed, window can close)
    onTaskCancelled: (callback) => {
        const handler = () => callback();
        electron_1.ipcRenderer.on('task-cancelled', handler);
        return () => electron_1.ipcRenderer.removeListener('task-cancelled', handler);
    },
    // Toggle pause
    togglePauseTask: (paused) => electron_1.ipcRenderer.send('task-pause', paused),
    // Show task queue dialog
    showQueueDialog: (message) => electron_1.ipcRenderer.invoke('show-queue-dialog', message),
    // Get native file icon
    getFileIcon: (filePath) => electron_1.ipcRenderer.invoke('get-file-icon', filePath),
});
