/**
 * useScrollControl Hook
 * Manages scroll functionality for message lists
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { Message } from '@/types';

interface UseScrollControlOptions {
  messages?: Message[];
  isStreaming?: boolean;
}

export function useScrollControl(options: UseScrollControlOptions = {}) {
  const { messages = [], isStreaming = false } = options;
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isUserScrolled, setIsUserScrolled] = useState(false);

  // Scroll to bottom
  const scrollToBottom = useCallback((smooth = true) => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto'
      });
      setIsUserScrolled(false);
    }
  }, []);

  // Handle scroll events
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 80;
    setShowScrollButton(!isNearBottom);
    setIsUserScrolled(!isNearBottom);
  }, []);

  // Auto-scroll when new messages arrive (but only if user hasn't scrolled up)
  useEffect(() => {
    const shouldAutoScroll = !isUserScrolled || isStreaming;
    if (shouldAutoScroll && messages.length > 0) {
      // Small delay to ensure content is rendered
      const timeoutId = setTimeout(() => scrollToBottom(false), 50);
      return () => clearTimeout(timeoutId);
    }
  }, [messages.length, isUserScrolled, isStreaming, scrollToBottom]);

  // Reset scroll position when messages become empty (new conversation)
  useEffect(() => {
    if (messages.length === 0 && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
      setIsUserScrolled(false);
    }
  }, [messages.length]);

  return {
    scrollRef,
    messagesEndRef,
    showScrollButton,
    scrollToBottom,
    handleScroll,
    isUserScrolled
  };
}
