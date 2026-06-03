"""State subsystem for SearchSDK.

This module provides filesystem-based state persistence for cross-turn
intermediate results.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


class StatePrimitives:
    """State management primitives for SearchSDK.

    Provides filesystem-based persistence for intermediate search results,
    allowing state to survive context compression across turns.
    """

    def __init__(self) -> None:
        """Initialize state primitives."""
        self._state_dir = Path.home() / ".terminator" / "search"
        self._state_dir.mkdir(parents=True, exist_ok=True)

    def save(self, name: str, data: Any) -> None:
        """Save data to filesystem.

        Args:
            name: Name for the state file (without extension)
            data: Data to save (must be JSON-serializable)

        Example:
            ```python
            sdk.state.save("cve_results", results)
            sdk.state.save("comparison", {"data": [...]})
            ```
        """
        state_path = self._state_dir / f"{name}.json"

        try:
            state_path.write_text(json.dumps(data, indent=2))
        except (TypeError, ValueError) as e:
            raise ValueError(f"Data must be JSON-serializable: {e}") from e

    def load(self, name: str) -> Any | None:
        """Load data from filesystem.

        Args:
            name: Name of the state file (without extension)

        Returns:
            Loaded data, or None if not found

        Example:
            ```python
            results = sdk.state.load("cve_results")
            if results:
                print(f"Loaded {len(results)} cached CVEs")
            ```
        """
        state_path = self._state_dir / f"{name}.json"

        if not state_path.exists():
            return None

        try:
            return json.loads(state_path.read_text())
        except (json.JSONDecodeError, OSError) as e:
            return None

    def list(self) -> list[str]:
        """List all saved states.

        Returns:
            List of state names (without .json extension)

        Example:
            ```python
            states = sdk.state.list()
            for state in states:
                print(f"Saved state: {state}")
            ```
        """
        if not self._state_dir.exists():
            return []

        states = []
        for path in self._state_dir.glob("*.json"):
            states.append(path.stem)  # Remove .json extension

        return sorted(states)

    def delete(self, name: str) -> bool:
        """Delete a saved state.

        Args:
            name: Name of the state to delete

        Returns:
            True if deleted, False if not found
        """
        state_path = self._state_dir / f"{name}.json"

        if state_path.exists():
            state_path.unlink()
            return True
        return False

    def clear(self) -> int:
        """Delete all saved states.

        Returns:
            Number of states deleted
        """
        count = 0
        for path in self._state_dir.glob("*.json"):
            path.unlink()
            count += 1
        return count


__all__ = ["StatePrimitives"]
