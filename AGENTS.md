# AI Developer & Technical Writer Rules — Budget Request System

Follow this context read order to minimize unnecessary context and maintain reliable progress:

## Read protocol (in order)

1. Read `/RULES.md` first for non-negotiable project guardrails.
2. Read `.ai_context/MANIFEST.md` second for immediate scope and real-time liveness tracking.
3. Read `.ai_context/REQUIREMENTS.md` only when the task changes high-level specifications, architecture, or core conventions.
4. Read `.ai_context/memory/CHRONICLE.md` only when historical architectural rationale is needed.
5. Read only the project or documentation files relevant to the active scope. Use the manifest's Files to Touch list when it is populated; do not scan unrelated files.

## Graphify-assisted code reading

- Treat `graphify-out/` as a code-reading cache and navigation aid, not a replacement for source files. When available, use scoped Graphify queries (`graphify query`, `graphify explain`, or `graphify path`) for codebase questions; use `GRAPH_REPORT.md` for broad orientation and `graphify-out/wiki/index.md` to navigate a generated wiki when present.
- If the graph, report, or relevant cached memory does not exist, cannot be queried, is stale, or does not contain enough detail to answer the question, read the relevant source files directly. Do not stop or infer that information is absent just because it is absent from the graph.
- Before making or validating code changes, inspect the relevant source and tests directly; graph output can guide where to look but may omit details or lag behind the code.
- After modifying code files, run `graphify update .` when the CLI is available to refresh the cache. Do not treat Graphify's output as evidence for Graphify's own correctness.

## Incremental manifest updates

- After diagnosis, update `.ai_context/MANIFEST.md` with concrete findings and a step-by-step checklist under In-Progress Tasks.
- As work proceeds, update the manifest immediately after completing each listed file or task, recording exact paths and remaining work.
- When resuming, check the manifest for partially completed checklists before repeating work.

## Documentation authoring

- Treat existing files under `documentation/` as authoritative narrative, while ensuring updates match the actual implementation.
- Keep section-number and database-table cross-references synchronized.
- When documenting API endpoints, include request/response DTO shapes, permission scopes, error codes, and caching behavior.

## Context maintenance

- Record historical implementation decisions in `.ai_context/memory/CHRONICLE.md`; do not create new timestamped files in the deprecated `.ai_context/memos/` directory.
- Update `.ai_context/REQUIREMENTS.md` when requirements or core architecture/conventions change, including its version.
- Keep the manifest focused on the active sprint. When a task is complete, regenerate it for the next sprint according to the context architecture; do not erase useful historical rationale from the chronicle.

---

# Agent Skills Repository Guidance

> **Scope:** This guidance was written for the [`addyosmani/agent-skills`](https://github.com/addyosmani/agent-skills) repository. It describes that repository's layout and workflows; apply its skill-specific paths and procedures only where they exist in this project.

## Repository Overview

A collection of skills for Claude.ai and Claude Code for senior software engineers. Skills are packaged instructions and scripts that extend Claude and your coding agents capabilities.

## OpenCode Integration

OpenCode uses a **skill-driven execution model** powered by the `skill` tool and this repository's `/skills` directory.

### Mandatory First Skill

For **every user request**, invoke the project-local `token-context-optimizer` skill before invoking any other skill or beginning task-specific work. This requirement applies even when the request appears trivial or no other skill matches. Follow its read-order, liveness, and context-management protocol; then invoke any additional skills required by the request.

### Core Rules

- If a task matches a skill, you MUST invoke it
- Skills are located in `skills/<skill-name>/SKILL.md`
- Never implement directly if a skill applies
- Always follow the skill instructions exactly (do not partially apply them)

### Intent → Skill Mapping

The agent should automatically map user intent to the relevant skills:

- Feature or new functionality → `spec-driven-development`, then `incremental-implementation` and `test-driven-development`
- Planning or task breakdown → `planning-and-task-breakdown`
- Bug, failure, or unexpected behavior → `debugging-and-error-recovery`
- Code review → `code-review-and-quality`
- Refactoring or simplification → `code-simplification`
- API or interface design → `api-and-interface-design`
- Codebase analysis or code reading → `graphify` (use the repository knowledge graph where applicable)
- UI work → `frontend-ui-engineering`

### Lifecycle Mapping (Implicit Commands)

OpenCode does not support slash commands such as `/spec` or `/plan`. The agent must internally follow this lifecycle when applicable:

- DEFINE → `spec-driven-development`
- PLAN → `planning-and-task-breakdown`
- BUILD → `incremental-implementation` and `test-driven-development`
- VERIFY → `debugging-and-error-recovery`
- REVIEW → `code-review-and-quality`

### Execution Model

For every request:

1. Invoke `token-context-optimizer` first and follow its workflow.
2. Determine which additional skills match the user's intent.
3. Invoke those skills using the `skill` tool and follow their workflows.
4. Apply the implicit lifecycle stages as appropriate to the task; do not expect or require slash commands.
5. Proceed only after required definition and planning steps are complete.

### Anti-Rationalization

The following thoughts are incorrect and must be ignored:

- "This is too small for a skill"
- "I can just quickly implement this"
- "I’ll gather context first"

Correct behavior:

- Always check for and use skills first

This ensures OpenCode behaves similarly to Claude Code with full workflow enforcement.

## Orchestration: Personas, Skills, and Commands

This repo has three composable layers. They have different jobs and should not be confused:

- **Skills** (`skills/<name>/SKILL.md`) — workflows with steps and exit criteria. The _how_. Mandatory hops when an intent matches.
- **Personas** (`agents/<role>.md`) — roles with a perspective and an output format. The _who_.
- **Slash commands** (`.claude/commands/*.md`) — user-facing entry points. The _when_. The orchestration layer.

Composition rule: **the user (or a slash command) is the orchestrator. Personas do not invoke other personas.** A persona may invoke skills.

The only multi-persona orchestration pattern this repo endorses is **parallel fan-out with a merge step** — used by `/ship` to run `code-reviewer`, `security-auditor`, and `test-engineer` concurrently and synthesize their reports. Do not build a "router" persona that decides which other persona to call; that's the job of slash commands and intent mapping.

See [docs/agents.md](docs/agents.md) for the decision matrix and [references/orchestration-patterns.md](references/orchestration-patterns.md) for the full pattern catalog.

**Claude Code interop:** the personas in `agents/` work as Claude Code subagents (auto-discovered from this plugin's `agents/` directory) and as Agent Teams teammates (referenced by name when spawning). Two platform constraints align with our rules: subagents cannot spawn other subagents, and teams cannot nest. Plugin agents silently ignore the `hooks`, `mcpServers`, and `permissionMode` frontmatter fields.

## Creating a New Skill

> **Before you start:** run the pre-flight checks in [CONTRIBUTING.md](CONTRIBUTING.md#before-proposing-a-new-skill), search the catalog, check open PRs (`gh pr list --state open`), confirm the idea fits [docs/skill-anatomy.md](docs/skill-anatomy.md), and justify the gap in your PR description. Most new-skill ideas overlap an existing skill or an open PR; prefer extending an existing skill over adding a near-duplicate. CONTRIBUTING.md is the single source of truth for this workflow.

Skills in this repo are markdown-first: each lives at `skills/<kebab-case-name>/SKILL.md` with YAML frontmatter (`name`, `description`) and follows the section anatomy (Overview, When to Use, Process, Common Rationalizations, Red Flags, Verification). Add a `scripts/` directory only when the skill ships runnable helpers; most skills are markdown only, and there are no per-skill zip packages.

For the full format, naming conventions, frontmatter rules, supporting-file thresholds, and writing principles, see `docs/skill-anatomy.md`, the single source of truth for skill structure. Do not restate that guidance here.
