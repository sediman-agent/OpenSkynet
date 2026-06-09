/**
 * VS Code-Style SettingsPage
 * Application settings with VS Code design system
 */

import { useState, useEffect } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import { toast } from 'sonner';

export function SettingsPage() {
  const apiBaseUrl = useAppStore((state) => state.apiBaseUrl);
  const autoConnect = useAppStore((state) => state.autoConnect);
  const model = useAppStore((state) => state.model);
  const provider = useAppStore((state) => state.provider);
  const headless = useAppStore((state) => state.headless);
  const stealth = useAppStore((state) => state.stealth);
  const setSettings = useAppStore((state) => state.setSettings);
  const theme = useAppStore((state) => state.theme);
  const colorTheme = useAppStore((state) => state.colorTheme);
  const setColorTheme = useAppStore((state) => state.setColorTheme);
  const toggleTheme = useAppStore((state) => state.toggleTheme);

  const [localSettings, setLocalSettings] = useState({
    apiBaseUrl: apiBaseUrl || 'http://localhost:3001',
    autoConnect,
    model: model || '',
    provider: provider || 'openai',
    headless: headless ?? false,
    stealth: stealth ?? true,
  });

  const [hasChanges, setHasChanges] = useState(false);
  const [appVersion, setAppVersion] = useState<string>('');
  const [platform, setPlatform] = useState<string>('');

  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI) {
      window.electronAPI.getVersion()
        .then(setAppVersion)
        .catch(() => setAppVersion('0.3.2'));

      setPlatform(window.electronAPI.getPlatform() || navigator.platform);
    } else {
      setAppVersion('0.3.2');
      setPlatform(navigator.platform);
    }
  }, []);

  const handleSave = () => {
    setSettings(localSettings);
    setHasChanges(false);
    toast.success('Settings saved');
  };

  const handleReset = () => {
    setLocalSettings({
      apiBaseUrl: 'http://localhost:3001',
      autoConnect: true,
      model: '',
      provider: 'openai',
      headless: false,
      stealth: true,
    });
    setHasChanges(true);
  };

  const handleChange = (key: string, value: any) => {
    setLocalSettings((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const COLOR_THEMES = [
    { name: 'Blue', value: 'blue', color: '#007acc' },
    { name: 'Green', value: 'green', color: '#388a34' },
    { name: 'Red', value: 'red', color: '#a1260d' },
    { name: 'Purple', value: 'purple', color: '#6c5ce7' },
    { name: 'Orange', value: 'orange', color: '#d18616' },
  ];

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--vscode-background)' }}>
      {/* Header */}
      <div className="h-10 border-b flex items-center justify-between px-4" style={{
        borderColor: 'var(--vscode-border-color)',
        backgroundColor: 'var(--vscode-background)'
      }}>
        <h1 className="text-xs font-medium" style={{ color: 'var(--vscode-foreground)' }}>Settings</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            className="px-2 py-1 text-xs font-mono transition-colors"
            style={{
              backgroundColor: 'transparent',
              color: 'var(--vscode-foreground)',
              minHeight: '26px'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges}
            className="px-3 py-1 text-xs font-mono uppercase tracking-wider transition-colors"
            style={{
              backgroundColor: hasChanges ? 'var(--vscode-button-primary-background)' : 'var(--vscode-button-secondary-background)',
              color: hasChanges ? 'var(--vscode-button-primary-foreground)' : 'var(--vscode-button-secondary-foreground)',
              border: '1px solid transparent',
              borderRadius: 'var(--vscode-corner-radius)',
              minHeight: '26px',
              opacity: hasChanges ? 1 : 0.6
            }}
            onMouseEnter={(e) => {
              if (hasChanges) {
                e.currentTarget.style.backgroundColor = 'var(--vscode-button-primary-hover-background)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = hasChanges
                ? 'var(--vscode-button-primary-background)'
                : 'var(--vscode-button-secondary-background)';
            }}
          >
            Save
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-xl mx-auto py-4 px-3 space-y-4">
          {/* Appearance Section */}
          <section className="space-y-3">
            <h2 className="text-xs font-medium px-1" style={{ color: 'var(--vscode-foreground)' }}>
              APPEARANCE
            </h2>
            <div className="space-y-2">
              {/* Color Theme */}
              <div className="flex items-center justify-between py-2 px-2 rounded transition-colors"
                style={{ borderRadius: 'var(--vscode-corner-radius-round)' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <div className="flex-1">
                  <label className="text-xs font-medium block" style={{ color: 'var(--vscode-foreground)' }}>
                    Color Theme
                  </label>
                  <p className="text-[10px] mt-0.5" style={{ color: 'var(--vscode-secondary-text)' }}>
                    Choose your accent color
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {COLOR_THEMES.map((theme) => (
                    <button
                      key={theme.value}
                      onClick={() => setColorTheme(theme.value as any)}
                      className="w-5 h-5 rounded transition-transform"
                      style={{
                        backgroundColor: theme.color,
                        transform: colorTheme === theme.value ? 'scale(1.2)' : 'scale(1)',
                        border: colorTheme === theme.value ? '2px solid var(--vscode-foreground)' : '2px solid transparent'
                      }}
                      title={theme.name}
                    />
                  ))}
                </div>
              </div>

              {/* Dark Mode Toggle */}
              <div className="flex items-center justify-between py-2 px-2 rounded transition-colors"
                style={{ borderRadius: 'var(--vscode-corner-radius-round)' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <div>
                  <label className="text-xs font-medium block" style={{ color: 'var(--vscode-foreground)' }}>
                    Dark Mode
                  </label>
                  <p className="text-[10px] mt-0.5" style={{ color: 'var(--vscode-secondary-text)' }}>
                    Use dark color scheme
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (theme !== 'dark') {
                      toggleTheme();
                    }
                  }}
                  className="w-10 h-5 rounded-full relative transition-colors"
                  style={{
                    backgroundColor: theme === 'dark' ? 'var(--vscode-button-primary-background)' : 'var(--vscode-input-background)',
                    border: '1px solid var(--vscode-border-color)'
                  }}
                >
                  <span
                    className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
                    style={{
                      left: theme === 'dark' ? 'calc(100% - 20px)' : '2px',
                      backgroundColor: theme === 'dark' ? 'var(--vscode-button-primary-foreground)' : 'var(--vscode-secondary-text)'
                    }}
                  />
                </button>
              </div>
            </div>
          </section>

          {/* Connection Section */}
          <section className="space-y-3">
            <h2 className="text-xs font-medium px-1" style={{ color: 'var(--vscode-foreground)' }}>
              CONNECTION
            </h2>
            <div className="space-y-2">
              {/* API URL */}
              <div className="py-2 px-2 rounded transition-colors"
                style={{ borderRadius: 'var(--vscode-corner-radius-round)' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <label htmlFor="api-url" className="text-xs font-medium block mb-1" style={{ color: 'var(--vscode-foreground)' }}>
                  API URL
                </label>
                <input
                  id="api-url"
                  type="text"
                  value={localSettings.apiBaseUrl}
                  onChange={(e) => handleChange('apiBaseUrl', e.target.value)}
                  placeholder="http://localhost:3001"
                  className="w-full px-3 py-1 text-xs font-mono outline-none border"
                  style={{
                    backgroundColor: 'var(--vscode-input-background)',
                    borderColor: 'var(--vscode-input-border)',
                    borderRadius: 'var(--vscode-corner-radius)',
                    color: 'var(--vscode-input-foreground)',
                    minHeight: '26px',
                    fontFamily: 'var(--vscode-font-family)'
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'var(--vscode-focus-border)';
                    e.currentTarget.style.boxShadow = '0 0 0 1px var(--vscode-focus-border)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'var(--vscode-input-border)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>

              {/* Auto-connect Toggle */}
              <div className="flex items-center justify-between py-2 px-2 rounded transition-colors"
                style={{ borderRadius: 'var(--vscode-corner-radius-round)' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <div>
                  <label className="text-xs font-medium block" style={{ color: 'var(--vscode-foreground)' }}>
                    Auto-connect
                  </label>
                  <p className="text-[10px] mt-0.5" style={{ color: 'var(--vscode-secondary-text)' }}>
                    Connect on startup
                  </p>
                </div>
                <button
                  onClick={() => handleChange('autoConnect', !localSettings.autoConnect)}
                  className="w-10 h-5 rounded-full relative transition-colors"
                  style={{
                    backgroundColor: localSettings.autoConnect ? 'var(--vscode-button-primary-background)' : 'var(--vscode-input-background)',
                    border: '1px solid var(--vscode-border-color)'
                  }}
                >
                  <span
                    className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
                    style={{
                      left: localSettings.autoConnect ? 'calc(100% - 20px)' : '2px',
                      backgroundColor: localSettings.autoConnect ? 'var(--vscode-button-primary-foreground)' : 'var(--vscode-secondary-text)'
                    }}
                  />
                </button>
              </div>
            </div>
          </section>

          {/* Language Model Section */}
          <section className="space-y-3">
            <h2 className="text-xs font-medium px-1" style={{ color: 'var(--vscode-foreground)' }}>
              LANGUAGE MODEL
            </h2>
            <div className="space-y-2">
              {/* Provider Select */}
              <div className="py-2 px-2 rounded transition-colors"
                style={{ borderRadius: 'var(--vscode-corner-radius-round)' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <label htmlFor="provider-select" className="text-xs font-medium block mb-1" style={{ color: 'var(--vscode-foreground)' }}>
                  Provider
                </label>
                <select
                  id="provider-select"
                  value={localSettings.provider}
                  onChange={(e) => handleChange('provider', e.target.value)}
                  className="w-full px-2 py-1 text-xs outline-none border font-mono"
                  style={{
                    backgroundColor: 'var(--vscode-input-background)',
                    borderColor: 'var(--vscode-input-border)',
                    borderRadius: 'var(--vscode-corner-radius)',
                    color: 'var(--vscode-input-foreground)',
                    minHeight: '26px',
                    fontFamily: 'var(--vscode-font-family)'
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'var(--vscode-focus-border)';
                    e.currentTarget.style.boxShadow = '0 0 0 1px var(--vscode-focus-border)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'var(--vscode-input-border)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <option value="openai">OpenAI</option>
                  <option value="ollama">Ollama</option>
                  <option value="anthropic">Anthropic</option>
                </select>
              </div>

              {/* Model Input */}
              <div className="py-2 px-2 rounded transition-colors"
                style={{ borderRadius: 'var(--vscode-corner-radius-round)' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <label htmlFor="model-input" className="text-xs font-medium block mb-1" style={{ color: 'var(--vscode-foreground)' }}>
                  Model
                </label>
                <input
                  id="model-input"
                  type="text"
                  value={localSettings.model}
                  onChange={(e) => handleChange('model', e.target.value)}
                  placeholder="gpt-4 or leave empty for default"
                  className="w-full px-3 py-1 text-xs font-mono outline-none border"
                  style={{
                    backgroundColor: 'var(--vscode-input-background)',
                    borderColor: 'var(--vscode-input-border)',
                    borderRadius: 'var(--vscode-corner-radius)',
                    color: 'var(--vscode-input-foreground)',
                    minHeight: '26px',
                    fontFamily: 'var(--vscode-font-family)'
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'var(--vscode-focus-border)';
                    e.currentTarget.style.boxShadow = '0 0 0 1px var(--vscode-focus-border)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'var(--vscode-input-border)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>
            </div>
          </section>

          {/* Browser Section */}
          <section className="space-y-3">
            <h2 className="text-xs font-medium px-1" style={{ color: 'var(--vscode-foreground)' }}>
              BROWSER
            </h2>
            <div className="space-y-2">
              {/* Headless Mode Toggle */}
              <div className="flex items-center justify-between py-2 px-2 rounded transition-colors"
                style={{ borderRadius: 'var(--vscode-corner-radius-round)' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <div>
                  <label className="text-xs font-medium block" style={{ color: 'var(--vscode-foreground)' }}>
                    Headless Mode
                  </label>
                  <p className="text-[10px] mt-0.5" style={{ color: 'var(--vscode-secondary-text)' }}>
                    Run without visible window
                  </p>
                </div>
                <button
                  onClick={() => handleChange('headless', !localSettings.headless)}
                  className="w-10 h-5 rounded-full relative transition-colors"
                  style={{
                    backgroundColor: localSettings.headless ? 'var(--vscode-button-primary-background)' : 'var(--vscode-input-background)',
                    border: '1px solid var(--vscode-border-color)'
                  }}
                >
                  <span
                    className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
                    style={{
                      left: localSettings.headless ? 'calc(100% - 20px)' : '2px',
                      backgroundColor: localSettings.headless ? 'var(--vscode-button-primary-foreground)' : 'var(--vscode-secondary-text)'
                    }}
                  />
                </button>
              </div>

              {/* Stealth Mode Toggle */}
              <div className="flex items-center justify-between py-2 px-2 rounded transition-colors"
                style={{ borderRadius: 'var(--vscode-corner-radius-round)' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <div>
                  <label className="text-xs font-medium block" style={{ color: 'var(--vscode-foreground)' }}>
                    Stealth Mode
                  </label>
                  <p className="text-[10px] mt-0.5" style={{ color: 'var(--vscode-secondary-text)' }}>
                    Anti-detection patches
                  </p>
                </div>
                <button
                  onClick={() => handleChange('stealth', !localSettings.stealth)}
                  className="w-10 h-5 rounded-full relative transition-colors"
                  style={{
                    backgroundColor: localSettings.stealth ? 'var(--vscode-button-primary-background)' : 'var(--vscode-input-background)',
                    border: '1px solid var(--vscode-border-color)'
                  }}
                >
                  <span
                    className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
                    style={{
                      left: localSettings.stealth ? 'calc(100% - 20px)' : '2px',
                      backgroundColor: localSettings.stealth ? 'var(--vscode-button-primary-foreground)' : 'var(--vscode-secondary-text)'
                    }}
                  />
                </button>
              </div>
            </div>
          </section>

          {/* About Section */}
          <section className="space-y-3">
            <h2 className="text-xs font-medium px-1" style={{ color: 'var(--vscode-foreground)' }}>
              ABOUT
            </h2>
            <div className="py-2 px-2 rounded transition-colors"
              style={{ borderRadius: 'var(--vscode-corner-radius-round)' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <dl className="grid grid-cols-2 gap-2 text-xs">
                <dt style={{ color: 'var(--vscode-secondary-text)' }}>Version:</dt>
                <dd className="font-medium text-right" style={{ color: 'var(--vscode-foreground)' }}>{appVersion}</dd>

                <dt style={{ color: 'var(--vscode-secondary-text)' }}>Build:</dt>
                <dd className="font-medium text-right" style={{ color: 'var(--vscode-foreground)' }}>Electron + React</dd>

                <dt style={{ color: 'var(--vscode-secondary-text)' }}>Platform:</dt>
                <dd className="font-medium text-right" style={{ color: 'var(--vscode-foreground)' }}>{platform}</dd>

                <dt style={{ color: 'var(--vscode-secondary-text)' }}>Architecture:</dt>
                <dd className="font-medium text-right" style={{ color: 'var(--vscode-foreground)' }}>Universal</dd>
              </dl>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;
