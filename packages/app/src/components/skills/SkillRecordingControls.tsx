/**
 * Skill Recording Controls Component
 * Server-side recording integration for browser panel
 */

import { useState, useEffect } from 'react';
import { Circle, Square, X } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { Input } from '@/components/shared/Input';
import { Modal } from '@/components/shared/Modal';

interface RecordingState {
  isRecording: boolean;
  sessionId: string | null;
  sessionName: string;
}

interface SkillRecordingControlsProps {
  onRecordingComplete?: (skillName: string) => void;
  position?: 'header' | 'sidebar' | 'floating';
}

const API_BASE = 'http://localhost:3001';

export function SkillRecordingControls({
  onRecordingComplete,
  position = 'header'
}: SkillRecordingControlsProps) {
  const [recordingState, setRecordingState] = useState<RecordingState>({
    isRecording: false,
    sessionId: null,
    sessionName: '',
  });
  const [showStartModal, setShowStartModal] = useState(false);
  const [skillName, setSkillName] = useState('');

  useEffect(() => {
    // Poll recording state from server
    const checkRecording = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/record/active`);
        if (response.ok) {
          const data = await response.json();
          const sessions = data.sessions || [];
          const activeSession = sessions.find((s: any) => s.status === 'recording');
          if (activeSession) {
            setRecordingState({
              isRecording: true,
              sessionId: activeSession.id,
              sessionName: activeSession.name,
            });
          }
        }
      } catch (error) {
        console.error('Failed to check recording state:', error);
      }
    };

    checkRecording();
    const interval = setInterval(checkRecording, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleStartRecording = async () => {
    if (!skillName.trim()) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/record/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: skillName }),
      });

      if (response.ok) {
        const result = await response.json();
        setRecordingState({
          isRecording: true,
          sessionId: result.id,
          sessionName: result.name,
        });
        setShowStartModal(false);
        setSkillName('');
      }
    } catch (error) {
      console.error('Failed to start recording:', error);
    }
  };

  const handleStopRecording = async () => {
    if (!recordingState.sessionId) return;

    try {
      const response = await fetch(`${API_BASE}/api/record/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: recordingState.sessionId }),
      });

      if (response.ok) {
        setRecordingState({
          isRecording: false,
          sessionId: null,
          sessionName: '',
        });

        if (onRecordingComplete && skillName) {
          onRecordingComplete(skillName);
        }
      }
    } catch (error) {
      console.error('Failed to stop recording:', error);
    }
  };

  if (position === 'header') {
    return (
      <>
        <div className="flex items-center gap-2">
          {!recordingState.isRecording ? (
            <Button
              size="sm"
              variant="default"
              onClick={() => setShowStartModal(true)}
              className="hover-lift"
            >
              <Circle className="w-3 h-3 mr-1.5" />
              Record Skill
            </Button>
          ) : (
            <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Circle className="w-3 h-3 text-red-500 animate-pulse" />
                </div>
                <span className="text-xs font-medium text-red-700">
                  {recordingState.sessionName || 'Recording'}...
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleStopRecording}
                  className="h-6 px-2 text-xs hover-lift"
                >
                  <Square className="w-3 h-3 mr-1" />
                  Stop
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleStopRecording}
                  className="h-6 px-2 text-xs hover-lift text-red-600 hover:text-red-700"
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Start Recording Modal */}
        <Modal
          isOpen={showStartModal}
          onClose={() => setShowStartModal(false)}
          title="Start Recording New Skill"
          description="Record browser interactions to create a reusable skill"
          size="md"
        >
          <div className="space-y-4">
            <Input
              label="Skill Name"
              placeholder="e.g., Login to Google"
              value={skillName}
              onChange={(e) => setSkillName(e.target.value)}
              autoFocus
            />

            <div className="flex items-center justify-between pt-4 border-t border-gray-200">
              <Button
                variant="ghost"
                onClick={() => setShowStartModal(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleStartRecording}
                disabled={!skillName.trim()}
              >
                <Circle className="w-4 h-4 mr-2" />
                Start Recording
              </Button>
            </div>
          </div>
        </Modal>
      </>
    );
  }

  // Floating position for overlay controls
  return (
    <>
      <div className="fixed bottom-4 left-4 z-50">
        {!recordingState.isRecording ? (
          <Button
            size="lg"
            variant="primary"
            onClick={() => setShowStartModal(true)}
            className="shadow-lg hover-lift"
          >
            <Circle className="w-5 h-5 mr-2" />
            Record Skill
          </Button>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 min-w-[280px]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Circle className="w-3 h-3 text-red-500 animate-pulse" />
                <span className="text-sm font-semibold">Recording</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleStopRecording}
                className="text-red-600"
              >
                <X className="w-3 h-3" />
              </Button>
            </div>

            <div className="text-xs text-gray-600 mb-3">
              {recordingState.sessionName}
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                variant="default"
                onClick={handleStopRecording}
                className="flex-1"
              >
                <Square className="w-3 h-3 mr-1" />
                Stop
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Modal would be the same */}
    </>
  );
}
