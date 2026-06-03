"""Tests for search parser utilities."""

import pytest

from sediman.search.utils.parsers import (
    extract_query_terms,
    format_result_summary,
    highlight_matches,
    parse_code_result,
    parse_skill_result,
    parse_web_result,
)
from sediman.search.base import SearchResult


class TestParseWebResult:
    def test_parse_web_result_basic(self):
        data = {
            "title": "Test Title",
            "content": "Test Content",
            "url": "https://example.com",
            "score": 0.8,
        }
        result = parse_web_result(data)
        assert isinstance(result, SearchResult)
        assert result.title == "Test Title"
        assert result.content == "Test Content"
        assert result.url == "https://example.com"
        assert result.score == 0.8
        assert result.metadata["source"] == "web"

    def test_parse_web_result_missing_fields(self):
        data = {"title": "Test"}
        result = parse_web_result(data)
        assert result.title == "Test"
        assert result.content == ""
        assert result.url == ""
        assert result.score == 0.0


class TestParseSkillResult:
    def test_parse_skill_result_basic(self):
        data = {
            "name": "test-skill",
            "description": "A test skill",
            "path": "skills/test",
            "score": 0.9,
            "source": "local",
            "category": "test",
            "keywords": ["test", "example"],
        }
        result = parse_skill_result(data)
        assert isinstance(result, SearchResult)
        assert result.title == "test-skill"
        assert result.content == "A test skill"
        assert result.url == "skill:skills/test"
        assert result.score == 0.9
        assert result.metadata["source"] == "local"
        assert result.metadata["category"] == "test"
        assert result.metadata["keywords"] == ["test", "example"]

    def test_parse_skill_result_defaults(self):
        data = {"name": "test", "description": "Test"}
        result = parse_skill_result(data)
        assert result.url == ""
        assert result.score == 0.0
        assert result.metadata["source"] == "unknown"
        assert result.metadata["category"] == "general"


class TestParseCodeResult:
    def test_parse_code_result_basic(self):
        data = {
            "path": "src/main.py",
            "content": "def hello(): pass",
            "line": 42,
            "score": 0.7,
            "language": "python",
        }
        result = parse_code_result(data)
        assert isinstance(result, SearchResult)
        assert "main.py" in result.title
        assert "python" in result.title
        assert result.title == "[python] src/main.py:42"
        assert result.content == "def hello(): pass"
        assert result.url == "file:src/main.py:42"
        assert result.metadata["language"] == "python"
        assert result.metadata["line"] == 42


class TestFormatResultSummary:
    def test_format_empty_results(self):
        summary = format_result_summary([])
        assert summary == "No results found."

    def test_format_single_result(self):
        results = [
            SearchResult(title="Test", content="Content", score=0.8, url="https://example.com")
        ]
        summary = format_result_summary(results)
        assert "Found 1 result" in summary
        assert "Test" in summary
        assert "0.80" in summary
        assert "https://example.com" in summary

    def test_format_multiple_results(self):
        results = [
            SearchResult(title=f"Result {i}", content=f"Content {i}", score=0.9 - i * 0.1)
            for i in range(3)
        ]
        summary = format_result_summary(results)
        assert "Found 3 result" in summary
        assert "Result 0" in summary
        assert "Result 1" in summary
        assert "Result 2" in summary

    def test_format_truncates_long_content(self):
        long_content = "x" * 300
        results = [SearchResult(title="Test", content=long_content, score=0.8)]
        summary = format_result_summary(results, max_length=100)
        assert "..." in summary
        # Should be truncated, so less than original length
        assert summary.count("x") < 300


class TestExtractQueryTerms:
    def test_extract_basic(self):
        terms = extract_query_terms("python programming language")
        assert "python" in terms
        assert "programming" in terms
        assert "language" in terms

    def test_extract_removes_special_chars(self):
        terms = extract_query_terms("python@programming#language")
        assert "python" in terms
        assert "programming" in terms
        assert "language" in terms

    def test_extract_filters_short_terms(self):
        terms = extract_query_terms("a b c python programming")
        assert "python" in terms
        assert "programming" in terms
        assert "a" not in terms
        assert "b" not in terms
        assert "c" not in terms

    def test_extract_case_insensitive(self):
        terms = extract_query_terms("Python PROGRAMMING")
        assert "python" in terms
        assert "programming" in terms


class TestHighlightMatches:
    def test_highlight_basic(self):
        content = "Python is a programming language"
        result = highlight_matches(content, "python programming")
        assert "**Python**" in result
        assert "**programming**" in result

    def test_highlight_no_match(self):
        content = "This is some text"
        result = highlight_matches(content, "python")
        assert result == content

    def test_highlight_limits_highlights(self):
        content = "python ruby golang java rust"
        result = highlight_matches(content, "python ruby golang java rust", max_highlights=2)
        # Should only highlight first 2 terms
        count = result.count("**")
        assert count <= 4  # 2 highlights = 4 asterisks

    def test_highlight_empty_query(self):
        content = "Python programming"
        result = highlight_matches(content, "")
        assert result == content
