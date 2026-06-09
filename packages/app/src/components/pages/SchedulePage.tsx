/**
 * VS Code-Style SchedulePage
 * Cron-based task automation with VS Code design system
 */

import { useState, useEffect, useCallback } from 'react';
import { Clock, Plus, Trash2, Search, Play, Calendar, X } from 'lucide-react';
import { type CronJob } from '@/types';
import { cn } from '@/lib/utils';
import { CRON_PRESETS, formatCronHuman, timeAgo } from '@/lib/schedule-utils';

const API_BASE = 'http://localhost:3001';

interface AddJobForm {
  cron: string;
  task: string;
  skill_name: string;
  provider: string;
}

export function SchedulePage() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState<AddJobForm>({
    cron: '',
    task: '',
    skill_name: '',
    provider: '',
  });
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<Set<string>>(new Set());

  const loadJobs = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/schedule`);
      if (response.ok) {
        const data = await response.json();
        setJobs(data.jobs || []);
      }
    } catch {
      // server not reachable
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJobs();
    const interval = setInterval(loadJobs, 10000);
    return () => clearInterval(interval);
  }, [loadJobs]);

  const filteredJobs = jobs.filter((job) => {
    const q = searchQuery.toLowerCase();
    return (
      job.task.toLowerCase().includes(q) ||
      job.cron.toLowerCase().includes(q) ||
      (job.skill_name ?? '').toLowerCase().includes(q) ||
      job.id.toLowerCase().includes(q)
    );
  });

  const handleAddJob = async () => {
    setFormError('');

    if (!form.cron.trim()) {
      setFormError('Cron expression is required');
      return;
    }
    if (!form.task.trim()) {
      setFormError('Task description is required');
      return;
    }

    const parts = form.cron.trim().split(/\s+/);
    if (parts.length !== 5) {
      setFormError('Cron must be 5 fields: minute hour day month weekday');
      return;
    }

    setIsSubmitting(true);
    try {
      const body: Record<string, string> = {
        cron: form.cron.trim(),
        task: form.task.trim(),
      };
      if (form.skill_name.trim()) body.skill_name = form.skill_name.trim();
      if (form.provider.trim()) body.provider = form.provider.trim();

      const response = await fetch(`${API_BASE}/api/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        setForm({ cron: '', task: '', skill_name: '', provider: '' });
        setShowAddForm(false);
        await loadJobs();
      } else {
        const data = await response.json();
        setFormError(data.message || `Error ${response.status}`);
      }
    } catch {
      setFormError('Failed to connect to server');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    setDeleting((prev) => new Set(prev).add(jobId));
    try {
      const response = await fetch(`${API_BASE}/api/schedule/${jobId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        await loadJobs();
      }
    } catch {
      // ignore
    } finally {
      setDeleting((prev) => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });
    }
  };

  const enabledCount = jobs.filter((j) => j.enabled).length;

  return (
    <div className="schedule-page">
      {/* Header */}
      <div className="schedule-header">
        <Clock size={18} className="schedule-header-icon" />
        <div className="flex-1">
          <h1 className="schedule-header-title">Schedule</h1>
          <p className="schedule-header-subtitle">
            Cron-based task automation
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="job-counter">
            <Calendar size={14} className="job-counter-icon" />
            <span className="job-counter-value">
              {jobs.length}
            </span>
            {jobs.length > 0 && (
              <span className="job-counter-detail">
                ({enabledCount} active)
              </span>
            )}
          </div>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="job-item-button job-item-button-primary"
          >
            <Plus size={12} />
            Add Job
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="schedule-search">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="relative flex-1">
            <Search
              size={14}
              className="schedule-search-icon"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search jobs..."
              className="schedule-search-input"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="schedule-content">
        {showAddForm && (
          <div className="job-form-card">
            <div className="job-form-header">
              <h3 className="job-form-title">
                <Plus size={14} />
                New Scheduled Job
              </h3>
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setFormError('');
                }}
                className="job-form-close"
              >
                <X size={14} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="job-form-field">
                <div className="flex items-center justify-between mb-2">
                  <label className="job-form-label">
                    Cron Expression
                  </label>
                  <span className="text-[10px]" style={{ color: 'var(--vscode-secondary-text)' }}>
                    minute hour day month weekday
                  </span>
                </div>
                <input
                  type="text"
                  value={form.cron}
                  onChange={(e) => setForm({ ...form, cron: e.target.value })}
                  placeholder="*/30 * * * *"
                  className="job-form-input"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {CRON_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setForm({ ...form, cron: preset.value })}
                      className="text-[10px] px-2 py-1 rounded border transition-colors font-mono"
                      style={{
                        backgroundColor: form.cron === preset.value
                          ? 'var(--vscode-button-primary-background)'
                          : 'transparent',
                        color: form.cron === preset.value
                          ? 'var(--vscode-button-primary-foreground)'
                          : 'var(--vscode-foreground)',
                        borderColor: form.cron === preset.value
                          ? 'transparent'
                          : 'var(--vscode-border-color)'
                      }}
                      onMouseEnter={(e) => {
                        if (form.cron !== preset.value) {
                          e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (form.cron !== preset.value) {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }
                      }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="job-form-field">
                <label className="job-form-label">
                  Task Description
                </label>
                <textarea
                  value={form.task}
                  onChange={(e) => setForm({ ...form, task: e.target.value })}
                  placeholder="Describe what the agent should do..."
                  className="job-form-input job-form-textarea"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="job-form-field">
                  <label className="job-form-label">
                    Skill Name (optional)
                  </label>
                  <input
                    type="text"
                    value={form.skill_name}
                    onChange={(e) => setForm({ ...form, skill_name: e.target.value })}
                    placeholder="skill-name"
                    className="job-form-input"
                  />
                </div>
                <div className="job-form-field">
                  <label className="job-form-label">
                    Provider (optional)
                  </label>
                  <input
                    type="text"
                    value={form.provider}
                    onChange={(e) => setForm({ ...form, provider: e.target.value })}
                    placeholder="openai"
                    className="job-form-input"
                  />
                </div>
              </div>

              {formError && (
                <div className="job-form-error">{formError}</div>
              )}

              <div className="job-form-actions">
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setFormError('');
                  }}
                  className="job-item-button"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddJob}
                  disabled={isSubmitting}
                  className="job-item-button job-item-button-primary"
                  style={{ opacity: isSubmitting ? 0.6 : 1 }}
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Clock size={12} />
                      Schedule
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{
              borderColor: 'var(--vscode-progress-background)',
              borderTopColor: 'transparent'
            }} />
          </div>
        ) : filteredJobs.length > 0 ? (
          <div className="job-list">
            {filteredJobs.map((job, index) => (
              <div
                key={job.id}
                className={cn('job-item', !job.enabled && 'job-item-disabled')}
                style={{
                  borderBottom: index !== filteredJobs.length - 1 ? '1px solid var(--vscode-border-color)' : 'none'
                }}
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded flex items-center justify-center flex-shrink-0 mt-0.5" style={{
                    backgroundColor: 'var(--vscode-input-background)'
                  }}>
                    <Play
                      size={16}
                      style={{ color: job.enabled ? 'var(--vscode-button-primary-background)' : 'var(--vscode-secondary-text)' }}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <code className="text-xs font-mono px-2 py-0.5 rounded" style={{
                        backgroundColor: 'var(--vscode-input-background)',
                        color: 'var(--vscode-foreground)'
                      }}>
                        {job.cron}
                      </code>
                      <span className={cn('job-item-status', job.enabled ? 'job-item-status-enabled' : 'job-item-status-disabled')}>
                        {job.enabled ? 'Active' : 'Disabled'}
                      </span>
                      {job.skill_name && (
                        <span className="text-[10px] px-2 py-0.5 rounded" style={{
                          backgroundColor: 'var(--vscode-info-foreground)',
                          color: 'white'
                        }}>
                          {job.skill_name}
                        </span>
                      )}
                      {job.provider && job.provider !== 'openai' && (
                        <span className="text-[10px] px-2 py-0.5 rounded" style={{
                          backgroundColor: 'var(--vscode-badge-background)',
                          color: 'var(--vscode-badge-foreground)'
                        }}>
                          {job.provider}
                        </span>
                      )}
                    </div>

                    <p className="text-sm line-clamp-2" style={{ color: 'var(--vscode-foreground)' }}>
                      {job.task}
                    </p>

                    <div className="flex items-center gap-3 mt-2 text-xs" style={{ color: 'var(--vscode-secondary-text)' }}>
                      <span title={formatCronHuman(job.cron)}>
                        {formatCronHuman(job.cron)}
                      </span>
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                        Last run: {timeAgo(job.last_run)}
                      </span>
                      <span className="text-[10px] font-mono">
                        {job.id}
                      </span>
                    </div>

                    {job.last_result && (
                      <div className="mt-2 px-3 py-2 rounded text-xs line-clamp-2 font-mono" style={{
                        backgroundColor: 'var(--vscode-input-background)',
                        color: 'var(--vscode-secondary-text)'
                      }}>
                        {job.last_result}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => handleDeleteJob(job.id)}
                    disabled={deleting.has(job.id)}
                    className="job-item-button job-item-button-danger"
                    style={{ opacity: deleting.has(job.id) ? 0.6 : 1 }}
                  >
                    {deleting.has(job.id) ? (
                      <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Trash2 size={14} />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="schedule-empty-state">
            <Clock size={48} className="schedule-empty-icon" />
            <p className="schedule-empty-description">
              {searchQuery
                ? 'No scheduled jobs matching your search'
                : 'No scheduled jobs yet. Click "Add Job" to create one.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default SchedulePage;
