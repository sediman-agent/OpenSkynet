import { useState, useCallback, useEffect, useRef } from 'react';
import { ElectronWebView } from '@/components/electron/ElectronWebView';
import { X, Plus, Maximize2, Minimize2, RefreshCw, ExternalLink, Globe, XCircle, Upload, FileText } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { useSandboxStore } from '@/stores/useSandboxStore';
import { SkillRecordingControls } from '@/components/skills/SkillRecordingControls';
import { cn } from '@/lib/utils';

interface Tab {
  id: string;
  title: string;
  url: string;
  isActive: boolean;
}

interface UploadedFile {
  name: string;
  path: string;
  size: number;
}

export function SandboxPanel() {
  const isOpen = useSandboxStore(state => state.isOpen);
  const isActive = useSandboxStore(state => state.isActive);
  const togglePanel = useSandboxStore(state => state.togglePanel);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [panelWidth, setPanelWidth] = useState(600);
  const [isResizing, setIsResizing] = useState(false);
  const [browserUrl] = useState('https://www.google.com');
  const [tabs, setTabs] = useState<Tab[]>([
    { id: '1', title: 'Browser', url: 'https://www.google.com', isActive: true }
  ]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const apiBaseUrl = 'http://localhost:3001';

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isFullscreen) return;
    setIsResizing(true);
    e.preventDefault();
  }, [isFullscreen]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    const newWidth = window.innerWidth - e.clientX;
    if (newWidth >= 400 && newWidth <= window.innerWidth - 100) {
      setPanelWidth(newWidth);
    }
  }, [isResizing]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizing, handleMouseMove, handleMouseUp]);

  const addTab = () => {
    const newTab: Tab = {
      id: Date.now().toString(),
      title: 'New Tab',
      url: 'https://www.google.com',
      isActive: true
    };
    setTabs(prev => prev.map(t => ({ ...t, isActive: false })).concat(newTab));
  };

  const closeTab = (tabId: string) => {
    if (tabs.length === 1) return;
    setTabs(prev => {
      const filtered = prev.filter(t => t.id !== tabId);
      if (prev.find(t => t.id === tabId)?.isActive) {
        filtered[filtered.length - 1].isActive = true;
      }
      return filtered;
    });
  };

  const switchTab = (tabId: string) => {
    setTabs(prev => prev.map(t => ({ ...t, isActive: t.id === tabId })));
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }

    try {
      const response = await fetch(`${apiBaseUrl}/api/files/upload`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.uploaded) {
          setUploadedFiles(prev => [...prev, ...result.uploaded]);
        }
      }
    } catch (error) {
      console.error('Failed to upload files:', error);
    }
  };

  const handleRemoveFile = (fileName: string) => {
    setUploadedFiles(prev => prev.filter(f => f.name !== fileName));
  };

  const handleOpenFilePicker = () => {
    fileInputRef.current?.click();
  };

  if (!isOpen) {
    return null;
  }

  const activeTab = tabs.find(t => t.isActive);

  const handleStart = async () => {
    try {
      useSandboxStore.getState().setIsActive(true);
      useSandboxStore.getState().setConnectionStatus('connected');
    } catch (error) {
      console.error('[SandboxPanel] Failed to start browser:', error);
    }
  };

  return (
    <>
      {!isFullscreen && (
        <div
          className={cn(
            "fixed top-0 h-full z-[60] w-1.5 cursor-col-resize",
            "hover:bg-primary/30 transition-colors",
            isResizing && "bg-primary/50"
          )}
          style={{ right: panelWidth - 1 }}
          onMouseDown={handleMouseDown}
          aria-hidden="true"
        />
      )}
      <div
        className={cn(
          "flex flex-col bg-background shadow-lg transition-all duration-300 border-l border-border",
          isFullscreen ? "fixed inset-0 z-50" : "fixed right-0 top-0 bottom-0 z-40"
        )}
        style={{ width: isFullscreen ? '100%' : panelWidth }}
        role="complementary"
        aria-label="Browser panel"
      >
        <div className="bg-muted/30 border-b border-border">
          <div className="flex items-center bg-muted/50">
            {tabs.map(tab => (
              <div
                key={tab.id}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 border-r border-border cursor-pointer group relative transition-all duration-200",
                  tab.isActive ? 'bg-background shadow-sm' : 'bg-muted/30 hover:bg-muted/50'
                )}
                onClick={() => switchTab(tab.id)}
              >
                <span className="text-sm max-w-[150px] truncate font-medium">{tab.title}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 hover:bg-destructive/20 hover:text-destructive rounded p-1 transition-all duration-200 flex-shrink-0"
                  aria-label={`Close tab ${tab.title}`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <button
              onClick={addTab}
              className="p-2 hover:bg-muted-foreground/20 rounded transition-all duration-200"
              title="New tab"
              aria-label="Open new tab"
            >
              <Plus className="w-4 h-4" />
            </button>
            <div className="flex-1" />
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 hover:bg-muted-foreground/20 rounded transition-all duration-200"
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              onClick={togglePanel}
              className="p-2 hover:bg-destructive/20 hover:text-destructive rounded transition-all duration-200 ml-1"
              title="Close browser"
              aria-label="Close browser panel"
            >
              <XCircle className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2 px-3 py-2">
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Back" aria-label="Go back">
                <span className="text-xs">{'\u25C0'}</span>
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Forward" aria-label="Go forward">
                <span className="text-xs">{'\u25B6'}</span>
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Refresh" aria-label="Refresh page">
                <RefreshCw className="w-3 h-3" />
              </Button>
            </div>

            {isActive && (
              <div className="flex items-center">
                <SkillRecordingControls position="header" />
              </div>
            )}
            <div className="flex-1 flex items-center bg-background border border-input rounded-md px-3 py-1.5 shadow-sm focus-within:ring-2 focus-within:ring-ring focus-within:border-ring transition-all duration-200">
              <ExternalLink className="w-3 h-3 text-muted-foreground mr-2" />
              <input
                type="text"
                value={activeTab?.url || ''}
                readOnly
                className="flex-1 bg-transparent text-sm outline-none text-foreground"
                aria-label="Current URL"
              />
            </div>
          </div>

          {/* File Workspace Section */}
          {uploadedFiles.length > 0 && (
            <div className="border-b border-border bg-muted/30 px-3 py-2">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium">Workspace Files</span>
                  <span className="text-xs text-muted-foreground">({uploadedFiles.length})</span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleOpenFilePicker}
                  className="h-7 px-2 text-xs"
                >
                  <Upload className="w-3 h-3 mr-1" />
                  Add Files
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {uploadedFiles.map((file) => (
                  <div
                    key={file.name}
                    className="flex items-center gap-2 bg-background border border-input rounded-md px-2 py-1 text-sm"
                  >
                    <FileText className="w-3 h-3 text-muted-foreground" />
                    <span className="max-w-[150px] truncate">{file.name}</span>
                    <span className="text-xs text-muted-foreground">
                      ({(file.size / 1024).toFixed(1)} KB)
                    </span>
                    <button
                      onClick={() => handleRemoveFile(file.name)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {uploadedFiles.length === 0 && (
            <div className="border-b border-border px-3 py-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleOpenFilePicker}
                className="w-full text-xs"
              >
                <Upload className="w-3 h-3 mr-2" />
                Upload Files to Workspace
              </Button>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>

        <div className="flex-1 relative bg-background">
          {!isActive ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center p-8">
                <Globe className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-2">Browser ready to start</p>
                <Button onClick={handleStart} size="lg">
                  Start Browser
                </Button>
              </div>
            </div>
          ) : (
            <ElectronWebView
              url={activeTab?.url || browserUrl}
              style={{ width: '100%', height: '100%' }}
            />
          )}
        </div>

        {isActive && (
          <div className="flex items-center justify-between px-3 py-1 bg-muted/30 border-t border-border text-xs text-muted-foreground">
            <span>Connected</span>
            <span>Electron Runtime</span>
          </div>
        )}
      </div>
    </>
  );
}
