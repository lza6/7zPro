"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const compression_1 = require("./compression");
const registry_1 = require("./registry");
const logger_1 = __importDefault(require("./logger"));
// Reliable path resolution
const ROOT = electron_1.app.getAppPath();
const DIST = path_1.default.join(ROOT, 'dist');
const PRELOAD = path_1.default.join(ROOT, 'dist-electron', 'preload.js');
const PUBLIC = electron_1.app.isPackaged ? path_1.default.join(process.resourcesPath, 'app.asar.unpacked', 'public') : path_1.default.join(ROOT, 'public');
// Fallback to dist if not in unpacked (some builds might bundle it)
const getIconPath = () => {
    const p1 = path_1.default.join(PUBLIC, 'icon.png');
    if (fs_1.default.existsSync(p1))
        return p1;
    const p2 = path_1.default.join(DIST, 'icon.png');
    if (fs_1.default.existsSync(p2))
        return p2;
    return path_1.default.join(ROOT, 'public', 'icon.png'); // Dev fallback
};
// Log environment info for debugging
logger_1.default.info('App Startup Info', {
    isPackaged: electron_1.app.isPackaged,
    ROOT,
    DIST,
    PRELOAD,
    argv: process.argv,
    cwd: process.cwd()
});
let win;
let miniWin = null;
let tray = null;
let isTaskRunning = false;
// Task Queue System
const taskQueue = [];
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
electron_1.app.on('quit', () => {
    logger_1.default.info('Application quitting, cleaning up all 7z processes...');
    // Cancel any running task first
    (0, compression_1.cancelCurrentTask)();
    // Kill any zombie 7z processes (belt and suspenders)
    if (process.platform === 'win32') {
        try {
            require('child_process').execSync('taskkill /f /im 7za.exe /t', { stdio: 'ignore' });
            logger_1.default.info('Cleaned up all 7za.exe processes on quit');
        }
        catch {
            // Ignore error if no process found
        }
    }
});
// Periodic zombie process cleanup (every 30 seconds while task is running)
let zombieCleanupInterval = null;
function startZombieCleanup() {
    if (zombieCleanupInterval)
        return;
    zombieCleanupInterval = setInterval(() => {
        if (!isTaskRunning && process.platform === 'win32') {
            // Only cleanup when no task is running (in case of orphaned processes)
            try {
                const result = require('child_process').execSync('tasklist /fi "imagename eq 7za.exe" /fo csv /nh', { encoding: 'utf8' });
                if (result.includes('7za.exe')) {
                    logger_1.default.warn('Found orphaned 7za.exe processes, cleaning up...');
                    require('child_process').execSync('taskkill /f /im 7za.exe', { stdio: 'ignore' });
                }
            }
            catch {
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
const isMiniMode = process.argv.some(arg => arg === '--mini' || arg.startsWith('--mini') ||
    arg === '--extract' || arg.startsWith('--extract'));
// Mini mode window for right-click compression dialog
function createMiniWindow(filePath) {
    // Get screen dimensions to center the window
    const { width: screenWidth, height: screenHeight } = electron_1.screen.getPrimaryDisplay().workAreaSize;
    const windowWidth = 520;
    const windowHeight = 400;
    miniWin = new electron_1.BrowserWindow({
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
        miniWin === null || miniWin === void 0 ? void 0 : miniWin.show();
    });
    // Store file path to send after window loads
    const targetPath = filePath;
    miniWin.webContents.on('did-finish-load', () => {
        // Tell renderer to show mini compression dialog mode
        miniWin === null || miniWin === void 0 ? void 0 : miniWin.webContents.send('mini-mode-init', targetPath);
        logger_1.default.info('Mini window loaded', { filePath });
    });
    // Detect mode
    const isExtract = process.argv.some(arg => arg === '--extract');
    const isExtractSub = process.argv.some(arg => arg === '--extract-sub');
    let mode = 'compress';
    if (isExtract)
        mode = 'extract';
    if (isExtractSub)
        mode = 'extract-sub';
    const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
    if (!electron_1.app.isPackaged && VITE_DEV_SERVER_URL) {
        miniWin.loadURL(`${VITE_DEV_SERVER_URL}?mini=true&mode=${mode}`).catch(() => {
            miniWin === null || miniWin === void 0 ? void 0 : miniWin.loadFile(path_1.default.join(DIST, 'index.html'), { query: { mini: 'true', mode } });
        });
    }
    else {
        miniWin.loadFile(path_1.default.join(DIST, 'index.html'), { query: { mini: 'true', mode } });
    }
    // Close app when mini window closes
    miniWin.on('closed', () => {
        miniWin = null;
        if (!isTaskRunning)
            electron_1.app.quit();
    });
}
// Main full-sized window
function createWindow() {
    win = new electron_1.BrowserWindow({
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
        win === null || win === void 0 ? void 0 : win.show();
        if (!electron_1.app.isPackaged) {
            win === null || win === void 0 ? void 0 : win.webContents.openDevTools();
        }
    });
    // Handle load failures
    win.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
        logger_1.default.error('Main window load failed', { errorCode, errorDescription, validatedURL });
        // If it was trying to load the dev server, fallback to local file
        if (validatedURL.startsWith('http')) {
            logger_1.default.info('HTTP load failed, falling back to local file');
            win === null || win === void 0 ? void 0 : win.loadFile(path_1.default.join(DIST, 'index.html')).catch(e => logger_1.default.error('Fallback loadFile failed', e));
        }
    });
    win.webContents.on('did-finish-load', () => {
        logger_1.default.info('Main window did-finish-load');
    });
    // Smart Loading
    const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
    if (!electron_1.app.isPackaged && VITE_DEV_SERVER_URL) {
        logger_1.default.info('Loading from dev server', { VITE_DEV_SERVER_URL });
        win.loadURL(VITE_DEV_SERVER_URL).catch(() => {
            logger_1.default.info('Dev server unreachable, loading from dist');
            win === null || win === void 0 ? void 0 : win.loadFile(path_1.default.join(DIST, 'index.html'));
        });
    }
    else {
        const indexPath = path_1.default.join(DIST, 'index.html');
        logger_1.default.info('Loading from local file', { indexPath });
        win.loadFile(indexPath).catch(err => {
            logger_1.default.error('Failed to load local index.html', err);
        });
    }
    // Handle close event - show tray if task is running
    win.on('close', (e) => {
        if (isTaskRunning) {
            e.preventDefault();
            const choice = electron_1.dialog.showMessageBoxSync(win, {
                type: 'question',
                buttons: ['最小化到托盘', '强制退出', '取消'],
                defaultId: 0,
                cancelId: 2,
                title: '任务正在进行中',
                message: '压缩/解压任务正在进行中，您要如何处理？',
            });
            if (choice === 0) {
                // Minimize to tray
                win === null || win === void 0 ? void 0 : win.hide();
                createTray();
            }
            else if (choice === 1) {
                // Force quit
                (0, compression_1.cancelCurrentTask)();
                isTaskRunning = false;
                win === null || win === void 0 ? void 0 : win.destroy();
            }
            // choice === 2: cancel, do nothing
        }
    });
}
function createTray() {
    if (tray)
        return;
    const iconPath = getIconPath();
    const icon = electron_1.nativeImage.createFromPath(iconPath);
    tray = new electron_1.Tray(icon.resize({ width: 16, height: 16 }));
    const contextMenu = electron_1.Menu.buildFromTemplate([
        {
            label: '显示主窗口',
            click: () => {
                win === null || win === void 0 ? void 0 : win.show();
                win === null || win === void 0 ? void 0 : win.focus();
            }
        },
        { type: 'separator' },
        {
            label: '退出',
            click: () => {
                if (isTaskRunning) {
                    const choice = electron_1.dialog.showMessageBoxSync({
                        type: 'warning',
                        buttons: ['取消任务并退出', '取消'],
                        defaultId: 1,
                        title: '任务进行中',
                        message: '后台任务正在进行中，确定要退出吗？',
                    });
                    if (choice === 0) {
                        (0, compression_1.cancelCurrentTask)();
                        electron_1.app.quit();
                    }
                }
                else {
                    electron_1.app.quit();
                }
            }
        },
    ]);
    tray.setToolTip('7zPro - 后台压缩中...');
    tray.setContextMenu(contextMenu);
    tray.on('double-click', () => {
        win === null || win === void 0 ? void 0 : win.show();
        win === null || win === void 0 ? void 0 : win.focus();
    });
}
electron_1.app.on('window-all-closed', () => {
    if (!isTaskRunning) {
        win = null;
        if (process.platform !== 'darwin') {
            electron_1.app.quit();
        }
    }
});
process.on('uncaughtException', (error) => {
    logger_1.default.error('Uncaught Exception', { message: error.message, stack: error.stack });
    electron_1.dialog.showErrorBox('Application Error', `An error occurred: ${error.message}\n${error.stack}`);
});
// Parse command line arguments for files
function parseFileArgs(argv) {
    const files = [];
    for (const arg of argv) {
        // Skip electron/node executables and flags
        if (arg.startsWith('--') || arg.startsWith('-'))
            continue;
        if (arg.includes('electron.exe') || arg.includes('electron.cmd'))
            continue;
        if (arg === process.execPath)
            continue;
        if (arg.endsWith('.js') && arg.includes('dist-electron'))
            continue;
        // Check if it's a valid file/directory path
        try {
            if (fs_1.default.existsSync(arg)) {
                files.push(arg);
            }
        }
        catch {
            // Ignore invalid paths
        }
    }
    return files;
}
// Single instance handling - ONLY for normal mode
// Mini mode should always create independent windows
if (isMiniMode) {
    // Mini mode - NO single instance lock, create independent window
    electron_1.app.whenReady().then(() => {
        const files = parseFileArgs(process.argv);
        if (files.length > 0) {
            createMiniWindow(files[0]);
            logger_1.default.info('Application started in mini mode', { version: electron_1.app.getVersion(), file: files[0] });
        }
        else {
            electron_1.dialog.showErrorBox('7zPro', '未指定要压缩的文件');
            electron_1.app.quit();
        }
    });
}
else {
    // Normal mode - use single instance lock
    const gotTheLock = electron_1.app.requestSingleInstanceLock();
    if (!gotTheLock) {
        electron_1.app.quit();
    }
    else {
        electron_1.app.on('second-instance', (_event, commandLine, _workingDirectory) => {
            // Check if second instance is mini mode
            const isMiniCommand = commandLine.some(arg => arg === '--mini' || arg === '--extract' || arg === '--extract-sub');
            if (isMiniCommand) {
                // Create mini window for this request
                const files = parseFileArgs(commandLine);
                if (files.length > 0) {
                    createMiniWindow(files[0]);
                }
            }
            else {
                // Normal second instance - focus main window
                if (win) {
                    if (win.isMinimized())
                        win.restore();
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
        electron_1.app.whenReady().then(() => {
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
            logger_1.default.info('Application started', { version: electron_1.app.getVersion() });
        });
    }
}
// ============== IPC Handlers ==============
// Compression
// Compression
electron_1.ipcMain.on('compress-start', (event, { files, archivePath, options, totalBytes }) => {
    const sender = event.sender;
    const task = () => {
        isTaskRunning = true;
        logger_1.default.info('Compression task started', { files: files.length, archivePath, options, totalBytes });
        (0, compression_1.compressFiles)({
            files,
            archivePath,
            totalBytes,
            options,
            onProgress: (info) => {
                if (!sender.isDestroyed()) {
                    sender.send('compress-progress', info);
                    // Update taskbar progress - 安全访问窗口
                    try {
                        const win = electron_1.BrowserWindow.fromWebContents(sender);
                        if (win && !win.isDestroyed()) {
                            win.setProgressBar(info.percent / 100);
                            if (tray) {
                                tray.setToolTip(`7zPro - ${info.percent}% - ${info.currentFile || 'Processing...'}`);
                            }
                        }
                    }
                    catch (e) {
                        // 窗口已销毁，忽略进度更新
                        logger_1.default.warn('Window destroyed during progress update, ignoring');
                    }
                }
            },
            onError: (error) => {
                // Task finished (error)
                activeTasks--;
                if (activeTasks === 0) {
                    isTaskRunning = false;
                    try {
                        const win = electron_1.BrowserWindow.fromWebContents(sender);
                        if (win && !win.isDestroyed())
                            win.setProgressBar(-1);
                    }
                    catch (e) {
                        // 窗口已销毁
                    }
                }
                logger_1.default.error('Compression error', error);
                if (!sender.isDestroyed()) {
                    sender.send('compress-error', error);
                    // Update taskbar progress to error state
                    try {
                        const win = electron_1.BrowserWindow.fromWebContents(sender);
                        if (win && !win.isDestroyed()) {
                            win.setProgressBar(1, { mode: 'error' });
                            // 闪烁窗口提示错误
                            win.flashFrame(true);
                            setTimeout(() => {
                                try {
                                    if (!win.isDestroyed())
                                        win.flashFrame(false);
                                }
                                catch { }
                            }, 3000);
                        }
                    }
                    catch (e) {
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
                    const win = electron_1.BrowserWindow.fromWebContents(sender);
                    if (win && !win.isDestroyed()) {
                        win.setProgressBar(-1); // Remove progress bar
                        // 闪烁窗口提示成功
                        win.flashFrame(true);
                        setTimeout(() => {
                            try {
                                if (!win.isDestroyed())
                                    win.flashFrame(false);
                            }
                            catch { }
                        }, 2000);
                    }
                }
                catch (e) {
                    // 窗口已销毁
                }
                logger_1.default.info('Compression completed', { archivePath });
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
electron_1.ipcMain.on('extract-start', (event, { archivePath, outputPath }) => {
    const sender = event.sender;
    const task = () => {
        isTaskRunning = true;
        logger_1.default.info('Extraction task started', { archivePath, outputPath });
        (0, compression_1.extractFiles)({
            archivePath,
            outputPath,
            onProgress: (info) => {
                if (!sender.isDestroyed()) {
                    sender.send('compress-progress', info);
                    // Update taskbar progress - 安全访问窗口
                    try {
                        const win = electron_1.BrowserWindow.fromWebContents(sender);
                        if (win && !win.isDestroyed()) {
                            win.setProgressBar(info.percent / 100);
                        }
                    }
                    catch (e) {
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
                    const win = electron_1.BrowserWindow.fromWebContents(sender);
                    if (win && !win.isDestroyed()) {
                        win.setProgressBar(-1);
                        win.flashFrame(true);
                        setTimeout(() => {
                            try {
                                if (!win.isDestroyed())
                                    win.flashFrame(false);
                            }
                            catch { }
                        }, 3000);
                    }
                }
                catch (e) {
                    // 窗口已销毁
                }
                logger_1.default.error('Extraction error', error);
                if (!sender.isDestroyed())
                    sender.send('compress-error', error);
                runNextTask();
            },
            onSuccess: () => {
                activeTasks--;
                if (activeTasks === 0) {
                    isTaskRunning = false;
                }
                try {
                    const win = electron_1.BrowserWindow.fromWebContents(sender);
                    if (win && !win.isDestroyed()) {
                        win.setProgressBar(-1);
                        win.flashFrame(true);
                        setTimeout(() => {
                            try {
                                if (!win.isDestroyed())
                                    win.flashFrame(false);
                            }
                            catch { }
                        }, 2000);
                    }
                }
                catch (e) {
                    // 窗口已销毁
                }
                logger_1.default.info('Extraction completed', { outputPath });
                if (!sender.isDestroyed())
                    sender.send('compress-complete');
                runNextTask();
            },
        });
    };
    taskQueue.push(task);
    runNextTask();
});
// Task cancel
electron_1.ipcMain.on('task-cancel', (event) => {
    const sender = event.sender;
    let win = null;
    try {
        win = electron_1.BrowserWindow.fromWebContents(sender);
    }
    catch (e) {
        // 窗口已销毁
    }
    // Set callback to notify renderer when cleanup is done
    (0, compression_1.setOnCancelCallback)(() => {
        if (!sender.isDestroyed()) {
            sender.send('task-cancelled');
            logger_1.default.info('Task cancelled event sent to renderer');
        }
    });
    (0, compression_1.cancelCurrentTask)();
    isTaskRunning = false;
    // Clear taskbar progress
    try {
        if (win && !win.isDestroyed()) {
            win.setProgressBar(-1);
        }
    }
    catch (e) {
        // 窗口已销毁
    }
    logger_1.default.info('Task cancelled by user');
});
// Task pause/resume
electron_1.ipcMain.on('task-pause', (_event, paused) => {
    (0, compression_1.togglePauseTask)(paused);
});
// Quit app (for mini mode after compression completes)
electron_1.ipcMain.on('app-quit', () => {
    electron_1.app.quit();
});
// Context menu registration
electron_1.ipcMain.on('register-context-menu', async (event) => {
    const appPath = electron_1.app.isPackaged ? process.execPath : process.execPath;
    const sender = event.sender;
    logger_1.default.info('Registering context menu', { appPath });
    const success = await (0, registry_1.registerContextMenu)(appPath);
    if (!sender.isDestroyed()) {
        sender.send('register-result', success);
    }
});
// Unregister context menu
electron_1.ipcMain.on('unregister-context-menu', async (event) => {
    const { unregisterContextMenu } = await Promise.resolve().then(() => __importStar(require('./registry')));
    const sender = event.sender;
    logger_1.default.info('Unregistering context menu');
    const success = await unregisterContextMenu();
    if (!sender.isDestroyed()) {
        sender.send('unregister-result', success);
    }
});
// Window controls
electron_1.ipcMain.on('window-minimize', () => win === null || win === void 0 ? void 0 : win.minimize());
electron_1.ipcMain.on('window-maximize', () => {
    if (win === null || win === void 0 ? void 0 : win.isMaximized())
        win.unmaximize();
    else
        win === null || win === void 0 ? void 0 : win.maximize();
});
electron_1.ipcMain.on('window-close', () => win === null || win === void 0 ? void 0 : win.close());
// Get file stat (invoke handler)
electron_1.ipcMain.handle('get-file-stat', async (_event, filePath) => {
    try {
        const stat = fs_1.default.statSync(filePath);
        return {
            size: stat.size,
            isDirectory: stat.isDirectory(),
        };
    }
    catch (error) {
        logger_1.default.error('Failed to get file stat', { filePath, error });
        throw error;
    }
});
// Get native file icon
electron_1.ipcMain.handle('get-file-icon', async (_event, filePath) => {
    try {
        const icon = await electron_1.app.getFileIcon(filePath, { size: 'normal' });
        return icon.toDataURL();
    }
    catch (error) {
        logger_1.default.error('Failed to get file icon', { filePath, error });
        return null;
    }
});
// Show queue dialog
electron_1.ipcMain.handle('show-queue-dialog', async (_event, message) => {
    const result = await electron_1.dialog.showMessageBox(win, {
        type: 'question',
        buttons: ['加入队列', '并行执行', '取消'],
        defaultId: 0,
        cancelId: 2,
        title: '多任务处理',
        message: message,
    });
    const choices = ['queue', 'parallel', 'cancel'];
    return choices[result.response];
});
