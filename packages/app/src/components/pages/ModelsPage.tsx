/**
 * VS Code-Style ModelsPage
 * Model selection with VS Code design system
 */

import { useState, useEffect } from 'react';
import { Bot, Check, Copy, AlertCircle } from 'lucide-react';
import { useAppStore } from '@/stores/useAppStore';

interface Model {
  id: string;
  name: string;
  provider: string;
  contextLength: number;
  description: string;
}

export function ModelsPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const currentModel = useAppStore((state) => state.model);
  const currentProvider = useAppStore((state) => state.provider);
  const setCurrentModel = useAppStore((state) => state.setModel);

  useEffect(() => {
    if (currentModel) {
      setSelectedModel(currentModel);
    }
  }, [currentModel]);

  useEffect(() => {
    loadModels();
  }, [currentProvider]);

  const loadModels = async () => {
    if (!currentProvider) {
      setModels([]);
      return;
    }

    try {
      const response = await fetch(`http://localhost:3001/api/model/list?provider=${currentProvider}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (response.ok) {
        const data = await response.json();
        const providerModels = (data.models || []).map((m: any) => ({
          id: m.id,
          name: m.name || m.id,
          provider: currentProvider,
          contextLength: 128000,
          description: `Model by ${currentProvider}`
        }));
        setModels(providerModels);
      }
    } catch (error) {
      console.error('Failed to load models:', error);
      setModels([]);
    }
  };

  const handleSelectModel = (modelId: string) => {
    setSelectedModel(modelId);
    setCurrentModel(modelId);
  };

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
  };

  if (!currentProvider) {
    return (
      <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--vscode-background)' }}>
        {/* Page Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b" style={{
          borderColor: 'var(--vscode-border-color)',
          backgroundColor: 'var(--vscode-background)',
          color: 'var(--vscode-foreground)',
          minHeight: '40px'
        }}>
          <Bot size={18} style={{ color: 'var(--vscode-secondary-text)' }} />
          <div>
            <h1 className="text-sm font-medium" style={{ color: 'var(--vscode-foreground)' }}>Models</h1>
            <p className="text-xs" style={{ color: 'var(--vscode-secondary-text)' }}>Select AI model for agent</p>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto p-8 flex flex-col items-center justify-center h-full">
            <AlertCircle className="w-12 h-12 mb-4" style={{ color: 'var(--vscode-warning-foreground)' }} />
            <p className="text-sm" style={{ color: 'var(--vscode-secondary-text)' }}>
              Please configure a provider first in the Provider page
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--vscode-background)' }}>
      {/* Page Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b" style={{
        borderColor: 'var(--vscode-border-color)',
        backgroundColor: 'var(--vscode-background)',
        color: 'var(--vscode-foreground)',
        minHeight: '40px'
      }}>
        <Bot size={18} style={{ color: 'var(--vscode-secondary-text)' }} />
        <div>
          <h1 className="text-sm font-medium" style={{ color: 'var(--vscode-foreground)' }}>Models</h1>
          <p className="text-xs" style={{ color: 'var(--vscode-secondary-text)' }}>
            Available models for {currentProvider}
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-6 space-y-6">
          {/* Current Selection */}
          {selectedModel && (
            <div className="px-4 py-3 border" style={{
              borderColor: 'var(--vscode-focus-border)',
              backgroundColor: 'rgba(0, 127, 212, 0.05)'
            }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium uppercase mb-1" style={{ color: 'var(--vscode-secondary-text)' }}>Current Model</div>
                  <div className="text-sm" style={{ color: 'var(--vscode-foreground)' }}>
                    {models.find(m => m.id === selectedModel)?.name}
                  </div>
                </div>
                <Check className="w-5 h-5" style={{ color: 'var(--vscode-success-foreground)' }} />
              </div>
            </div>
          )}

          {/* Models */}
          {models.length === 0 ? (
            <div className="px-4 py-8 border text-center" style={{
              borderColor: 'var(--vscode-border-color)',
              backgroundColor: 'var(--vscode-panel-background)'
            }}>
              <p style={{ color: 'var(--vscode-secondary-text)' }}>No models found for provider: {currentProvider}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {models.map((model) => (
                <div
                  key={model.id}
                  className="px-4 py-3 border cursor-pointer transition-all"
                  style={{
                    borderColor: selectedModel === model.id ? 'var(--vscode-focus-border)' : 'var(--vscode-border-color)',
                    backgroundColor: selectedModel === model.id ? 'rgba(0, 127, 212, 0.05)' : 'var(--vscode-panel-background)'
                  }}
                  onClick={() => handleSelectModel(model.id)}
                  onMouseEnter={(e) => {
                    if (selectedModel !== model.id) {
                      e.currentTarget.style.borderColor = 'var(--vscode-focus-border)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedModel !== model.id) {
                      e.currentTarget.style.borderColor = 'var(--vscode-border-color)';
                    }
                  }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="text-sm font-medium mb-1" style={{ color: 'var(--vscode-foreground)' }}>
                        {model.name}
                      </div>
                      <div className="text-xs" style={{ color: 'var(--vscode-secondary-text)' }}>
                        {model.description}
                      </div>
                    </div>
                    {selectedModel === model.id && (
                      <Check className="w-5 h-5" style={{ color: 'var(--vscode-success-foreground)' }} />
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span style={{ color: 'var(--vscode-secondary-text)' }}>Context</span>
                      <span className="font-mono font-medium" style={{ color: 'var(--vscode-foreground)' }}>
                        {(model.contextLength / 1000).toFixed(0)}K
                      </span>
                    </div>
                    <button
                      className="w-full px-3 py-1 text-xs font-mono border transition-colors flex items-center justify-center gap-2"
                      style={{
                        backgroundColor: 'transparent',
                        borderColor: 'var(--vscode-border-color)',
                        color: 'var(--vscode-foreground)'
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyId(model.id);
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <Copy size={12} />
                      Copy ID
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ModelsPage;
