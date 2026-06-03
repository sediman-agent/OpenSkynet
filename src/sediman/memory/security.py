"""Security scanner for memory content — pure regex, no LLM calls."""
from __future__ import annotations

import re
import unicodedata

_THREAT_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    # Prompt injection
    (re.compile(r"ignore\s+(all\s+)?previous\s+instructions", re.I), "prompt_injection"),
    (re.compile(r"you\s+are\s+now\s+", re.I), "role_hijack"),
    (re.compile(r"do\s+not\s+tell\s+the\s+user", re.I), "deception_hide"),
    (re.compile(r"act\s+as\s+if\s+you\s+have\s+no\s+restrictions", re.I), "bypass_restrictions"),
    (re.compile(r"system\s*:\s*", re.I), "system_prefix"),
    # Data exfiltration
    (re.compile(r"curl\s+.*\$(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|API)", re.I), "exfil_curl"),
    (re.compile(r"wget\s+.*\$(?:KEY|TOKEN|SECRET)", re.I), "exfil_wget"),
    (re.compile(r"(?:cat|type)\s+(?:.env|credentials|\.netrc|\.pgpass|\.npmrc|\.pypirc)", re.I), "read_secrets"),
    (re.compile(r"(?:api[_-]?key|token|secret|password|credential)\s*[:=]\s*\S{8,}", re.I), "credential_leak"),
    # Backdoor
    (re.compile(r"authorized_keys|~/\.ssh", re.I), "ssh_backdoor"),
    # Shell injection
    (re.compile(r"!`[^`]+`"), "shell_injection_backtick"),
    (re.compile(r"\$\([^)]+\)"), "shell_injection_subshell"),
    # Destructive
    (re.compile(r"rm\s+-rf\s+/", re.I), "destructive_rm"),
    (re.compile(r"drop\s+table", re.I), "destructive_sql"),
]

_INVISIBLE_UNICODE_RANGES = [
    ("​", "‏"),   # zero-width space, non-joiner, joiner, LRE, RLE, PDF, LRO, RLO
    (" ", " "),   # line/paragraph separator
    ("‪", "‮"),   # bidi controls
    ("⁠", "⁩"),   # word joiner, invisible sep, LRI, RLI, FSI, PDI
    ("︀", "️"),   # variation selectors
    ("￹", "￻"),   # interlinear annotation
]


def has_invisible_unicode(text: str) -> bool:
    for char in text:
        for lo, hi in _INVISIBLE_UNICODE_RANGES:
            if lo <= char <= hi:
                return True
        cat = unicodedata.category(char)
        if cat == "Cf" and char not in ("­",):
            return True
    return False


def scan_content(content: str) -> list[str]:
    threats: list[str] = []
    for pattern, name in _THREAT_PATTERNS:
        if pattern.search(content):
            threats.append(name)
    if has_invisible_unicode(content):
        threats.append("invisible_unicode")
    return threats
