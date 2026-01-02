import { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage, screen } from 'electron';
import path from 'path';
import fs from 'fs';
import { compressFiles, extractFiles, cancelCurrentTask, togglePauseTask, setOnCancelCallback } from './compression';
import { registerContextMenu } from './registry';
import logger from './logger';

// Reliable path resolution
const ROOT = app.getAppPath();
const DIST = path.join(ROOT, 'dist');
const PRELOAD = path.join(ROOT, 'dist-electron', 'preload.js');
const PUBLIC = app.isPackaged ? path.join(process.resourcesPath, 'app.asar.unpacked', 'public') : path.join(ROOT, 'public');
// Fallback to dist if not in unpacked (some builds might bundle it)
const getIconPath = () => {
    const p1 = path.join(PUBLIC, 'icon.png');
    if (fs.existsSync(p1)) return p1;
    const p2 = path.join(DIST, 'icon.png');
    if (fs.existsSync(p2)) return p2;
    return path.join(ROOT, 'public', 'icon.png'); // Dev fallback
};

// Log environment info for debugging
logger.info('App Startup Info', {
    isPackaged: app.isPackaged,
    ROOT,
    DIST,
    PRELOAD,
    argv: process.argv,
    cwd: process.cwd()
});

let win: BrowserWindow | null;
let miniWin: BrowserWindow | null = null;
let tray: Tray | null = null;
let isTaskRunning = false;

// Task Queue System
const taskQueue: Array<() => void> = [];
let activeTasks = 0;
const MAX_CONCURRENT_TASKS = 2;

function runNextTask() {
    if (taskQueue.length > 0 && activeTasks < MAX_CONCURRENT_TASKS) {
        const task = taskQueue.shift();
        if (task) {
            activeTasks++;
            task();
        }
    }
}

// Ensure clean exit
app.on('quit', () => {
    logger.info('Application quitting, cleaning up all 7z processes...');
    // Cancel any running task first
    cancelCurrentTask();

    // Kill any zombie 7z processes (belt and suspenders)
    if (process.platform === 'win32') {
        try {
            require('child_process').execSync('taskkill /f /im 7za.exe /t', { stdio: 'ignore' });
            logger.info('Cleaned up all 7za.exe processes on quit');
        } catch {
            // Ignore error if no process found
        }
    }
});

// Periodic zombie process cleanup (every 30 seconds while task is running)
let zombieCleanupInterval: NodeJS.Timeout | null = null;

function startZombieCleanup() {
    if (zombieCleanupInterval) return;
    zombieCleanupInterval = setInterval(() => {
        if (!isTaskRunning && process.platform === 'win32') {
            // Only cleanup when no task is running (in case of orphaned processes)
            try {
                const result = require('child_process').execSync('tasklist /fi "imagename eq 7za.exe" /fo csv /nh', { encoding: 'utf8' });
                if (result.includes('7za.exe')) {
                    logger.warn('Found orphaned 7za.exe processes, cleaning up...');
                    require('child_process').execSync('taskkill /f /im 7za.exe', { stdio: 'ignore' });
                }
            } catch {
                // Ignore
            }
        }
    }, 30000);
}

function stopZombieCleanup() {
    if (zombieCleanupInterval) {
        clearInterval(zombieCleanupInterval);
        zombieCleanupInterval = null;
    }
}

// Mode detection
const isMiniMode = process.argv.some(arg =>
    arg === '--mini' || arg.startsWith('--mini') ||
    arg === '--extract' || arg.startsWith('--extract')
);

// Mini mode window for right-click compression dialog
function createMiniWindow(filePath: string): void {
    // Get screen dimensions to center the window
    const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
    const windowWidth = 520;
    const windowHeight = 400;

    miniWin = new BrowserWindow({
        width: windowWidth,
        height: windowHeight,
        minWidth: 400,
        minHeight: 350,
        x: Math.floor((screenWidth - windowWidth) / 2),
        y: Math.floor((screenHeight - windowHeight) / 2),
        frame: false, // No system title bar or menu
        transparent: false,
        backgroundColor: '#ffffff',
        hasShadow: true,
        alwaysOnTop: false,
        skipTaskbar: false,
        resizable: true,
        minimizable: true,
        maximizable: false,
        autoHideMenuBar: true, // Hide menu bar
        show: false,
        title: '7zPro - 快速压缩',
        icon: getIconPath(),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            preload: PRELOAD,
        },
    });

    // Remove menu completely for mini mode
    miniWin.setMenu(null);
    miniWin.once('ready-to-show', () => {
        miniWin?.show();
    });

    // Store file path to send after window loads
    const targetPath = filePath;

    miniWin.webContents.on('did-finish-load', () => {
        // Tell renderer to show mini compression dialog mode
        miniWin?.webContents.send('mini-mode-init', targetPath);
        logger.info('Mini window loaded', { filePath });
    });

    // Detect mode
    const isExtract = process.argv.some(arg => arg === '--extract');
    const isExtractSub = process.argv.some(arg => arg === '--extract-sub');

    let mode = 'compress';
    if (isExtract) mode = 'extract';
    if (isExtractSub) mode = 'extract-sub';

    const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
    if (!app.isPackaged && VITE_DEV_SERVER_URL) {
        miniWin.loadURL(`${VITE_DEV_SERVER_URL}?mini=true&mode=${mode}`).catch(() => {
            miniWin?.loadFile(path.join(DIST, 'index.html'), { query: { mini: 'true', mode } });
        });
    } else {
        miniWin.loadFile(path.join(DIST, 'index.html'), { query: { mini: 'true', mode } });
    }

    // Close app when mini window closes
    miniWin.on('closed', () => {
        miniWin = null;
        if (!isTaskRunning) app.quit();
    });
}

// Main full-sized window
function createWindow() {
    win = new BrowserWindow({
        width: 1100,
        height: 750,
        minWidth: 900,
        minHeight: 600,
        frame: false,
        backgroundColor: '#ffffff',
        show: false, // Don't show until ready
        title: '7zPro',
        icon: getIconPath(),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            preload: PRELOAD,
        },
    });

    win.once('ready-to-show', () => {
        win?.show();
        if (!app.isPackaged) {
            win?.webContents.openDevTools();
        }
    });

    // Handle load failures
    win.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
        logger.error('Main window load failed', { errorCode, errorDescription, validatedURL });

        // If it was trying to load the dev server, fallback to local file
        if (validatedURL.startsWith('http')) {
            logger.info('HTTP load failed, falling back to local file');
            win?.loadFile(path.join(DIST, 'index.html')).catch(e => logger.error('Fallback loadFile failed', e));
        }
    });

    win.webContents.on('did-finish-load', () => {
        logger.info('Main window did-finish-load');
    });

    // Smart Loading
    const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

    if (!app.isPackaged && VITE_DEV_SERVER_URL) {
        logger.info('Loading from dev server', { VITE_DEV_SERVER_URL });
        win.loadURL(VITE_DEV_SERVER_URL).catch(() => {
            logger.info('Dev server unreachable, loading from dist');
            win?.loadFile(path.join(DIST, 'index.html'));
        });
    } else {
        const indexPath = path.join(DIST, 'index.html');
        logger.info('Loading from local file', { indexPath });
        win.loadFile(indexPath).catch(err => {
            logger.error('Failed to load local index.html', err);
        });
    }

    // Handle close event - show tray if task is running
    win.on('close', (e) => {
        if (isTaskRunning) {
            e.preventDefault();
            const choice = dialog.showMessageBoxSync(win!, {
                type: 'question',
                buttons: ['最小化到托盘', '强制退出', '取消'],
                defaultId: 0,
                cancelId: 2,
                title: '任务正在进行中',
                message: '压缩/解压任务正在进行中，您要如何处理？',
            });

            if (choice === 0) {
                // Minimize to tray
                win?.hide();
                createTray();
            } else if (choice === 1) {
                // Force quit
                cancelCurrentTask();
                isTaskRunning = false;
                win?.destroy();
            }
            // choice === 2: cancel, do nothing
        }
    });
}

function createTray() {
    if (tray) return;

    const iconPath = getIconPath();
    const icon = nativeImage.createFromPath(iconPath);
    tray = new Tray(icon.resize({ width: 16, height: 16 }));

    const contextMenu = Menu.buildFromTemplate([
        {
            label: '显示主窗口',
            click: () => {
                win?.show();
                win?.focus();
            }
        },
        { type: 'separator' },
        {
            label: '退出',
            click: () => {
                if (isTaskRunning) {
                    const choice = dialog.showMessageBoxSync({
                        type: 'warning',
                        buttons: ['取消任务并退出', '取消'],
                        defaultId: 1,
                        title: '任务进行中',
                        message: '后台任务正在进行中，确定要退出吗？',
                    });
                    if (choice === 0) {
                        cancelCurrentTask();
                        app.quit();
                    }
                } else {
                    app.quit();
                }
            }
        },
    ]);

    tray.setToolTip('7zPro - 后台压缩中...');
    tray.setContextMenu(contextMenu);

    tray.on('double-click', () => {
        win?.show();
        win?.focus();
    });
}

app.on('window-all-closed', () => {
    if (!isTaskRunning) {
        win = null;
        if (process.platform !== 'darwin') {
            app.quit();
        }
    }
});

process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', { message: error.message, stack: error.stack });
    dialog.showErrorBox('Application Error', `An error occurred: ${error.message}\n${error.stack}`);
});

// Parse command line arguments for files
function parseFileArgs(argv: string[]): string[] {
    const files: string[] = [];
    for (const arg of argv) {
        // Skip electron/node executables and flags
        if (arg.startsWith('--') || arg.startsWith('-')) continue;
        if (arg.includes('electron.exe') || arg.includes('electron.cmd')) continue;
        if (arg === process.execPath) continue;
        if (arg.endsWith('.js') && arg.includes('dist-electron')) continue;

        // Check if it's a valid file/directory path
        try {
            if (fs.existsSync(arg)) {
                files.push(arg);
            }
        } catch {
            // Ignore invalid paths
        }
    }
    return files;
}

// Single instance handling - ONLY for normal mode
// Mini mode should always create independent windows
if (isMiniMode) {
    // Mini mode - NO single instance lock, create independent window
    app.whenReady().then(() => {
        const files = parseFileArgs(process.argv);
        if (files.length > 0) {
            createMiniWindow(files[0]);
            logger.info('Application started in mini mode', { version: app.getVersion(), file: files[0] });
        } else {
            dialog.showErrorBox('7zPro', '未指定要压缩的文件');
            app.quit();
        }
    });
} else {
    // Normal mode - use single instance lock
    const gotTheLock = app.requestSingleInstanceLock();

    if (!gotTheLock) {
        app.quit();
    } else {
        app.on('second-instance', (_event, commandLine, _workingDirectory) => {
            // Check if second instance is mini mode
            const isMiniCommand = commandLine.some(arg =>
                arg === '--mini' || arg === '--extract' || arg === '--extract-sub'
            );

            if (isMiniCommand) {
                // Create mini window for this request
                const files = parseFileArgs(commandLine);
                if (files.length > 0) {
                    createMiniWindow(files[0]);
                }
            } else {
                // Normal second instance - focus main window
                if (win) {
                    if (win.isMinimized()) win.restore();
                    win.focus();

                    const files = parseFileArgs(commandLine);
                    if (files.length > 0) {
                        for (const filePath of files) {
                            win.webContents.send('open-compression-dialog', filePath);
                        }
                    }
                }
            }
        });

        app.whenReady().then(() => {
            createWindow();

            const files = parseFileArgs(process.argv);
            if (files.length > 0) {
                setTimeout(() => {
                    if (win && !win.isDestroyed()) {
                        for (const filePath of files) {
                            win.webContents.send('open-compression-dialog', filePath);
                        }
                    }
                }, 1500);
            }

            logger.info('Application started', { version: app.getVersion() });
        });
    }
}

// ============== IPC Handlers ==============

// Compression
// Compression
ipcMain.on('compress-start', (event, { files, archivePath, options, totalBytes }) => {
    const sender = event.sender;

    const task = () => {
        isTaskRunning = true;
        logger.info('Compression task started', { files: files.length, archivePath, options, totalBytes });

        compressFiles({
            files,
            archivePath,
            totalBytes,
            options,
            onProgress: (info) => {
                if (!sender.isDestroyed()) {
                    sender.send('compress-progress', info);
                    // Update taskbar progress - 安全访问窗口
                    try {
                        const win = BrowserWindow.fromWebContents(sender);
                        if (win && !win.isDestroyed()) {
                            win.setProgressBar(info.percent / 100);
                            if (tray) {
                                tray.setToolTip(`7zPro - ${info.percent}% - ${info.currentFile || 'Processing...'}`);
                            }
                        }
                    } catch (e) {
                        // 窗口已销毁，忽略进度更新
                        logger.warn('Window destroyed during progress update, ignoring');
                    }
                }
            },
            onError: (error) => {
                // Task finished (error)
                activeTasks--;
                if (activeTasks === 0) {
                    isTaskRunning = false;
                    try {
                        const win = BrowserWindow.fromWebContents(sender);
                        if (win && !win.isDestroyed()) win.setProgressBar(-1);
                    } catch (e) {
                        // 窗口已销毁
                    }
                }

                logger.error('Compression error', error);
                if (!sender.isDestroyed()) {
                    sender.send('compress-error', error);
                    // Update taskbar progress to error state
                    try {
                        const win = BrowserWindow.fromWebContents(sender);
                        if (win && !win.isDestroyed()) {
                            win.setProgressBar(1, { mode: 'error' });
                            // 闪烁窗口提示错误
                            win.flashFrame(true);
                            setTimeout(() => {
                                try { if (!win.isDestroyed()) win.flashFrame(false); } catch { }
                            }, 3000);
                        }
                    } catch (e) {
                        // 窗口已销毁
                    }
                }

                runNextTask();
            },
            onSuccess: () => {
                // Task finished (success)
                activeTasks--;
                if (activeTasks === 0) {
                    isTaskRunning = false;
                }

                // 安全更新任务栏状态
                try {
                    const win = BrowserWindow.fromWebContents(sender);
                    if (win && !win.isDestroyed()) {
                        win.setProgressBar(-1); // Remove progress bar
                        // 闪烁窗口提示成功
                        win.flashFrame(true);
                        setTimeout(() => {
                            try { if (!win.isDestroyed()) win.flashFrame(false); } catch { }
                        }, 2000);
                    }
                } catch (e) {
                    // 窗口已销毁
                }

                logger.info('Compression completed', { archivePath });
                if (!sender.isDestroyed()) {
                    sender.send('compress-complete');
                    sender.send('queue-length-update', taskQueue.length);
                }

                runNextTask();
            },
        });
    };

    taskQueue.push(task);
    runNextTask();
});

// Extraction
// Extraction
ipcMain.on('extract-start', (event, { archivePath, outputPath }) => {
    const sender = event.sender;

    const task = () => {
        isTaskRunning = true;
        logger.info('Extraction task started', { archivePath, outputPath });

        extractFiles({
            archivePath,
            outputPath,
            onProgress: (info) => {
                if (!sender.isDestroyed()) {
                    sender.send('compress-progress', info);
                    // Update taskbar progress - 安全访问窗口
                    try {
                        const win = BrowserWindow.fromWebContents(sender);
                        if (win && !win.isDestroyed()) {
                            win.setProgressBar(info.percent / 100);
                        }
                    } catch (e) {
                        // 窗口已销毁
                    }
                }
            },
            onError: (error) => {
                activeTasks--;
                if (activeTasks === 0) {
                    isTaskRunning = false;
                }
                try {
                    const win = BrowserWindow.fromWebContents(sender);
                    if (win && !win.isDestroyed()) {
                        win.setProgressBar(-1);
                        win.flashFrame(true);
                        setTimeout(() => {
                            try { if (!win.isDestroyed()) win.flashFrame(false); } catch { }
                        }, 3000);
                    }
                } catch (e) {
                    // 窗口已销毁
                }

                logger.error('Extraction error', error);
                if (!sender.isDestroyed()) sender.send('compress-error', error);

                runNextTask();
            },
            onSuccess: () => {
                activeTasks--;
                if (activeTasks === 0) {
                    isTaskRunning = false;
                }
                try {
                    const win = BrowserWindow.fromWebContents(sender);
                    if (win && !win.isDestroyed()) {
                        win.setProgressBar(-1);
                        win.flashFrame(true);
                        setTimeout(() => {
                            try { if (!win.isDestroyed()) win.flashFrame(false); } catch { }
                        }, 2000);
                    }
                } catch (e) {
                    // 窗口已销毁
                }

                logger.info('Extraction completed', { outputPath });
                if (!sender.isDestroyed()) sender.send('compress-complete');

                runNextTask();
            },
        });
    };

    taskQueue.push(task);
    runNextTask();
});

// Task cancel
ipcMain.on('task-cancel', (event) => {
    const sender = event.sender;
    let win: BrowserWindow | null = null;
    try {
        win = BrowserWindow.fromWebContents(sender);
    } catch (e) {
        // 窗口已销毁
    }

    // Set callback to notify renderer when cleanup is done
    setOnCancelCallback(() => {
        if (!sender.isDestroyed()) {
            sender.send('task-cancelled');
            logger.info('Task cancelled event sent to renderer');
        }
    });

    cancelCurrentTask();
    isTaskRunning = false;

    // Clear taskbar progress
    try {
        if (win && !win.isDestroyed()) {
            win.setProgressBar(-1);
        }
    } catch (e) {
        // 窗口已销毁
    }

    logger.info('Task cancelled by user');
});

// Task pause/resume
ipcMain.on('task-pause', (_event, paused: boolean) => {
    togglePauseTask(paused);
});

// Quit app (for mini mode after compression completes)
ipcMain.on('app-quit', () => {
    app.quit();
});

// Context menu registration
ipcMain.on('register-context-menu', async (event) => {
    const appPath = app.isPackaged ? process.execPath : process.execPath;
    const sender = event.sender;

    logger.info('Registering context menu', { appPath });
    const success = await registerContextMenu(appPath);

    if (!sender.isDestroyed()) {
        sender.send('register-result', success);
    }
});

// Unregister context menu
ipcMain.on('unregister-context-menu', async (event) => {
    const { unregisterContextMenu } = await import('./registry');
    const sender = event.sender;

    logger.info('Unregistering context menu');
    const success = await unregisterContextMenu();

    if (!sender.isDestroyed()) {
        sender.send('unregister-result', success);
    }
});

// Window controls
ipcMain.on('window-minimize', () => win?.minimize());
ipcMain.on('window-maximize', () => {
    if (win?.isMaximized()) win.unmaximize();
    else win?.maximize();
});
ipcMain.on('window-close', () => win?.close());

// Get file stat (invoke handler)
ipcMain.handle('get-file-stat', async (_event, filePath: string) => {
    try {
        const stat = fs.statSync(filePath);
        return {
            size: stat.size,
            isDirectory: stat.isDirectory(),
        };
    } catch (error) {
        logger.error('Failed to get file stat', { filePath, error });
        throw error;
    }
});

// Get native file icon
ipcMain.handle('get-file-icon', async (_event, filePath: string) => {
    try {
        const icon = await app.getFileIcon(filePath, { size: 'normal' });
        return icon.toDataURL();
    } catch (error) {
        logger.error('Failed to get file icon', { filePath, error });
        return null;
    }
});

// Show queue dialog
ipcMain.handle('show-queue-dialog', async (_event, message: string) => {
    const result = await dialog.showMessageBox(win!, {
        type: 'question',
        buttons: ['加入队列', '并行执行', '取消'],
        defaultId: 0,
        cancelId: 2,
        title: '多任务处理',
        message: message,
    });

    const choices: ('queue' | 'parallel' | 'cancel')[] = ['queue', 'parallel', 'cancel'];
    return choices[result.response];
});
