import { useState } from 'react';
import { Button } from '@/components/shared/Button';
import { Input } from '@/components/shared/Input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/shared/Card';
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

  const handleSave = () => {
    setSettings(localSettings);
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
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="h-14 border-b border-border flex items-center justify-between px-4">
        <h2 className="text-lg font-semibold">Settings</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleReset}>
            Reset to Defaults
          </Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 p-4">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* RPC Settings */}
          <Card>
            <CardHeader>
              <CardTitle>RPC Connection</CardTitle>
              <CardDescription>
                Configure connection to the Sediman RPC server
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">RPC URL</label>
                <Input
                  value={localSettings.rpcUrl}
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, rpcUrl: e.target.value })
                  }
                  placeholder="ws://localhost:8765"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="autoConnect"
                  checked={localSettings.autoConnect}
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings,
                      autoConnect: e.target.checked,
                    })
                  }
                  className="w-4 h-4 rounded"
                />
                <label htmlFor="autoConnect" className="text-sm">
                  Auto-connect on startup
                </label>
              </div>
            </CardContent>
          </Card>

          {/* LLM Settings */}
          <Card>
            <CardHeader>
              <CardTitle>LLM Configuration</CardTitle>
              <CardDescription>
                Configure the language model provider
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Provider</label>
                <select
                  value={localSettings.provider}
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings,
                      provider: e.target.value as 'openai' | 'ollama',
                    })
                  }
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                >
                  <option value="openai">OpenAI</option>
                  <option value="ollama">Ollama</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Model (optional)</label>
                <Input
                  value={localSettings.model}
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, model: e.target.value })
                  }
                  placeholder="gpt-4 or leave empty for default"
                />
              </div>
            </CardContent>
          </Card>

          {/* Browser Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Browser Configuration</CardTitle>
              <CardDescription>
                Configure browser automation settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="headless"
                  checked={localSettings.headless}
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings,
                      headless: e.target.checked,
                    })
                  }
                  className="w-4 h-4 rounded"
                />
                <label htmlFor="headless" className="text-sm">
                  Run browser in headless mode (no visible window)
                </label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="stealth"
                  checked={localSettings.stealth}
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings,
                      stealth: e.target.checked,
                    })
                  }
                  className="w-4 h-4 rounded"
                />
                <label htmlFor="stealth" className="text-sm">
                  Use stealth mode with anti-detection patches
                </label>
              </div>
            </CardContent>
          </Card>

          {/* About */}
          <Card>
            <CardHeader>
              <CardTitle>About</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Version:</span>
                <span>0.3.2</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Build:</span>
                <span>Tauri + React</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
}
