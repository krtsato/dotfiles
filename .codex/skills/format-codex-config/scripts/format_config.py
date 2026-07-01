#!/usr/bin/env python3
"""Normalize Codex config.toml nested tables into grouped dotted keys."""

from __future__ import annotations

import argparse
import difflib
import os
from pathlib import Path
import re
import sys
import tomllib


DEFAULT_ROOTS = ("plugins", "marketplaces", "mcp_servers", "desktop", "tui", "apps")
BARE_KEY_RE = re.compile(r"^[A-Za-z0-9_]+$")
TABLE_HEADER_RE = re.compile(r"^(\s*)\[([^\[\]\n]+)\](\s*(?:#.*)?)$")


class FormatError(Exception):
    pass


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    default_path = Path(os.environ.get("CODEX_HOME", "~/.codex")).expanduser() / "config.toml"
    parser.add_argument("path", nargs="?", type=Path, default=default_path)
    parser.add_argument(
        "--roots",
        default=",".join(DEFAULT_ROOTS),
        help="Comma-separated parent tables to flatten.",
    )
    parser.add_argument("--check", action="store_true", help="Exit non-zero if formatting is needed.")
    parser.add_argument("--diff", action="store_true", help="Print a unified diff without writing.")
    return parser.parse_args()


def split_dotted_key(text: str) -> list[str]:
    parts: list[str] = []
    current: list[str] = []
    quote: str | None = None
    escape = False

    for char in text.strip():
        if quote:
            current.append(char)
            if quote == '"' and escape:
                escape = False
            elif quote == '"' and char == "\\":
                escape = True
            elif char == quote:
                quote = None
            continue

        if char in ("'", '"'):
            quote = char
            current.append(char)
        elif char == ".":
            part = "".join(current).strip()
            if not part:
                raise FormatError(f"empty TOML key component in {text!r}")
            parts.append(part)
            current = []
        else:
            current.append(char)

    if quote:
        raise FormatError(f"unterminated TOML key in {text!r}")

    part = "".join(current).strip()
    if not part:
        raise FormatError(f"empty TOML key component in {text!r}")
    parts.append(part)
    return parts


def key_component_name(component: str) -> str:
    component = component.strip()
    if not component:
        raise FormatError("empty TOML key component")
    if not component.startswith(("'", '"')):
        return component

    try:
        parsed = tomllib.loads(f"key = {component}")
    except tomllib.TOMLDecodeError as exc:
        raise FormatError(f"invalid TOML key component {component!r}: {exc}") from exc
    value = parsed["key"]
    if not isinstance(value, str):
        raise FormatError(f"invalid TOML key component {component!r}")
    return value


def quote_key_component(component: str) -> str:
    name = key_component_name(component)
    if BARE_KEY_RE.match(name):
        return name
    escaped = name.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def format_dotted_key(text: str) -> str:
    return ".".join(quote_key_component(part) for part in split_dotted_key(text))


def table_header_parts(line: str) -> list[str] | None:
    match = TABLE_HEADER_RE.match(line.rstrip("\n"))
    if not match:
        return None
    return split_dotted_key(match.group(2))


def find_assignment_equal(line: str) -> int | None:
    quote: str | None = None
    escape = False
    for index, char in enumerate(line):
        if quote:
            if quote == '"' and escape:
                escape = False
            elif quote == '"' and char == "\\":
                escape = True
            elif char == quote:
                quote = None
            continue
        if char in ("'", '"'):
            quote = char
        elif char == "#":
            return None
        elif char == "=":
            return index
    return None


def flatten_body_lines(prefix_parts: list[str], body_lines: list[str]) -> list[str]:
    prefix = ".".join(quote_key_component(part) for part in prefix_parts)
    flattened: list[str] = []

    for line in body_lines:
        equal_index = find_assignment_equal(line)
        if equal_index is None:
            flattened.append(line)
            continue

        indent = line[: len(line) - len(line.lstrip())]
        key = line[:equal_index].strip()
        value = line[equal_index + 1 :].lstrip()
        if not key:
            flattened.append(line)
            continue
        flattened.append(f"{indent}{prefix}.{format_dotted_key(key)} = {value}")

    return flattened


def normalize_body_lines(body_lines: list[str]) -> list[str]:
    normalized: list[str] = []

    for line in body_lines:
        equal_index = find_assignment_equal(line)
        if equal_index is None:
            normalized.append(line)
            continue

        indent = line[: len(line) - len(line.lstrip())]
        key = line[:equal_index].strip()
        value = line[equal_index + 1 :].lstrip()
        if not key:
            normalized.append(line)
            continue
        normalized.append(f"{indent}{format_dotted_key(key)} = {value}")

    return normalized


def split_blocks(lines: list[str]) -> list[tuple[list[str] | None, list[str], list[str]]]:
    blocks: list[tuple[list[str] | None, list[str], list[str]]] = []
    current_header: list[str] | None = None
    current_header_lines: list[str] = []
    current_body: list[str] = []

    for line in lines:
        parts = table_header_parts(line)
        if parts is not None:
            blocks.append((current_header, current_header_lines, current_body))
            current_header = parts
            current_header_lines = [line]
            current_body = []
        else:
            current_body.append(line)

    blocks.append((current_header, current_header_lines, current_body))
    return blocks


def normalize(text: str, roots: set[str]) -> str:
    lines = text.splitlines(keepends=True)
    blocks = split_blocks(lines)
    insertions: dict[str, list[str]] = {root: [] for root in roots}
    has_parent = {root: False for root in roots}
    first_flattened_index: dict[str, int] = {}

    for index, (header, _header_lines, body_lines) in enumerate(blocks):
        if not header:
            continue
        root = key_component_name(header[0])
        if root in roots and len(header) == 1:
            has_parent[root] = True
        elif root in roots and len(header) > 1:
            first_flattened_index.setdefault(root, index)
            insertions[root].extend(flatten_body_lines(header[1:], body_lines))

    output: list[str] = []
    inserted = {root: False for root in roots}

    for index, (header, header_lines, body_lines) in enumerate(blocks):
        if header is None:
            output.extend(body_lines)
            continue

        root = key_component_name(header[0])
        should_flatten = root in roots and len(header) > 1

        if should_flatten:
            if not has_parent[root] and not inserted[root] and first_flattened_index[root] == index:
                output.append(f"[{quote_key_component(root)}]\n")
                output.extend(insertions[root])
                inserted[root] = True
            continue

        output.extend(header_lines)
        body = normalize_body_lines(body_lines) if root in roots and len(header) == 1 else body_lines
        output.extend(body)

        if root in roots and len(header) == 1 and not inserted[root] and insertions[root]:
            if output and output[-1].strip():
                output.append("\n")
            output.extend(insertions[root])
            inserted[root] = True

    normalized = "".join(output)
    if text.endswith("\n") and not normalized.endswith("\n"):
        normalized += "\n"
    return normalized


def parsed_toml(text: str, source: Path) -> object:
    try:
        return tomllib.loads(text)
    except tomllib.TOMLDecodeError as exc:
        raise FormatError(f"invalid TOML in {source}: {exc}") from exc


def main() -> int:
    args = parse_args()
    roots = {root.strip() for root in args.roots.split(",") if root.strip()}
    path = args.path.expanduser()
    original = path.read_text()
    formatted = normalize(original, roots)

    before = parsed_toml(original, path)
    after = parsed_toml(formatted, path)
    if before != after:
        raise FormatError("refusing to write: parsed TOML differs after formatting")

    if args.diff:
        sys.stdout.writelines(
            difflib.unified_diff(
                original.splitlines(keepends=True),
                formatted.splitlines(keepends=True),
                fromfile=str(path),
                tofile=str(path),
            )
        )
        return 1 if original != formatted else 0

    if args.check:
        if original != formatted:
            print(f"{path}: formatting changes needed")
            return 1
        print(f"{path}: already formatted")
        return 0

    if original != formatted:
        path.write_text(formatted)
        print(f"{path}: formatted")
    else:
        print(f"{path}: already formatted")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except FormatError as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(2)
