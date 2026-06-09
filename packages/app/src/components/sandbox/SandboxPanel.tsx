/**
 * VS Code-Style SandboxPanel Component - Industrial Grade
 * Enhanced main browser panel with professional architecture and styling
 * Improved visual consistency, transitions, and panel management
 */

import { useRef, useCallback, useEffect, useState } from 'react';
import { Bug, PanelLeftClose, PanelLeftOpen, Columns } from 'lucide-react';
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
import { VS_CODES } from '@/styles/vscode-constants';

// ============================================================================
// Main Component
// ============================================================================
export function SandboxPanel() {
  const webviewRef = useRef<HTMLWebViewElement | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [debugHovered, setDebugHovered] = useState(false);

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
  // This hook now also handles showing the Electron BrowserView
  useCdpConnection(isOpen);

  // Callback ref to set src when webview mounts
  const setWebviewRef = useCallback((node: HTMLWebViewElement | null) => {
    if (node) {
      webviewRef.current = node;
      node.src = webviewSrc;
      // Register with BrowserService immediately when webview mounts
      if (isOpen) {
        browserService.registerWebview(node);
        browserService.activate();
        console.log('[SandboxPanel] Webview registered and activated');
      }
    }
  }, [webviewSrc, isOpen]);

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

      {/* Main Panel - Enhanced Architecture */}
      <div
        className={`flex flex-col font-mono transition-all ${
          isFullscreen ? 'fixed inset-0 z-40' : 'fixed right-0 top-0 bottom-0 z-40'
        }`}
        style={{
          width: isFullscreen ? '100%' : panelWidth,
          backgroundColor: 'var(--vscode-panel-background)',
          borderColor: 'var(--vscode-border-color)',
          color: 'var(--vscode-foreground)',
          transitionDuration: VS_CODES.transition,
          // Enhanced shadow for depth
          boxShadow: isFullscreen ? 'none' : '-2px 0 8px rgba(0, 0, 0, 0.1)'
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

        {/* Toolbar - Enhanced Debug Toggle */}
        <div
          className="flex items-center border-b"
          style={{
            borderColor: 'var(--vscode-border-color)',
            backgroundColor: 'var(--vscode-sideBar-background)',
            padding: `${VS_CODES.spacing.sm}px ${VS_CODES.spacing.lg}px`,
            minHeight: '32px'
          }}
        >
          <button
            onClick={toggleDebug}
            className="flex items-center gap-2 px-3 py-1.5 transition-all duration-150 font-mono uppercase tracking-wider"
            style={{
              backgroundColor: showDebug ? 'var(--vscode-warning-foreground)' : 'transparent',
              color: showDebug ? '#000000' : 'var(--vscode-secondary-text)',
              border: `1px solid ${showDebug ? 'var(--vscode-warning-foreground)' : 'var(--vscode-border-color)'}`,
              borderRadius: VS_CODES.radiusSm,
              fontSize: '11px',
              fontWeight: 500,
              transform: debugHovered ? 'scale(1.02)' : 'scale(1)',
              cursor: 'pointer'
            }}
            onMouseEnter={() => setDebugHovered(true)}
            onMouseLeave={() => setDebugHovered(false)}
          >
            <Bug size={11} />
            <span>
              {showDebug ? 'Debug ON' : 'Debug OFF'}
            </span>
          </button>

          <div className="flex-1" style={{ fontSize: '11px', color: 'var(--vscode-secondary-text)' }}>
            <span className="uppercase tracking-wide" style={{ fontWeight: 500 }}>
              {showDebug ? 'Debug panel active - use controls below' : 'Toggle debug panel for inspection'}
            </span>
          </div>

          {/* Panel info badge */}
          <div
            className="flex items-center gap-1 px-2 py-0.5"
            style={{
              backgroundColor: 'var(--vscode-badge-background)',
              borderRadius: VS_CODES.radiusSm,
              fontSize: '10px',
              color: 'var(--vscode-badge-foreground)',
              opacity: 0.8
            }}
          >
            <Columns size={10} />
            <span className="font-mono">{Math.round(panelWidth)}px</span>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Browser View - Renderer webview is the actual browser */}
          <div
            className="flex-1 relative overflow-hidden"
            style={{
              backgroundColor: '#ffffff',
              transition: `width ${VS_CODES.transition} ease-out`
            }}
          >
            {/* Webview - this IS the browser that agent controls via IPC */}
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

          {/* Debug Panel - Enhanced Transition */}
          {showDebug && (
            <div
              className="border-l overflow-hidden transition-all duration-200"
              style={{
                width: '300px',
                minWidth: '300px',
                borderColor: 'var(--vscode-border-color)',
                animation: 'slideIn 200ms ease-out'
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

      {/* Slide-in animation for debug panel */}
      <style>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(-10px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </>
  );
}

export default SandboxPanel;
