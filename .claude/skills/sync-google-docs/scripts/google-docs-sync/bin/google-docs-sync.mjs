#!/usr/bin/env node

const commands = new Map([
  ['generate', { script: 'generate.mjs', generate: false }],
  ['publish', { script: 'upload.mjs', generate: true }],
  ['pull-comments', { script: 'pull-comments.mjs', generate: true }],
  ['apply-patches', { script: 'apply-patches.mjs', generate: false }],
  ['sync-images', { script: 'sync-images.mjs', generate: true }],
  ['export-pdf', { script: 'export-pdf.mjs', generate: true }],
]);

const command = process.argv[2];
const definition = commands.get(command);
if (!definition) {
  console.error(`Usage: google-docs-sync <${[...commands.keys()].join('|')}> --config=<path> [options]`);
  process.exitCode = 1;
} else {
  process.argv.splice(2, 1);
  if (definition.generate) await import('../scripts/generate.mjs');
  await import(`../scripts/${definition.script}`);
}
