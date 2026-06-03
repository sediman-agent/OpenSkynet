"""
Fact Extractor for System 2 Memory.

Extracts atomic facts, preferences, and identity information from conversation.
"""

import logging
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from datetime import datetime

from .models import Layer, MemType

logger = logging.getLogger(__name__)


class ExtractedFact(BaseModel):
    """A single fact extracted from conversation."""

    content: str = Field(description="The fact content")
    fact_type: str = Field(
        description="Type: fact, preference, identity, decision, experience"
    )
    confidence: float = Field(default=0.8, description="Confidence score (0-1)")
    reasoning: str = Field(default="", description="Why this was extracted")


class FactExtractor:
    """Extracts structured facts from conversation messages.

    Transforms raw conversation into atomic facts for L2 FACT layer.
    """

    EXTRACTION_PROMPT = """Extract atomic facts, preferences, and identity information from this conversation:

Context: {context}
Message: "{message}"

Extract specific, atomic pieces of information. Each fact should be:
- Specific and concrete (not vague)
- Standalone (understandable without context)
- Truthful (don't hallucinate)

Respond with JSON:
{{
    "facts": [
        {{
            "content": "specific fact text",
            "fact_type": "fact|preference|identity|decision|experience",
            "confidence": 0.9,
            "reasoning": "brief explanation"
        }}
    ]
}}

Types:
- fact: Objective information (visited Tokyo, works at Google)
- preference: Likes/dislikes, tastes (prefers sweet food, likes sushi)
- identity: Traits, characteristics (introverted, detail-oriented)
- decision: Choices made (chose the red option, decided to switch careers)
- experience: Life events (traveled to Japan, learned to play piano)

Only extract facts explicitly stated. Do not infer or assume."""

    def __init__(self, llm_provider: Optional[Any] = None):
        """Initialize the fact extractor.

        Args:
            llm_provider: LLM provider for extraction
        """
        self.llm_provider = llm_provider

    async def extract_facts(
        self,
        message: str,
        context: Optional[Dict[str, Any]] = None,
        limit: int = 5,
    ) -> List[ExtractedFact]:
        """Extract facts from a message.

        Args:
            message: The message to extract from
            context: Additional context (previous messages, user info, etc.)
            limit: Maximum number of facts to extract

        Returns:
            List of extracted facts
        """
        if not self.llm_provider:
            # Fallback: return message as single fact
            return [
                ExtractedFact(
                    content=message,
                    fact_type="fact",
                    confidence=0.5,
                    reasoning="no LLM available, treating as single fact",
                )
            ]

        try:
            context_str = self._format_context(context or {})
            prompt = self.EXTRACTION_PROMPT.format(
                context=context_str, message=message[:1000]
            )

            response = await self.llm_provider(
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                temperature=0.2,  # Low temp for consistent extraction
                max_tokens=500,
            )

            import json

            data = json.loads(response.content.strip())
            facts_data = data.get("facts", [])

            # Limit and convert to ExtractedFact
            facts = [
                ExtractedFact(**fact_data) for fact_data in facts_data[:limit]
            ]

            logger.info(f"Extracted {len(facts)} facts from message")
            return facts

        except Exception as e:
            logger.error(f"Fact extraction failed: {e}")
            return []

    async def extract_from_conversation(
        self,
        messages: List[Dict[str, str]],
        limit: int = 10,
    ) -> List[ExtractedFact]:
        """Extract facts from a conversation history.

        Args:
            messages: List of messages with "role" and "content"
            limit: Maximum total facts to extract

        Returns:
            List of extracted facts
        """
        if not messages:
            return []

        # Combine recent messages for context
        recent_messages = messages[-5:]  # Last 5 messages
        context = "\n".join(
            [f"{m['role']}: {m['content']}" for m in recent_messages]
        )

        # Extract from latest message with context
        latest = messages[-1]["content"]
        return await self.extract_facts(
            latest, context={"conversation": context}, limit=limit
        )

    def _format_context(self, context: Dict[str, Any]) -> str:
        """Format context for prompt.

        Args:
            context: Context dictionary

        Returns:
            Formatted context string
        """
        if not context:
            return "No additional context"

        parts = []
        for key, value in context.items():
            if isinstance(value, str):
                parts.append(f"{key}: {value}")
            elif isinstance(value, list):
                parts.append(f"{key}: {', '.join(str(v) for v in value)}")
            else:
                parts.append(f"{key}: {value}")

        return "\n".join(parts)

    def fact_to_mem_type(self, fact_type: str) -> MemType:
        """Map fact type to memory type.

        Args:
            fact_type: The fact type from extraction

        Returns:
            Corresponding MemType enum
        """
        mapping = {
            "fact": MemType.FACT,
            "preference": MemType.PREFERENCE,
            "identity": MemType.IDENTITY,
            "decision": MemType.FACT,
            "experience": MemType.FACT,
        }
        return mapping.get(fact_type.lower(), MemType.FACT)

    async def extract_with_metadata(
        self,
        message: str,
        session_id: str,
        turn_number: int,
        context: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """Extract facts with metadata for storage.

        Args:
            message: The message to extract from
            session_id: Current session ID
            turn_number: Current turn number
            context: Additional context

        Returns:
            List of fact dictionaries with metadata
        """
        facts = await self.extract_facts(message, context)

        result = []
        for fact in facts:
            result.append(
                {
                    "content": fact.content,
                    "mem_type": self.fact_to_mem_type(fact.fact_type),
                    "layer": Layer.FACT,
                    "confidence": fact.confidence,
                    "metadata": {
                        "extraction_reasoning": fact.reasoning,
                        "session_id": session_id,
                        "turn_number": turn_number,
                        "extracted_at": datetime.now().isoformat(),
                    },
                }
            )

        return result
