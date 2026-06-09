/**
 * VS Code-Style SkillsPage
 * Skills management with VS Code design system
 */

import { useState, useEffect, useMemo } from 'react';
import { Trash2, Search, Package, Code, X, Folder, ExternalLink, Circle, Square, Download } from 'lucide-react';
import { type Skill } from '@/types';
import { cn } from '@/lib/utils';

interface ServerRecordingSession {
  id: string;
  name: string;
  startedAt: string;
}

interface RecordingState {
  isRecording: boolean;
  sessionId: string | null;
  sessionName: string;
  frameCount: number;
}

export function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'installed' | 'available'>('all');
  const [showCode, setShowCode] = useState<string | null>(null);
  const [codeContent, setCodeContent] = useState<string>('');
  const [recording, setRecording] = useState<RecordingState>({
    isRecording: false,
    sessionId: null,
    sessionName: '',
    frameCount: 0,
  });
  const [activeSessions, setActiveSessions] = useState<ServerRecordingSession[]>([]);
  const [installing, setInstalling] = useState<Set<string>>(new Set());

  const apiBaseUrl = 'http://localhost:3001';

  // Load skills from server
  const loadSkills = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/skills`);
      if (response.ok) {
        const data = await response.json();
        // Show all skills including external ones from 4xx API
        setSkills(data.skills || []);
      }
    } catch (error) {
      console.error('Failed to load skills:', error);
      setSkills([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Load active recording sessions
  const loadActiveSessions = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/skills/record/active`);
      if (response.ok) {
        const data = await response.json();
        setActiveSessions(data.sessions || []);
      }
    } catch (error) {
      console.error('Failed to load active sessions:', error);
    }
  };

  useEffect(() => {
    loadSkills();
    loadActiveSessions();
    const interval = setInterval(loadActiveSessions, 5000);
    return () => clearInterval(interval);
  }, []);

  const filteredSkills = skills.filter((skill) => {
    const matchesSearch =
      skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      skill.description.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesFilter =
      filter === 'all' ||
      (filter === 'installed' && skill.installed) ||
      (filter === 'available' && !skill.installed);

    return matchesSearch && matchesFilter;
  });

  // Group skills by category
  const skillsByCategory = useMemo(() => {
    const groups: Record<string, Skill[]> = {};
    for (const skill of filteredSkills) {
      const category = skill.category || 'general';
      if (!groups[category]) groups[category] = [];
      groups[category].push(skill);
    }
    return groups;
  }, [filteredSkills]);

  const handleStartRecording = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/skills/record/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `Recording ${new Date().toLocaleTimeString()}` }),
      });
      if (response.ok) {
        const result = await response.json();
        setRecording({
          isRecording: true,
          sessionId: result.id,
          sessionName: result.name,
          frameCount: 0,
        });
        loadActiveSessions();
      }
    } catch (error) {
      console.error('Failed to start recording:', error);
    }
  };

  const handleStopRecording = async () => {
    if (!recording.sessionId) return;

    try {
      const response = await fetch(`${apiBaseUrl}/api/skills/record/${recording.sessionId}/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (response.ok) {
        const result = await response.json();
        setRecording({
          isRecording: false,
          sessionId: null,
          sessionName: '',
          frameCount: 0,
        });
        loadActiveSessions();

        if (result.skillCreated) {
          loadSkills();
        }
      }
    } catch (error) {
      console.error('Failed to stop recording:', error);
    }
  };

  const handleViewSkillCode = async (skillId: string) => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/skills/${encodeURIComponent(skillId)}`);
      if (response.ok) {
        const skill = await response.json();
        // API returns skill directly or in error format
        const skillData = skill.error ? null : skill;
        if (skillData) {
          setCodeContent(JSON.stringify(skillData, null, 2));
          setShowCode(skill.name || skillId);
        } else {
          console.error('Skill not found or error:', skill.error || skill.message);
        }
      }
    } catch (error) {
      console.error('Failed to load skill code:', error);
    }
  };

  const handleDeleteSkill = async (skillId: string) => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/skills/${encodeURIComponent(skillId)}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        loadSkills();
      }
    } catch (error) {
      console.error('Failed to delete skill:', error);
    }
  };

  const handleInstallSkill = async (skillName: string) => {
    setInstalling(prev => new Set(prev).add(skillName));
    try {
      const response = await fetch(`${apiBaseUrl}/api/hub/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: skillName }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Skill installed:', result);
        // Reload skills to update the list
        await loadSkills();
      } else {
        console.error('Failed to install skill:', await response.text());
      }
    } catch (error) {
      console.error('Failed to install skill:', error);
    } finally {
      setInstalling(prev => {
        const next = new Set(prev);
        next.delete(skillName);
        return next;
      });
    }
  };

  const installedCount = skills.filter((s) => s.installed).length;
  const availableCount = skills.filter((s) => !s.installed).length;

  return (
    <div className="skills-page">
      {/* Header */}
      <div className="skills-header">
        <Package size={18} className="skills-header-icon" />
        <div className="flex-1">
          <h1 className="skills-header-title">Skills</h1>
          <p className="skills-header-subtitle">
            Manage agent skills and recordings
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="skills-counter">
            <Package size={14} className="skills-counter-icon" />
            <span className="skills-counter-value">
              {skills.length}
            </span>
          </div>
          {activeSessions.length > 0 && (
            <div className="recording-badge">
              <Circle size={14} className="recording-badge-icon" />
              <span className="recording-badge-text">
                {activeSessions.length} recording
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Search & Filter */}
      <div className="skills-search-section">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="relative flex-1">
            <Search
              size={14}
              className="skills-search-icon"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search skills..."
              className="skills-search-input"
            />
          </div>
          <button
            onClick={recording.isRecording ? handleStopRecording : handleStartRecording}
            className={cn('recording-button', recording.isRecording ? 'recording' : 'idle')}
          >
            {recording.isRecording ? (
              <>
                <Square size={14} />
                Stop Recording
              </>
            ) : (
              <>
                <Circle size={14} />
                Start Recording
              </>
            )}
          </button>
        </div>

        <div className="skills-filter-group max-w-4xl mx-auto">
          {(['all', 'installed', 'available'] as const).map((filterType) => (
            <button
              key={filterType}
              onClick={() => setFilter(filterType)}
              className={cn('skills-filter-button', filter === filterType && 'active')}
            >
              {filterType === 'all' && `All (${skills.length})`}
              {filterType === 'installed' && `Installed (${installedCount})`}
              {filterType === 'available' && `Available (${availableCount})`}
            </button>
          ))}
        </div>
      </div>

      {/* Active Recording Sessions */}
      {activeSessions.length > 0 && (
        <div className="px-6 py-3 border-b" style={{
          backgroundColor: 'rgba(139, 92, 246, 0.05)',
          borderColor: 'rgba(139, 92, 246, 0.2)'
        }}>
          <div className="max-w-4xl mx-auto flex items-center gap-3">
            <Circle size={14} className="animate-pulse" style={{ color: 'var(--vscode-focusBorder)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--vscode-focusBorder)' }}>
              Active Recording: {activeSessions[0]?.name}
            </span>
            <span className="text-xs" style={{ color: 'var(--vscode-secondary-text)' }}>
              ({recording.frameCount} frames captured)
            </span>
          </div>
        </div>
      )}

      {/* Skills List */}
      <div className="skills-content">
        <div className="max-w-4xl mx-auto space-y-6">
          {isLoading ? (
            <div className="skills-loading">
              <div className="skills-loading-spinner" />
            </div>
          ) : filteredSkills.length > 0 ? (
            <>
              {/* Available Skills Section */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold uppercase" style={{ color: 'var(--vscode-foreground)' }}>
                    Available Skills ({filteredSkills.length})
                  </h2>
                  {skills.length > 0 && (
                    <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--vscode-secondary-text)' }}>
                      <Folder size={14} />
                      {Object.keys(skillsByCategory).length} categories
                    </div>
                  )}
                </div>

                {/* Display by category */}
                {Object.entries(skillsByCategory).map(([category, categorySkills]) => (
                  <div key={category} className="skills-category">
                    <div className="skills-category-header">
                      <div className="flex items-center gap-2">
                        <Folder size={14} />
                        <span className="skills-category-title">{category}</span>
                        <span className="skills-category-count">({categorySkills.length})</span>
                      </div>
                    </div>
                    <div className="border rounded overflow-hidden" style={{
                      borderColor: 'var(--vscode-border-color)',
                      borderRadius: 'var(--radius-md)'
                    }}>
                      {categorySkills.map((skill, index) => (
                        <div
                          key={skill.name}
                          className="flex items-center gap-4 p-4 transition-colors"
                          style={{
                            borderBottom: index !== categorySkills.length - 1 ? '1px solid var(--vscode-border-color)' : 'none'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                          }}
                        >
                          {/* Icon */}
                          <div className="skill-card-icon">
                            {skill.source ? (
                              <ExternalLink size={18} style={{ color: 'var(--vscode-secondary-text)' }} />
                            ) : (
                              <Package size={18} style={{ color: 'var(--vscode-secondary-text)' }} />
                            )}
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="skill-card-name">
                                {skill.name}
                              </h4>
                              {skill.version && (
                                <span className="text-[10px] px-2 py-0.5 rounded" style={{
                                  backgroundColor: 'var(--vscode-badge-background)',
                                  color: 'var(--vscode-badge-foreground)'
                                }}>
                                  v{skill.version}
                                </span>
                              )}
                              {skill.source && (
                                <span className="text-[10px] px-2 py-0.5 rounded" style={{
                                  backgroundColor: 'var(--vscode-info-foreground)',
                                  color: 'white'
                                }}>
                                  {skill.source.split('/')[0]}
                                </span>
                              )}
                            </div>
                            <p className="skill-card-description">
                              {skill.description}
                            </p>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-2">
                            {!skill.installed && (
                              <button
                                onClick={() => handleInstallSkill(skill.name)}
                                disabled={installing.has(skill.name)}
                                className="skill-card-button primary"
                                style={{ opacity: installing.has(skill.name) ? 0.6 : 1 }}
                              >
                                {installing.has(skill.name) ? (
                                  <>
                                    <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                    Installing...
                                  </>
                                ) : (
                                  <>
                                    <Download size={12} />
                                    Install
                                  </>
                                )}
                              </button>
                            )}
                            <button
                              onClick={() => handleViewSkillCode(skill.id)}
                              className="skill-card-button secondary"
                            >
                              <Code size={12} />
                              View
                            </button>
                            {skill.installed && (
                              <button
                                onClick={() => handleDeleteSkill(skill.id)}
                                className="skill-card-button danger"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="skills-empty-state">
              <Package size={48} className="skills-empty-icon" />
              <p className="skills-empty-description">
                {searchQuery || filter !== 'all'
                  ? 'No skills found matching your criteria'
                  : 'No skills available. Start recording to create skills!'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Code View Modal */}
      {showCode && (
        <div
          className="skill-code-modal"
          onClick={() => setShowCode(null)}
        >
          <div
            className="skill-code-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="skill-code-modal-header">
              <div>
                <h3 className="skill-code-modal-title">
                  Skill: {showCode}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(codeContent);
                  }}
                  className="skill-code-modal-close"
                >
                  <Code size={14} />
                </button>
                <button
                  onClick={() => setShowCode(null)}
                  className="skill-code-modal-close"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
            <div className="skill-code-modal-body">
              <pre className="skill-code-modal-code">
                {codeContent}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SkillsPage;
