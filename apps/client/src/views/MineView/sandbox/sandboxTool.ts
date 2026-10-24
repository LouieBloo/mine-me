/** What the left mouse button does in the sandbox. */
export type SandboxToolSelection =
  | { kind: 'mine' }
  | { kind: 'pour'; fluidKey: string }
  | { kind: 'releaseGas'; gasKey: string }
  | { kind: 'spawn'; mobId: string }
  | { kind: 'ignite' }
  | { kind: 'placeDoodad'; doodadId: string }
  | { kind: 'removeDoodad' };

export const MINE_TOOL: SandboxToolSelection = { kind: 'mine' };

/** The sandbox view settings MiningGrid needs (absent outside the sandbox). */
export interface SandboxViewState {
  tool: SandboxToolSelection;
  freeCamera: boolean;
}
