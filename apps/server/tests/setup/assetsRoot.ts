import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll } from 'vitest';

// Upload/delete endpoints write real files. Point them at a throwaway folder so tests never touch
// (or leave junk in) packages/shared/assets.
const sharedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mine-me-shared-'));
process.env.SHARED_ROOT = sharedRoot;

afterAll(() => {
  fs.rmSync(sharedRoot, { recursive: true, force: true });
});
