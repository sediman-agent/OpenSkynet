/**
 * VS Code-Style ProviderPage
 * Minimal, professional provider configuration matching VS Code settings UI
 */

import { useState, useEffect } from 'react';
import { Server, Check, CheckCircle, ChevronRight, Search, X } from 'lucide-react';
import { useAppStore } from '@/stores/useAppStore';
import { toast } from 'sonner';

interface ProviderInfo {
  name: string;
  display_name?: string;
  category: string;
  needs_api_key: boolean;
  has_key: boolean;
}

function VSCodeStatusBadge({ status }: { status: 'connected' | 'disconnected' | 'error' | 'default' }) {
  const colors = {
    connected: 'var(--vscode-success-foreground)',
    disconnected: 'var(--vscode-secondary-text)',
    error: 'var(--vscode-error-foreground)',
    default: 'var(--vscode-secondary-text)'
  };

  const texts = {
    connected: 'CONFIGURED',
    disconnected: 'NOT CONFIGURED',
    error: 'ERROR',
    default: 'DEFAULT'
  };

  return (
    <span
      className="text-[10px] font-mono uppercase tracking-wider"
      style={{ color: colors[status] }}
    >
      {texts[status]}
    </span>
  );
}

function VSCodeProviderItem({
  provider,
  isExpanded,
  isSelected,
  status,
  apiKey,
  onToggle,
  onApiKeyChange,
  onSave
}: {
  provider: ProviderInfo;
  isExpanded: boolean;
  isSelected: boolean;
  status: 'connected' | 'disconnected' | 'error' | 'default';
  apiKey: string;
  onToggle: () => void;
  onApiKeyChange: (value: string) => void;
  onSave: () => void;
}) {
  const needsKey = provider.needs_api_key && !provider.has_key;
  const hasKey = provider.has_key;

  return (
    <div
      className="border font-mono text-sm"
      style={{
        borderColor: 'var(--vscode-border-color)',
        borderRadius: 'var(--vscode-corner-radius-round)',
        backgroundColor: isSelected ? 'var(--vscode-list-hoverBackground)' : 'transparent',
        marginBottom: 'var(--vscode-design-unit)'
      }}
    >
      {/* Main Row */}
      <button
        onClick={onToggle}
        className="w-full px-2 py-1.5 flex items-center gap-2 text-left transition-colors"
        style={{ minHeight: '32px' }}
        onMouseEnter={(e) => {
          if (!isSelected) {
            e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isSelected) {
            e.currentTarget.style.backgroundColor = 'transparent';
          }
        }}
      >
        {/* Status Indicator */}
        <div
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{
            backgroundColor: status === 'connected' ? 'var(--vscode-success-foreground)' :
                         status === 'error' ? 'var(--vscode-error-foreground)' :
                         hasKey ? 'var(--vscode-info-foreground)' :
                         needsKey ? 'var(--vscode-warning-foreground)' :
                         'var(--vscode-secondary-text)'
          }}
        />

        {/* Expand Icon */}
        <div className="shrink-0" style={{ width: '16px' }}>
          {isExpanded ? (
            <ChevronRight size={12} style={{ color: 'var(--vscode-secondary-text)', transform: 'rotate(90deg)' }} />
          ) : (
            <ChevronRight size={12} style={{ color: 'var(--vscode-secondary-text)' }} />
          )}
        </div>

        {/* Provider Name */}
        <div className="flex-1 truncate">
          <span style={{ color: 'var(--vscode-foreground)', fontWeight: 500 }}>
            {provider.display_name || provider.name}
          </span>
        </div>

        {/* Status Badge */}
        <VSCodeStatusBadge
          status={status === 'default' && hasKey ? 'connected' : status}
        />

        {/* Selection Check */}
        {isSelected && (
          <Check size={12} style={{ color: 'var(--vscode-success-foreground)' }} />
        )}
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div
          className="px-2 py-2 border-t overflow-hidden"
          style={{
            borderColor: 'var(--vscode-border-color)',
            backgroundColor: 'var(--vscode-input-background)'
          }}
        >
          {/* Category */}
          <div className="text-[10px] mb-2" style={{ color: 'var(--vscode-secondary-text)' }}>
            CATEGORY: <span style={{ color: 'var(--vscode-foreground)' }}>{provider.category.toUpperCase()}</span>
          </div>

          {/* API Key Input */}
          {needsKey ? (
            <div className="space-y-2">
              <div>
                <label className="text-[10px] uppercase mb-1 block" style={{ color: 'var(--vscode-secondary-text)' }}>
                  API Key
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => onApiKeyChange(e.target.value)}
                    placeholder="sk-xxx..."
                    className="flex-1 px-2 py-1 text-xs font-mono outline-none"
                    style={{
                      backgroundColor: 'var(--vscode-input-background)',
                      border: '1px solid var(--vscode-input-border)',
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
                  <button
                    onClick={onSave}
                    disabled={!apiKey}
                    className="px-3 py-1 text-xs font-mono uppercase tracking-wider transition-colors disabled:opacity-40"
                    style={{
                      backgroundColor: apiKey ? 'var(--vscode-button-primary-background)' : 'var(--vscode-button-secondary-background)',
                      color: apiKey ? 'var(--vscode-button-primary-foreground)' : 'var(--vscode-button-secondary-foreground)',
                      border: '1px solid transparent',
                      borderRadius: 'var(--vscode-corner-radius)',
                      minHeight: '26px',
                      cursor: apiKey ? 'pointer' : 'not-allowed'
                    }}
                    onMouseEnter={(e) => {
                      if (apiKey) {
                        e.currentTarget.style.backgroundColor = 'var(--vscode-button-primary-hover-background)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (apiKey) {
                        e.currentTarget.style.backgroundColor = 'var(--vscode-button-primary-background)';
                      }
                    }}
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          ) : hasKey ? (
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--vscode-success-foreground)' }}>
              <CheckCircle size={12} />
              <span>API key configured</span>
            </div>
          ) : (
            <div className="text-xs" style={{ color: 'var(--vscode-secondary-text)' }}>
              No API key required
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ProviderPage() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [statuses, setStatuses] = useState<Record<string, 'connected' | 'disconnected' | 'error' | 'default'>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);

  const setProvider = useAppStore((state) => state.setProvider);
  const setModel = useAppStore((state) => state.setModel);

  useEffect(() => {
    loadProviders();
  }, []);

  const loadProviders = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/model/providers', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (response.ok) {
        const data = await response.json();
        setProviders(data.providers || []);

        const initialStatuses: Record<string, 'connected' | 'disconnected' | 'error' | 'default'> = {};
        data.providers?.forEach((p: ProviderInfo) => {
          initialStatuses[p.name] = p.has_key ? 'connected' : 'default';
        });
        setStatuses(initialStatuses);
      }
    } catch {
      console.error('Failed to load providers');
    }
  };

  const handleSelectProvider = (providerName: string) => {
    setSelectedProvider(providerName);
    setExpandedProvider(providerName === expandedProvider ? null : providerName);
    setApiKey('');
  };

  const handleSave = async () => {
    if (!selectedProvider) return;

    try {
      const response = await fetch('http://localhost:3001/api/model/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: selectedProvider,
          api_key: apiKey || undefined
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setProvider(selectedProvider);
        if (result.model) {
          setModel(result.model);
        }
        setStatuses(prev => ({ ...prev, [selectedProvider]: 'connected' }));
        toast.success(`Provider ${selectedProvider} configured successfully`);
      } else {
        const errorData = await response.json().catch(() => ({}));
        setStatuses(prev => ({ ...prev, [selectedProvider]: 'error' }));
        toast.error(`Failed to configure provider: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      setStatuses(prev => ({ ...prev, [selectedProvider]: 'error' }));
      toast.error('Failed to configure provider: Network error');
    }
  };

  const filteredProviders = providers.filter((provider) => {
    const query = searchQuery.toLowerCase();
    return (
      provider.name.toLowerCase().includes(query) ||
      (provider.display_name?.toLowerCase() || '').includes(query) ||
      provider.category.toLowerCase().includes(query)
    );
  });

  return (
    <div className="flex flex-col h-full font-mono text-sm" style={{ backgroundColor: 'var(--vscode-background)' }}>
      {/* Header - VS Code Style */}
      <div className="border-b px-4 py-2 flex items-center gap-2" style={{ borderColor: 'var(--vscode-border-color)' }}>
        <Server size={14} style={{ color: 'var(--vscode-secondary-text)' }} />
        <span className="font-medium" style={{ color: 'var(--vscode-foreground)' }}>Provider Configuration</span>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-4">
          {/* Search Bar - VS Code Style */}
          <div className="mb-4 relative">
            <Search
              size={12}
              className="absolute left-2 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--vscode-secondary-text)' }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded transition-colors"
                style={{ color: 'var(--vscode-secondary-text)' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--vscode-list-hover-background)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <X size={12} />
              </button>
            )}
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search providers..."
              className="w-full pl-8 pr-8 py-1 text-xs outline-none font-mono"
              style={{
                backgroundColor: 'var(--vscode-input-background)',
                border: '1px solid var(--vscode-input-border)',
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

          {/* Providers List */}
          {filteredProviders.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-12 h-12 mx-auto mb-3 flex items-center justify-center rounded" style={{
                backgroundColor: 'var(--vscode-input-background)',
                borderRadius: 'var(--vscode-corner-radius-round)'
              }}>
                <Search size={20} style={{ color: 'var(--vscode-secondary-text)' }} />
              </div>
              <p className="text-xs" style={{ color: 'var(--vscode-secondary-text)' }}>
                {searchQuery ? 'No providers match your search' : 'No providers available'}
              </p>
            </div>
          ) : (
            <div className="space-y-0">
              {/* Section Header */}
              <div className="text-[10px] uppercase mb-2 tracking-wider" style={{ color: 'var(--vscode-secondary-text)' }}>
                Providers ({filteredProviders.length})
              </div>

              {filteredProviders.map((provider) => (
                <VSCodeProviderItem
                  key={provider.name}
                  provider={provider}
                  isExpanded={expandedProvider === provider.name}
                  isSelected={selectedProvider === provider.name}
                  status={statuses[provider.name] || 'default'}
                  apiKey={apiKey}
                  onToggle={() => handleSelectProvider(provider.name)}
                  onApiKeyChange={setApiKey}
                  onSave={handleSave}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ProviderPage;
