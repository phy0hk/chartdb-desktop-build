---
name: graphify
description: Use this skill when working with the repository's Graphify knowledge graph or when querying the codebase through Graphify. Follow the project's graph guidance and keep graphify-out current after code changes.
---

# Graphify Knowledge Graph

This repository maintains a Graphify knowledge graph in `graphify-out/`. Use it as a code-reading cache and navigation aid: query its indexed knowledge before broad source exploration, but never assume the cache is complete or current.

## Working with Graphify

- For codebase questions, prefer scoped `graphify query`, `graphify explain`, or `graphify path` queries when the graph is available. Use `graphify-out/GRAPH_REPORT.md` for broad orientation.
- If `graphify-out/wiki/index.md` exists, navigate the wiki from that index rather than reading raw files.
- If the graph or relevant cached memory is missing, Graphify cannot be queried, the graph is stale, or its result is insufficient, continue by reading the relevant source files and tests directly. Missing graph coverage is not evidence that the code or behavior does not exist.
- Use graph results to identify relevant files and relationships, then inspect source directly before implementing or validating changes. The graph may omit details or lag behind the code.
- When working on Graphify itself—including its generation, configuration, or correctness—follow the repository's existing Graphify guidance. Do not treat the graph as evidence when evaluating the graph's own correctness.
- After modifying code files in the session, run `graphify update .` when the CLI is available to keep the cache current. This update is AST-only and does not incur API cost.
