import path from 'path';
import { MiningDataManager } from '../../src/services/mining/subsystems/MiningDataManager';
import { loadDefinitionsFromFiles } from '../../src/services/mining/definitionLoaders';

// Tests run against the developer seed JSON (never the database).
MiningDataManager.initialize(
  loadDefinitionsFromFiles(path.resolve(__dirname, '../../../../packages/shared/src/data'))
);
