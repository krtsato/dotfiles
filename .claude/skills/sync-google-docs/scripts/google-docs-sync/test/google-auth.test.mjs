import assert from 'node:assert/strict';
import test from 'node:test';
import { oauthCallbackOptions } from '../scripts/google-auth.mjs';

test('oauthCallbackOptions uses an ephemeral loopback callback by default', () => {
  assert.deepEqual(oauthCallbackOptions(''), { host: '127.0.0.1', port: 0 });
});

test('oauthCallbackOptions exposes a configured port for Docker forwarding', () => {
  assert.deepEqual(oauthCallbackOptions('8787'), { host: '0.0.0.0', port: 8787 });
  assert.throws(() => oauthCallbackOptions('0'), /between 1 and 65535/);
});
