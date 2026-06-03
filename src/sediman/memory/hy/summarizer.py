"""
Session Summarizer for System 2 Memory.

Creates L4 SUMMARY layer records from conversation sessions.
"""

import logging
from typing import List, Dict, Any, Optional
from datetime import datetime

from .models import MemoryRecord, Layer, MemType, SessionRaw

logger = logging.getLogger(__name__)


class SessionSummarizer:
    """Summarizes conversation sessions for L4 SUMMARY layer."""

    SUMMARY_PROMPT = """Summarize this conversation session into key points:

Session messages:
{messages}

Create a concise summary that captures:
1. Main topics discussed
2. Decisions made or preferences expressed
3. Important facts learned
4. Action items or next steps

Respond with JSON:
{{
    "summary": "2-3 sentence summary",
    "key_points": ["point 1", "point 2", ...],
    "topics": ["topic1", "topic2", ...],
    "decisions": ["decision 1", ...],
    "preferences": ["preference 1", ...]
}}"""

    def __init__(self, llm_provider: Optional[Any] = None):
        """Initialize the session summarizer.

        Args:
            llm_provider: LLM provider for summarization
        """
        self.llm_provider = llm_provider

    async def summarize_session(
        self,
        session_id: str,
        store,
        max_messages: int = 50,
    ) -> Optional[MemoryRecord]:
        """Create a summary for a session.

        Args:
            session_id: The session ID to summarize
            store: Memory store for fetching traces
            max_messages: Maximum messages to process

        Returns:
            Summary record, or None if failed
        """
        # Fetch session traces
        traces = await store.get_session_traces(session_id, limit=max_messages)

        if not traces:
            logger.warning(f"No traces found for session {session_id}")
            return None

        # Format messages
        messages = self._format_traces(traces)

        # Check for existing summary
        existing = await self._find_existing_summary(session_id, store)

        if existing and self._should_update(existing, traces):
            return await self._update_summary(existing, messages, store)

        # Create new summary
        return await self._create_new_summary(session_id, messages, store)

    async def _create_new_summary(
        self,
        session_id: str,
        messages: str,
        store,
    ) -> Optional[MemoryRecord]:
        """Create a new session summary.

        Args:
            session_id: Session ID
            messages: Formatted messages
            store: Memory store

        Returns:
            New summary record
        """
        if not self.llm_provider:
            # Fallback: simple concatenation
            summary_content = f"Session with {messages.count(chr(10))} messages"
        else:
            try:
                prompt = self.SUMMARY_PROMPT.format(messages=messages[:2000])

                response = await self.llm_provider(
                    messages=[{"role": "user", "content": prompt}],
                    response_format={"type": "json_object"},
                    temperature=0.3,
                    max_tokens=500,
                )

                import json

                data = json.loads(response.content.strip())
                summary_content = self._format_summary(data)

            except Exception as e:
                logger.error(f"Summary generation failed: {e}")
                summary_content = f"Session summary (error during generation)"

        summary = MemoryRecord.create(
            layer=Layer.SUMMARY,
            mem_type=MemType.SUMMARY,
            content=summary_content,
            metadata={
                "session_id": session_id,
                "created_at": datetime.now().isoformat(),
                "message_count": messages.count("\n"),
            },
        )

        await store.add_record(summary)
        logger.info(f"Created summary for session {session_id}")

        return summary

    async def _update_summary(
        self,
        existing: MemoryRecord,
        messages: str,
        store,
    ) -> Optional[MemoryRecord]:
        """Update an existing summary with new content.

        Args:
            existing: Existing summary record
            messages: New messages to incorporate
            store: Memory store

        Returns:
            Updated summary record
        """
        if not self.llm_provider:
            # Simple append
            existing.content += f"\n\n[Update: Additional activity in session]"
            existing.updated_at = datetime.now()
            await store.update_record(existing)
            return existing

        try:
            prompt = f"""Update this summary with new information:

Existing summary:
{existing.content}

New messages:
{messages[:1000]}

Respond with JSON:
{{
    "updated_summary": "updated summary text",
    "changes": ["change 1", "change 2"]
}}"""

            response = await self.llm_provider(
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                temperature=0.3,
                max_tokens=500,
            )

            import json

            data = json.loads(response.content.strip())
            existing.content = data.get("updated_summary", existing.content)
            existing.updated_at = datetime.now()
            existing.metadata = existing.metadata or {}
            existing.metadata["last_updated"] = datetime.now().isoformat()
            existing.metadata["update_count"] = (
                existing.metadata.get("update_count", 0) + 1
            )

            await store.update_record(existing)
            logger.info(f"Updated summary {existing.id}")

            return existing

        except Exception as e:
            logger.error(f"Summary update failed: {e}")
            return existing

    async def update_summary(
        self,
        session_id: str,
        new_content: str,
        store,
    ) -> Optional[MemoryRecord]:
        """Update a session summary incrementally.

        Args:
            session_id: Session ID
            new_content: New content to add
            store: Memory store

        Returns:
            Updated summary record
        """
        existing = await self._find_existing_summary(session_id, store)

        if not existing:
            # Create new summary
            return await self._create_new_summary(
                session_id, f"New content: {new_content}", store
            )

        # Append to existing
        existing.content += f"\n\n{new_content}"
        existing.updated_at = datetime.now()
        existing.metadata = existing.metadata or {}
        existing.metadata["last_updated"] = datetime.now().isoformat()

        await store.update_record(existing)
        return existing

    async def _find_existing_summary(
        self,
        session_id: str,
        store,
    ) -> Optional[MemoryRecord]:
        """Find existing summary for a session.

        Args:
            session_id: Session ID to find
            store: Memory store

        Returns:
            Existing summary record or None
        """
        summaries = await store.query_by_type(MemType.SUMMARY, limit=50)

        for summary in summaries:
            if summary.metadata.get("session_id") == session_id:
                return summary

        return None

    def _should_update(
        self,
        existing: MemoryRecord,
        new_traces: List[SessionRaw],
    ) -> bool:
        """Determine if existing summary should be updated.

        Args:
            existing: Existing summary
            new_traces: New session traces

        Returns:
            True if should update
        """
        # Update if more than 10 new messages
        existing_count = existing.metadata.get("message_count", 0)
        return len(new_traces) > existing_count + 10

    def _format_traces(self, traces: List[SessionRaw]) -> str:
        """Format session traces for summarization.

        Args:
            traces: List of session traces

        Returns:
            Formatted message string
        """
        lines = []
        for trace in traces:
            lines.append(f"{trace.role}: {trace.content}")
        return "\n".join(lines)

    def _format_summary(self, data: Dict[str, Any]) -> str:
        """Format summary data into readable content.

        Args:
            data: Summary data from LLM

        Returns:
            Formatted summary string
        """
        parts = []

        if data.get("summary"):
            parts.append(data["summary"])

        if data.get("key_points"):
            parts.append("\nKey Points:")
            for point in data["key_points"]:
                parts.append(f"  - {point}")

        if data.get("decisions"):
            parts.append("\nDecisions:")
            for decision in data["decisions"]:
                parts.append(f"  - {decision}")

        if data.get("preferences"):
            parts.append("\nPreferences:")
            for pref in data["preferences"]:
                parts.append(f"  - {pref}")

        return "\n".join(parts)

    async def get_session_insights(
        self,
        session_id: str,
        store,
    ) -> Dict[str, Any]:
        """Get insights about a session.

        Args:
            session_id: Session ID
            store: Memory store

        Returns:
            Dictionary of insights
        """
        traces = await store.get_session_traces(session_id, limit=100)

        if not traces:
            return {"message_count": 0, "duration": 0}

        # Calculate basic stats
        user_messages = [t for t in traces if t.role == "user"]
        assistant_messages = [t for t in traces if t.role == "assistant"]

        duration = (
            traces[-1].created_at - traces[0].created_at
            if len(traces) > 1
            else None
        )

        return {
            "message_count": len(traces),
            "user_message_count": len(user_messages),
            "assistant_message_count": len(assistant_messages),
            "duration_seconds": duration.total_seconds() if duration else 0,
            "has_summary": await self._find_existing_summary(session_id, store)
            is not None,
        }
