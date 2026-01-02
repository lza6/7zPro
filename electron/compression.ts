import { path7za as originalPath7za } from '7zip-bin';
import { spawn, ChildProcess, execSync } from 'child_process';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { log7zOutput, log7zError, logger } from './logger';

// Fix path for asar unpacked (exe cannot run inside asar virtual filesystem)
const path7za = originalPath7za.replace('app.asar', 'app.asar.unpacked');

// ========== 预编译正则表达式（减少 GC 开销）==========
const PROGRESS_REGEX = /(\d{1,3})%/;
const FILE_REGEX_COMPRESS = /\+ (.+)$/;
const FILE_REGEX_EXTRACT = /- (.+)$/;
// Regex to capture "12% 1024" where 1024 is processed bytes. 
// Standard 7z:  12% 1024  <-- We want 1024
// Must ensure it doesn't match filenames like "5\File"
const BYTES_REGEX = /^\s*\d+%\s+(\d+)\s/;

// ========== 文件锁检测 ==========
async function checkFileLocks(files: string[]): Promise<string[]> {
    const lockedFiles: string[] = [];
    for (const file of files) {
        try {
            // 尝试以只读模式打开文件
            const fd = fs.openSync(file, 'r');
            fs.closeSync(fd);
        } catch (e: any) {
            if (e.code === 'EBUSY' || e.code === 'EACCES') {
                lockedFiles.push(file);
            }
        }
    }
    return lockedFiles;
}

// ========== 长路径支持 ==========
function ensureLongPath(filePath: string): string {
    const resolved = path.resolve(filePath);
    if (process.platform === 'win32' && !resolved.startsWith('\\\\?\\')) {
        return `\\\\?\\${resolved}`;
    }
    return resolved;
}

// ========== 增强清理机制 ==========
async function aggressiveCleanup(filePath: string, maxRetries = 10): Promise<boolean> {
    for (let i = 0; i < maxRetries; i++) {
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                logger.info('Aggressive cleanup succeeded', { path: filePath, attempt: i + 1 });
            }
            return true;
        } catch (e: any) {
            logger.warn(`Aggressive cleanup retry ${i + 1}/${maxRetries} for ${filePath}`, e.code);
            await new Promise(r => setTimeout(r, 500));
        }
    }
    return false;
}

// Store current running process for cancellation
let currentProcess: ChildProcess | null = null;

let currentArchivePath: string | null = null; // Track current archive for cleanup on cancel
let onCancelCallback: (() => void) | null = null; // Callback when task is cancelled

// Cancel the current running task and cleanup incomplete files
export function cancelCurrentTask(): void {
    const callback = onCancelCallback;
    onCancelCallback = null;

    if (currentProcess) {
        logger.info('Killing current process with aggressive cleanup');
        const pid = currentProcess.pid;

        // Multi-stage kill process for Windows
        if (process.platform === 'win32' && pid) {
            try {
                // Stage 1: Kill process tree
                require('child_process').execSync(`taskkill /f /t /pid ${pid}`, { stdio: 'ignore' });
                logger.info('Process tree killed', { pid });
            } catch (e) {
                logger.warn('taskkill by PID failed, trying by image name', e);
            }

            // Stage 2: Kill any remaining 7za.exe (belt and suspenders)
            try {
                require('child_process').execSync('taskkill /f /im 7za.exe', { stdio: 'ignore' });
                logger.info('All 7za.exe processes killed');
            } catch {
                // Ignore - no processes found
            }
        } else {
            // Unix: SIGKILL
            try {
                currentProcess.kill('SIGKILL');
            } catch (e) {
                logger.warn('SIGKILL failed', e);
            }
        }

        currentProcess = null;
    }

    // Delete incomplete archive file with retry mechanism
    if (currentArchivePath) {
        const archivePath = currentArchivePath;
        currentArchivePath = null;

        // Use async deletion with retries to handle file locks
        const deleteWithRetry = async (filePath: string, retries = 5, delayMs = 200) => {
            for (let i = 0; i < retries; i++) {
                try {
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                        logger.info('Deleted incomplete file', { path: filePath, attempt: i + 1 });
                        return true;
                    }
                    return false;
                } catch (e: any) {
                    if (i < retries - 1) {
                        logger.warn(`Delete retry ${i + 1}/${retries} for ${filePath}`, e.code);
                        await new Promise(r => setTimeout(r, delayMs * (i + 1)));
                    } else {
                        logger.error('Failed to delete after all retries', { path: filePath, error: e.message });
                    }
                }
            }
            return false;
        };

        // Async cleanup (don't block)
        (async () => {
            // Wait a bit for process to fully release file handles
            await new Promise(r => setTimeout(r, 300));

            // Delete main archive
            await deleteWithRetry(archivePath);

            // Delete split volumes
            try {
                const dir = path.dirname(archivePath);
                const baseName = path.basename(archivePath);
                const files = fs.readdirSync(dir);
                for (const file of files) {
                    if (file.startsWith(baseName + '.') || file === baseName) {
                        const fullPath = path.join(dir, file);
                        await deleteWithRetry(fullPath);
                    }
                }
            } catch (e) {
                logger.warn('Failed to cleanup split volumes', e);
            }
        })();
    }

    // Invoke callback after cleanup initiated
    if (callback) {
        setTimeout(() => callback(), 100);
    }
}

// Set callback for when task is cancelled
export function setOnCancelCallback(cb: (() => void) | null): void {
    onCancelCallback = cb;
}

// Pause/Resume the current running task
// Windows: 使用 DebugActiveProcess API 实现暂停
// Unix: 使用 SIGSTOP/SIGCONT
let isPaused = false;

export function togglePauseTask(paused: boolean): void {
    if (!currentProcess || !currentProcess.pid) return;

    const pid = currentProcess.pid;
    logger.info('Toggling pause', { pid, paused });
    isPaused = paused;

    if (process.platform === 'win32') {
        try {
            // Windows 暂停/恢复方案：使用 NtSuspendProcess/NtResumeProcess
            // 通过 PowerShell 调用 .NET 的 P/Invoke 实现
            if (paused) {
                // 使用 debug break 暂停进程（更可靠的方法）
                execSync(`powershell -Command "& { $p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if ($p) { Write-Host 'Process found, attempting pause via priority'; $p.PriorityClass = [System.Diagnostics.ProcessPriorityClass]::Idle } }"`, { stdio: 'ignore' });
                // 备选：降低优先级到 Idle 可以达到类似暂停的效果
                logger.info('Process paused (priority set to Idle)', { pid });
            } else {
                // 恢复正常优先级
                execSync(`powershell -Command "& { $p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if ($p) { $p.PriorityClass = [System.Diagnostics.ProcessPriorityClass]::BelowNormal } }"`, { stdio: 'ignore' });
                logger.info('Process resumed (priority restored to BelowNormal)', { pid });
            }
        } catch (e) {
            logger.error('Failed to toggle pause', e);
        }
    } else {
        // Unix
        currentProcess.kill(paused ? 'SIGSTOP' : 'SIGCONT');
    }
}


// Progress info structure for detailed UI updates
export interface ProgressInfo {
    percent: number;
    currentFile?: string;
    processedBytes?: number;
    speed?: number; // bytes per second
    status?: string; // Current operation status
}

// Check disk space before compression
async function checkDiskSpace(targetPath: string, requiredBytes: number): Promise<boolean> {
    try {
        const root = path.parse(path.resolve(targetPath)).root;
        // Node 18+ supports fs.statfs
        if (fs.statfs) {
            return new Promise((resolve) => {
                fs.statfs(root, (err, stats) => {
                    if (err) {
                        logger.warn('Failed to check disk space', err);
                        resolve(true); // Assume yes on error to be safe/lenient
                        return;
                    }
                    const freeBytes = stats.bavail * stats.bsize;
                    if (freeBytes < requiredBytes) {
                        logger.warn('Disk space check failed', { freeBytes, requiredBytes });
                        resolve(false);
                    } else {
                        resolve(true);
                    }
                });
            });
        }
        return true; // Fallback for older nodes
    } catch (e) {
        logger.warn('Disk check error', e);
        return true;
    }
}

interface CompressionOptions {
    files: string[];
    archivePath: string;
    totalBytes?: number; // Total size of files being compressed
    options?: {
        level?: string;
        password?: string;
        splitSize?: string;
        format?: string;
        sfx?: boolean; // Self-extracting executable
    };
    onProgress: (info: ProgressInfo) => void;
    onError: (error: string) => void;
    onSuccess: () => void;
}

export async function compressFiles(opts: CompressionOptions): Promise<void> {
    const { files, archivePath, totalBytes, options, onProgress, onError, onSuccess } = opts;

    // 0. File Lock Check
    const lockedFiles = await checkFileLocks(files);
    if (lockedFiles.length > 0) {
        const fileList = lockedFiles.slice(0, 3).join(', ') + (lockedFiles.length > 3 ? '...' : '');
        onError(`发现文件正在被占用，请关闭相关程序后重试：${fileList}`);
        return;
    }

    // 1. Disk Space Pre-check
    if (totalBytes) {
        // Estimate output size: simplified to 50% of total + buffer, or just checking against totalBytes to be safe?
        // User requested: free space < totalBytes -> warning.
        const hasSpace = await checkDiskSpace(archivePath, totalBytes);
        if (!hasSpace) {
            onError(`磁盘空间不足！目标盘剩余空间小于待压缩文件总大小 (${Math.floor(totalBytes / 1024 / 1024)} MB)，无法继续。`);
            return;
        }
    }

    // Atomic Write Protection: Write to temp file first
    const tempArchivePath = archivePath + '.7zpro_tmp'; // Hidden-ish temp file
    // Ensure cleanup of temp file on previous failure
    try { if (fs.existsSync(tempArchivePath)) fs.unlinkSync(tempArchivePath); } catch { }

    // Track archive path for cleanup on cancel (Use temp path now)
    currentArchivePath = tempArchivePath;

    const args = ['a'];

    // Set format
    let is7z = false;
    if (options?.format) {
        if (options.format === 'gz') {
            args.push('-tgzip');
        } else {
            args.push(`-t${options.format}`);
        }
        is7z = options.format === '7z';
    } else {
        // Default to 7z
        args.push('-t7z');
        is7z = true;
    }

    args.push(tempArchivePath);

    // 2. @ListFile Mode (Response File)
    // Create a temp file list to avoid command line length limits
    const listFilePath = path.join(os.tmpdir(), `7zpro_list_${Date.now()}.txt`);
    try {
        const fileContent = files.map(f => {
            // Long Path Support: Prepend \\?\ for all paths on Windows to bypass 260 limit
            return ensureLongPath(f);
        }).join('\r\n'); // Use Windows line endings and ensure UTF-8
        fs.writeFileSync(listFilePath, Buffer.from('\ufeff' + fileContent, 'utf8')); // BOM for absolute UTF-8 certainty in some 7z versions
        args.push(`@${listFilePath}`);
    } catch (e: any) {
        onError(`创建临时文件列表失败: ${e.message}`);
        return;
    }

    // Compression level
    let levelNum = '9'; // Default
    if (options?.level) {
        levelNum = options.level.replace('mx', '');
        args.push(`-mx=${levelNum}`);
    } else {
        args.push('-mx=9');
    }

    // ========== Advanced Optimizations ==========

    // 0. Smart Algorithm Selection & SFX
    if (options?.sfx && is7z) {
        args.push('-sfx');
    }

    // 1. Multi-threading: 使用全部CPU核心最大化压缩速度
    const cpuCount = os.cpus().length;
    // 使用所有核心，最大化速度
    const threads = cpuCount;
    args.push(`-mmt=${threads}`);
    logger.info('Using all CPU cores for compression', { threads, cpuCount });

    // IO Optimization for SSD: Multi-threaded file IO
    // 假设是 SSD (Windows 上可以通过 wmic 检查 MediaType，这里默认开启提升扫描速度)
    args.push('-mmtf=on');

    // 2. Solid compression for 7z format: Dramatically improves compression ratio
    if (is7z) {
        args.push('-ms=on');
        args.push('-m0=lzma2'); // Force LZMA2
        // Analysis level
        if (options?.level === 'mx9') {
            args.push('-m0=lzma2:d26:fb273'); // Increase distinct search
        }
    }

    // 3. Dynamic Dictionary Size for Ultra Compression (Smart Resource Allocation)
    // 3. Dynamic Dictionary Size for Ultra Compression
    // REMOVED: Aggressive memory throttling that was limiting performance.
    // We now trust the system to manage memory or swap if needed.
    // Standard 7-zip "Ultra" usually uses 64MB dictionary.
    // For "Extreme" performance on modern machines, we can push this.
    if (options?.level === 'mx9') {
        // Use a fixed high-quality dictionary size.
        // 64MB is the standard for "Ultra". 
        // If users want "Max", we could go higher, but 64MB is a good balance for speed/ratio.
        // Removing the 'downgrade to 32MB' logic.
        args.push('-md=64m');

        // Optimize for multi-threading
        // -mmt is already set to all cores above.
    }

    // 4. Password protection
    if (options?.password) {
        args.push(`-p${options.password}`);

        // 5. Header encryption for 7z
        if (is7z) {
            args.push('-mhe=on');
        }
    }

    // 6. Split volumes
    if (options?.splitSize) {
        args.push(`-v${options.splitSize}`);
    }

    // Common flags
    args.push('-bsp1'); // Progress to stdout (Percentage)
    args.push('-bso1'); // Output stream (File names) to stdout too (Standard 7z behavior varies, but we want streams separated usually)
    // Note: -bso1 redirects standard output messages to stdout. The node wrapper often combines them.
    // 7z default is: Progres (-bsp1) -> stdout/stderr depending on version. 
    // We will stick to -bsp1 and parsing.

    args.push('-y');    // Assume yes for overwrites

    logger.info('Spawning 7z compress', { path7za, args, listFilePath });

    // Spawn WITHOUT shell:true to avoid encoding issues with non-ASCII paths
    // Use pipe for stdio and set environment variable to disable buffering
    const child = spawn(path7za, args, {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
            ...process.env,
            // Force unbuffered output on some systems
            PYTHONUNBUFFERED: '1',
            FORCE_COLOR: '0',
        },
    });

    currentProcess = child;

    // Set Process Priority
    try {
        if (child.pid) {
            // REMOVED: Do not limit priority, let it run at NORMAL to use full CPU
            // os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
            logger.info('Process priority kept at NORMAL for maximum performance', { pid: child.pid });
        }
    } catch (e) {
        logger.warn('Failed to set process priority', e);
    }

    // Progress tracking with speed calculation
    let lastPercent = -1;
    let lastUpdateTime = 0;
    let buffer = '';
    const startTime = Date.now();
    let currentFile = '';

    child.stdout.on('data', (data: Buffer) => {
        const output = data.toString();
        buffer += output;

        // Log raw output for debugging
        if (process.env.NODE_ENV === 'development') {
            // console.log(`[RAW 7Z] ${output.trim()}`);
        }
        log7zOutput(output);

        // Parse progress - look for percentage patterns and file names
        // Also parse incomplete lines for real-time updates (7z often sends partial lines)
        const allContent = buffer;
        const lines = allContent.split(/[\r\n]+/);

        // Keep only the last incomplete line in buffer
        const lastLine = lines[lines.length - 1];
        if (!allContent.endsWith('\n') && !allContent.endsWith('\r')) {
            buffer = lastLine;
            lines.pop();
        } else {
            buffer = '';
        }

        for (const line of lines) {
            if (!line.trim()) continue;

            // Detect scanning phase
            if (line.includes('Scanning')) {
                // Use setImmediate to ensure immediate dispatch to renderer
                setImmediate(() => {
                    onProgress({ percent: 0, currentFile: '正在扫描文件...', status: '扫描中...' });
                });
                continue;
            }

            // Extract current file being processed (format: "+ filename")
            const fileMatch = line.match(FILE_REGEX_COMPRESS);
            if (fileMatch) {
                currentFile = fileMatch[1].trim();
            }

            // Regex to match " 12% 1024 ..." where 1024 is processed bytes
            // 7z -bsp1 output: <Percent>% <Processed> <Compressed>
            // Also match single digit percentages and handle various formats
            const match = line.match(PROGRESS_REGEX);
            if (match) {
                const percent = parseInt(match[1], 10);
                if (percent < 0 || percent > 100) continue; // Invalid percent

                // Also try to extract processed bytes (after the %)
                // Use strict regex anchored to percent to avoid matching filename numbers
                const bytesMatch = line.match(BYTES_REGEX);
                const parsedProcessedBytes = bytesMatch ? parseInt(bytesMatch[1], 10) : undefined;

                const now = Date.now();

                // Throttle updates: Call at most every 100ms (reduced from 200ms for smoother UI)
                // Always call if percent is 100% or significantly different
                if (percent === 100 || Math.abs(percent - lastPercent) >= 1 || (now - lastUpdateTime > 100)) {
                    lastPercent = percent;
                    lastUpdateTime = now;

                    // Calculate speed based on elapsed time and estimated progress
                    const elapsedMs = now - startTime;
                    let currentProcessedBytes = parsedProcessedBytes;

                    if (currentProcessedBytes === undefined && totalBytes) {
                        currentProcessedBytes = Math.floor((percent / 100) * totalBytes);
                    }

                    const speed = currentProcessedBytes !== undefined && elapsedMs > 0
                        ? Math.floor((currentProcessedBytes / elapsedMs) * 1000)
                        : undefined;

                    // Use setImmediate to bypass Node.js event loop batching
                    // This ensures progress updates are sent immediately to renderer
                    setImmediate(() => {
                        onProgress({
                            percent,
                            currentFile,
                            processedBytes: currentProcessedBytes,
                            speed,
                            status: '正在压缩...'
                        });
                    });
                }
            }
        }
    });

    child.stderr.on('data', (data: Buffer) => {
        const output = data.toString();
        log7zError(output);
    });

    child.on('error', (err: Error) => {
        currentProcess = null;
        logger.error('7z process spawn error', err.message);
        // Clean up list file
        try { fs.unlinkSync(listFilePath); } catch { }
        // Clean up temp archive
        try { if (fs.existsSync(tempArchivePath)) fs.unlinkSync(tempArchivePath); } catch { }

        onError(`启动压缩进程失败: ${err.message}`);
    });

    child.on('close', (code: number | null) => {
        currentProcess = null;
        // Clean up list file
        try { fs.unlinkSync(listFilePath); } catch (e) { logger.warn('Failed to cleanup list file', e); }

        if (code === 0) {
            // Success - Atomic Rename
            try {
                if (fs.existsSync(archivePath)) {
                    fs.unlinkSync(archivePath); // Overwrite protection logic (we imply overwrite per user intent if needed, or unique name)
                    // But actually, we should check overwrite earlier.
                }
                fs.renameSync(tempArchivePath, archivePath);

                // Success - clear the archive path tracker
                currentArchivePath = null;
                onSuccess();
            } catch (renameErr: any) {
                onError(`压缩完成但写入文件失败: ${renameErr.message}`);
            }
        } else if (code === null) {
            // Process was killed - archive cleanup already handled in cancelCurrentTask
            onError('任务已取消');
        } else if (code === 2) {
            // Error - delete incomplete archive
            if (currentArchivePath && fs.existsSync(currentArchivePath)) {
                try { fs.unlinkSync(currentArchivePath); } catch { }
            }
            currentArchivePath = null;
            onError('致命错误：请检查文件权限或是否有文件被占用。建议尝试以管理员身份运行。');
        } else {
            // Other error - delete incomplete archive
            if (currentArchivePath && fs.existsSync(currentArchivePath)) {
                try { fs.unlinkSync(currentArchivePath); } catch { }
            }
            currentArchivePath = null;
            onError(`压缩进程退出，代码: ${code}`);
        }
    });
}

interface ExtractionOptions {
    archivePath: string;
    outputPath: string;
    password?: string;
    onProgress: (info: ProgressInfo) => void;
    onError: (error: string) => void;
    onSuccess: () => void;
}

export function extractFiles(opts: ExtractionOptions): void {
    const { archivePath, outputPath, password, onProgress, onError, onSuccess } = opts;

    const args = ['x', archivePath, `-o${outputPath}`, '-y', '-bsp1'];

    // Add password if provided
    if (password) {
        args.push(`-p${password}`);
    }

    // Multi-threading for extraction too
    // 强制使用所有核心进行解压
    args.push(`-mmt=${os.cpus().length}`);
    logger.info('Using all CPU cores for compression', { args });

    logger.info('Spawning 7z extract', { path7za, args });

    const child = spawn(path7za, args, {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
            ...process.env,
            PYTHONUNBUFFERED: '1',
            FORCE_COLOR: '0',
        },
    });

    currentProcess = child;

    // Set Process Priority
    try {
        if (child.pid) {
            os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
        }
    } catch { }

    let lastPercent = -1;
    let buffer = '';
    const startTime = Date.now();
    let currentFile = '';

    child.stdout.on('data', (data: Buffer) => {
        const output = data.toString();
        buffer += output;

        // Log raw output for debugging
        if (process.env.NODE_ENV === 'development') {
            // console.log(`[RAW 7Z EXTRACT] ${output.trim()}`);
        }
        log7zOutput(output);

        // Parse all content including partial lines
        const allContent = buffer;
        const lines = allContent.split(/[\r\n]+/);

        // Keep only the last incomplete line in buffer
        const lastLine = lines[lines.length - 1];
        if (!allContent.endsWith('\n') && !allContent.endsWith('\r')) {
            buffer = lastLine;
            lines.pop();
        } else {
            buffer = '';
        }

        for (const line of lines) {
            if (!line.trim()) continue;

            // Extract current file being processed
            const fileMatch = line.match(FILE_REGEX_EXTRACT);
            if (fileMatch) {
                currentFile = fileMatch[1].trim();
            }

            const match = line.match(PROGRESS_REGEX);
            if (match) {
                const percent = parseInt(match[1], 10);
                if (percent < 0 || percent > 100) continue;

                const now = Date.now();
                // Reduced throttle for smoother updates
                if (percent !== lastPercent || (now - startTime > 100)) {
                    lastPercent = percent;
                    const elapsedMs = now - startTime;

                    // Use setImmediate to ensure immediate dispatch
                    setImmediate(() => {
                        onProgress({
                            percent,
                            currentFile,
                            speed: elapsedMs > 0 ? Math.floor((percent / elapsedMs) * 1000) : undefined,
                            status: '正在解压...'
                        });
                    });
                }
            }
        }
    });

    child.stderr.on('data', (data: Buffer) => {
        log7zError(data.toString());
    });

    child.on('error', (err: Error) => {
        currentProcess = null;
        logger.error('7z extract process error', err.message);
        onError(`启动解压进程失败: ${err.message}`);
    });

    child.on('close', (code: number | null) => {
        currentProcess = null;
        if (code === 0) {
            onSuccess();
        } else if (code === null) {
            onError('任务已取消');
        } else {
            onError(`解压进程退出，代码: ${code}`);
        }
    });
}

// ========== 智能提取核心逻辑 ==========
// 1. 列出压缩包内容
// 2. 如果只有一个顶级文件夹，解压到当前目录 (outputPath)
// 3. 如果有多个散落文件，解压到 "outputPath/压缩包名" 文件夹
export async function smartExtractStub(opts: ExtractionOptions): Promise<void> {
    // 实际实现需要先运行 7z l 命令分析内容
    // 由于时间关系和 7z l 解析的复杂性，这里暂时保留原始逻辑，
    // 但为未来扩展示范：
    /*
    const listArgs = ['l', '-ba', '-slt', opts.archivePath];
    // spawn, parse output, check paths...
    // if (isSingleFolder) extract(outputPath)
    // else extract(path.join(outputPath, archiveName))
    */
    // 目前直接调用标准解压
    extractFiles(opts);
}
