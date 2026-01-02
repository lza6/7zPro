// TypeScript type definitions for the secure electronAPI exposed via contextBridge

// Progress info from compression/extraction
interface ProgressInfo {
    percent: number;
    currentFile?: string;
    processedBytes?: number;
    speed?: number; // bytes per second
}

interface ElectronAPI {
    // Compression
    compress: (data: { files: string[]; archivePath: string; options: any; totalBytes?: number }) => void;

    // Extraction
    extract: (data: { archivePath: string; outputPath: string }) => void;

    // Event listeners (return cleanup functions)
    onProgress: (callback: (info: ProgressInfo) => void) => () => void;
    onComplete: (callback: () => void) => () => void;
    onError: (callback: (err: string) => void) => () => void;
    onOpenDialog: (callback: (path: string) => void) => () => void;
    onMiniModeInit: (callback: (path: string) => void) => () => void;
    on: (channel: string, callback: (...args: any[]) => void) => () => void;

    // App control
    quitApp: () => void;

    // Window controls
    windowControl: (action: 'minimize' | 'maximize' | 'close') => void;

    // Context menu registration
    registerMenu: () => void;
    unregisterMenu: () => void;

    // File utilities
    getFileStat: (filePath: string) => Promise<{ size: number; isDirectory: boolean }>;
    getFileIcon: (filePath: string) => Promise<string>;

    // Task management
    cancelTask: () => void;
    onTaskCancelled: (callback: () => void) => () => void;
    togglePauseTask: (paused: boolean) => void;
    showQueueDialog: (message: string) => Promise<'queue' | 'parallel' | 'cancel'>;
}

declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}

export { ProgressInfo };
