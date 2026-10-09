# 026: Proper client prediction with input replay

- **Status:** Open
- **Priority:** P3
- **Area:** client + server
- **Source:** Mining game audit

## Problem
Client runs physics with variable `dt` (<=0.05) vs server fixed 1/30, then nudges toward server position (`MiningPredictionSystem.ts`). `sequence` exists on inputs but there is no input buffer or replay. Rubber-banding under latency; will worsen with knockback/dashes.

## Proposed approach
Fixed-step client prediction, input history keyed by sequence, server acks last processed sequence, replay on correction.

## Acceptance
- Smooth movement under simulated latency/jitter; tests for reconciliation.

## Open questions
(to be asked before work starts)
