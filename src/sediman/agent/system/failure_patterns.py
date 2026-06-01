from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

import structlog

logger = structlog.get_logger()


@dataclass
class FailurePattern:
    task_signature: str
    pattern: str
    mitigation: str
    occurrences: int = 1
    last_seen: str = ""


class FailurePatternStore:
    def __init__(self, path=""):
        from sediman.config import DATA_DIR
        self.path = Path(path) if path else DATA_DIR / "failure_patterns.json"
        self._patterns: list[FailurePattern] = []

    def load(self):
        if not self.path.exists():
            self._patterns = []
            return
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
            self._patterns = [FailurePattern(**item) for item in data.get("patterns", [])]
        except (json.JSONDecodeError, OSError, TypeError):
            self._patterns = []

    def save(self):
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            data = {"patterns": [asdict(p) for p in self._patterns]}
            self.path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        except OSError as e:
            logger.warning("failure_patterns_save_error", error=str(e))

    def add_pattern(self, task_signature, pattern, mitigation):
        for existing in self._patterns:
            if self._similar(existing.pattern, pattern):
                existing.occurrences += 1
                existing.task_signature = task_signature
                existing.mitigation = mitigation
                existing.last_seen = _now_iso()
                return
        self._patterns.append(FailurePattern(
            task_signature=task_signature, pattern=pattern,
            mitigation=mitigation, occurrences=1, last_seen=_now_iso()))

    def get_warnings(self, task_description, limit=3):
        if not self._patterns:
            self.load()
        warnings = []
        task_lower = task_description.lower()
        task_words = set(re.findall(r"\w+", task_lower))
        for pat in self._patterns:
            pat_words = set(re.findall(r"\w+", pat.pattern.lower()))
            sig_words = set(re.findall(r"\w+", pat.task_signature.lower()))
            overlap = len(task_words & pat_words) + len(task_words & sig_words)
            if overlap >= 2 or any(w in task_lower for w in pat_words if len(w) > 4):
                warnings.append((pat.occurrences, f"{pat.pattern} -> {pat.mitigation}"))
        warnings.sort(key=lambda x: x[0], reverse=True)
        return [w for _, w in warnings[:limit]]

    @property
    def pattern_count(self):
        return len(self._patterns)

    @staticmethod
    def _similar(a, b, threshold=0.6):
        if a == b:
            return True
        words_a = set(re.findall(r"\w+", a.lower()))
        words_b = set(re.findall(r"\w+", b.lower()))
        if not words_a or not words_b:
            return False
        overlap = len(words_a & words_b)
        union = len(words_a | words_b)
        return (overlap / union) >= threshold if union else False


def _now_iso():
    from datetime import UTC, datetime
    return datetime.now(UTC).isoformat()
