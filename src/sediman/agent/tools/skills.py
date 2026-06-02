from __future__ import annotations

import json
from typing import Any

import structlog

from sediman.agent.tool_dispatch import ToolResult

logger = structlog.get_logger()


def _scan_skill_content(name: str, description: str, steps: list[str]) -> list[str]:
    all_text = f"{name} {description} {' '.join(steps)}"
    try:
        from sediman.memory.security import scan_content

        return scan_content(all_text)
    except ImportError:
        return []


async def _handle_skill_manage(
    action: str = "create",
    name: str | None = None,
    description: str | None = None,
    steps: list[str] | None = None,
    verification: str | None = None,
    **kwargs: Any,
) -> ToolResult:
    try:
        from sediman.skills.engine import SkillEngine

        engine = SkillEngine()

        if action == "list":
            skills = engine.list_skills()
            if not skills:
                return ToolResult(
                    success=True, output="No skills found.", data={"skills": []}
                )
            lines = [f"- {s['name']}: {s['description']}" for s in skills]
            return ToolResult(
                success=True,
                output="\n".join(lines),
                data={"skills": skills},
            )

        if action == "view":
            if not name:
                return ToolResult(
                    success=False, output="name is required for view action."
                )
            skill = engine.read(name)
            if not skill:
                return ToolResult(success=False, output=f"Skill '{name}' not found.")
            return ToolResult(
                success=True,
                output=f"Skill: {skill['name']}\nDescription: {skill['description']}\nSteps: {skill.get('steps', [])}\nVerification: {skill.get('verification', 'N/A')}\nUsed: {skill.get('use_count', 0)}x, last: {skill.get('last_used_at', 'never')}",
                data=skill,
            )

        if action == "create":
            if not name or not description or not steps:
                return ToolResult(
                    success=False,
                    output="name, description, and steps are required for create action.",
                )

            threats = _scan_skill_content(name, description, steps)
            if threats:
                return ToolResult(
                    success=False,
                    output=f"Skill rejected — security threats detected: {', '.join(threats)}",
                )

            existing = engine.read(name)
            if existing:
                return ToolResult(
                    success=False,
                    output=f"Skill '{name}' already exists. Use action='patch' to update it.",
                )

            engine.create(
                name=name,
                description=description,
                steps=steps,
                category="auto-created",
                verification=verification,
            )
            logger.info("tool_created_skill", name=name)
            return ToolResult(
                success=True,
                output=f"Skill '{name}' created with {len(steps)} steps.",
                data={"name": name, "steps": len(steps)},
            )

        if action == "patch":
            if not name:
                return ToolResult(
                    success=False, output="name is required for patch action."
                )

            updates: dict[str, Any] = {}
            if description:
                updates["description"] = description
            if steps:
                updates["steps"] = steps
            if verification:
                updates["verification"] = verification

            if not updates:
                return ToolResult(
                    success=False,
                    output="Nothing to patch — provide description and/or steps.",
                )

            all_text = f"{name} {description or ''} {' '.join(steps or [])}"
            try:
                from sediman.memory.security import scan_content

                threats = scan_content(all_text)
                if threats:
                    return ToolResult(
                        success=False,
                        output=f"Skill rejected — security threats: {', '.join(threats)}",
                    )
            except (ValueError, KeyError, OSError, ImportError):
                pass

            patched = engine.patch(name, updates)
            if not patched:
                return ToolResult(
                    success=False,
                    output=f"Skill '{name}' not found. Use action='create' first.",
                )
            logger.info("tool_patched_skill", name=name, version=patched.get("version"))
            return ToolResult(
                success=True,
                output=f"Skill '{name}' patched to version {patched.get('version')}.",
                data=patched,
            )

        if action == "run":
            if not name:
                return ToolResult(
                    success=False, output="name is required for run action."
                )
            skill = engine.read(name)
            if not skill:
                return ToolResult(success=False, output=f"Skill '{name}' not found.")
            return ToolResult(
                success=True,
                output=f"Skill '{name}' loaded. Steps:\n" + "\n".join(
                    f"  {i+1}. {s}" for i, s in enumerate(skill.get("steps", []))
                ),
                data=skill,
            )

        if action == "delete":
            if not name:
                return ToolResult(
                    success=False, output="name is required for delete action."
                )
            deleted = engine.delete(name)
            if not deleted:
                return ToolResult(success=False, output=f"Skill '{name}' not found.")
            logger.info("tool_deleted_skill", name=name)
            return ToolResult(
                success=True,
                output=f"Skill '{name}' deleted.",
                data={"name": name, "deleted": True},
            )

        if action == "install_suggested":
            if not name or not kwargs.get("source"):
                return ToolResult(
                    success=False, output="name and source are required for install_suggested action."
                )
            from sediman.skills.engine import SkillEngine
            from sediman.skills.hub import LocalSkillInstaller

            engine = SkillEngine()
            installer = LocalSkillInstaller()
            source = kwargs["source"]
            ok, msg = installer.install(name, source, engine, force=False)
            if not ok:
                from sediman.skills.hub import GitHubInstaller

                gh = GitHubInstaller()
                ref = f"{source}@{name}"
                ok, msg = gh.install(ref, engine, force=False)
            if ok:
                return ToolResult(success=True, output=f"Installed '{name}' from {source}.")
            return ToolResult(success=False, output=f"Install failed: {msg}")

        if action == "record_choice":
            if not name or not kwargs.get("decision"):
                return ToolResult(
                    success=False, output="name and decision are required for record_choice action."
                )
            from sediman.skills.permissions import SkillPermissions

            decision = kwargs["decision"]
            source = kwargs.get("source", "unknown")
            valid = ("allow_once", "always_allow_skill", "always_allow_source", "deny", "skip")
            if decision not in valid:
                return ToolResult(
                    success=False,
                    output=f"Invalid decision '{decision}'. Valid: {', '.join(valid)}",
                )
            perms = SkillPermissions()
            perms.set_decision(name, source, decision)

            install_msg = ""
            if decision in ("allow_once", "always_allow_skill", "always_allow_source"):
                from sediman.skills.engine import SkillEngine
                from sediman.skills.hub import LocalSkillInstaller

                engine = SkillEngine()
                installer = LocalSkillInstaller()
                ok, install_msg = installer.install(name, source, engine, force=True)
                if not ok:
                    from sediman.skills.hub import GitHubInstaller

                    gh = GitHubInstaller()
                    ref = f"{source}@{name}"
                    ok, install_msg = gh.install(ref, engine, force=True)

            return ToolResult(
                success=True,
                output=f"Decision '{decision}' recorded for skill '{name}' from {source}. {install_msg}",
                data={"decision": decision, "installed": decision != "deny" and decision != "skip"},
            )

        return ToolResult(
            success=False,
            output=f"Unknown action '{action}'. Use: create, patch, list, view, delete, install_suggested, record_choice.",
        )

    except (ValueError, KeyError, OSError, json.JSONDecodeError, ImportError) as e:
        return ToolResult(success=False, output=f"Skill operation failed: {e}")


class _TodoStore:
    _instance: _TodoStore | None = None

    def __init__(self) -> None:
        self._items: list[dict[str, str]] = []

    @classmethod
    def get(cls) -> _TodoStore:
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @classmethod
    def reset(cls) -> None:
        cls._instance = None

    def list_items(self) -> list[dict[str, str]]:
        return list(self._items)

    def set_items(self, items: list[dict[str, str]]) -> None:
        self._items = items

    def merge_items(self, items: list[dict[str, str]]) -> None:
        existing_by_content = {it["content"]: it for it in self._items}
        for item in items:
            existing_by_content[item["content"]] = item
        self._items = list(existing_by_content.values())

    def format_items(self) -> str:
        if not self._items:
            return "No tasks."
        icons = {"pending": "○", "in_progress": "◐", "completed": "●"}
        lines = []
        for i, item in enumerate(self._items, 1):
            icon = icons.get(item.get("status", "pending"), "○")
            lines.append(f"  {i}. {icon} {item['content']}")
        done = sum(1 for it in self._items if it.get("status") == "completed")
        total = len(self._items)
        lines.append(f"  ({done}/{total} completed)")
        return "\n".join(lines)
