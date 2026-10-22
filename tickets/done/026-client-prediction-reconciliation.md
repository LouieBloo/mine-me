# 026: Proper client prediction with input replay

- **Status:** Done
- **Priority:** P3
- **Area:** client + server
- **Source:** Mining game audit

## Problem
Client runs physics with variable `dt` (<=0.05) vs server fixed 1/30, then nudges toward server position (`MiningPredictionSystem.ts`). `sequence` exists on inputs but there is no input buffer or replay. Rubber-banding under latency; will worsen with knockback/dashes.

## Proposed approach
Fixed-step client prediction, input history keyed by sequence, server acks last processed sequence, replay on correction.

## Acceptance
- Smooth movement under simulated latency/jitter; tests for reconciliation.

## Decisions (2026-10-09)
**Revised after owner review** ("emulate what a modern game does"): the fixed-step input latency is gone. The body still simulates at 1/30 s, but the drawn position is the body plus a speculative partial step through the time left over in the accumulator (run with the current input, then undone). A key press now shows on the next frame, as in modern predicted-movement netcode; `renderPosition()` no longer interpolates between steps. Original notes:
Owner asked to keep moving, so design choices were made here (documented for review):
- Keep the existing change-based `mining_input` protocol (no per-frame command stream). Instead of acking "last processed command", the server acks the input `sequence` in effect plus its **age** (ticks it has been in effect). Because client and server both step at a fixed 1/30 s, `(sequence, age)` names exactly one client step, which is what the client compares against.
- The client steps the body at a fixed 1/30 s (accumulator) and draws it interpolated between steps. Cost: up to one step (~33 ms) of visual latency before a key press shows, instead of the old per-frame (variable `dt`) step.
- Server-only forces are handled by the server telling the client what it cannot derive: `bodyState` (grounded, on-ladder, knockback timer) rides in every tick payload, and hits carry the server `tick` they happened on.

## Implementation notes
- **Shared `PlayerPredictor`** (`physics/PlayerPredictor.ts`): fixed-step `advance`, per-step history (input + resulting state + impulses), `setInput`, `applyKnockback(vx, vy, seconds, serverTick)`, and `reconcile(snapshot, grid)`: finds the client step for `(ackSequence, ackAge)`; within tolerance -> `ok`; otherwise reset the body to the server state at that step and **replay** every later step with its recorded input (re-applying pushes the snapshot does not already contain) -> `corrected`, or `snapped` past 1.5 tiles. Snapshots it cannot line up (unknown sequence, step not simulated, input ran longer on the server than on the client) are ignored. Corrections are blended: the body and its previous position move together and `renderOffset` cancels the move for drawing, then decays.
- **Server:** `MiningStateTickPayload` gains `ackSequence`, `ackAge`, `bodyState`; `MiningPlayerDamagedEvent` gains `tick`; `MiningWorld.tick`; sessions track `inputAge` (reset when the sequence changes).
- **Client:** `MiningPredictionState` (predictor + newest snapshot), `MiningPredictionSystem` now drives the predictor instead of nudging toward the server position; knockback goes through the predictor. One new `predictionRef` option on the ticker/state-sync/damage hooks (ticket 027 will fold these into a world object).
- **Tests:** a latency/jitter rig in `PlayerPredictor.test.ts` (0-12 ticks of delay: zero corrections when both sides agree; jitter: corrects, never snaps, converges; server-only stall: bounded lead, converges; knockback: single application; teleport: snaps; blending keeps the drawn position put) plus direct reconcile tests, server ack tests, and client system/ticker tests. Mutation-checked (impulse de-dup, replay, blend offset each fail tests).
- Known limits: if several input changes land in one client frame the middle sequences are never recorded and their acks are ignored (self-heals on the next change); tile changes made by others are not rewound during replay.

