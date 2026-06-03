import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Settings as SettingsIcon, Server, Cpu, Globe, Info } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/shared/Button';
import { Input } from '@/components/shared/Input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/shared/Card';
import { ToggleSwitch } from '@/components/shared/ToggleSwitch';
import { ScrollArea } from '@/components/shared/ScrollArea';
import { useAppStore } from '@/stores/useAppStore';

export function SettingsPage() {
  const rpcUrl = useAppStore((state) => state.rpcUrl);
  const autoConnect = useAppStore((state) => state.autoConnect);
  const model = useAppStore((state) => state.model);
  const provider = useAppStore((state) => state.provider);
  const headless = useAppStore((state) => state.headless);
  const stealth = useAppStore((state) => state.stealth);
  const setSettings = useAppStore((state) => state.setSettings);

  const [localSettings, setLocalSettings] = useState({
    rpcUrl,
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
    // Load app info from Tauri
    invoke<string>('get_app_version')
      .then(setAppVersion)
      .catch(() => setAppVersion('0.3.2'));

    // Detect platform
    setPlatform(navigator.platform);
  }, []);

  const handleSave = () => {
    setSettings(localSettings);
    setHasChanges(false);
  };

  const handleReset = () => {
    setLocalSettings({
      rpcUrl: 'ws://localhost:8765',
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

  return (
    <div className="flex flex-col h-screen bg-muted/40">
      {/* Header */}
      <PageHeader
        icon={SettingsIcon}
        title="Settings"
        subtitle="Configure OpenSkynet"
        actions={
          <>
            <Button variant="outline" onClick={handleReset}>
              Reset
            </Button>
            <Button
              onClick={handleSave}
              disabled={!hasChanges}
            >
              Save Changes
            </Button>
          </>
        }
      />

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="max-w-2xl mx-auto py-6 px-6 space-y-6">
          {/* RPC Settings */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Server className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <CardTitle>RPC Connection</CardTitle>
                  <CardDescription>
                    Configure connection to the OpenSkynet RPC server
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground" htmlFor="rpc-url">
                  RPC URL
                </label>
                <Input
                  id="rpc-url"
                  value={localSettings.rpcUrl}
                  onChange={(e) => handleChange('rpcUrl', e.target.value)}
                  placeholder="ws://localhost:8765"
                />
                <p className="text-xs text-muted-foreground">
                  WebSocket URL for the RPC backend server
                </p>
              </div>

              <ToggleSwitch
                checked={localSettings.autoConnect}
                onCheckedChange={(checked) => handleChange('autoConnect', checked)}
                label="Auto-connect on startup"
                description="Automatically connect to RPC server when app starts"
              />
            </CardContent>
          </Card>

          {/* LLM Settings */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Cpu className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <CardTitle>LLM Configuration</CardTitle>
                  <CardDescription>
                    Configure the language model provider and settings
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground" htmlFor="provider">
                  Provider
                </label>
                <select
                  id="provider"
                  value={localSettings.provider}
                  onChange={(e) => handleChange('provider', e.target.value)}
                  className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="openai">OpenAI</option>
                  <option value="ollama">Ollama</option>
                  <option value="anthropic">Anthropic</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground" htmlFor="model">
                  Model (optional)
                </label>
                <Input
                  id="model"
                  value={localSettings.model}
                  onChange={(e) => handleChange('model', e.target.value)}
                  placeholder="gpt-4 or leave empty for default"
                />
                <p className="text-xs text-muted-foreground">
                  Specific model to use (e.g., gpt-4, claude-3-opus)
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Browser Settings */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Globe className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <CardTitle>Browser Configuration</CardTitle>
                  <CardDescription>
                    Configure browser automation settings
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <ToggleSwitch
                checked={localSettings.headless}
                onCheckedChange={(checked) => handleChange('headless', checked)}
                label="Headless mode"
                description="Run browser without visible window"
              />

              <ToggleSwitch
                checked={localSettings.stealth}
                onCheckedChange={(checked) => handleChange('stealth', checked)}
                label="Stealth mode"
                description="Use anti-detection patches for bot avoidance"
              />
            </CardContent>
          </Card>

          {/* About */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                  <Info className="w-5 h-5 text-foreground" />
                </div>
                <CardTitle>About OpenSkynet</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-muted-foreground">Version:</span>
                <span className="font-medium text-foreground">{appVersion}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-muted-foreground">Build:</span>
                <span className="font-medium text-foreground">Tauri + React</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-muted-foreground">Platform:</span>
                <span className="font-medium text-foreground">{platform}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-muted-foreground">Architecture:</span>
                <span className="font-medium text-foreground">Universal</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
}
