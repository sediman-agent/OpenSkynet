"""
Attention Gate for System 2 Memory.

Determines whether a conversation turn is worth processing for memory extraction.
This prevents wasting LLM calls on trivial content like "hello" or "ok".
"""

import logging
from typing import Dict, Any, Optional
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class ContentClassification(BaseModel):
    """Classification result from attention gate."""

    should_process: bool = Field(
        description="Whether this content is worth processing for memory"
    )
    has_fact: bool = Field(default=False, description="Contains factual information")
    has_preference: bool = Field(
        default=False, description="Contains user preference or taste"
    )
    has_identity: bool = Field(
        default=False, description="Contains identity or trait information"
    )
    has_decision: bool = Field(default=False, description="Contains a decision or choice")
    reasoning: str = Field(default="", description="Brief explanation of classification")


class AttentionGate:
    """Gate for determining if content is worth processing.

    Uses LLM classification to avoid processing trivial content.
    """

    # Minimal gate prompt for fast classification
    GATE_PROMPT = """Analyze this message and determine if it contains information worth remembering:

Message: "{message}"

Respond with JSON:
{{
    "should_process": true/false,
    "has_fact": true/false,
    "has_preference": true/false,
    "has_identity": true/false,
    "has_decision": true/false,
    "reasoning": "brief explanation"
}}

Process if contains: facts, preferences, identity traits, decisions, experiences.
Skip if: greetings, confirmations, trivial chat, lack of substance."""

    def __init__(self, llm_provider: Optional[Any] = None):
        """Initialize the attention gate.

        Args:
            llm_provider: LLM provider for classification
        """
        self.llm_provider = llm_provider

    async def should_process(self, message: str) -> bool:
        """Determine if a message is worth processing.

        Args:
            message: The message to evaluate

        Returns:
            True if worth processing, False otherwise
        """
        if not self.llm_provider:
            # Fallback: simple heuristic if no LLM
            return self._heuristic_gate(message)

        try:
            classification = await self.classify_content(message)
            return classification.should_process
        except Exception as e:
            logger.warning(f"Attention gate failed, using heuristic: {e}")
            return self._heuristic_gate(message)

    async def classify_content(self, message: str) -> ContentClassification:
        """Classify content with detailed analysis.

        Args:
            message: The message to classify

        Returns:
            ContentClassification with detailed flags
        """
        if not self.llm_provider:
            # Fallback to heuristic
            should = self._heuristic_gate(message)
            return ContentClassification(
                should_process=should,
                has_fact=should,
                has_preference="喜欢" in message or "偏好" in message,
                reasoning="heuristic classification",
            )

        try:
            prompt = self.GATE_PROMPT.format(message=message[:500])  # Limit length

            response = await self.llm_provider(
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                temperature=0.1,  # Low temperature for consistent classification
                max_tokens=150,  # Short response
            )

            import json

            data = json.loads(response.content.strip())
            return ContentClassification(**data)

        except Exception as e:
            logger.error(f"Classification failed: {e}")
            # Fallback
            should = self._heuristic_gate(message)
            return ContentClassification(
                should_process=should,
                reasoning="fallback to heuristic after error",
            )

    def _heuristic_gate(self, message: str) -> bool:
        """Simple heuristic gate when LLM is unavailable.

        Args:
            message: The message to evaluate

        Returns:
            True if worth processing
        """
        stripped = message.strip()

        # Skip very short messages (but allow keyword matches even if short)
        trivial_phrases = [
            "ok",
            "okay",
            "yes",
            "no",
            "thanks",
            "thank you",
            "hello",
            "hi",
            "bye",
            "goodbye",
            "cool",
            "nice",
            "great",
            "awesome",
            "sure",
            "alright",
            "got it",
            "understood",
            "继续",
            "好的",
            "谢谢",
            "你好",
            "再见",
        ]

        lower_msg = stripped.lower()
        for phrase in trivial_phrases:
            if lower_msg == phrase:
                return False

        # Include if contains memory-relevant keywords
        relevant_keywords = [
            "喜欢",
            "偏好",
            "想要",
            "需要",
            "喜欢",
            "不喜欢",
            "prefer",
            "want",
            "need",
            "love",
            "hate",
            "去过",
            "做过",
            "remember",
            "重要",
            "important",
            "决定",
            "decided",
            "选择",
            "chose",
        ]

        for keyword in relevant_keywords:
            if keyword in lower_msg:
                return True

        # Default: process if longer than 10 characters
        return len(stripped) > 10

    async def batch_classify(
        self, messages: list[str]
    ) -> list[ContentClassification]:
        """Classify multiple messages efficiently.

        Args:
            messages: List of messages to classify

        Returns:
            List of classifications
        """
        results = []
        for message in messages:
            classification = await self.classify_content(message)
            results.append(classification)
        return results
