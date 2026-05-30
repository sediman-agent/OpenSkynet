from __future__ import annotations

from sediman.agent.coding_agent.agent import CodingAgent, create_coding_agent

CodingSubagent = CodingAgent

from sediman.agent.coding_agent.context import discover_project
from sediman.agent.coding_agent.prompts import (
    build_system_prompt,
    build_classification_prompt,
)
from sediman.agent.coding_agent.tools import create_coding_tool_registry
from sediman.agent.coding_agent.types import (
    CodingResult,
    ProjectInfo,
    VerifyResult,
    PlanStep,
)
from sediman.agent.coding_agent.verifier import VerifyLoop

__all__ = [
    "CodingAgent",
    "CodingSubagent",
    "create_coding_agent",
    "create_coding_tool_registry",
    "CodingResult",
    "ProjectInfo",
    "VerifyResult",
    "PlanStep",
    "VerifyLoop",
    "discover_project",
    "build_system_prompt",
    "build_classification_prompt",
]
