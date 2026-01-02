"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
exports.log = log;
exports.log7zOutput = log7zOutput;
exports.log7zError = log7zError;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const electron_1 = require("electron");
// ============ Configuration ============
const MAX_LOG_LINES = 500; // Maximum lines per log file
const MAX_LOG_AGE_DAYS = 7; // Auto-delete logs older than this
const TRUNCATE_CHECK_INTERVAL = 50; // Check line count every N writes
// Log directory in user's AppData
const getLogDir = () => {
    const logDir = path_1.default.join(electron_1.app.getPath('userData'), 'logs');
    if (!fs_1.default.existsSync(logDir)) {
        fs_1.default.mkdirSync(logDir, { recursive: true });
    }
    return logDir;
};
// Track state
let hasLoggedPath = false;
let writeCounter = 0;
// Get current log file path (one file per day)
const getLogFilePath = () => {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const logPath = path_1.default.join(getLogDir(), `${date}.log`);
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
function truncateLogFile(filePath) {
    try {
        if (!fs_1.default.existsSync(filePath))
            return;
        const content = fs_1.default.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        if (lines.length > MAX_LOG_LINES) {
            // Keep only the last MAX_LOG_LINES lines
            const truncatedLines = lines.slice(-MAX_LOG_LINES);
            // Add a marker showing truncation happened
            const marker = `[TRUNCATED] Removed ${lines.length - MAX_LOG_LINES} old lines\n`;
            fs_1.default.writeFileSync(filePath, marker + truncatedLines.join('\n'));
            console.log(`[LOGS] Truncated log file to ${MAX_LOG_LINES} lines`);
        }
    }
    catch (err) {
        console.error('Failed to truncate log file:', err);
    }
}
// Clean up old log files (older than MAX_LOG_AGE_DAYS)
function cleanOldLogs() {
    try {
        const logDir = getLogDir();
        const files = fs_1.default.readdirSync(logDir);
        const now = Date.now();
        const maxAge = MAX_LOG_AGE_DAYS * 24 * 60 * 60 * 1000;
        for (const file of files) {
            if (!file.endsWith('.log'))
                continue;
            const filePath = path_1.default.join(logDir, file);
            const stat = fs_1.default.statSync(filePath);
            if (now - stat.mtimeMs > maxAge) {
                fs_1.default.unlinkSync(filePath);
                console.log(`[LOGS] Deleted old log file: ${file}`);
            }
        }
    }
    catch (err) {
        console.error('Failed to clean old logs:', err);
    }
}
// Main logging function
function log(level, message, data) {
    const timestamp = new Date().toISOString();
    let logLine = `[${timestamp}] [${level}] ${message}`;
    if (data !== undefined) {
        try {
            const dataStr = typeof data === 'object' ? JSON.stringify(data) : String(data);
            logLine += ` | Data: ${dataStr}`;
        }
        catch {
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
        fs_1.default.appendFileSync(logPath, logLine);
        // Periodically check if truncation is needed
        writeCounter++;
        if (writeCounter >= TRUNCATE_CHECK_INTERVAL) {
            writeCounter = 0;
            truncateLogFile(logPath);
        }
    }
    catch (err) {
        console.error('Failed to write to log file:', err);
    }
}
// Convenience methods
exports.logger = {
    info: (message, data) => log('INFO', message, data),
    warn: (message, data) => log('WARN', message, data),
    error: (message, data) => log('ERROR', message, data),
    debug: (message, data) => log('DEBUG', message, data),
};
// Log 7z output specifically (simplified to reduce log volume)
function log7zOutput(output) {
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
function log7zError(output) {
    const lines = output.split('\n').filter(line => line.trim());
    for (const line of lines) {
        log('ERROR', `7z Error: ${line.trim()}`);
    }
}
exports.default = exports.logger;
