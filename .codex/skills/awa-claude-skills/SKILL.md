---
name: awa-claude-skills
description: Use when the user asks for an AWA/Claude skill by name, or asks for AWA team workflows such as fix-ci, check-review, codex-review, commit-push-pr, request-review-copilot, resolve-review-comments, reorg-commits, check-plan, terraform-fmt, ECS operations, generate-openapi, implement-api, migrate-mgo-to-ds, draft-requirement, or write-postmortem. This skill locates the matching existing Claude SKILL.md and follows it without requiring Codex plugin installation.
---

# AWA Claude Skills

Use existing AWA Claude skills directly from:

`/Users/s11639/go/src/github.com/awa/claude-plugins/plugins`

## Workflow

1. Identify the requested skill name or workflow from the user request.
2. Locate candidate files with `rg --files ~/go/src/github.com/awa/claude-plugins/plugins | rg '/skills/.+/SKILL.md$'`.
3. Prefer an exact directory-name match, for example `common-dev/skills/fix-ci/SKILL.md`.
4. If multiple skills have the same name, choose by project context:
   - AWA backend/API work: `server-dev`
   - AWA admin tool work: `admintool-dev`
   - Terraform, ECS, AWS, Datadog, or infra work: `infra-dev`
   - Requirements, memory, or postmortem documents: `document-dev`
   - GitHub, CI, PR, review, branch, or commit workflows: `common-dev`
5. Read the matched `SKILL.md` and follow its workflow. Treat Claude-specific tool names as intent:
   - `Bash`, `Read`, `Glob`, `Grep`, `Edit`, `Write` map to Codex shell/read/edit tools.
   - `mcp__github__*`, `mcp__awa-slack__*`, `mcp__docbase-mcp__*`, and similar names map to the corresponding configured Codex MCP server when available.
   - `Task` or `Agent` means use a Codex sub-agent or a compact local investigation when sub-agents are not available.
6. Do not modify `/Users/s11639/go/src/github.com/awa/claude-plugins` unless the user explicitly asks to edit the source skills.

## Known Skill Roots

- `common-dev/skills`: commit, clean-gone, plan-issue, fix-ide-diagnostics, eval-skills, ship-it-review, resolve-review-comments, request-review-copilot, commit-push-pr, fix-ci, reorg-commits, ship-it, check-npm-audit, copilot-review-and-fix, upgrade-npm-packages, check-review-pr, codex-review-plan, ready-and-auto-merge, codex-review, check-review.
- `infra-dev/skills`: scale-room-event, delete-ecs-resources, add-ecs-services, terraform-fmt, check-plan, improve-datadog-dashboard, tag-ecs-resources, investigate-reliability-lounge, update-ecs-services, hide-plan-comments, setup-load-test, migrate-load-test-services, scale-room-event-jenkins, migrate-arm64, analyze-datadog-dashboard, check-plan-pr, check-env-drift, fix-vpn-cert.
- `server-dev/skills`: implement-api, generate-openapi, migrate-mgo-to-ds, prepare-server-meeting-agenda.
- `admintool-dev/skills`: generate-openapi.
- `document-dev/skills`: draft-requirement, improve-memory-md, write-postmortem.
