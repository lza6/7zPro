import React, { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Helper for classes
function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs));
}

export interface ProgressInfo {
    percent: number;
    currentFile?: string;
    processedBytes?: number;
    speed?: number; // bytes per second
    status?: string;
}

interface ProgressModalProps {
    isOpen: boolean;
    progress: ProgressInfo | null;
    onClose: () => void;
    onCancel: () => void;
    onMinimize: () => void;
    onPauseResume: (paused: boolean) => void;
}

// EMA (Exponential Moving Average) alpha
const EMA_ALPHA = 0.15;

const ProgressModal: React.FC<ProgressModalProps> = ({ isOpen, progress, onClose, onCancel, onMinimize, onPauseResume }) => {
    const [isPaused, setIsPaused] = useState(false);

    // EMA State
    const [smoothedSpeed, setSmoothedSpeed] = useState<number>(0);
    const [lastProcessedBytes, setLastProcessedBytes] = useState<number>(0);
    const [lastUpdateTime, setLastUpdateTime] = useState<number>(Date.now());
    const [remainingTimeStr, setRemainingTimeStr] = useState<string>('计算中...');

    // Reset EMA on open
    useEffect(() => {
        if (!isOpen) {
            setSmoothedSpeed(0);
            setLastProcessedBytes(0);
            setRemainingTimeStr('计算中...');
            setIsPaused(false);
        }
    }, [isOpen]);

    // Update EMA & Calculate Time
    useEffect(() => {
        if (!progress || !isOpen || isPaused) return;

        const now = Date.now();
        const timeDiff = (now - lastUpdateTime) / 1000; // seconds

        // Only update if we have enough time passed (debounce slightly) or significant byte change
        if (progress.processedBytes !== undefined && timeDiff > 0.1) {
            const bytesDiff = progress.processedBytes - lastProcessedBytes;
            // Instant speed
            const instantSpeed = bytesDiff > 0 ? bytesDiff / timeDiff : 0;

            // EMA calculation
            let newSpeed = instantSpeed;
            if (smoothedSpeed > 0) {
                newSpeed = (instantSpeed * EMA_ALPHA) + (smoothedSpeed * (1 - EMA_ALPHA));
            } else if (progress.speed) {
                // If this is first calc, try to use backend speed as seed if available
                newSpeed = progress.speed; // Or just instantSpeed
            }

            setSmoothedSpeed(newSpeed);
            setLastProcessedBytes(progress.processedBytes);
            setLastUpdateTime(now);

            // Calculate Remaining Time
            if (progress.percent > 0 && newSpeed > 0) {
                // Estimate total bytes
                const totalBytesEst = progress.processedBytes / (progress.percent / 100);
                const remainingBytes = totalBytesEst - progress.processedBytes;
                const seconds = Math.ceil(remainingBytes / newSpeed);

                let timeStr = '';
                if (seconds < 60) {
                    timeStr = `${seconds} 秒`;
                } else if (seconds < 3600) {
                    timeStr = `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
                } else {
                    timeStr = `${Math.floor(seconds / 3600)} 小时 ${Math.floor((seconds % 3600) / 60)} 分`;
                }
                setRemainingTimeStr(timeStr);
            }
        }
    }, [progress, isOpen, isPaused]);


    if (!isOpen || !progress) return null;

    const handlePauseToggle = () => {
        const newState = !isPaused;
        setIsPaused(newState);
        onPauseResume(newState);
    };

    const formatSpeed = (bytesPerSec: number) => {
        if (!bytesPerSec) return '0 B/s';
        const k = 1024;
        const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
        const i = Math.floor(Math.log(bytesPerSec) / Math.log(k));
        return parseFloat((bytesPerSec / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl w-[480px] overflow-hidden border border-gray-100 flex flex-col">
                {/* Header */}
                <div className="bg-gray-50/50 px-6 py-4 flex justify-between items-center border-b border-gray-100">
                    <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                        {progress.status === '扫描中...' ? (
                            <span className="animate-pulse">🔍 正在扫描...</span>
                        ) : (
                            <span>📦 正在处理...</span>
                        )}
                    </h3>
                    <div className="flex gap-2">
                        <button onClick={onMinimize} className="p-1.5 hover:bg-gray-200 rounded-md text-gray-500 transition-colors" title="最小化">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                    {/* File Info */}
                    <div>
                        <div className="text-sm text-gray-500 mb-1 flex justify-between">
                            <span>当前文件:</span>
                            <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-600">
                                {progress.percent}%
                            </span>
                        </div>
                        <div className="text-sm font-medium text-gray-800 truncate" title={progress.currentFile}>
                            {progress.currentFile || '准备中...'}
                        </div>
                    </div>

                    {/* Progress Bar with Glow */}
                    <div className="relative h-3 bg-gray-100 rounded-full overflow-hidden shadow-inner">
                        <div
                            className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-300 ease-out flex items-center"
                            style={{ width: `${progress.percent}%` }}
                        >
                            {/* Shimmer/Glow Effect */}
                            <div className="w-full h-full absolute top-0 left-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full animate-[shimmer_2s_infinite]"></div>
                        </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                            <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">处理速度</div>
                            <div className="text-lg font-bold text-gray-700 font-mono">
                                {formatSpeed(smoothedSpeed)}
                            </div>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                            <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">剩余时间</div>
                            <div className="text-lg font-bold text-gray-700 font-mono">
                                {remainingTimeStr}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3 border-t border-gray-100">
                    <button
                        onClick={handlePauseToggle}
                        className={cn(
                            "px-4 py-2 text-sm font-medium rounded-lg transition-all active:scale-95 shadow-sm border",
                            isPaused
                                ? "bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-200"
                                : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                        )}
                    >
                        {isPaused ? '继续任务' : '暂停任务'}
                    </button>
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-sm font-medium rounded-lg bg-white text-red-600 border border-red-200 hover:bg-red-50 hover:border-red-300 transition-all active:scale-95 shadow-sm"
                    >
                        取消
                    </button>
                    <button
                        onClick={onClose} // Only valid when finished? Actually main window handles hiding.
                        className="hidden" // Generally we don't manually close while running unless hidden
                    >
                        Hide
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ProgressModal;
