---
name: graphify
description: Use this skill when working with the repository's Graphify knowledge graph or when querying the codebase through Graphify. Follow the project's graph guidance and keep graphify-out current after code changes.
---

# Graphify Knowledge Graph

This repository maintains a Graphify knowledge graph in `graphify-out/`.

## Working with Graphify

- When working on Graphify itself—including its generation, configuration, or correctness—follow the repository's existing Graphify guidance. Do not treat the graph as evidence when evaluating the graph's own correctness.
- For codebase questions, prefer scoped Graphify queries when available. Use the graph report for broad orientation.
- If `graphify-out/wiki/index.md` exists, navigate the wiki from that index rather than reading raw files.
- After modifying code files in the session, run `graphify update .` to keep the graph current. This is AST-only and does not incur API cost.
