# Follow-up Task List

## Task 1: Capture reproducible build and bundle baseline

**Description:** Record clean production build duration/peak memory by phase, compressed JS/CSS sizes, and largest static assets.

**Acceptance criteria:**

- [ ] Record command, environment, elapsed time, and peak memory for lint/type/build phases where measurable.
- [ ] Record compressed bundle and largest-asset sizes from the produced output.
- [ ] Save results in a repeatable format for comparison.

**Verification:**

- [ ] Repeat the measurements under the same environment and compare results.

**Dependencies:** None

**Files likely touched:** Build scripts/configuration only if measurement requires instrumentation; results location to be selected.

**Estimated scope:** S

## Task 2: Measure app startup to interactive editor

**Description:** Establish cold/warm launch timing and startup spans for storage open/load, diagram load, and editor render.

**Acceptance criteria:**

- [ ] Record cold and warm launch-to-interactive timings.
- [ ] Attribute timings to the listed startup spans without changing storage behavior.
- [ ] Record environment and repeatable procedure.

**Verification:**

- [ ] Repeat cold/warm measurements and confirm the procedure distinguishes the two cases.

**Dependencies:** None

**Files likely touched:** Frontend startup/editor instrumentation paths to identify after inspecting current implementation.

**Estimated scope:** M

## Task 3: Reproduce collaboration operation rejection

**Description:** Capture the exact operation payload, validation path, and response for the reported invalid-operation error.

**Acceptance criteria:**

- [ ] Reproduce with a documented payload, or mark the report unconfirmed and record the missing reproduction inputs.
- [ ] Verify existing `databaseEdition: null` regression coverage remains relevant.
- [ ] Add a focused regression test only for a confirmed failure.

**Verification:**

- [ ] Run the focused operation-validation test once its owning package/command is identified.

**Dependencies:** None

**Files likely touched:** Collaboration operation validation and its focused test files, identified during diagnosis.

**Estimated scope:** M

**Current evidence (2026-11-03):** Go operation-focused tests pass (`go test -run 'TestSequencer|Test.*Operation' -count=1 .`), including existing sequencer validations. The reported user operation rejection remains unconfirmed because no failing payload/error was supplied. Frontend targeted collaboration tests pass (2 files, 10 tests).

## Task 4: Verify LAN invite address selection with two clients

**Description:** Validate candidate URL fallback and invite copying on a real two-device LAN flow.

**Acceptance criteria:**

- [ ] Record OS/network conditions and selected successful invite URL.
- [ ] Verify full candidate invite copying and successful client connection.
- [ ] Capture any failure with actionable logs/reproduction steps.

**Verification:**

- [ ] Manual two-client test on the available LAN.

**Dependencies:** None

**Files likely touched:** None unless manual verification exposes a defect; then the relevant collaboration paths.

**Estimated scope:** XS

## Checkpoint A: Evidence review

- [ ] Review Tasks 1–4 and decide which measured bottleneck or reproduced defect warrants implementation.

### Evidence recorded 2026-11-03

- `go test ./...` passed.
- `npm run build` passed ESLint and TypeScript build stages, then Vite failed with a V8 heap out-of-memory error near the default ~2 GiB heap limit while transforming frontend assets. `NODE_OPTIONS=--max-old-space-size=4096 npm run build` did not complete within 120 seconds; because this retry ran concurrently with other frontend work, it is not a valid comparable baseline.
- `npx vitest run --reporter=dot --bail=1` found 212 passing tests, 2 failing tests, and 6 skipped across the completed run; both failures throw because `localStorage` is undefined in SQL-import tests. Need determine whether test environment configuration or test setup is intended to provide it before fixing.
- `npx vitest run src/lib/collaboration/__tests__/diagram-operations.test.ts src/lib/collaboration/__tests__/collaboration-protocol.test.ts --reporter=dot` passed (2 files, 10 tests).
- Cold/warm desktop startup and two-device LAN validation were not performed: no running Wails desktop/second LAN client was available in this execution environment. No timing or successful invite address is claimed.
- No Vite visualizer attribution, packaged-app verification, or performance change is justified yet; Task 1's reproducible bundle baseline and Task 2 startup spans remain incomplete.

## Task 5: Attribute bundle cost and evaluate lazy-loading

**Description:** Use the existing Vite visualizer to identify the largest dependencies/features and lazy-load only measured heavy routes/features.

**Acceptance criteria:**

- [ ] Record dependency/chunk attribution and identify a measurable target.
- [ ] Implement lazy-loading only where data shows a benefit.
- [ ] Confirm no harmful dependency duplication or feature regression.

**Verification:**

- [ ] Compare production chunk output before/after and run relevant frontend checks.

**Dependencies:** Task 1

**Files likely touched:** Vite/frontend route or feature entry points selected from profiling.

**Estimated scope:** M

## Task 6: Evaluate embedded assets and packaged output

**Description:** Determine whether static assets dominate embedded output and change strategy only if supported by measurements.

**Acceptance criteria:**

- [ ] Identify largest embedded assets and quantify their contribution.
- [ ] Any proposed asset change preserves required functionality and Wails loading.
- [ ] Report output-size comparison.

**Verification:**

- [ ] Build and manually verify packaged Wails app loading with representative diagrams/assets.

**Dependencies:** Task 1

**Files likely touched:** Asset references/build configuration only if a measured change is justified.

**Estimated scope:** M

## Task 7: Address a measured startup bottleneck

**Description:** Use Task 2 spans to improve the demonstrated initialization bottleneck without changing storage semantics.

**Acceptance criteria:**

- [ ] Identify the dominant span using repeated measurements.
- [ ] Make a focused change preserving existing storage/data behavior.
- [ ] Show before/after timing under comparable conditions.

**Verification:**

- [ ] Run focused frontend tests and repeat startup measurements.

**Dependencies:** Task 2

**Files likely touched:** Startup/storage/editor code identified from instrumentation.

**Estimated scope:** M

## Checkpoint B: Performance regression review

- [ ] Confirm repeatable before/after measurements and Wails packaged loading before proceeding.

## Task 8: Add collaboration origin/rate safeguards

**Description:** Define policy from current requirements and implement appropriate origin/rate controls with security tests.

**Acceptance criteria:**

- [ ] Confirm accepted client origins and rate/size limits before coding.
- [ ] Reject disallowed traffic without weakening token validation or host-side operation validation.
- [ ] Cover accepted/rejected cases with focused tests.

**Verification:**

- [ ] Run collaboration security tests and verify normal desktop client connection manually.

**Dependencies:** None

**Files likely touched:** WebSocket host/client security paths and focused tests, identified during implementation.

**Estimated scope:** M

## Task 9: Specify remote-operation persistence and undo behavior

**Description:** Resolve whether remote edits persist locally and how they interact with undo, then implement the agreed policy.

**Acceptance criteria:**

- [ ] Document expected persistence and undo behavior before implementation.
- [ ] Preserve authoritative host sequencing and stale-version rejection.
- [ ] Add tests for local/remote edits, persistence, and undo according to the agreed policy.

**Verification:**

- [ ] Run focused collaboration and persistence tests; manually verify reconnect behavior if relevant.

**Dependencies:** None

**Files likely touched:** Collaboration operation handling, persistence/undo integration, and tests.

**Estimated scope:** L

## Task 10: Improve active-edit collaboration UX

**Description:** Make serialized, stale, or rejected active edits understandable and actionable to users.

**Acceptance criteria:**

- [ ] Show clear state for pending, accepted, or rejected edits.
- [ ] Handle stale/rejected edits without presenting them as conflict-free merges.
- [ ] Verify keyboard and accessible status feedback.

**Verification:**

- [ ] Run focused UI checks and manually exercise host/client edit and rejection flows.

**Dependencies:** Tasks 3, 9

**Files likely touched:** Collaboration UI components/state and their tests.

**Estimated scope:** M

## Task 11: Test client lifecycle, backpressure, disconnect, and resync

**Description:** Add coverage for client teardown/reconnect, bounded message handling, disconnects, and state resynchronization.

**Acceptance criteria:**

- [ ] Exercise lifecycle and backpressure boundaries with tests.
- [ ] Verify disconnect and reconnect/resync restore expected diagram state.
- [ ] Fix only confirmed faults and retain bounded message handling.

**Verification:**

- [ ] Run focused lifecycle/fault tests and a two-client manual disconnect/resync test.

**Dependencies:** Tasks 3, 8

**Files likely touched:** Collaboration transport/client lifecycle code and tests.

**Estimated scope:** L

## Task 12: Run broader collaboration acceptance

**Description:** Validate collaboration under load and repeated disconnect/resynchronization after focused fixes.

**Acceptance criteria:**

- [ ] Record load scenario, client count, duration, and observed results.
- [ ] Verify no protocol/validation regression or unbounded client/message behavior.
- [ ] Document remaining limitations and failures.

**Verification:**

- [ ] Execute the documented load and disconnect/resync acceptance procedure.

**Dependencies:** Tasks 8–11

**Files likely touched:** Test/acceptance documentation or scripts if needed.

**Estimated scope:** M
