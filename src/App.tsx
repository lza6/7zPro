import React, { useState, useCallback, useEffect } from 'react';
import TitleBar from './components/TitleBar';
import FileList from './components/FileList';
import ProgressModal from './components/ProgressModal';
import CompressionDialog from './components/CompressionDialog';
import './index.css';
import './electron.d.ts'; // Import types

interface FileItem {
  name: string;
  path: string;
  size: number;
  type: string;
  icon?: string;
}

function App() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState({ visible: false, percent: 0, status: '', speed: 0, currentFile: '', processedBytes: 0 });
  const [showCompressionDialog, setShowCompressionDialog] = useState(false);
  const [queueLength, setQueueLength] = useState(0);

  // Mini mode - launched from right-click context menu
  const [isMiniMode, setIsMiniMode] = useState(() => {
    // Check URL query for mini mode
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('mini') === 'true';
  });


  // Setup IPC listeners with proper cleanup
  useEffect(() => {
    const api = window.electronAPI;
    if (!api) {
      console.warn('electronAPI not available - running outside Electron?');
      return;
    }

    const cleanupProgress = api.onProgress((info) => {
      setProgress(prev => ({
        ...prev,
        visible: true,
        percent: info.percent,
        speed: info.speed || 0,
        currentFile: info.currentFile || '',
        processedBytes: info.processedBytes || 0, // Add this
        status: info.currentFile ? `正在处理: ${info.currentFile.split(/[\\/]/).pop()}` : '正在压缩...',
      }));
    });

    const cleanupComplete = api.onComplete(() => {
      setProgress(prev => ({ ...prev, percent: 100, status: '压缩完成!' }));
    });

    const cleanupError = api.onError((err) => {
      setProgress(prev => ({ ...prev, status: `错误: ${err}` }));
    });

    const cleanupOpenDialog = api.onOpenDialog(async (filePath) => {
      try {
        const stat = await api.getFileStat(filePath);
        const name = filePath.split(/[\\/]/).pop() || 'file';

        // Get native icon
        let icon: string | undefined;
        try {
          icon = await api.getFileIcon(filePath) || undefined;
        } catch {
          // Ignore icon errors
        }

        setFiles(prev => {
          // Check if already in queue
          if (prev.some(f => f.path === filePath)) {
            return prev;
          }
          return [...prev, {
            name,
            path: filePath,
            size: stat.size,
            type: stat.isDirectory ? 'Folder' : 'File',
            icon
          }];
        });
        setShowCompressionDialog(true);
      } catch (e) {
        console.error('Failed to read file from context menu:', e);
      }
    });

    // Mini mode initialization - right-click context menu launches this
    const cleanupMiniMode = api.onMiniModeInit(async (filePath) => {
      setIsMiniMode(true);
      try {
        const stat = await api.getFileStat(filePath);
        const name = filePath.split(/[\\/]/).pop() || 'file';

        // Update files state
        const newFiles = [{
          name,
          path: filePath,
          size: stat.size,
          type: stat.isDirectory ? 'Folder' : 'File',
        }];
        setFiles(newFiles);

        // Auto-action based on mode
        const urlParams = new URLSearchParams(window.location.search);
        const mode = urlParams.get('mode');

        if (mode === 'extract' || mode === 'extract-sub') {
          // We need to trigger extraction. 
          let outputPath = '';

          if (mode === 'extract-sub') {
            // Extract to subfolder: remove extension (e.g. C:/foo/bar.zip -> C:/foo/bar)
            outputPath = filePath.replace(/\.[^/.]+$/, '');
          } else {
            // Extract here: parent directory (e.g. C:/foo/bar.zip -> C:/foo)
            outputPath = filePath.replace(/[\\/][^\\/]+$/, '');
          }

          setProgress({ visible: true, percent: 0, status: '正在准备解压...', speed: 0, currentFile: '', processedBytes: 0 });
          // Small delay to ensure UI renders
          setTimeout(() => {
            api.extract({ archivePath: filePath, outputPath });
          }, 300);
        } else {
          // Compress mode (default)
          setShowCompressionDialog(true);
        }

      } catch (e) {
        console.error('Failed to initialize mini mode:', e);
      }
    });

    const cleanupQueue = api.on('queue-length-update', (length: number) => {
      setQueueLength(length);
    });

    // Task cancelled event - cleanup completed, handle window close
    const cleanupCancelled = api.onTaskCancelled(() => {
      console.log('[App] Task cancelled event received');
      setProgress(prev => ({ ...prev, visible: false, percent: 0, status: '' }));

      // In mini mode, quit the app after cancel
      if (isMiniMode) {
        setTimeout(() => {
          api.quitApp();
        }, 300);
      }
    });

    // Cleanup all listeners on unmount
    return () => {
      cleanupProgress();
      cleanupComplete();
      cleanupError();
      cleanupOpenDialog();
      cleanupMiniMode();
      cleanupQueue();
      cleanupCancelled();
    };
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    const api = window.electronAPI;

    // If there are existing files, ask what to do
    if (files.length > 0 && api) {
      const choice = await api.showQueueDialog(
        `已有 ${files.length} 个文件。要如何处理新拖入的 ${droppedFiles.length} 个文件？`
      );

      if (choice === 'cancel') return;
      if (choice === 'parallel') {
        // Clear existing and add new
        setFiles([]);
      }
      // 'queue' - just add to existing list
    }

    const newFiles: FileItem[] = [];
    for (const f of droppedFiles) {
      const fileItem: FileItem = {
        name: f.name,
        path: (f as any).path,
        size: f.size,
        type: f.type || 'Unknown'
      };

      // Try to get native icon
      if (api) {
        try {
          const icon = await api.getFileIcon((f as any).path);
          if (icon) fileItem.icon = icon;
        } catch {
          // Ignore
        }
      }

      newFiles.push(fileItem);
    }

    setFiles(prev => {
      const combined = [...prev];
      for (const nf of newFiles) {
        if (!combined.some(f => f.path === nf.path)) {
          combined.push(nf);
        }
      }
      return combined;
    });
  }, [files.length]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const openCompressDialog = () => {
    if (files.length === 0) return;
    setShowCompressionDialog(true);
  };

  const handleConfirmCompression = (filename: string, options: any) => {
    setShowCompressionDialog(false);
    if (files.length === 0) return;

    const firstFile = files[0].path;
    if (!firstFile) return;

    // Get directory of first file
    const dir = firstFile.replace(/[\\/][^\\/]+$/, '');
    const archivePath = `${dir}\\${filename}`;
    const filePaths = files.map(f => f.path).filter(p => !!p);

    if (filePaths.length === 0) return;

    // Calculate total bytes for speed estimation
    const totalBytes = files.reduce((acc, f) => acc + f.size, 0);

    setProgress({ visible: true, percent: 0, status: '准备开始...', speed: 0, currentFile: '', processedBytes: 0 });
    window.electronAPI?.compress({ files: filePaths, archivePath, options, totalBytes });
  };

  // Smart Naming Calculation
  const getDefaultName = useCallback(() => {
    if (files.length === 0) return '';
    const firstFile = files[0];
    const namePart = firstFile.name.replace(/\.[^/.]+$/, ""); // Remove extension

    if (files.length === 1) {
      return namePart;
    } else {
      // e.g. "Doc1 + 2 files"
      return `${namePart} 等 ${files.length} 个文件`;
    }
  }, [files]);

  const startExtraction = useCallback(() => {
    if (files.length === 0) return;
    const firstFile = files[0].path;
    const outputPath = firstFile.replace(/\.[^/.]+$/, ''); // Remove extension

    setProgress({ visible: true, percent: 0, status: '正在解压...', speed: 0, currentFile: '', processedBytes: 0 });
    window.electronAPI?.extract({ archivePath: firstFile, outputPath });
  }, [files]);

  const handleCancelTask = () => {
    window.electronAPI?.cancelTask();
    setProgress(prev => ({ ...prev, status: '正在取消并清理...' }));
    // Note: The actual window close/progress hide is handled by onTaskCancelled callback
  };

  const [isPaused, setIsPaused] = useState(false);

  // Toggle pause
  const handleTogglePause = () => {
    const newPaused = !isPaused;
    setIsPaused(newPaused);
    window.electronAPI?.togglePauseTask(newPaused);
  };

  // Handle closing compression dialog in mini mode
  const handleMiniModeClose = () => {
    // If task is running (visible progress) and NOT complete, hide to background
    if (progress.visible && progress.percent < 100) {
      window.electronAPI?.windowControl('minimize'); // Minimize to tray (hide)
      return;
    }

    // Otherwise quit
    setShowCompressionDialog(false);
    window.electronAPI?.quitApp();
  };

  // Handle progress completion - auto quit cleanly without showing dialog again
  useEffect(() => {
    if (isMiniMode && progress.percent === 100) {
      // Wait briefly to show 100% then quit directly
      const timer = setTimeout(() => {
        window.electronAPI?.quitApp();
      }, 150); // 0.15s delay
      return () => clearTimeout(timer);
    }
  }, [progress.percent, isMiniMode]);

  // Mini mode - only show compression dialog and progress modal
  if (isMiniMode) {
    return (
      <div className="h-screen w-screen flex flex-col bg-white/90 backdrop-blur-md overflow-hidden rounded-lg shadow-2xl border border-gray-200">
        {/* Custom draggable title bar for mini mode */}
        <div
          className="h-10 bg-gradient-to-r from-brand to-blue-600 flex items-center justify-between px-4 shrink-0"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <div className="flex items-center space-x-2 text-white">
            <span className="text-sm font-medium">7zPro - 快速压缩</span>
          </div>
          <div
            className="flex items-center space-x-1"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <button
              // Minimize button always minimizes window logic
              onClick={() => window.electronAPI?.windowControl('minimize')}
              className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/20 text-white transition-colors"
            >
              <span className="text-lg leading-none">−</span>
            </button>
            <button
              onClick={handleMiniModeClose}
              className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-500 text-white transition-colors"
            >
              <span className="text-lg leading-none">×</span>
            </button>
          </div>
        </div>

        {/* Main content area - fills remaining space */}
        <div className="flex-1 overflow-auto">
          <ProgressModal
            isOpen={progress.visible}
            progress={{
              percent: progress.percent,
              status: progress.status,
              speed: progress.speed,
              currentFile: progress.currentFile,
              processedBytes: progress.processedBytes
            }}
            onClose={() => { /* Do nothing on close click during end phase, let effect quit */ }}
            onCancel={handleCancelTask}
            onMinimize={() => window.electronAPI?.windowControl('minimize')}
            onPauseResume={handleTogglePause}
          />

          {!progress.visible && (
            <CompressionDialog
              isOpen={true}
              embedded={true}
              initialPath={files.length > 0 ? files[0].path : ''}
              defaultName={getDefaultName()}
              onClose={handleMiniModeClose}
              onConfirm={handleConfirmCompression}
            />
          )}
        </div>
      </div>
    );
  }

  // Normal mode - full UI
  return (
    <div className="flex flex-col h-screen bg-gray-50 rounded-lg overflow-hidden shadow-2xl">
      <ProgressModal
        isOpen={progress.visible}
        progress={{
          percent: progress.percent,
          status: progress.status,
          speed: progress.speed,
          currentFile: progress.currentFile,
          processedBytes: progress.processedBytes
        }}
        onClose={() => setProgress(prev => ({ ...prev, visible: false }))}
        onCancel={handleCancelTask}
        onMinimize={() => window.electronAPI?.windowControl('minimize')}
        onPauseResume={handleTogglePause}
      />

      <CompressionDialog
        isOpen={showCompressionDialog}
        initialPath={files.length > 0 ? files[0].path : ''}
        defaultName={getDefaultName()}
        onClose={() => setShowCompressionDialog(false)}
        onConfirm={handleConfirmCompression}
      />

      <TitleBar />

      {/* Toolbar */}
      <div className="h-12 bg-white border-b border-gray-200 flex items-center px-4 space-x-2">
        <ToolbarButton icon="add" label="添加" onClick={() => alert('请直接拖入文件')} />
        <div className="w-px h-6 bg-gray-300 mx-2"></div>
        <ToolbarButton icon="compress" label="压缩" onClick={openCompressDialog} disabled={files.length === 0} />
        <ToolbarButton icon="extract" label="解压" onClick={startExtraction} disabled={files.length === 0} />
        <div className="w-px h-6 bg-gray-300 mx-2"></div>
        <ToolbarButton icon="delete" label="清空" onClick={() => setFiles([])} disabled={files.length === 0} />
        <div className="w-px h-6 bg-gray-300 mx-2"></div>
        <ToolbarButton icon="settings" label="注册菜单" onClick={() => {
          window.electronAPI?.registerMenu();
          alert('正在注册右键菜单...');
        }} />
        <ToolbarButton icon="delete" label="取消注册" onClick={() => {
          window.electronAPI?.unregisterMenu();
          alert('正在取消注册右键菜单...');
        }} />
      </div>

      <main
        className={`flex-1 flex flex-col items-center justify-center overflow-hidden relative transition-all duration-200
                    ${isDragging ? 'bg-blue-50 ring-2 ring-brand ring-inset' : 'bg-gray-50'}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {/* Drag overlay effect */}
        {isDragging && (
          <div className="absolute inset-4 border-2 border-dashed border-brand rounded-xl bg-brand/5 
                        flex items-center justify-center z-10 pointer-events-none animate-pulse-soft">
            <div className="text-brand text-lg font-medium">
              松开鼠标添加文件
            </div>
          </div>
        )}

        {files.length > 0 ? (
          <FileList files={files} onRemove={(path) => setFiles(prev => prev.filter(f => f.path !== path))} />
        ) : (
          <div className="text-center space-y-4 pointer-events-none select-none">
            <div className="w-20 h-20 mx-auto bg-gradient-to-br from-blue-100 to-blue-200 text-brand rounded-2xl 
                            flex items-center justify-center shadow-lg">
              <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-700">拖入文件到这里</h2>
              <p className="text-sm text-gray-500 mt-1">支持格式: 7z, ZIP, RAR, TAR, GZ</p>
            </div>
          </div>
        )}
      </main>

      {/* Status Bar */}
      <div className="h-7 bg-gradient-to-r from-brand to-brand-light text-white text-xs flex items-center px-4 justify-between select-none">
        <span>已选择 {files.length} 个对象</span>
        <div className="flex items-center space-x-4">
          {queueLength > 0 && (
            <span className="flex items-center text-amber-100 animate-pulse">
              <span className="w-2 h-2 bg-amber-400 rounded-full mr-1.5"></span>
              等待中: {queueLength} 个任务
            </span>
          )}
          <span>
            总大小: {formatBytes(files.reduce((acc, f) => acc + f.size, 0))}
          </span>
        </div>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

interface ToolbarButtonProps {
  icon: string;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}

const ToolbarButton: React.FC<ToolbarButtonProps> = ({ icon, label, onClick, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`flex flex-col items-center justify-center w-16 py-1 rounded-lg transition-all
            ${disabled
        ? 'opacity-50 cursor-not-allowed'
        : 'hover:bg-gray-100 active:bg-gray-200 active:scale-95 text-gray-700'}`}
  >
    <div className={`w-6 h-6 mb-1 ${disabled ? 'text-gray-300' : 'text-brand'}`}>
      {icon === 'add' && (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      )}
      {icon === 'compress' && (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      )}
      {icon === 'extract' && (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
        </svg>
      )}
      {icon === 'delete' && (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      )}
      {icon === 'settings' && (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      )}
    </div>
    <span className="text-xs font-medium">{label}</span>
  </button>
);

export default App;
