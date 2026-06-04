"""Streaming and text handling for AgentLoop.

Handles text streaming, think tag parsing, and conversational responses.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Callable

import asyncio

if TYPE_CHECKING:
    from sediman.llm.provider import LLMProvider


class StreamingHandler:
    """Handles streaming text output and conversational responses."""

    def __init__(
        self,
        llm_provider: LLMProvider,
        on_streaming_text: Callable[[str, str], None] | None = None,
    ):
        self.llm = llm_provider
        self.on_streaming_text = on_streaming_text

    def stream_text(self, token: str, phase: str = "responding") -> None:
        """Stream a text token to the callback.

        Args:
            token: The text token to stream
            phase: The phase label (e.g., "responding", "thinking")
        """
        if not self.on_streaming_text or not token:
            return

        try:
            self.on_streaming_text(token, phase)
        except Exception:
            import structlog
            structlog.get_logger().debug("stream_text_callback_failed")

    async def stream_text_async(self, text: str, phase: str = "responding") -> None:
        """Stream text token-by-token for smooth TUI rendering with think tag parsing.

        Args:
            text: The text to stream
            phase: The phase for non-think content (usually "responding")
        """
        if not self.on_streaming_text or not text:
            return

        from sediman.agent.streaming import ThinkTagParser
        parser = ThinkTagParser(on_streaming_text=self.on_streaming_text)
        await parser.parse_and_stream(text, phase)

    async def get_conversational_response(
        self,
        task: str,
        conversation: list[dict[str, str]],
    ) -> str:
        """Generate a conversational response when the plan doesn't provide one.

        Args:
            task: The user's task/message
            conversation: Previous conversation history

        Returns:
            A conversational response string
        """
        import structlog
        logger = structlog.get_logger()

        try:
            system_msg = """You are Terminator, a helpful AI automation agent powered by OpenSkynet.

Your role:
- Help with browser automation, web scraping, form filling, data extraction
- Execute code tasks (installing packages, running scripts, building projects)
- Schedule recurring tasks
- Engage in friendly, natural conversation

Guidelines:
- Be warm and conversational but get to the point
- For greetings: acknowledge warmly and ask how you can help
- For thanks: respond politely and offer further assistance
- For acknowledgments ("good", "ok"): acknowledge and ask what's next
- For questions about capabilities: explain what you can do briefly
- Keep responses under 3 sentences typically
- Never leave a response empty or just "ok" - add value
- Use conversation context to maintain continuity"""

            messages = [{"role": "system", "content": system_msg}]

            # Include recent conversation context for continuity
            if conversation and len(conversation) > 0:
                recent_convo = conversation[-6:]  # Last 3 exchanges
                messages.extend(recent_convo)

            messages.append({"role": "user", "content": task})

            response = await asyncio.wait_for(
                self.llm.chat(messages=messages, tools=[]),
                timeout=10.0
            )
            result_text = response.text or ""
            if not result_text.strip():
                return "I'm here and ready to help! What would you like me to do?"
            return result_text

        except (asyncio.TimeoutError, Exception) as e:
            logger.debug("conversational_response_failed", error=str(e))
            return self._get_fallback_response(task, conversation)

    def _get_fallback_response(
        self,
        task: str,
        conversation: list[dict[str, str]],
    ) -> str:
        """Get a fallback conversational response based on task content.

        Used when LLM call fails or times out.
        """
        task_lower = task.lower()

        # Check conversation context for better responses
        last_msg = ""
        if conversation and len(conversation) > 0:
            last_msg = conversation[-1].get("content", "").lower() if conversation[-1].get("role") == "assistant" else ""

        # Greetings
        if any(greeting in task_lower for greeting in ["hi", "hello", "hey", "greetings"]):
            return "Hello! I'm Terminator, your AI automation assistant. I can help with browser tasks, web scraping, code execution, and more. What would you like to work on?"
        elif any(q in task_lower for q in ["how are you", "how do you do"]):
            return "I'm running at full capacity and ready to help! What can I do for you today?"

        # Capabilities
        elif any(q in task_lower for q in ["what can you do", "help me", "capabilities", "what are you"]):
            return "I'm Terminator, an AI agent that automates browsers, runs code, installs packages, fills forms, extracts data, and schedules recurring tasks. Just tell me what you need!"

        # Gratitude
        elif "thank" in task_lower or "thanks" in task_lower:
            return "You're welcome! I'm here whenever you need help with automation or coding tasks."

        # Acknowledgments
        elif any(ack in task_lower for ack in ["good", "great", "ok", "okay", "nice", "cool", "perfect", "excellent"]):
            return "Glad that helps! Is there anything else you'd like me to automate or work on?"
        elif any(ack in task_lower for ack in ["yes", "yeah", "yep", "sure", "alright", "right", "correct"]):
            return "Got it! What's the next task you'd like me to handle?"
        elif any(ack in task_lower for ack in ["no", "nope", "nah", "not"]):
            return "Understood. Let me know if there's anything else I can help with!"

        # Empty/minimal input
        elif task_lower.strip() in [".", "..", "..."] or len(task_lower.strip()) < 3:
            return "I'm ready to help! Tell me what you'd like me to do - automate a browser task, run some code, or anything else."

        # Default: show understanding and ask for clarification if needed
        else:
            if len(task_lower) > 50:
                return f"I understand you're asking about \"{task[:50]}...\". To help you best, could you clarify if this involves browser automation, code execution, or something else?"
            else:
                return f"I can help with \"{task}\". Should I handle this through browser automation, code execution, or another approach?"
