"""Tests for DOM Snapshot Overhaul — ElementInfo new fields, format_snapshot richness."""
from __future__ import annotations

from sediman.browser.controller import ElementInfo, PageSnapshot, format_snapshot


class TestElementInfoNewFields:
    def test_level_field_default_empty(self):
        el = ElementInfo(ref_id=1, tag="div")
        assert el.level == ""

    def test_level_field_heading(self):
        el = ElementInfo(ref_id=1, tag="h2", level="2", role="heading")
        assert el.level == "2"

    def test_checked_field(self):
        el = ElementInfo(ref_id=1, tag="input", type="checkbox", checked="true")
        assert el.checked == "true"

    def test_checked_default_empty(self):
        el = ElementInfo(ref_id=1, tag="input")
        assert el.checked == ""

    def test_disabled_field(self):
        el = ElementInfo(ref_id=1, tag="button", disabled="true")
        assert el.disabled == "true"

    def test_selected_field(self):
        el = ElementInfo(ref_id=1, tag="option", selected="true")
        assert el.selected == "true"

    def test_required_field(self):
        el = ElementInfo(ref_id=1, tag="input", required="true")
        assert el.required == "true"


class TestFormatSnapshotRichElements:
    def test_heading_shown_with_level(self):
        elements = [ElementInfo(ref_id=1, tag="h2", text="Welcome", level="2", role="heading")]
        snapshot = PageSnapshot(url="https://x.com", title="X", elements=elements)
        text = format_snapshot(snapshot)
        assert "h2" in text
        assert "Welcome" in text

    def test_checkbox_shows_checked(self):
        elements = [ElementInfo(ref_id=1, tag="input", type="checkbox", checked="true")]
        snapshot = PageSnapshot(url="https://x.com", title="X", elements=elements)
        text = format_snapshot(snapshot)
        assert "checked=true" in text

    def test_button_shows_disabled(self):
        elements = [ElementInfo(ref_id=1, tag="button", text="Submit", disabled="true")]
        snapshot = PageSnapshot(url="https://x.com", title="X", elements=elements)
        text = format_snapshot(snapshot)
        assert "disabled" in text

    def test_option_shows_selected(self):
        elements = [ElementInfo(ref_id=1, tag="option", text="Red", selected="true")]
        snapshot = PageSnapshot(url="https://x.com", title="X", elements=elements)
        text = format_snapshot(snapshot)
        assert "selected=true" in text

    def test_input_shows_required(self):
        elements = [ElementInfo(ref_id=1, tag="input", type="text", required="true", placeholder="Name")]
        snapshot = PageSnapshot(url="https://x.com", title="X", elements=elements)
        text = format_snapshot(snapshot)
        assert "required" in text

    def test_offscreen_element(self):
        elements = [ElementInfo(ref_id=1, tag="button", text="Hidden", is_visible=False)]
        snapshot = PageSnapshot(url="https://x.com", title="X", elements=elements)
        text = format_snapshot(snapshot)
        assert "offscreen" in text

    def test_content_elements_included(self):
        elements = [
            ElementInfo(ref_id=1, tag="p", text="Paragraph text here"),
            ElementInfo(ref_id=2, tag="li", text="List item one"),
            ElementInfo(ref_id=3, tag="td", text="Cell data"),
        ]
        snapshot = PageSnapshot(url="https://x.com", title="X", elements=elements)
        text = format_snapshot(snapshot)
        assert "Paragraph text" in text
        assert "List item" in text
        assert "Cell data" in text

    def test_text_preview_capped_at_800_in_output(self):
        elements = [ElementInfo(ref_id=1, tag="p", text="hello")]
        snapshot = PageSnapshot(
            url="https://x.com", title="X", elements=elements,
            text_preview="x" * 4000,
        )
        text = format_snapshot(snapshot)
        page_text_section = text.split("Page text:")[-1] if "Page text:" in text else ""
        assert len(page_text_section.strip()) <= 800

    def test_max_80_elements_shown(self):
        elements = [ElementInfo(ref_id=i, tag="div", text=f"Item {i}") for i in range(1, 150)]
        snapshot = PageSnapshot(url="https://x.com", title="X", elements=elements)
        text = format_snapshot(snapshot)
        lines = [l for l in text.split("\n") if l.startswith("  [")]
        assert len(lines) <= 80

    def test_scroll_position_displayed(self):
        elements = [ElementInfo(ref_id=1, tag="div", text="hi")]
        snapshot = PageSnapshot(
            url="https://x.com", title="X", elements=elements,
            scroll_position={"x": 0, "y": 500},
        )
        text = format_snapshot(snapshot)
        assert "Scroll: x=0, y=500" in text
