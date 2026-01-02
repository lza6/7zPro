import React, { useState, useEffect } from 'react';

interface CompressionOptions {
    format: '7z' | 'zip' | 'tar' | 'gz';
    level: 'mx0' | 'mx1' | 'mx5' | 'mx9';
    password?: string;
    splitSize?: string;
    sfx?: boolean;
}

interface CompressionDialogProps {
    isOpen: boolean;
    initialPath: string;
    defaultName?: string; // Smart name passed from parent
    embedded?: boolean; // If true, render without modal overlay (for mini mode)
    onClose: () => void;
    onConfirm: (filename: string, options: CompressionOptions) => void;
}

// Smart split presets
const SPLIT_PRESETS = [
    { label: '无分卷', value: '' },
    { label: '邮件附件 (20M)', value: '20m' },
    { label: 'FAT32 限制 (4G)', value: '4g' },
    { label: 'DVD (4.7G)', value: '4700m' },
    { label: 'CD (650M)', value: '650m' },
    { label: '自定义', value: 'custom' },
];

const CompressionDialog: React.FC<CompressionDialogProps> = ({ isOpen, initialPath, defaultName, embedded = false, onClose, onConfirm }) => {
    const [filename, setFilename] = useState('');
    const [mode, setMode] = useState<'fast' | 'small' | 'smart' | 'custom'>('smart');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isSfx, setIsSfx] = useState(false);
    const [isCompressing, setIsCompressing] = useState(false);

    // Custom Options
    const [format, setFormat] = useState<'7z' | 'zip' | 'tar' | 'gz'>('7z');
    const [level, setLevel] = useState<'mx0' | 'mx1' | 'mx5' | 'mx9'>('mx9');
    const [splitPreset, setSplitPreset] = useState('');
    const [customSplit, setCustomSplit] = useState('');
    const [isCustomOpen, setIsCustomOpen] = useState(false);

    // Disk space warning
    const [diskWarning, setDiskWarning] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            if (defaultName) {
                setFilename(`${defaultName}.${isSfx ? 'exe' : format}`);
            } else if (initialPath) {
                const cleanPath = initialPath.replace(/[\\/]$/, '');
                const name = cleanPath.split(/[\\/]/).pop() || 'archive';
                setFilename(`${name}.${isSfx ? 'exe' : format}`);
            }
            setIsCompressing(false);
            setDiskWarning(null);
        }
    }, [isOpen, initialPath, defaultName, format, isSfx]);

    // Check disk space (simplified - would need actual disk info)
    useEffect(() => {
        // Placeholder: In real implementation, call window.electronAPI.getDiskSpace()
        // For now, just show a warning for very large names
        if (filename.length > 200) {
            setDiskWarning('文件名过长，可能导致问题');
        } else {
            setDiskWarning(null);
        }
    }, [filename]);

    if (!isOpen) return null;

    const handleConfirm = () => {
        if (isCompressing) return;

        setIsCompressing(true);

        let finalLevel = level;
        if (mode === 'fast') finalLevel = 'mx1';
        if (mode === 'small') finalLevel = 'mx9';
        if (mode === 'smart') finalLevel = 'mx5'; // Balanced mode

        const finalSplit = splitPreset === 'custom' ? customSplit : splitPreset;

        onConfirm(filename, {
            format,
            level: finalLevel,
            password: password || undefined,
            splitSize: finalSplit || undefined,
            sfx: isSfx,
        });
    };


    // Embedded mode: no modal overlay, fill container
    if (embedded) {
        return (
            <div className="flex-1 flex flex-col bg-white/95 backdrop-blur-sm font-sans overflow-auto">
                {/* Body */}
                <div className="p-5 space-y-4 flex-1">
                    {/* Filename Input */}
                    <div className="relative">
                        <label className="block text-sm font-medium text-gray-700 mb-1">压缩文件名</label>
                        <input
                            type="text"
                            value={filename}
                            onChange={(e) => setFilename(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm 
                                focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all"
                        />
                    </div>

                    {/* Mode Selection */}
                    <div className="space-y-2">
                        <span className="text-sm font-medium text-gray-700">压缩模式</span>
                        <div className="grid grid-cols-4 gap-2">
                            {(['fast', 'smart', 'small', 'custom'] as const).map((m) => (
                                <button
                                    key={m}
                                    onClick={() => { setMode(m); setIsCustomOpen(m === 'custom'); }}
                                    className={`py-2 px-2 rounded-lg text-sm font-medium transition-all border-2
                                        ${mode === m
                                            ? 'border-brand bg-brand/5 text-brand'
                                            : 'border-gray-200 hover:border-gray-300 text-gray-600'}`}
                                >
                                    {m === 'fast' && '⚡ 速度优先'}
                                    {m === 'smart' && '🎯 智能模式'}
                                    {m === 'small' && '📦 体积优先'}
                                    {m === 'custom' && '⚙️ 自定义'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* SFX Option */}
                    <div className="flex items-center space-x-2 py-1">
                        <input
                            type="checkbox"
                            id="sfx-mini"
                            checked={isSfx}
                            onChange={(e) => setIsSfx(e.target.checked)}
                            className="w-4 h-4 text-brand rounded border-gray-300 focus:ring-brand"
                        />
                        <label htmlFor="sfx-mini" className="text-sm font-medium text-gray-700 cursor-pointer">
                            创建自解压可执行文件 (.exe)
                        </label>
                    </div>

                    {/* Password */}
                    <div className="border-t pt-4">
                        <button
                            onClick={() => setShowPassword(!showPassword)}
                            className="flex items-center text-sm text-amber-600 hover:text-amber-700 font-medium"
                        >
                            🔒 添加密码保护
                            <span className="ml-1">{showPassword ? '▲' : '▼'}</span>
                        </button>
                        {showPassword && (
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="输入密码"
                                className="mt-2 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                            />
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="border-t border-gray-200 px-5 py-3 bg-gray-50 flex justify-end space-x-3">
                    <button
                        onClick={onClose}
                        className="px-5 py-2 text-gray-600 hover:bg-gray-100 text-sm font-medium rounded-lg transition-colors"
                    >
                        取消
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={isCompressing || !filename.trim()}
                        className="px-6 py-2 bg-brand text-white text-sm font-semibold rounded-lg shadow 
                            hover:bg-brand-dark transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isCompressing ? '压缩中...' : '🚀 立即压缩'}
                    </button>
                </div>
            </div>
        );
    }

    // Modal mode: NO dimming mask, just clean white dialog
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center font-sans pointer-events-none">
            <div className="bg-white/80 backdrop-blur-2xl rounded-2xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] w-[580px] overflow-hidden flex flex-col animate-scale-in pointer-events-auto border border-white/20">
                {/* Header */}
                <div className="h-10 bg-gradient-to-r from-brand to-brand-light border-b border-brand-dark flex items-center justify-between px-4 select-none">
                    <div className="flex items-center space-x-2 text-white">
                        <div className="w-5 h-5 bg-white/20 rounded flex items-center justify-center">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <span className="text-sm font-medium">创建压缩文件 - 7zPro</span>
                    </div>
                    <button onClick={onClose} className="text-white/70 hover:text-white hover:bg-white/10 rounded p-1 transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-5">
                    {/* Filename Input */}
                    <div className="relative">
                        <label className="block text-sm font-medium text-gray-700 mb-1">压缩文件名</label>
                        <input
                            type="text"
                            value={filename}
                            onChange={(e) => setFilename(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm 
                                focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all"
                        />
                        {diskWarning && (
                            <div className="absolute right-2 top-8 text-xs text-red-500 font-medium flex items-center">
                                <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                </svg>
                                {diskWarning}
                            </div>
                        )}
                    </div>

                    {/* Mode Selection */}
                    <div className="space-y-2">
                        <span className="text-sm font-medium text-gray-700">压缩模式</span>
                        <div className="grid grid-cols-4 gap-2">
                            {(['fast', 'smart', 'small', 'custom'] as const).map((m) => (
                                <button
                                    key={m}
                                    onClick={() => { setMode(m); setIsCustomOpen(m === 'custom'); }}
                                    className={`py-2.5 px-3 rounded-lg text-sm font-medium transition-all border-2
                                        ${mode === m
                                            ? 'border-brand bg-brand/5 text-brand'
                                            : 'border-gray-200 hover:border-gray-300 text-gray-600'}`}
                                >
                                    {m === 'fast' && '⚡ 速度优先'}
                                    {m === 'smart' && '🎯 智能模式'}
                                    {m === 'small' && '📦 体积优先'}
                                    {m === 'custom' && '⚙️ 自定义'}
                                </button>
                            ))}
                        </div>
                        {mode === 'smart' && (
                            <p className="text-xs text-gray-400 mt-1">
                                智能判断文件类型，自动平衡压缩速度与压缩率
                            </p>
                        )}
                    </div>

                    {/* Custom Options */}
                    {isCustomOpen && (
                        <div className="space-y-4 p-4 bg-gray-50 rounded-lg border border-gray-100 animate-fade-in-down">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">压缩格式</label>
                                    <select
                                        value={format}
                                        onChange={(e) => setFormat(e.target.value as any)}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand"
                                    >
                                        <option value="7z">7Z (最佳压缩率)</option>
                                        <option value="zip">ZIP (兼容性好)</option>
                                        <option value="tar">TAR (打包无压缩)</option>
                                        <option value="gz">GZIP (单个文件)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">压缩等级</label>
                                    <select
                                        value={level}
                                        onChange={(e) => setLevel(e.target.value as any)}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand"
                                    >
                                        <option value="mx0">仅存储 (最快)</option>
                                        <option value="mx1">快速压缩</option>
                                        <option value="mx5">标准压缩</option>
                                        <option value="mx9">极限压缩 (最小)</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">分卷大小</label>
                                <div className="flex space-x-2">
                                    <select
                                        value={splitPreset}
                                        onChange={(e) => setSplitPreset(e.target.value)}
                                        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand"
                                    >
                                        {SPLIT_PRESETS.map(p => (
                                            <option key={p.value} value={p.value}>{p.label}</option>
                                        ))}
                                    </select>
                                    {splitPreset === 'custom' && (
                                        <input
                                            type="text"
                                            placeholder="如: 100m, 1g"
                                            value={customSplit}
                                            onChange={(e) => setCustomSplit(e.target.value)}
                                            className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand"
                                        />
                                    )}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">选项</label>
                                <div className="flex items-center space-x-4">
                                    <label className="flex items-center space-x-2 text-xs text-gray-700 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={isSfx}
                                            onChange={(e) => setIsSfx(e.target.checked)}
                                            className="w-4 h-4 text-brand rounded border-gray-300"
                                        />
                                        <span>创建自解压 (SFX)</span>
                                    </label>
                                </div>
                            </div>
                        </div>
                    )}

                    <hr className="border-gray-100" />

                    {/* Password Section */}
                    <div className="space-y-3">
                        <button
                            type="button"
                            className="flex items-center space-x-2 text-sm text-amber-600 hover:text-amber-700 font-medium transition-colors"
                            onClick={() => setShowPassword(!showPassword)}
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                            <span>{showPassword ? '隐藏密码设置' : '🔒 添加密码保护'}</span>
                            <svg className={`w-4 h-4 transition-transform ${showPassword ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>

                        {showPassword && (
                            <div className="animate-fade-in-down">
                                <input
                                    type="password"
                                    placeholder="输入加密密码"
                                    className="w-full border border-amber-200 bg-amber-50 rounded-lg px-3 py-2.5 text-sm 
                                        focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                                <p className="text-xs text-amber-600 mt-1">
                                    使用 AES-256 加密。7Z 格式还会加密文件列表。
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="h-16 bg-gray-50 flex items-center justify-end px-6 space-x-3 border-t border-gray-100">
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 text-gray-600 text-sm font-medium hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        取消
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={isCompressing || !filename.trim()}
                        className={`px-6 py-2.5 rounded-lg text-sm font-medium shadow-md transition-all
                            flex items-center space-x-2
                            ${isCompressing || !filename.trim()
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : 'bg-brand hover:bg-brand-dark text-white hover:shadow-lg active:scale-95'}`}
                    >
                        {isCompressing ? (
                            <>
                                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <span>压缩中...</span>
                            </>
                        ) : (
                            <>
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                </svg>
                                <span>立即压缩</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CompressionDialog;
