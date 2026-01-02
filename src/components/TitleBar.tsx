import React from 'react';

const TitleBar: React.FC = () => {
    const api = window.electronAPI;

    const minimize = () => api?.windowControl('minimize');
    const maximize = () => api?.windowControl('maximize');
    const close = () => api?.windowControl('close');

    return (
        <div className="h-8 bg-gradient-to-r from-brand/90 to-brand-light/90 backdrop-blur-md flex items-center justify-between 
            titlebar-drag-region select-none text-white shadow-md">
            <div className="px-3 flex items-center space-x-2">
                {/* App Icon */}
                <div className="w-5 h-5 bg-white/20 rounded flex items-center justify-center backdrop-blur-sm">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm4 5a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                    </svg>
                </div>
                <span className="text-sm font-semibold tracking-wide">7zPro</span>
                <span className="text-xs text-white/60 hidden sm:inline">高性能压缩工具</span>
            </div>

            <div className="flex h-full titlebar-no-drag">
                <button
                    onClick={minimize}
                    className="w-11 h-full flex items-center justify-center hover:bg-white/10 transition-colors focus:outline-none"
                    title="最小化"
                >
                    <svg className="w-3 h-[2px]" fill="currentColor" viewBox="0 0 12 2">
                        <rect width="12" height="2" rx="1" />
                    </svg>
                </button>
                <button
                    onClick={maximize}
                    className="w-11 h-full flex items-center justify-center hover:bg-white/10 transition-colors focus:outline-none"
                    title="最大化"
                >
                    <div className="w-[10px] h-[10px] border-2 border-current rounded-sm"></div>
                </button>
                <button
                    onClick={close}
                    className="w-11 h-full flex items-center justify-center hover:bg-red-500 transition-colors focus:outline-none"
                    title="关闭"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
        </div>
    );
};

export default TitleBar;
