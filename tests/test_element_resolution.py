"""Tests for Cascading Element Resolution — _resolve_element fallback chain."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from sediman.browser.controller import BrowserController, ElementInfo, PageSnapshot


class TestResolveElement:
    @pytest.fixture
    def ctrl(self):
        ctrl = BrowserController(headless=True)
        ctrl._page = AsyncMock()
        ctrl._started = True
        return ctrl

    @pytest.mark.asyncio
    async def test_ref_id_match_first(self, ctrl):
        el = AsyncMock()
        ctrl._page.query_selector = AsyncMock(return_value=el)
        result = await ctrl._resolve_element(1)
        assert result is el
        ctrl._page.query_selector.assert_called_once_with('[data-sediman-ref-id="1"]')

    @pytest.mark.asyncio
    async def test_aria_label_fallback(self, ctrl):
        aria_el = AsyncMock()

        snapshot = PageSnapshot(
            url="https://x.com", title="X",
            elements=[ElementInfo(ref_id=5, tag="button", aria_label="Close dialog")],
        )

        async def mock_query(selector):
            if 'data-sediman-ref-id="5"' in selector:
                return None
            if 'aria-label="Close dialog"' in selector:
                return aria_el
            return None

        ctrl._page.query_selector = mock_query

        with patch.object(ctrl, "snapshot", new_callable=AsyncMock, return_value=snapshot):
            result = await ctrl._resolve_element(5)

        assert result is aria_el

    @pytest.mark.asyncio
    async def test_href_fallback_for_links(self, ctrl):
        href_el = AsyncMock()

        snapshot = PageSnapshot(
            url="https://x.com", title="X",
            elements=[ElementInfo(ref_id=3, tag="a", text="Click", href="/about")],
        )

        async def mock_query(selector):
            if 'data-sediman-ref-id' in selector:
                return None
            if 'a[href="/about"]' in selector:
                return href_el
            return None

        ctrl._page.query_selector = mock_query

        with patch.object(ctrl, "snapshot", new_callable=AsyncMock, return_value=snapshot):
            result = await ctrl._resolve_element(3)

        assert result is href_el

    @pytest.mark.asyncio
    async def test_text_content_fallback(self, ctrl):
        text_el = AsyncMock()

        snapshot = PageSnapshot(
            url="https://x.com", title="X",
            elements=[ElementInfo(ref_id=7, tag="span", text="Unique Label Here")],
        )

        async def mock_query(selector):
            if 'data-sediman-ref-id' in selector:
                return None
            if '"Unique Label Here"' in selector:
                return text_el
            return None

        ctrl._page.query_selector = mock_query

        with patch.object(ctrl, "snapshot", new_callable=AsyncMock, return_value=snapshot):
            result = await ctrl._resolve_element(7)

        assert result is text_el

    @pytest.mark.asyncio
    async def test_role_fallback_unique_only(self, ctrl):
        role_el = AsyncMock()

        snapshot = PageSnapshot(
            url="https://x.com", title="X",
            elements=[ElementInfo(ref_id=9, tag="button", role="submit-button")],
        )

        async def mock_query(selector):
            if 'data-sediman-ref-id' in selector:
                return None
            if 'role="submit-button"' in selector:
                return role_el
            return None

        async def mock_evaluate(js):
            if "submit-button" in js:
                return 1
            return 0

        ctrl._page.query_selector = mock_query
        ctrl._page.evaluate = mock_evaluate

        with patch.object(ctrl, "snapshot", new_callable=AsyncMock, return_value=snapshot):
            result = await ctrl._resolve_element(9)

        assert result is role_el

    @pytest.mark.asyncio
    async def test_role_fallback_skips_if_not_unique(self, ctrl):
        snapshot = PageSnapshot(
            url="https://x.com", title="X",
            elements=[ElementInfo(ref_id=10, tag="button", role="button")],
        )

        async def mock_query(selector):
            if 'data-sediman-ref-id' in selector:
                return None
            if 'role="button"' in selector:
                return AsyncMock()
            return None

        async def mock_evaluate(js):
            if 'role="button"' in js:
                return 5
            return 0

        ctrl._page.query_selector = mock_query
        ctrl._page.evaluate = mock_evaluate

        with patch.object(ctrl, "snapshot", new_callable=AsyncMock, return_value=snapshot):
            result = await ctrl._resolve_element(10)

        assert result is None

    @pytest.mark.asyncio
    async def test_placeholder_fallback(self, ctrl):
        ph_el = AsyncMock()

        snapshot = PageSnapshot(
            url="https://x.com", title="X",
            elements=[ElementInfo(ref_id=11, tag="input", placeholder="Enter email")],
        )

        async def mock_query(selector):
            if 'data-sediman-ref-id' in selector:
                return None
            if 'placeholder="Enter email"' in selector:
                return ph_el
            return None

        ctrl._page.query_selector = mock_query

        with patch.object(ctrl, "snapshot", new_callable=AsyncMock, return_value=snapshot):
            result = await ctrl._resolve_element(11)

        assert result is ph_el

    @pytest.mark.asyncio
    async def test_returns_none_when_no_match(self, ctrl):
        snapshot = PageSnapshot(
            url="https://x.com", title="X",
            elements=[ElementInfo(ref_id=12, tag="div", text="nothing matches")],
        )

        ctrl._page.query_selector = AsyncMock(return_value=None)

        with patch.object(ctrl, "snapshot", new_callable=AsyncMock, return_value=snapshot):
            result = await ctrl._resolve_element(12)

        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_no_page(self):
        ctrl = BrowserController(headless=True)
        result = await ctrl._resolve_element(1)
        assert result is None
