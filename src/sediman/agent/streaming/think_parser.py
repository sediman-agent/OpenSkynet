"""Think tag parser for separating model thinking from response.

Handles extended thinking formats like <think_tags>...</think_tags>
that some models embed in their responses.
"""

import structlog
from typing import Callable

logger = structlog.get_logger()

# Think tag patterns - models may use various formats
THINK_TAG_START_PATTERNS = [
    "<think>"
]

THINK_TAG_END_PATTERNS = [
    "</think>"
]


class ThinkTagParser:
    """Stateful parser for extracting think tags from streaming text.

    Maintains local state per instance for concurrent agent safety.
    Routes think content to 'thinking' phase, other content to specified phase.
    """

    def __init__(self, on_streaming_text: Callable[[str, str], None] | None = None):
        self.on_streaming_text = on_streaming_text

    def _check_pattern_match(self, buffer: str, patterns: list[str]) -> tuple[bool, str]:
        """Check if buffer starts with or matches any pattern completely."""
        for pattern in patterns:
            if buffer.startswith(pattern[:len(buffer)]):
                if buffer == pattern:
                    return True, pattern
                return True, ""  # Partial match
        return False, ""

    def _handle_normal_state(self, char: str, state: dict) -> None:
        """Handle character processing when in NORMAL state."""
        if char == '<':
            state['current'] = 'EXPECT_TAG_START'
            state['buffer'] = char
        else:
            state['response'].append(char)

    def _handle_expect_tag_start(self, char: str, state: dict) -> None:
        """Handle checking for potential think tag start."""
        state['buffer'] += char
        is_match, matched = self._check_pattern_match(state['buffer'], THINK_TAG_START_PATTERNS)

        if is_match and matched:
            # Complete opening tag found, transition directly to thinking content
            state['current'] = 'IN_THINK_CONTENT'
            state['buffer'] = ''
        elif not is_match and len(state['buffer']) > max(len(p) for p in THINK_TAG_START_PATTERNS):
            # Not a think tag, flush buffer to response
            state['response'].extend(list(state['buffer']))
            state['buffer'] = ''
            state['current'] = 'NORMAL'

    def _handle_in_think_content(self, char: str, state: dict) -> None:
        """Handle character when inside think content."""
        if char == '<':
            state['current'] = 'EXPECT_TAG_END'
            state['buffer'] = char
        else:
            state['think'].append(char)

    def _handle_expect_tag_end(self, char: str, state: dict) -> None:
        """Handle checking for potential think tag end."""
        state['buffer'] += char
        is_match, matched = self._check_pattern_match(state['buffer'], THINK_TAG_END_PATTERNS)

        if is_match and matched:
            # Complete closing tag found, transition directly back to normal
            state['current'] = 'NORMAL'
            state['buffer'] = ''
        elif not is_match and len(state['buffer']) > max(len(p) for p in THINK_TAG_END_PATTERNS):
            # Not a closing tag, treat as think content
            state['think'].extend(list(state['buffer']))
            state['buffer'] = ''
            state['current'] = 'IN_THINK_CONTENT'

    async def _emit_content_chunks(self, content: list, phase: str) -> None:
        """Emit accumulated content in chunks with controlled pacing."""
        import asyncio

        if not content or not self.on_streaming_text:
            return

        text = ''.join(content)
        chunk_size = 3
        for i in range(0, len(text), chunk_size):
            chunk = text[i:i + chunk_size]
            try:
                logger.info(
                    "streaming",
                    content=content,
                    phase=phase
                )
                self.on_streaming_text(chunk, phase)
            except Exception:
                logger.debug("stream_chunk_failed")
            if i > 0 and i % 18 == 0:
                await asyncio.sleep(0)

    async def parse_and_stream(self, text: str, phase: str = "responding") -> None:
        """Parse text for think tags and stream content to appropriate phases.

        Args:
            text: The text to parse and stream
            phase: The phase for non-think content (usually "responding")
        """
        if not self.on_streaming_text or not text:
            return

        # Local state - per call, no global state
        state = {
            'current': 'NORMAL',
            'buffer': '',
            'think': [],
            'response': [],
        }

        logger.info("parse_start", text=text[:100], phase=phase)

        # Process each character
        for i, char in enumerate(text):
            old_state = state['current']
            old_buffer = state['buffer']

            handler = None
            if state['current'] == 'NORMAL':
                handler = self._handle_normal_state
            elif state['current'] == 'EXPECT_TAG_START':
                handler = self._handle_expect_tag_start
            elif state['current'] == 'IN_THINK_CONTENT':
                handler = self._handle_in_think_content
            elif state['current'] == 'EXPECT_TAG_END':
                handler = self._handle_expect_tag_end

            if handler:
                handler(char, state)

            # Log state transitions for debugging
            if old_state != state['current'] or old_buffer != state['buffer']:
                logger.info(
                    "state_change",
                    index=i,
                    char=char,
                    old_state=old_state,
                    new_state=state['current'],
                    buffer=state['buffer'],
                    think_len=len(state['think']),
                    response_len=len(state['response'])
                )

        logger.info(
            "parse_complete",
            think=''.join(state['think'])[:100],
            response=''.join(state['response'])[:100]
        )

        # Flush remaining content
        
        await self._emit_content_chunks(state['response'], phase)
        await self._emit_content_chunks(state['think'], "thinking")
