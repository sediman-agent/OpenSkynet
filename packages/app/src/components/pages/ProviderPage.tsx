/**
 * VS Code-Style ProviderPage
 * Minimal, professional provider configuration matching VS Code settings UI
 */

import { useState, useEffect } from 'react';
import { Server, Check, CheckCircle, ChevronRight, Search, X } from 'lucide-react';
import { useAppStore } from '@/stores/useAppStore';
import { toast } from 'sonner';

// ============================================================================
// VS Code Design Tokens
// ============================================================================
const VS_CODES = {
  // Border colors
  border: '#3c3c3c',
  borderLight: '#454545',
  borderFocus: '#007fd4',

  // Background colors
  bg: '#1e1e1e',
  bgHover: '#2a2d2e',
  bgSecondary: '#252526',
  bgInput: '#3c3c3c',

  // Text colors
  text: '#cccccc',
  textMuted: '#858585',
  textDim: '#6e6e6e',

  // Status colors
  success: '#4ec9b0',
  error: '#f48771',
  warning: '#dcdcaa',
  info: '#3794ff',

  // Spacing
  xs: '2px',
  sm: '4px',
  md: '8px',
  lg: '12px',

  // Typography
  fontSize: '13px',
  fontSizeSmall: '11px',

  // Border radius
  radius: '2px',
  radiusSm: '3px',
} as const;

// ============================================================================
// Types
// ============================================================================

interface ProviderInfo {
  name: string;
  display_name?: string;
  category: string;
  needs_api_key: boolean;
  has_key: boolean;
}

// ============================================================================
// VS Code-Style Status Badge
// ============================================================================

function VSCodeStatusBadge({ status }: { status: 'connected' | 'disconnected' | 'error' | 'default' }) {
  const styles = {
    connected: { color: VS_CODES.success, text: 'CONFIGURED' },
    disconnected: { color: VS_CODES.textMuted, text: 'NOT CONFIGURED' },
    error: { color: VS_CODES.error, text: 'ERROR' },
    default: { color: VS_CODES.textMuted, text: 'DEFAULT' }
  };

  const style = styles[status];

  return (
    <span
      className="text-[10px] font-mono uppercase tracking-wider"
      style={{ color: style.color }}
    >
      {style.text}
    </span>
  );
}

// ============================================================================
// VS Code-Style Provider Item
// ============================================================================

interface VSCodeProviderItemProps {
  provider: ProviderInfo;
  isExpanded: boolean;
  isSelected: boolean;
  status: 'connected' | 'disconnected' | 'error' | 'default';
  apiKey: string;
  onToggle: () => void;
  onApiKeyChange: (value: string) => void;
  onSave: () => void;
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
}: VSCodeProviderItemProps) {
  const needsKey = provider.needs_api_key && !provider.has_key;
  const hasKey = provider.has_key;

  return (
    <div
      className="border font-mono text-sm"
      style={{
        borderColor: VS_CODES.border,
        borderRadius: VS_CODES.radiusSm,
        backgroundColor: isSelected ? VS_CODES.bgHover : VS_CODES.bg,
        marginBottom: VS_CODES.sm
      }}
    >
      {/* Main Row */}
      <button
        onClick={onToggle}
        className="w-full px-2 py-1.5 flex items-center gap-2 text-left hover:bg-[#2a2d2e]/50 transition-colors"
        style={{ minHeight: '32px' }}
      >
        {/* Status Indicator */}
        <div
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{
            backgroundColor: status === 'connected' ? VS_CODES.success :
                         status === 'error' ? VS_CODES.error :
                         hasKey ? VS_CODES.info :
                         needsKey ? VS_CODES.warning :
                         VS_CODES.textDim
          }}
        />

        {/* Expand Icon */}
        <div className="shrink-0" style={{ width: '16px' }}>
          {isExpanded ? (
            <ChevronRight size={12} style={{ color: VS_CODES.textMuted, transform: 'rotate(90deg)' }} />
          ) : (
            <ChevronRight size={12} style={{ color: VS_CODES.textMuted }} />
          )}
        </div>

        {/* Provider Name */}
        <div className="flex-1 truncate">
          <span style={{ color: VS_CODES.text, fontWeight: 500 }}>
            {provider.display_name || provider.name}
          </span>
        </div>

        {/* Status Badge */}
        <VSCodeStatusBadge
          status={status === 'default' && hasKey ? 'connected' : status}
        />

        {/* Selection Check */}
        {isSelected && (
          <Check size={12} style={{ color: VS_CODES.success }} />
        )}
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div
          className="px-2 py-2 border-t overflow-hidden"
          style={{
            borderColor: VS_CODES.border,
            backgroundColor: VS_CODES.bgSecondary
          }}
        >
          {/* Category */}
          <div className="text-[10px] mb-2" style={{ color: VS_CODES.textMuted }}>
            CATEGORY: <span style={{ color: VS_CODES.text }}>{provider.category.toUpperCase()}</span>
          </div>

          {/* API Key Input */}
          {needsKey ? (
            <div className="space-y-2">
              <div>
                <label className="text-[10px] uppercase mb-1 block" style={{ color: VS_CODES.textMuted }}>
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
                      backgroundColor: VS_CODES.bgInput,
                      border: `1px solid ${VS_CODES.border}`,
                      borderRadius: VS_CODES.radius,
                      color: VS_CODES.text,
                      minHeight: '24px'
                    }}
                    onFocus={(e) => e.currentTarget.style.borderColor = VS_CODES.borderFocus}
                    onBlur={(e) => e.currentTarget.style.borderColor = VS_CODES.border}
                  />
                  <button
                    onClick={onSave}
                    disabled={!apiKey}
                    className="px-3 py-1 text-xs font-mono uppercase tracking-wider transition-colors disabled:opacity-40"
                    style={{
                      backgroundColor: apiKey ? VS_CODES.info : VS_CODES.bgHover,
                      color: '#ffffff',
                      border: `1px solid ${apiKey ? VS_CODES.info : VS_CODES.border}`,
                      borderRadius: VS_CODES.radius,
                      minHeight: '24px'
                    }}
                    onMouseEnter={(e) => {
                      if (apiKey) e.currentTarget.style.backgroundColor = '#4da3ff';
                    }}
                    onMouseLeave={(e) => {
                      if (apiKey) e.currentTarget.style.backgroundColor = VS_CODES.info;
                    }}
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          ) : hasKey ? (
            <div className="flex items-center gap-2 text-xs" style={{ color: VS_CODES.success }}>
              <CheckCircle size={12} />
              <span>API key configured</span>
            </div>
          ) : (
            <div className="text-xs" style={{ color: VS_CODES.textMuted }}>
              No API key required
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

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

        // Initialize statuses based on has_key
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
    <div className="flex flex-col h-full font-mono text-sm" style={{ backgroundColor: VS_CODES.bg }}>
      {/* Header - VS Code Style */}
      <div className="border-b px-4 py-2 flex items-center gap-2" style={{ borderColor: VS_CODES.border }}>
        <Server size={14} style={{ color: VS_CODES.textMuted }} />
        <span className="font-medium" style={{ color: VS_CODES.text }}>Provider Configuration</span>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-4">
          {/* Search Bar - VS Code Style */}
          <div className="mb-4 relative">
            <Search
              size={12}
              className="absolute left-2 top-1/2 -translate-y-1/2"
              style={{ color: VS_CODES.textDim }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5"
                style={{ color: VS_CODES.textMuted }}
                onMouseEnter={(e) => e.currentTarget.style.color = VS_CODES.text}
                onMouseLeave={(e) => e.currentTarget.style.color = VS_CODES.textMuted}
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
                backgroundColor: VS_CODES.bgInput,
                border: `1px solid ${VS_CODES.border}`,
                borderRadius: VS_CODES.radius,
                color: VS_CODES.text,
                minHeight: '26px'
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = VS_CODES.borderFocus}
              onBlur={(e) => e.currentTarget.style.borderColor = VS_CODES.border}
            />
          </div>

          {/* Providers List */}
          {filteredProviders.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-12 h-12 mx-auto mb-3 flex items-center justify-center" style={{ backgroundColor: VS_CODES.bgSecondary, borderRadius: VS_CODES.radius }}>
                <Search size={20} style={{ color: VS_CODES.textDim }} />
              </div>
              <p className="text-xs" style={{ color: VS_CODES.textMuted }}>
                {searchQuery ? 'No providers match your search' : 'No providers available'}
              </p>
            </div>
          ) : (
            <div className="space-y-0">
              {/* Section Header */}
              <div className="text-[10px] uppercase mb-2 tracking-wider" style={{ color: VS_CODES.textMuted }}>
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
