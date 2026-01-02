import fs from 'fs';
import path from 'path';
import { app } from 'electron';

// ============ Configuration ============
const MAX_LOG_LINES = 500;           // Maximum lines per log file
const MAX_LOG_AGE_DAYS = 7;          // Auto-delete logs older than this
const TRUNCATE_CHECK_INTERVAL = 50;  // Check line count every N writes

// Log directory in user's AppData
const getLogDir = () => {
    const logDir = path.join(app.getPath('userData'), 'logs');
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
    return logDir;
};

// Track state
let hasLoggedPath = false;
let writeCounter = 0;

// Get current log file path (one file per day)
const getLogFilePath = () => {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const logPath = path.join(getLogDir(), `${date}.log`);
    // Print logs location to console for user visibility
    if (!hasLoggedPath) {
        console.log(`[LOGS] Log file location: ${logPath}`);
        hasLoggedPath = true;
        // Clean old logs on startup
        cleanOldLogs();
    }
    return logPath;
};

// Truncate log file to keep only the last MAX_LOG_LINES lines
function truncateLogFile(filePath: string): void {
    try {
        if (!fs.existsSync(filePath)) return;

        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');

        if (lines.length > MAX_LOG_LINES) {
            // Keep only the last MAX_LOG_LINES lines
            const truncatedLines = lines.slice(-MAX_LOG_LINES);
            // Add a marker showing truncation happened
            const marker = `[TRUNCATED] Removed ${lines.length - MAX_LOG_LINES} old lines\n`;
            fs.writeFileSync(filePath, marker + truncatedLines.join('\n'));
            console.log(`[LOGS] Truncated log file to ${MAX_LOG_LINES} lines`);
        }
    } catch (err) {
        console.error('Failed to truncate log file:', err);
    }
}

// Clean up old log files (older than MAX_LOG_AGE_DAYS)
function cleanOldLogs(): void {
    try {
        const logDir = getLogDir();
        const files = fs.readdirSync(logDir);
        const now = Date.now();
        const maxAge = MAX_LOG_AGE_DAYS * 24 * 60 * 60 * 1000;

        for (const file of files) {
            if (!file.endsWith('.log')) continue;

            const filePath = path.join(logDir, file);
            const stat = fs.statSync(filePath);

            if (now - stat.mtimeMs > maxAge) {
                fs.unlinkSync(filePath);
                console.log(`[LOGS] Deleted old log file: ${file}`);
            }
        }
    } catch (err) {
        console.error('Failed to clean old logs:', err);
    }
}

// Log levels
type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

// Main logging function
export function log(level: LogLevel, message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    let logLine = `[${timestamp}] [${level}] ${message}`;

    if (data !== undefined) {
        try {
            const dataStr = typeof data === 'object' ? JSON.stringify(data) : String(data);
            logLine += ` | Data: ${dataStr}`;
        } catch {
            logLine += ` | Data: [Unable to serialize]`;
        }
    }

    logLine += '\n';

    // Console output
    const consoleFn = level === 'ERROR' ? console.error :
        level === 'WARN' ? console.warn : console.log;
    consoleFn(logLine.trim());

    // File output
    try {
        const logPath = getLogFilePath();
        fs.appendFileSync(logPath, logLine);

        // Periodically check if truncation is needed
        writeCounter++;
        if (writeCounter >= TRUNCATE_CHECK_INTERVAL) {
            writeCounter = 0;
            truncateLogFile(logPath);
        }
    } catch (err) {
        console.error('Failed to write to log file:', err);
    }
}

// Convenience methods
export const logger = {
    info: (message: string, data?: any) => log('INFO', message, data),
    warn: (message: string, data?: any) => log('WARN', message, data),
    error: (message: string, data?: any) => log('ERROR', message, data),
    debug: (message: string, data?: any) => log('DEBUG', message, data),
};

// Log 7z output specifically (simplified to reduce log volume)
export function log7zOutput(output: string): void {
    // Only log non-empty meaningful lines to reduce spam
    const lines = output.split('\n').filter(line => {
        const trimmed = line.trim();
        // Skip empty lines and pure percentage lines (too frequent)
        return trimmed && !trimmed.match(/^\d+%\s*$/);
    });
    for (const line of lines) {
        log('DEBUG', `7z: ${line.trim()}`);
    }
}

// Log 7z error output
export function log7zError(output: string): void {
    const lines = output.split('\n').filter(line => line.trim());
    for (const line of lines) {
        log('ERROR', `7z Error: ${line.trim()}`);
    }
}

export default logger;
