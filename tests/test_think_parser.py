"""Tests for ThinkTagParser — covers all functions and documents known bugs."""

from __future__ import annotations

import pytest

from sediman.agent.streaming.think_parser import (
    ThinkTagParser,
    THINK_TAG_START_PATTERNS,
    THINK_TAG_END_PATTERNS,
)

START_TAG = THINK_TAG_START_PATTERNS[0]   # "<think>"  len=7
END_TAG = THINK_TAG_END_PATTERNS[0]        # "</think>" len=8
MAX_START_LEN = max(len(p) for p in THINK_TAG_START_PATTERNS)
MAX_END_LEN = max(len(p) for p in THINK_TAG_END_PATTERNS)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _collect():
    """Return a callable + lists that capture streamed chunks."""
    thinking: list[str] = []
    responding: list[str] = []

    def on_streaming_text(chunk: str, phase: str) -> None:
        if phase == "thinking":
            thinking.append(chunk)
        else:
            responding.append(chunk)

    return on_streaming_text, thinking, responding


async def _run_parse(text: str, phase: str = "responding") -> tuple[str, str]:
    """Run parse_and_stream and return (thinking_text, response_text)."""
    on_fn, thinking, responding = _collect()
    parser = ThinkTagParser(on_streaming_text=on_fn)
    await parser.parse_and_stream(text, phase)
    return "".join(thinking), "".join(responding)


def _make_state(current: str, buffer: str = "") -> dict:
    return {"current": current, "buffer": buffer, "think": [], "response": []}


# ===========================================================================
# _check_pattern_match
# ===========================================================================

class TestCheckPatternMatch:
    """Tests for ThinkTagParser._check_pattern_match."""

    def setup_method(self):
        self.parser = ThinkTagParser()

    def test_empty_buffer_matches_partial(self):
        ok, matched = self.parser._check_pattern_match("", ["<think>"])
        assert ok is True
        assert matched == ""

    def test_partial_match_single_char(self):
        ok, matched = self.parser._check_pattern_match("<", ["<think>"])
        assert ok is True
        assert matched == ""

    def test_partial_match_mid_tag(self):
        ok, matched = self.parser._check_pattern_match("<thi", ["<think>"])
        assert ok is True
        assert matched == ""

    def test_complete_match(self):
        ok, matched = self.parser._check_pattern_match("<think>", ["<think>"])
        assert ok is True
        assert matched == "<think>"

    def test_no_match_diverges(self):
        ok, matched = self.parser._check_pattern_match("<xyz", ["<think>"])
        assert ok is False
        assert matched == ""

    def test_no_match_unrelated(self):
        ok, matched = self.parser._check_pattern_match("abc", ["<think>"])
        assert ok is False
        assert matched == ""

    def test_multiple_patterns_first_matches(self):
        patterns = ["<think>", "<thought>"]
        ok, matched = self.parser._check_pattern_match("<thi", patterns)
        assert ok is True
        assert matched == ""

    def test_multiple_patterns_second_matches(self):
        patterns = ["<think>", "<thought>"]
        ok, matched = self.parser._check_pattern_match("<tho", patterns)
        assert ok is True
        assert matched == ""

    def test_multiple_patterns_complete_on_second(self):
        patterns = ["<think>", "<thought>"]
        ok, matched = self.parser._check_pattern_match("<thought>", patterns)
        assert ok is True
        assert matched == "<thought>"

    def test_empty_patterns_list(self):
        ok, matched = self.parser._check_pattern_match("<", [])
        assert ok is False
        assert matched == ""

    # -- BUG: buffer longer than pattern returns stale partial match ----------
    # When len(buffer) > len(pattern), pattern[:len(buffer)] == pattern,
    # so buffer.startswith(pattern) can be True even though buffer has
    # extra characters. This can cause stuck states with multi-pattern lists.

    @pytest.mark.xfail(
        reason="BUG: buffer longer than short pattern still returns partial "
               "match because pattern[:len(buffer)] == pattern when "
               "len(buffer) > len(pattern).",
        strict=True,
    )
    def test_buffer_longer_than_pattern_should_not_partial_match(self):
        patterns = ["<ab>", "<abcde>"]
        ok, matched = self.parser._check_pattern_match("<ab>x", patterns)
        assert ok is False

    def test_second_pattern_complete_match_found_when_first_fails(self):
        # When buffer == "<thin>" and first pattern "<thinking>" is not a
        # partial match, the loop continues and finds complete match on second.
        patterns = ["<thinking>", "<thin>"]
        ok, matched = self.parser._check_pattern_match("<thin>", patterns)
        assert ok is True
        assert matched == "<thin>"


# ===========================================================================
# _handle_normal_state
# ===========================================================================

class TestHandleNormalState:
    def setup_method(self):
        self.parser = ThinkTagParser()

    def test_angle_bracket_starts_tag_detection(self):
        s = _make_state("NORMAL")
        self.parser._handle_normal_state("<", s)
        assert s["current"] == "EXPECT_TAG_START"
        assert s["buffer"] == "<"
        assert s["response"] == []

    def test_regular_char_appended_to_response(self):
        s = _make_state("NORMAL")
        self.parser._handle_normal_state("x", s)
        assert s["current"] == "NORMAL"
        assert s["response"] == ["x"]


# ===========================================================================
# _handle_expect_tag_start
# ===========================================================================

class TestHandleExpectTagStart:
    def setup_method(self):
        self.parser = ThinkTagParser()

    def test_complete_start_tag_transitions_to_think(self):
        s = _make_state("EXPECT_TAG_START", START_TAG[:-1])
        self.parser._handle_expect_tag_start(START_TAG[-1], s)
        assert s["current"] == "IN_THINK_CONTENT"
        assert s["buffer"] == ""

    def test_partial_start_tag_continues_matching(self):
        s = _make_state("EXPECT_TAG_START", START_TAG[:3])
        self.parser._handle_expect_tag_start(START_TAG[3], s)
        assert s["current"] == "EXPECT_TAG_START"
        assert s["buffer"] == START_TAG[:4]

    def test_non_match_before_max_length_stays(self):
        s = _make_state("EXPECT_TAG_START", START_TAG[:3] + "x")
        self.parser._handle_expect_tag_start("y", s)
        assert s["current"] == "EXPECT_TAG_START"
        assert s["buffer"] == START_TAG[:3] + "xy"

    def test_non_match_past_max_length_flushes(self):
        long_buffer = START_TAG[:3] + "x" * (MAX_START_LEN - 1)
        s = _make_state("EXPECT_TAG_START", long_buffer)
        self.parser._handle_expect_tag_start("!", s)
        assert s["current"] == "NORMAL"
        assert s["buffer"] == ""


# ===========================================================================
# _handle_in_think_content
# ===========================================================================

class TestHandleInThinkContent:
    def setup_method(self):
        self.parser = ThinkTagParser()

    def test_angle_bracket_starts_end_tag_detection(self):
        s = _make_state("IN_THINK_CONTENT")
        self.parser._handle_in_think_content("<", s)
        assert s["current"] == "EXPECT_TAG_END"
        assert s["buffer"] == "<"

    def test_regular_char_appended_to_think(self):
        s = _make_state("IN_THINK_CONTENT")
        self.parser._handle_in_think_content("z", s)
        assert s["current"] == "IN_THINK_CONTENT"
        assert s["think"] == ["z"]


# ===========================================================================
# _handle_expect_tag_end
# ===========================================================================

class TestHandleExpectTagEnd:
    def setup_method(self):
        self.parser = ThinkTagParser()

    def test_complete_end_tag_transitions_to_normal(self):
        s = _make_state("EXPECT_TAG_END", END_TAG[:-1])
        self.parser._handle_expect_tag_end(END_TAG[-1], s)
        assert s["current"] == "NORMAL"
        assert s["buffer"] == ""

    def test_partial_end_tag_continues_matching(self):
        s = _make_state("EXPECT_TAG_END", END_TAG[:3])
        self.parser._handle_expect_tag_end(END_TAG[3], s)
        assert s["current"] == "EXPECT_TAG_END"
        assert s["buffer"] == END_TAG[:4]

    def test_non_match_past_max_length_flushes_to_think(self):
        long_buffer = END_TAG[:4] + "x" * (MAX_END_LEN - 2)
        s = _make_state("EXPECT_TAG_END", long_buffer)
        self.parser._handle_expect_tag_end("!", s)
        assert s["current"] == "IN_THINK_CONTENT"
        assert s["buffer"] == ""


# ===========================================================================
# _emit_content_chunks
# ===========================================================================

class TestEmitContentChunks:
    @pytest.mark.asyncio
    async def test_emits_in_chunks(self):
        chunks: list[tuple[str, str]] = []
        p = ThinkTagParser(on_streaming_text=lambda c, ph: chunks.append((c, ph)))
        await p._emit_content_chunks(list("abcdefgh"), "responding")
        texts = [c for c, _ in chunks]
        assert "".join(texts) == "abcdefgh"
        assert all(len(c) <= 3 for c in texts)

    @pytest.mark.asyncio
    async def test_no_emit_when_no_callback(self):
        p = ThinkTagParser(on_streaming_text=None)
        await p._emit_content_chunks(["a"], "responding")

    @pytest.mark.asyncio
    async def test_no_emit_when_empty_content(self):
        chunks: list[str] = []
        p = ThinkTagParser(on_streaming_text=lambda c, ph: chunks.append(c))
        await p._emit_content_chunks([], "responding")
        assert chunks == []

    @pytest.mark.asyncio
    async def test_callback_exception_is_swallowed(self):
        def bad_callback(chunk, phase):
            raise RuntimeError("boom")

        p = ThinkTagParser(on_streaming_text=bad_callback)
        await p._emit_content_chunks(["a"], "responding")


# ===========================================================================
# parse_and_stream — integration tests
# ===========================================================================

class TestParseAndStream:
    @pytest.mark.asyncio
    async def test_plain_text_no_tags(self):
        t, r = await _run_parse("Hello world")
        assert t == ""
        assert r == "Hello world"

    @pytest.mark.asyncio
    async def test_thinking_tag_wrapped_content(self):
        t, r = await _run_parse(f"{START_TAG}inner thoughts{END_TAG}answer")
        assert t == "inner thoughts"
        assert r == "answer"

    @pytest.mark.asyncio
    async def test_only_thinking_no_response(self):
        t, r = await _run_parse(f"{START_TAG}just thinking{END_TAG}")
        assert t == "just thinking"
        assert r == ""

    @pytest.mark.asyncio
    async def test_response_before_and_after_thinking(self):
        t, r = await _run_parse(f"before{START_TAG}mid{END_TAG}after")
        assert t == "mid"
        assert r == "beforeafter"

    @pytest.mark.asyncio
    async def test_empty_thinking_tag(self):
        t, r = await _run_parse(f"{START_TAG}{END_TAG}response")
        assert t == ""
        assert r == "response"

    @pytest.mark.asyncio
    async def test_empty_input(self):
        t, r = await _run_parse("")
        assert t == ""
        assert r == ""

    @pytest.mark.asyncio
    async def test_no_callback_does_nothing(self):
        parser = ThinkTagParser(on_streaming_text=None)
        await parser.parse_and_stream(f"{START_TAG}test{END_TAG}")

    @pytest.mark.asyncio
    async def test_custom_phase(self):
        chunks: list[tuple[str, str]] = []
        parser = ThinkTagParser(
            on_streaming_text=lambda c, p: chunks.append((c, p))
        )
        await parser.parse_and_stream("hello", phase="custom_phase")
        phases = [p for _, p in chunks]
        assert all(p == "custom_phase" for p in phases)

    @pytest.mark.asyncio
    async def test_angle_bracket_in_normal_text_flushed(self):
        # When < is followed by enough non-tag content to exceed max start
        # pattern length, the buffer flushes correctly.
        non_tag = "x" * (MAX_START_LEN + 2)  # exceeds max pattern length
        text = f"hello<{non_tag}world"
        t, r = await _run_parse(text)
        assert t == ""
        assert r == text

    @pytest.mark.asyncio
    async def test_double_angle_brackets(self):
        t, r = await _run_parse(f"<<{START_TAG}>>test{END_TAG}out")
        assert t == ""
        # Everything should end up as response (no valid start tag)
        assert "out" in r

    @pytest.mark.asyncio
    async def test_thinking_tag_case_sensitive(self):
        t, r = await _run_parse("<Think>not a tag</Think>rest")
        assert "not a tag" not in t
        assert "rest" in r

    @pytest.mark.asyncio
    async def test_nested_fake_thinking_tag(self):
        # <think> inside think content is just content, only </think> exits
        t, r = await _run_parse(f"{START_TAG}fake{START_TAG}inner{END_TAG}after")
        assert f"fake{START_TAG}inner" in t
        assert r == "after"

    # ------------------------------------------------------------------
    # BUG #1: Unflushed buffer when text ends mid-tag
    # ------------------------------------------------------------------

    @pytest.mark.xfail(
        reason="BUG: buffer is not flushed at end of parse_and_stream. "
               "Text ending with a partial tag loses those characters.",
        strict=True,
    )
    @pytest.mark.asyncio
    async def test_partial_tag_at_end_is_not_lost(self):
        partial = START_TAG[:4]
        t, r = await _run_parse(f"hello{partial}")
        assert r == f"hello{partial}"
        assert t == ""

    # ------------------------------------------------------------------
    # BUG #2: Non-tag '<' in think content eats the real closing tag
    # ------------------------------------------------------------------

    @pytest.mark.xfail(
        reason="BUG: '<world' in think content causes the real closing "
               "tag to be consumed as think content. The buffer keeps "
               "accumulating until exceeding max pattern length, splitting "
               "the legitimate closing tag across the flush boundary.",
        strict=True,
    )
    @pytest.mark.asyncio
    async def test_non_tag_angle_bracket_does_not_eat_closing_tag(self):
        t, r = await _run_parse(f"{START_TAG}Hello <world{END_TAG}Done")
        assert t == "Hello <world"
        assert r == "Done"

    # ------------------------------------------------------------------
    # BUG #2 variant: non-tag '<' + enough chars exceeds max end length,
    # losing subsequent content including the real end tag.
    # ------------------------------------------------------------------

    @pytest.mark.xfail(
        reason="Same as above: angle bracket followed by non-tag chars "
               "in think content delays flush until the real end tag "
               "characters are also swallowed.",
        strict=True,
    )
    @pytest.mark.asyncio
    async def test_angle_bracket_in_think_not_end_tag(self):
        t, r = await _run_parse(f"{START_TAG}use a<b here{END_TAG}done")
        assert t == "use a<b here"
        assert r == "done"
