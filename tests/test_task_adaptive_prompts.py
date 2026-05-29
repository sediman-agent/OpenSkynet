"""Tests for Task-Adaptive Browser Prompts — _get_task_addon classification."""
from __future__ import annotations

from sediman.agent.prompts import build_system_prompt
from sediman.agent.prompts.builder import PromptBuilder


class TestGetTaskAddon:
    def test_extraction_keywords(self):
        tasks = [
            "extract all prices from this page",
            "get the latest headlines",
            "find all products on this page",
            "list all ingredients",
            "show me all items in cart",
            "what are the prices",
            "how many users are online",
            "price of bitcoin",
            "compare laptop prices",
            "scrape the table data",
            "collect all email addresses",
            "pull the data from the table",
            "top 10 restaurants",
            "best laptops 2024",
        ]
        for task in tasks:
            addon = PromptBuilder._get_task_addon(task)
            assert addon is not None, f"Expected extraction addon for: {task}"
            assert "extraction" in addon.lower() or "extract" in addon.lower(), f"Wrong addon for: {task}"

    def test_form_keywords(self):
        tasks = [
            "fill in the registration form",
            "submit the application",
            "register for an account",
            "sign up for the newsletter",
            "apply for the job",
            "login to the portal",
            "log in to my dashboard",
            "create account on the site",
            "checkout the cart",
            "book a flight",
            "reserve a table",
            "order a pizza",
        ]
        for task in tasks:
            addon = PromptBuilder._get_task_addon(task)
            assert addon is not None, f"Expected form addon for: {task}"
            assert "form" in addon.lower(), f"Wrong addon for: {task}"

    def test_search_keywords(self):
        tasks = [
            "find me a good restaurant",
            "look up the population of France",
            "research renewable energy trends",
            "what is the current time in London",
            "latest news about climate change",
            "news about the election",
            "information about quantum computing",
            "how to bake a cake",
        ]
        for task in tasks:
            addon = PromptBuilder._get_task_addon(task)
            assert addon is not None, f"Expected search addon for: {task}"
            assert "search" in addon.lower(), f"Wrong addon for: {task}"

    def test_navigation_keywords(self):
        tasks = [
            "go to example.com",
            "navigate to the settings page",
            "browse the product catalog",
            "visit the about page",
            "click on the contact link",
            "open the dashboard",
            "follow the link to the docs",
            "multi-page product listing",
            "pagination through results",
        ]
        for task in tasks:
            addon = PromptBuilder._get_task_addon(task)
            assert addon is not None, f"Expected navigation addon for: {task}"
            assert "navigation" in addon.lower() or "navigate" in addon.lower(), f"Wrong addon for: {task}"

    def test_no_addon_for_generic_tasks(self):
        tasks = [
            "what is the weather today",
            "tell me a joke",
            "summarize this page",
            "is this website secure",
        ]
        for task in tasks:
            addon = PromptBuilder._get_task_addon(task)
            assert addon is None, f"Expected no addon for: {task}"

    def test_extraction_takes_priority_over_navigation(self):
        addon = PromptBuilder._get_task_addon("navigate to the page and extract all prices")
        assert addon is not None
        assert "extraction" in addon.lower() or "extract" in addon.lower()


class TestBuildSystemPromptWithTask:
    def test_extraction_addon_included(self, tmp_sediman_dir):
        prompt = build_system_prompt(task="extract all prices from the page")
        assert "<extraction_focus>" in prompt

    def test_form_addon_included(self, tmp_sediman_dir):
        prompt = build_system_prompt(task="fill in the registration form")
        assert "<form_focus>" in prompt

    def test_search_addon_included(self, tmp_sediman_dir):
        prompt = build_system_prompt(task="search for hotels in Tokyo")
        assert "<search_focus>" in prompt or "search" in prompt.lower()

    def test_navigation_addon_included(self, tmp_sediman_dir):
        prompt = build_system_prompt(task="go to example.com and click about")
        assert "<navigation_focus>" in prompt or "navigation" in prompt.lower()

    def test_no_addon_for_generic(self, tmp_sediman_dir):
        prompt_no_task = build_system_prompt()
        prompt_generic = build_system_prompt(task="what is the weather")
        assert len(prompt_no_task) == len(prompt_generic)

    def test_turbo_mode_skips_addon(self, tmp_sediman_dir):
        builder = PromptBuilder(turbo_mode=True)
        prompt = builder.build_system_prompt(task="extract all prices")
        assert "<extraction_focus>" not in prompt
