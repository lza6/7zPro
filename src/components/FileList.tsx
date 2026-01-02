import React, { useState, useEffect, useRef } from 'react';
import { List } from 'react-window';
import type { RowComponentProps } from 'react-window';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Helper for classes
function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs));
}

interface FileItem {
    name: string;
    path: string;
    size: number;
    type: string;
    icon?: string; // Data URL for native icon
}

interface FileListProps {
    files: FileItem[];
    onRemove: (path: string) => void;
}

// File extension to color mapping
const getExtensionColor = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const colorMap: Record<string, string> = {
        // Archives
        '7z': 'bg-yellow-500',
        'zip': 'bg-yellow-400',
        'rar': 'bg-purple-500',
        'tar': 'bg-orange-500',
        'gz': 'bg-orange-400',
        // Documents
        'pdf': 'bg-red-500',
        'doc': 'bg-blue-600',
        'docx': 'bg-blue-600',
        'xls': 'bg-green-600',
        'xlsx': 'bg-green-600',
        'ppt': 'bg-orange-600',
        'pptx': 'bg-orange-600',
        'txt': 'bg-gray-500',
        // Images
        'jpg': 'bg-pink-500',
        'jpeg': 'bg-pink-500',
        'png': 'bg-pink-400',
        'gif': 'bg-pink-600',
        'svg': 'bg-purple-400',
        'webp': 'bg-pink-300',
        // Video
        'mp4': 'bg-indigo-500',
        'mkv': 'bg-indigo-600',
        'avi': 'bg-indigo-400',
        'mov': 'bg-indigo-500',
        // Audio
        'mp3': 'bg-teal-500',
        'wav': 'bg-teal-400',
        'flac': 'bg-teal-600',
        // Code
        'js': 'bg-yellow-400',
        'ts': 'bg-blue-500',
        'py': 'bg-green-500',
        'html': 'bg-orange-500',
        'css': 'bg-blue-400',
        // Executables
        'exe': 'bg-red-600',
        'msi': 'bg-red-500',
        'dll': 'bg-gray-600',
    };
    return colorMap[ext] || 'bg-gray-400';
};

const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const FileList: React.FC<FileListProps> = ({ files, onRemove }) => {
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; path: string } | null>(null);

    const handleContextMenu = (e: React.MouseEvent, path: string) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, path });
    };

    const closeContextMenu = () => setContextMenu(null);

    const handleOpenFolder = (_filePath: string) => {
        // Placeholder - would need shell.showItemInFolder API
        closeContextMenu();
    };

    return (
        <div className="w-full h-full bg-white relative flex flex-col" onClick={closeContextMenu}>
            {/* Header */}
            <div className="flex items-center h-10 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider shrink-0 select-none">
                <div className="w-12 text-center">类型</div>
                <div className="flex-1 px-2">名称</div>
                <div className="w-24 text-right pr-4">大小</div>
                <div className="w-48 text-right pr-4 hidden xl:block">路径</div>
                <div className="w-12"></div>
            </div>

            {/* Virtual List Content */}
            <VirtualListContainer>
                {({ width, height }) => (
                    <List
                        style={{ height, width }}
                        rowCount={files.length}
                        rowHeight={44}
                        className="scrollbar-thin scrollbar-thumb-gray-200 hover:scrollbar-thumb-gray-300"
                        overscanCount={5}
                        rowComponent={Row}
                        rowProps={{ files, onRemove, onContextMenu: handleContextMenu }}
                    />
                )}
            </VirtualListContainer>

            {/* Context Menu */}
            {contextMenu && (
                <div
                    className="fixed bg-white/95 backdrop-blur rounded-lg shadow-xl border border-gray-200 py-1 z-50 animate-in fade-in zoom-in-95 duration-100"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                >
                    <button
                        className="w-full px-4 py-2 text-left text-sm hover:bg-brand/10 text-gray-700 hover:text-brand flex items-center space-x-2 transition-colors"
                        onClick={() => { onRemove(contextMenu.path); closeContextMenu(); }}
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        <span>从列表中移除</span>
                    </button>
                    <button
                        className="w-full px-4 py-2 text-left text-sm hover:bg-brand/10 text-gray-700 hover:text-brand flex items-center space-x-2 transition-colors"
                        onClick={() => handleOpenFolder(contextMenu.path)}
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
                        </svg>
                        <span>打开所在文件夹</span>
                    </button>
                </div>
            )}
        </div>
    );
};

interface RowProps {
    files: FileItem[];
    onRemove: (path: string) => void;
    onContextMenu: (e: React.MouseEvent, path: string) => void;
}

const Row = ({ index, style, files, onRemove, onContextMenu }: RowComponentProps<RowProps>) => {
    const file = files[index];
    if (!file) return <div style={style} />;
    const isOdd = index % 2 !== 0;

    return (
        <div
            style={style}
            className={cn(
                "flex items-center hover:bg-blue-50/80 transition-colors cursor-default group border-b border-gray-100",
                isOdd ? "bg-white" : "bg-gray-50/30"
            )}
            onContextMenu={(e) => onContextMenu(e, file.path)}
        >
            {/* Icon */}
            <div className="w-12 flex items-center justify-center shrink-0">
                {file.icon ? (
                    <img src={file.icon} alt="" className="w-6 h-6 object-contain drop-shadow-sm" />
                ) : (
                    <div className={`w-6 h-6 ${getExtensionColor(file.name)} rounded-md shadow-sm 
                        flex items-center justify-center text-white text-[9px] font-bold uppercase tracking-wider`}>
                        {file.name.split('.').pop()?.slice(0, 3)}
                    </div>
                )}
            </div>

            {/* Name */}
            <div className="flex-1 min-w-0 pr-4">
                <div className="text-sm font-medium text-gray-700 truncate" title={file.name}>
                    {file.name}
                </div>
            </div>

            {/* Size */}
            <div className="w-24 text-right pr-4 text-xs tabular-nums text-gray-500 shrink-0">
                {formatSize(file.size)}
            </div>

            {/* Path */}
            <div className="w-48 text-right pr-4 text-xs text-gray-400 truncate hidden xl:block shrink-0" title={file.path}>
                {file.path}
            </div>

            {/* Actions */}
            <div className="w-12 flex items-center justify-center shrink-0">
                <button
                    onClick={(e) => { e.stopPropagation(); onRemove(file.path); }}
                    className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 
                        transition-all hover:scale-110 active:scale-95 p-1 rounded-full hover:bg-red-50"
                    title="从列表中移除"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
        </div>
    );
};

// Simple container to provide dimensions
const VirtualListContainer: React.FC<{ children: (size: { width: number; height: number }) => React.ReactNode }> = ({ children }) => {
    const parentRef = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({ width: 0, height: 0 });

    useEffect(() => {
        if (!parentRef.current) return;

        const resizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                setSize({ width, height });
            }
        });

        resizeObserver.observe(parentRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    return (
        <div ref={parentRef} className="flex-1 w-full h-full overflow-hidden">
            {size.height > 0 && children(size)}
        </div>
    );
};

export default FileList;
