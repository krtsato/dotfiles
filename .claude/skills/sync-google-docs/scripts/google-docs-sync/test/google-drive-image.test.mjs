import assert from 'node:assert/strict';
import test from 'node:test';
import { assertPublicTemporaryImageAccess } from '../scripts/google-drive-image.mjs';

test('temporary public image access requires explicit acknowledgement', () => {
  assert.throws(
    () => assertPublicTemporaryImageAccess(false),
    /allowPublicTemporaryImages=true/,
  );
  assert.doesNotThrow(() => assertPublicTemporaryImageAccess(true));
});
