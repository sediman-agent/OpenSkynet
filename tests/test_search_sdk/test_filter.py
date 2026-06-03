"""Tests for filter subsystem."""

import pytest

from sediman.search.sdk.retrieve import SearchHit
from sediman.search.sdk.filter import FilterPrimitives


class TestFilterPrimitives:
    def test_dedupe_empty_list(self):
        filtered = FilterPrimitives.dedupe([])
        assert filtered == []

    def test_dedupe_by_url(self):
        hits = [
            SearchHit(url="https://example.com", title="Test", snippet="Content"),
            SearchHit(url="https://example.com", title="Test2", snippet="Content2"),
            SearchHit(url="https://other.com", title="Test3", snippet="Content3"),
        ]
        filtered = FilterPrimitives.dedupe(hits)
        assert len(filtered) == 2
        assert all(h.url != "https://example.com" or h.url != "https://other.com" for h in filtered)

    def test_dedupe_by_title(self):
        hits = [
            SearchHit(url="https://example.com/1", title="Same Title", snippet="A"),
            SearchHit(url="https://example.com/2", title="Same Title", snippet="B"),
            SearchHit(url="https://example.com/3", title="Different", snippet="C"),
        ]
        filtered = FilterPrimitives.dedupe(hits, key="title")
        assert len(filtered) == 2

    def test_dedupe_with_callable(self):
        hits = [
            SearchHit(url="HTTPS://EXAMPLE.COM/", title="Test", snippet="Content"),
            SearchHit(url="https://example.com/", title="Test2", snippet="Content2"),
        ]
        filtered = FilterPrimitives.dedupe(hits, key=lambda h: h.url.lower())
        assert len(filtered) == 1

    def test_by_domain_empty(self):
        hits = [SearchHit(url="https://example.com", title="Test", snippet="Content")]
        result = FilterPrimitives.by_domain(hits)
        assert len(result) == 1

    def test_by_domain_include(self):
        hits = [
            SearchHit(url="https://google.com/test", title="Google", snippet="A"),
            SearchHit(url="https://chromium.org/test", title="Chromium", snippet="B"),
            SearchHit(url="https://spam.com/test", title="Spam", snippet="C"),
        ]
        result = FilterPrimitives.by_domain(hits, include=["google.com", "chromium.org"])
        assert len(result) == 2
        assert all("google.com" in h.url or "chromium.org" in h.url for h in result)

    def test_by_domain_exclude(self):
        hits = [
            SearchHit(url="https://google.com/test", title="Google", snippet="A"),
            SearchHit(url="https://chromium.org/test", title="Chromium", snippet="B"),
            SearchHit(url="https://spam.com/test", title="Spam", snippet="C"),
        ]
        result = FilterPrimitives.by_domain(hits, exclude=["spam.com"])
        assert len(result) == 2
        assert all("spam.com" not in h.url for h in result)

    def test_by_regex_pattern(self):
        hits = [
            SearchHit(url="https://example.com/1", title="CVE-2024-1234", snippet="A"),
            SearchHit(url="https://example.com/2", title="No CVE", snippet="B"),
            SearchHit(url="https://example.com/3", title="CVE-2025-5678", snippet="C"),
        ]
        result = FilterPrimitives.by_regex(hits, field="title", pattern=r"CVE-\d{4}-\d+")
        assert len(result) == 2

    def test_by_regex_invalid_pattern(self):
        hits = [SearchHit(url="https://example.com", title="Test", snippet="Content")]
        # Invalid regex should return all hits
        result = FilterPrimitives.by_regex(hits, pattern="[invalid(")
        assert result == hits

    def test_by_keyword_include(self):
        hits = [
            SearchHit(url="https://example.com/1", title="Python Tutorial", snippet="A"),
            SearchHit(url="https://example.com/2", title="Java Guide", snippet="B"),
            SearchHit(url="https://example.com/3", title="Security Guide", snippet="C"),
        ]
        result = FilterPrimitives.by_keyword(hits, words=["python", "guide"], mode="include", field="title")
        assert len(result) == 3
        assert all("python" in h.title.lower() or "guide" in h.title.lower() for h in result)

    def test_by_keyword_exclude(self):
        hits = [
            SearchHit(url="https://example.com/1", title="Sponsored Link", snippet="A"),
            SearchHit(url="https://example.com/2", title="Normal Link", snippet="B"),
            SearchHit(url="https://example.com/3", title="Ad Content", snippet="C"),
        ]
        result = FilterPrimitives.by_keyword(hits, words=["sponsored", "ad"], mode="exclude", field="title")
        assert len(result) == 1
        assert "sponsored" not in result[0].title.lower()
        assert "ad" not in result[0].title.lower()
        assert "sponsored" not in result[0].title.lower() and "ad" not in result[0].title.lower()

    def test_by_keyword_empty_words(self):
        hits = [SearchHit(url="https://example.com", title="Test", snippet="Content")]
        result_include = FilterPrimitives.by_keyword(hits, words=[], mode="include")
        result_exclude = FilterPrimitives.by_keyword(hits, words=[], mode="exclude")
        # With no words, include returns empty, exclude returns all
        assert result_include == []
        assert result_exclude == hits
