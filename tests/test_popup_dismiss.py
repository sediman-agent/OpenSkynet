"""Tests for Popup Auto-Dismiss — dismiss_overlays method."""
from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from sediman.browser.controller import BrowserController


class TestDismissOverlays:
    @pytest.fixture
    def ctrl(self):
        ctrl = BrowserController(headless=True)
        ctrl._page = AsyncMock()
        ctrl._started = True
        return ctrl

    @pytest.mark.asyncio
    async def test_returns_count_when_overlays_dismissed(self, ctrl):
        ctrl._page.evaluate = AsyncMock(return_value=2)
        result = await ctrl.dismiss_overlays()
        assert "Dismissed 2 overlay(s)" in result

    @pytest.mark.asyncio
    async def test_returns_empty_when_no_overlays(self, ctrl):
        ctrl._page.evaluate = AsyncMock(return_value=0)
        result = await ctrl.dismiss_overlays()
        assert result == ""

    @pytest.mark.asyncio
    async def test_returns_empty_when_browser_not_started(self):
        ctrl = BrowserController(headless=True)
        result = await ctrl.dismiss_overlays()
        assert result == ""

    @pytest.mark.asyncio
    async def test_handles_evaluate_exception(self, ctrl):
        ctrl._page.evaluate = AsyncMock(side_effect=RuntimeError("page crashed"))
        result = await ctrl.dismiss_overlays()
        assert result == ""

    @pytest.mark.asyncio
    async def test_emits_step_on_dismiss(self, ctrl):
        calls = []

        def on_step(action, detail):
            calls.append((action, detail))

        ctrl._on_step = on_step
        ctrl._page.evaluate = AsyncMock(return_value=1)
        await ctrl.dismiss_overlays()
        assert len(calls) == 1
        assert calls[0][0] == "dismiss_overlay"

    @pytest.mark.asyncio
    async def test_no_emit_when_zero_dismissed(self, ctrl):
        calls = []

        def on_step(action, detail):
            calls.append((action, detail))

        ctrl._on_step = on_step
        ctrl._page.evaluate = AsyncMock(return_value=0)
        await ctrl.dismiss_overlays()
        assert len(calls) == 0


class TestDismissOverlaysBeforeSnapshot:
    @pytest.mark.asyncio
    async def test_snapshot_calls_dismiss_overlays(self):
        ctrl = BrowserController(headless=True)
        ctrl._page = AsyncMock()
        ctrl._started = True
        ctrl._page.evaluate = AsyncMock(return_value=[])
        ctrl._page.title = AsyncMock(return_value="Test")
        ctrl._page.url = "https://example.com"

        dismiss_called = []

        original_dismiss = ctrl.dismiss_overlays

        async def track_dismiss():
            dismiss_called.append(True)
            return await original_dismiss()

        ctrl.dismiss_overlays = track_dismiss
        await ctrl.snapshot()

        assert len(dismiss_called) == 1
