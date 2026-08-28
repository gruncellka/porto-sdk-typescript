#!/usr/bin/env python3
"""Verify this TypeScript SDK's package.json / pnpm-lock use registry specs only."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

LOCAL_SPEC = re.compile(
    r"(^file:)|(^link:)|(^workspace:)|(@\s*file://)|(;\s*file://)",
    re.IGNORECASE,
)
DEP_KEYS = (
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
)


def _is_local_spec(spec: str) -> bool:
    return bool(LOCAL_SPEC.search(spec.strip()))


def check_package_json(path: Path) -> list[str]:
    if not path.exists():
        return [f"{path}: missing package.json"]
    data = json.loads(path.read_text(encoding="utf-8"))
    errors: list[str] = []

    for key in DEP_KEYS:
        section = data.get(key)
        if not isinstance(section, dict):
            continue
        for name, spec in section.items():
            if isinstance(spec, str) and _is_local_spec(spec):
                errors.append(f"{path}: {key}.{name} = {spec!r} (local source)")

    if data.get("name") == "@gruncellka/porto-sdk":
        deps = data.get("dependencies") or {}
        if "@gruncellka/porto-data" not in deps:
            errors.append(f"{path}: missing registry dependency @gruncellka/porto-data")

    overrides = (data.get("pnpm") or {}).get("overrides")
    if isinstance(overrides, dict):
        for name, spec in overrides.items():
            if isinstance(spec, str) and _is_local_spec(spec):
                errors.append(f"{path}: pnpm.overrides.{name} = {spec!r} (local source)")

    return errors


def check_pnpm_lock(path: Path) -> list[str]:
    if not path.exists():
        return []
    errors: list[str] = []
    local_line = re.compile(
        r"(^|\s)(specifier|version|resolution):\s*(file:|link:|workspace:)",
        re.IGNORECASE,
    )
    for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        stripped = line.strip()
        if stripped.startswith("#"):
            continue
        if local_line.search(stripped) or re.search(r"(^|\s)(file:|link:|workspace:)\S", stripped):
            errors.append(f"{path}:{lineno}: local-source lockfile entry")
    return errors


def run_check(root: Path) -> list[str]:
    errors: list[str] = []
    errors.extend(check_package_json(root / "package.json"))
    errors.extend(check_pnpm_lock(root / "pnpm-lock.yaml"))
    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Verify registry-only dependency manifests for the TypeScript SDK."
    )
    parser.add_argument("--root", type=Path, default=Path.cwd(), help="SDK root (default: cwd)")
    args = parser.parse_args(argv)
    errors = run_check(args.root.resolve())

    if errors:
        print("Registry check failed:\n", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        print(
            "\nCommitted manifests must declare porto packages as registry semver only.",
            file=sys.stderr,
        )
        return 1

    print("Registry check passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
