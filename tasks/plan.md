# Implementation Plan: Desktop Performance and Collaboration Follow-ups

## Overview

Work from the active manifest in two tracks: first establish reproducible performance measurements and isolate reported collaboration/build issues; then implement only changes supported by those measurements or a reproduced failure. In parallel, complete the explicitly listed collaboration reliability and usability follow-ups in small, verifiable slices.

## Architecture Decisions

- Keep collaboration desktop-only and preserve tokenized WebSocket transport and authoritative host-side validation.
- Treat collaboration as serialized/conflict-detected editing, not CRDT or conflict-free merging.
- Measure before optimizing; do not claim speedups without repeatable before/after results.
- Do not change storage semantics or add a build-heap workaround until profiling supports it.

## Ordered Phases

### Phase 1: Baselines and Error Reproduction

1. Record clean production build duration and peak Node memory by phase, compressed bundle sizes, and largest static assets.
2. Measure cold and warm launch to interactive editor; instrument/record storage open/load, diagram load, and editor render spans.
3. Reproduce the reported invalid-operation rejection with an exact payload and capture the validation response; retain the existing null `databaseEdition` regression case.
4. Manually verify two-client LAN URL selection and invite copying; record platform/network conditions and failures.

### Checkpoint: Evidence Review

- [ ] Baseline data is repeatable and includes environment/commands.
- [ ] Each reported error is reproduced or explicitly marked unconfirmed with a next diagnostic step.
- [ ] Agree on the measured bottleneck or confirmed defect before implementation.

### Phase 2: Evidence-Based Performance Work

5. Use the existing Vite visualizer to attribute bundle cost, then lazy-load only measured heavy routes/features if justified.
6. Evaluate embedded asset/output size and packaged Wails loading; change asset strategy only with a measured target.
7. Profile startup spans and storage reads, then address the demonstrated bottleneck without changing persistence semantics.

### Checkpoint: Performance Regression Review

- [ ] Compare before/after metrics under the same conditions.
- [ ] Verify packaged Wails loading and existing diagram/storage behavior.

### Phase 3: Collaboration Safety and Reliability

8. Add origin/rate controls and focused security tests, after confirming intended policy from existing behavior/requirements.
9. Define and implement remote-operation persistence and undo policy; document behavior before changing state semantics.
10. Improve active-edit UX for serialized/rejected edits, aligned with host validation and stale-version behavior.
11. Test client lifecycle, backpressure, disconnect, and resynchronization; address confirmed failures.
12. Run broader load and disconnect/resync acceptance across two clients.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Measurements vary between runs | False optimization conclusions | Record environment and repeat runs; compare like-for-like builds. |
| User-reported invalid operation cannot be reproduced | Unnecessary or incorrect validation change | Capture exact payload/error first; keep this as an investigation until evidence exists. |
| Collaboration policy changes affect persisted data or undo | Data loss or surprising behavior | Agree on policy and add regression tests before implementation. |
| LAN controls block legitimate clients | Collaboration unavailable on some networks | Confirm expected origin/rate policy and test two-client flows. |

## Open Questions

- What exact operation payload and user-visible error are still occurring, and how can they be reproduced?
- Which OS/network conditions are available for two-device LAN verification?
- What should undo do for remote operations, and should those operations be persisted locally?
- What origin policy is intended for desktop WebSocket clients, and what rate/size thresholds are acceptable?
- Which existing project commands should be used for focused frontend/backend tests and packaged Wails validation? Resolve from the relevant package/build configuration when implementation begins.
