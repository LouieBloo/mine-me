import path from 'path';
import { MiningDataManager } from '../../src/services/mining/subsystems/MiningDataManager';
import { loadDefinitionsFromFiles } from '../../src/services/mining/definitionLoaders';

// Tests run against the developer seed JSON (never the database).
// Balance numbers the seed mirrors from the admin (a block's health) change as the game is tuned, so tests that
// count swings pin the ones they rely on instead of reading the tuned value.
const definitions = loadDefinitionsFromFiles(path.resolve(__dirname, '../../../../packages/shared/src/data'));
const PINNED_BLOCK_HEALTH: Record<string, number> = { DIRT: 100 };
definitions.blocks = definitions.blocks.map((block) =>
  block.typeKey in PINNED_BLOCK_HEALTH ? { ...block, health: PINNED_BLOCK_HEALTH[block.typeKey] } : block
);
MiningDataManager.initialize(definitions);
