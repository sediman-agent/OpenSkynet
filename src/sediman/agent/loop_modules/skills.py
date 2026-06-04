"""Skill management for AgentLoop.

Handles skill verification, installation, and learning.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import structlog

if TYPE_CHECKING:
    from sediman.llm.provider import LLMProvider
    from sediman.browser.session import BrowserSession
    from sediman.agent.skill_learner import SkillLearnerAgent
    from sediman.agent.skill_auditor import SkillAuditor


logger = structlog.get_logger()


class SkillManager:
    """Manages skill verification, installation, and learning."""

    def __init__(
        self,
        llm_provider: LLMProvider,
        browser_session: BrowserSession,
        skill_learner: SkillLearnerAgent | None = None,
        skill_auditor: SkillAuditor | None = None,
    ):
        self.llm = llm_provider
        self.browser = browser_session
        self._skill_learner = skill_learner
        self._skill_auditor = skill_auditor
        self._skill_engine: Any | None = None

    def get_engine(self) -> Any:
        """Get or create the skill engine."""
        if self._skill_engine is None:
            from sediman.skills.engine import SkillEngine
            self._skill_engine = SkillEngine()
            if self._skill_learner:
                self._skill_learner._engine = self._skill_engine
            if self._skill_auditor:
                self._skill_auditor._engine = self._skill_engine
        return self._skill_engine

    async def verify_skill(self, skill_name: str) -> bool:
        """Verify that a skill works correctly.

        Args:
            skill_name: Name of the skill to verify

        Returns:
            True if the skill executes successfully, False otherwise
        """
        try:
            from sediman.skills.executor import execute_skill
            from sediman.errors import looks_like_error

            engine = self.get_engine()
            skill_data = engine.read(skill_name)
            if not skill_data:
                return False

            result = await execute_skill(skill_data, self.browser, self.llm, max_retries=0)
            if looks_like_error(result):
                logger.info("skill_verification_failed", name=skill_name, result=result[:100])
                return False

            logger.info("skill_verification_passed", name=skill_name)
            return True

        except Exception as e:
            logger.debug("skill_verification_error", name=skill_name, error=str(e))
            return False

    def verify_skill_later(self, skill_name: str) -> None:
        """Schedule skill verification to run asynchronously.

        Fire-and-forget verification that does not block the calling task.
        """
        import asyncio

        async def _run() -> None:
            try:
                await self.verify_skill(skill_name)
            except Exception as e:
                logger.debug("lazy_verification_failed", name=skill_name, error=str(e))

        asyncio.create_task(_run())

    async def install_suggested_skill(
        self,
        skill_name: str,
        source: str,
    ) -> str | None:
        """Install a suggested skill from a source.

        Args:
            skill_name: Name of the skill to install
            source: Source to install from (e.g., "github", "local")

        Returns:
            Success message if installed, None if failed
        """
        try:
            from sediman.skills.hub import LocalSkillInstaller, GitHubInstaller

            engine = self.get_engine()
            installer = LocalSkillInstaller()
            ok, msg = installer.install(skill_name, source, engine, force=False)

            if not ok:
                gh = GitHubInstaller()
                ref = f"{source}@{skill_name}"
                ok, msg = gh.install(ref, engine, force=False)

            if ok:
                logger.info("suggested_skill_installed", name=skill_name, source=source)
                return msg

            logger.warning("suggested_skill_install_failed", name=skill_name, msg=msg)
            return None

        except Exception as e:
            logger.warning("suggested_skill_install_error", name=skill_name, error=str(e))
            return None

    async def run_skill_review(
        self,
        task: str,
        actions: list[dict[str, Any]],
        result: str,
        conversation: list[dict[str, str]] | None = None,
    ) -> str | None:
        """Run skill review to potentially learn a new skill.

        Args:
            task: The task that was executed
            actions: Actions taken during execution
            result: The result of the execution
            conversation: Optional conversation context

        Returns:
            Name of learned skill if one was created, None otherwise
        """
        if not self._skill_learner:
            return None

        try:
            engine = self.get_engine()
            existing_skills = engine.list_skills()

            learned = await self._skill_learner.review_and_learn(
                task=task,
                browser_actions=actions,
                result=result,
                success=not self._looks_like_error(result),
                existing_skills=existing_skills,
                conversation=conversation or [],
            )

            if learned:
                logger.info("skill_auto_learned", name=learned, source="review_agent")
            return learned

        except Exception as e:
            logger.debug("skill_review_failed", error=str(e))
            return None

    @staticmethod
    def extract_skill_arguments(skill: dict[str, Any], task: str) -> dict[str, str]:
        """Extract arguments for a skill from a task.

        Args:
            skill: Skill data dictionary
            task: Task string

        Returns:
            Dictionary of argument name to value
        """
        args: dict[str, str] = {}
        skill_name = skill.get("name", "")
        task_lower = task.lower()

        if skill_name.lower() in task_lower:
            prefix = task_lower.split(skill_name.lower())[-1].strip()
            args["ARGUMENTS"] = prefix
            args["0"] = prefix
        else:
            args["ARGUMENTS"] = task
            args["0"] = task

        return args

    @staticmethod
    def _looks_like_error(text: str) -> bool:
        """Check if text looks like an error message."""
        from sediman.errors import looks_like_error
        return looks_like_error(text)
