"""Search strategies for different search types.

This package provides search strategy implementations.
"""

from .skill_search import SkillSearchStrategy
from .web_search import WebSearchStrategy

__all__ = ["SkillSearchStrategy", "WebSearchStrategy"]
