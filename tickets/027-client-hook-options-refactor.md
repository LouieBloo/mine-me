# 027: Reduce ref-passing in useMiningTicker/useMiningStateSync

- **Status:** Open
- **Priority:** P3
- **Area:** client / architecture
- **Source:** Mining game audit

## Problem
`useMiningTicker` takes ~45 options and `useMiningStateSync` ~40 plus a 250-line handler. Hard to test and extend. Several `any` types hide payload mismatches.

## Proposed approach
A single `MiningClientWorld` holding managers/refs, passed to systems; split the tick handler into per-section handlers (tiles, entities, effects).

## Acceptance
- Option lists shrink substantially; handlers individually testable.

## Open questions
(to be asked before work starts)
