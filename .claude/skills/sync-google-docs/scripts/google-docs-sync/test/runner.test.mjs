import assert from 'node:assert/strict';
import { access, chmod, mkdtemp, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const runner = fileURLToPath(new URL('../../sync.sh', import.meta.url));

async function runWithFakeDocker(command, extraEnv = {}, useAbsoluteConfig = false) {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'google-docs-sync-runner-'));
  const fakeBin = path.join(temporaryDirectory, 'bin');
  const workspace = path.join(temporaryDirectory, 'workspace');
  const argumentsFile = path.join(temporaryDirectory, 'docker-arguments.txt');
  await mkdir(fakeBin);
  await mkdir(workspace);
  await mkdir(path.join(workspace, 'docs'));
  const configPath = path.join(workspace, 'docs', 'config.json');
  await writeFile(configPath, '{}\n');
  const docker = path.join(fakeBin, 'docker');
  await writeFile(
    docker,
    '#!/usr/bin/env bash\nprintf \'CALL\\n\' >> "$DOCKER_ARGUMENTS_FILE"\nprintf \'%s\\n\' "$@" >> "$DOCKER_ARGUMENTS_FILE"\n',
  );
  await chmod(docker, 0o755);

  const config = useAbsoluteConfig ? configPath : 'docs/config.json';
  const result = spawnSync(runner, [command, `--config=${config}`], {
    encoding: 'utf8',
    env: {
      ...process.env,
      ...extraEnv,
      PATH: `${fakeBin}:${process.env.PATH}`,
      DOCKER_ARGUMENTS_FILE: argumentsFile,
      GOOGLE_DOCS_SYNC_WORKSPACE: workspace,
    },
  });
  assert.equal(result.status, 0, result.stderr);
  return {
    arguments: await readFile(argumentsFile, 'utf8'),
    workspace: await realpath(workspace),
  };
}

test('runner mounts the selected workspace and forwards config', async () => {
  const result = await runWithFakeDocker('generate');
  assert.match(result.arguments, new RegExp(`\\n${result.workspace.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&')}:/workspace\\n`));
  assert.match(result.arguments, /--user\n\d+:\d+\n/);
  assert.match(result.arguments, /generate\n--config=\/workspace\/docs\/config\.json\n/);
  assert.doesNotMatch(result.arguments, /127\.0\.0\.1:/);
});

test('runner exposes the OAuth callback on host loopback only', async () => {
  const result = await runWithFakeDocker('pull-comments', {
    GOOGLE_OAUTH_CALLBACK_PORT: '9876',
  });
  assert.match(result.arguments, /127\.0\.0\.1:9876:9876/);
  assert.match(result.arguments, /GOOGLE_OAUTH_CALLBACK_PORT=9876/);
  assert.match(result.arguments, /pull-comments\n--config=\/workspace\/docs\/config\.json\n/);
});

test('runner converts an absolute workspace config path for the container', async () => {
  const result = await runWithFakeDocker('generate', {}, true);
  assert.match(result.arguments, /--config=\/workspace\/docs\/config\.json/);
});


test('runner reports usage when filtering leaves no command', () => {
  for (const args of [[], ['--config=docs/config.json']]) {
    const result = spawnSync(runner, args, { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /^Usage:/);
    assert.doesNotMatch(result.stderr, /unbound variable/);
  }
});


test('runner removes the temporary credentials mount after generation', async () => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'google-docs-sync-empty-auth-'));
  const result = await runWithFakeDocker('generate', {
    GOOGLE_DOCS_SYNC_CREDENTIALS_DIR: path.join(temporaryDirectory, 'missing'),
  });
  const mount = result.arguments.match(/\n([^\n]+):\/credentials\n/);
  assert.ok(mount, 'expected a credentials mount');
  await assert.rejects(access(mount[1]), { code: 'ENOENT' });
});
