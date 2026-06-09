/**
 * VS Code-Style SandboxPanel Component
 * Main browser panel with debug controls - modular architecture
 */

import { useRef, useCallback, useEffect, useState } from 'react';
import { Bug } from 'lucide-react';
import { useSandboxStore } from '@/stores/useSandboxStore';
import { browserService } from '@/services/BrowserService';
import { BrowserHeader } from './BrowserHeader';
import { BrowserStatusBar } from './BrowserStatusBar';
import { ResizeHandle } from './ResizeHandle';
import { DebugPanel } from './DebugPanel';
import { useBrowserState } from '@/hooks/browser/useBrowserState';
import { usePanelResize } from '@/hooks/browser/usePanelResize';
import { useBrowserCommands } from '@/hooks/browser/useBrowserCommands';
import { useWebviewControl } from '@/hooks/browser/useWebviewControl';
import { useCdpConnection } from '@/hooks/browser/useCdpConnection';

// ============================================================================
// VS Code Design Tokens
// ============================================================================
const VS_CODES = {
  border: '#3c3c3c',
  bg: '#1e1e1e',
  bgHover: '#2a2d2e',
  text: '#cccccc',
  textMuted: '#858585',
  textDim: '#6e6e6e',
  warning: '#dcdcaa',
  radius: '2px',
} as const;

// ============================================================================
// Main Component
// ============================================================================
export function SandboxPanel() {
  const webviewRef = useRef<HTMLWebViewElement | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  // Store state
  const isOpen = useSandboxStore(state => state.isOpen);
  const togglePanel = useSandboxStore(state => state.togglePanel);

  // Custom hooks
  const {
    browserStatus,
    browserUrl,
    inputUrl,
    webviewSrc,
    setLatestSnapshot,
    setInputUrl,
    navigateTo,
    handleRefresh,
    handleBack,
    handleForward,
    handleUrlKeyDown
  } = useBrowserState(isOpen);

  const {
    panelWidth,
    isResizing,
    isFullscreen,
    toggleFullscreen,
    resizeHandlers
  } = usePanelResize(600);

  // Set up command polling when panel opens
  useBrowserCommands(isOpen, webviewRef, setLatestSnapshot);

  // Set up webview control
  useWebviewControl(isOpen, webviewRef, navigateTo);

  // Establish CDP connection when browser panel opens
  useCdpConnection(isOpen);

  // Callback ref to set src when webview mounts
  const setWebviewRef = useCallback((node: HTMLWebViewElement | null) => {
    if (node) {
      webviewRef.current = node;
      node.src = webviewSrc;
    }
  }, [webviewSrc]);

  // Set webview src directly when webviewSrc state changes
  useEffect(() => {
    if (webviewRef.current && webviewSrc && webviewSrc !== 'about:blank') {
      webviewRef.current.src = webviewSrc;
    }
  }, [webviewSrc]);

  // Register webview with BrowserService when mounted
  useEffect(() => {
    if (webviewRef.current && isOpen) {
      browserService.registerWebview(webviewRef.current);
      browserService.activate();
    }
  }, [isOpen]);

  const handleClose = useCallback(() => togglePanel(), [togglePanel]);

  const toggleDebug = useCallback(() => {
    setShowDebug(prev => !prev);
  }, []);

  if (!isOpen) return null;

  return (
    <>
      {/* Resize Handle */}
      {!isFullscreen && (
        <ResizeHandle
          panelWidth={panelWidth}
          isResizing={isResizing}
          onMouseDown={resizeHandlers.down}
        />
      )}

      {/* Main Panel */}
      <div
        className={`flex flex-col font-mono text-xs transition-all duration-200 border-l ${
          isFullscreen ? 'fixed inset-0 z-40' : 'fixed right-0 top-0 bottom-0 z-40'
        }`}
        style={{
          width: isFullscreen ? '100%' : panelWidth,
          backgroundColor: VS_CODES.bg,
          borderColor: VS_CODES.border,
          color: VS_CODES.text
        }}
        role="complementary"
        aria-label="Browser Panel"
      >
        {/* Header */}
        <BrowserHeader
          browserStatus={browserStatus}
          inputUrl={inputUrl}
          setInputUrl={setInputUrl}
          onUrlKeyDown={handleUrlKeyDown}
          onBack={handleBack}
          onForward={handleForward}
          onRefresh={handleRefresh}
          onToggleFullscreen={toggleFullscreen}
          onClose={handleClose}
        />

        {/* Toolbar - Debug Toggle */}
        <div
          className="flex items-center gap-2 px-2 py-1 border-b font-mono text-[10px]"
          style={{ borderColor: VS_CODES.border, backgroundColor: VS_CODES.bgHover }}
        >
          <button
            onClick={toggleDebug}
            className="flex items-center gap-1.5 px-2 py-0.5 transition-colors"
            style={{
              backgroundColor: showDebug ? VS_CODES.warning : 'transparent',
              color: showDebug ? '#000000' : VS_CODES.textMuted,
              border: `1px solid ${showDebug ? VS_CODES.warning : VS_CODES.border}`,
              borderRadius: VS_CODES.radius
            }}
            onMouseEnter={(e) => {
              if (!showDebug) e.currentTarget.style.backgroundColor = VS_CODES.bgHover;
            }}
            onMouseLeave={(e) => {
              if (!showDebug) e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <Bug size={10} />
            <span className="uppercase tracking-wider">
              {showDebug ? 'Debug ON' : 'Debug OFF'}
            </span>
          </button>

          <span className="flex-1" style={{ color: VS_CODES.textDim }}>
            {showDebug ? 'Debug panel active - use controls below' : 'Toggle debug panel for inspection'}
          </span>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Browser View */}
          <div className="flex-1 relative overflow-hidden bg-white">
            <webview
              ref={setWebviewRef}
              id="embedded-browser"
              style={{
                width: '100%',
                height: '100%',
                border: 'none'
              }}
              allowpopups={true}
              nodeintegration={false}
              plugins={true}
            />
          </div>

          {/* Debug Panel (when enabled) */}
          {showDebug && (
            <div
              className="border-l overflow-y-auto"
              style={{
                width: '300px',
                borderColor: VS_CODES.border,
                minWidth: '300px'
              }}
            >
              <DebugPanel />
            </div>
          )}
        </div>

        {/* Status Bar */}
        <BrowserStatusBar
          browserStatus={browserStatus}
          browserUrl={browserUrl}
        />
      </div>
    </>
  );
}

export default SandboxPanel;
