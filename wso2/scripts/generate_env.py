"""Create .env from .env.example, generating random secrets and passwords.

Safe to re-run: values already present in .env are never changed.
"""

from __future__ import annotations

import secrets
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EXAMPLE = ROOT / ".env.example"
TARGET = ROOT / ".env"

GENERATED = {
    "GATEWAY_SHARED_SECRET": lambda: secrets.token_urlsafe(48),
    # WSO2's default password policy is 5-30 non-whitespace characters.
    "ANALYST1_PASSWORD": lambda: "An1-" + secrets.token_urlsafe(15),
    "MANAGER1_PASSWORD": lambda: "Mg1-" + secrets.token_urlsafe(15),
    "AI_AGENT_SERVICE_PASSWORD": lambda: "Svc-" + secrets.token_urlsafe(15),
}


def read_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                key, value = line.split("=", 1)
                values[key.strip()] = value.strip()
    return values


def main() -> int:
    existing = read_env(TARGET)
    lines, created = [], []
    for line in EXAMPLE.read_text(encoding="utf-8").splitlines():
        if "=" not in line or line.lstrip().startswith("#"):
            lines.append(line)
            continue
        key, example_value = (part.strip() for part in line.split("=", 1))
        if existing.get(key):
            value = existing[key]
        elif key in GENERATED:
            value = GENERATED[key]()
            created.append(key)
        else:
            value = example_value
        lines.append(f"{key}={value}")
    # Keep any extra keys the user added by hand.
    known = {line.split("=", 1)[0] for line in lines if "=" in line and not line.startswith("#")}
    lines += [f"{k}={v}" for k, v in existing.items() if k not in known]
    TARGET.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {TARGET.name}; generated: {', '.join(created) or 'nothing (all values already set)'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
