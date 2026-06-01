"""Custom exception hierarchy for the Sediman bot."""


class BotError(Exception):
    """Base exception for all bot errors."""


class GitHubAPIError(BotError):
    """Raised when a GitHub API call fails."""

    def __init__(self, message: str, stderr: str = "") -> None:
        self.stderr = stderr
        super().__init__(message)


class OpencodeTimeout(BotError):
    """Raised when an opencode subprocess exceeds its time limit."""

    def __init__(self, timeout: int) -> None:
        self.timeout = timeout
        super().__init__(f"opencode timed out after {timeout}s")


class CIFailure(BotError):
    """Raised when local CI (pytest) does not pass."""
