---
name: format-codex-config
description: Normalize Codex config.toml files to grouped parent tables with dotted keys. Use when Codex needs to reformat ~/.codex/config.toml, project .codex/config.toml, or dotfiles-managed Codex config after Codex CLI/App writes nested tables such as [plugins."name"], [marketplaces.name], [mcp_servers.name], [desktop.name], [tui.name], or [apps.name].
---

# Format Codex Config

## Workflow

1. Identify the target `config.toml`.
   - Prefer the path named by the user.
   - If unspecified, use `$CODEX_HOME/config.toml` when `CODEX_HOME` is set; otherwise use `~/.codex/config.toml`.

2. Run the formatter:

```bash
python3 <skill-dir>/scripts/format_config.py <path-to-config.toml>
```

3. Verify the result:

```bash
python3 <skill-dir>/scripts/format_config.py --check <path-to-config.toml>
```

The script parses the TOML before and after formatting and refuses to write if the parsed configuration changes.

## Options

- `--check`: report whether formatting is needed without writing.
- `--diff`: print a unified diff without writing.
- `--roots plugins,marketplaces,mcp_servers,desktop,tui,apps`: override the default parent tables to flatten.

## Notes

- Preserve user changes and secrets; do not print full config diffs unless the user asks.
- Treat this as formatting only. Do not change config values.
- The default roots intentionally match sections that Codex CLI/App commonly appends as nested tables.
- Dotted key components are canonicalized as bare keys only for `A-Z`, `a-z`, `0-9`, and `_`; components containing `-` or other characters are emitted as quoted keys.
