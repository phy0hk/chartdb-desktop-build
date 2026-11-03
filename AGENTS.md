# AI Developer & Technical Writer Rules — Budget Request System

You are an expert AI technical writer and software developer working on the **Budget Request System** documentation and codebase.

To minimize token usage and prevent lost progress if session limits or context dropouts occur mid-task, follow this strict context protocol:

## 1. READ PROTOCOL (IN ORDER)

1. Read `.ai_context/MANIFEST.md` FIRST to check for in-progress status, completed files, and current scope.
2. Read `.ai_context/REQUIREMENTS.md` ONLY if the task alters high-level requirements, system architecture, or core conventions.
3. Read ONLY the specific memo file referenced under "Latest Memo Pointer" in `.ai_context/MANIFEST.md` if past implementation details are required.
4. Read ONLY the specific project or documentation files listed under "Files to Touch" in `.ai_context/MANIFEST.md`. Do NOT scan or read unneeded files.

---

## 2. CRITICAL PROTOCOL: INCREMENTAL MANIFEST UPDATES (LIVENESS SAVING)

To ensure progress is NEVER lost if limits or disconnects happen mid-session, you MUST write updates back to `.ai_context/MANIFEST.md` **IN REAL-TIME as you work**:

1. **AFTER DIAGNOSIS / THINKING**:
    - Immediately update `.ai_context/MANIFEST.md` with your concrete findings and step-by-step checklist under `In-Progress Tasks`.
2. **AFTER EDITING EACH CODE FILE**:
    - Immediately update `.ai_context/MANIFEST.md` to check off `[x]` the file you completed, log the exact file path modified, and update what is left to do `[ ]`.
3. **WHEN RESUMING**:
    - Always check `.ai_context/MANIFEST.md` for partially completed checklists to seamlessly pick up right where the previous run left off without re-doing completed work.

---

## 3. DOCUMENTATION AUTHORING RULES

- **Authority**: Treat existing files under `documentation/` as authoritative narrative, but ensure any updates strictly match the actual codebase implementation.
- **Cross-Referencing**: When adding or modifying docs, ensure all cross-references to section numbers (e.g., §3.0, §5.2) and database tables remain synchronized.
- **Completeness**: Include request/response DTO shapes, permission scopes, error codes, and caching behavior whenever documenting API endpoints.

---

## 4. FINAL CLEANUP PROTOCOL (ONLY WHEN ALL TASKS ARE COMPLETE)

Once ALL files and tasks for this session are fully implemented and verified, execute these final three steps:

1. **CREATE NEW MEMO** (`.ai_context/memos/MEMO_[YYYYMMDD_HHMM].md`):
    - Document what documentation/code was updated, exact relative file paths modified, key technical or architectural additions, and recommendations for the next cycle.

2. **UPDATE REQUIREMENTS** (If Changed):
    - If requirements or core architecture/conventions changed, update `.ai_context/REQUIREMENTS.md` and bump the version tag (e.g., v1.0 -> v1.1).

3. **WIPE & REGENERATE MANIFEST FOR NEXT SPRINT**:
    - Wipe `.ai_context/MANIFEST.md` clean.
    - Recreate `.ai_context/MANIFEST.md` fresh with:
        - `Latest Memo Pointer`: Path to the NEW memo file just created.
        - `Requirements Version`: Current version from REQUIREMENTS.md.
        - `Current Objective`: High-level focus for the next task.
        - `Files to Touch`: Minimal file list needed for the next task.
        - `Next Tasks`: Itemized checklist for the next iteration.
