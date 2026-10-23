import fs from 'node:fs/promises';
import path from 'node:path';

function argument(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function requiredString(config, key) {
  if (typeof config[key] !== 'string' || !config[key]) throw new Error(`config.${key} must be a non-empty string.`);
}

function integer(config, key) {
  if (!Number.isInteger(config[key])) throw new Error(`config.${key} must be an integer.`);
}

function range(value, key) {
  if (!value || typeof value !== 'object') throw new Error(`config.${key} must be an object.`);
  integer(value, 'min');
  integer(value, 'max');
  if (value.min > value.max) throw new Error(`config.${key}.min must not exceed max.`);
}

export function validateConfig(config) {
  if (!config || typeof config !== 'object') throw new Error('config must be a JSON object.');
  if (config.version !== 1) throw new Error(`Unsupported config version: ${config.version}.`);
  for (const key of ['documentTitle', 'sourceDir', 'buildDir', 'indexFile']) requiredString(config, key);
  integer(config, 'imageWidthPt');
  if (config.imageWidthPt <= 0) throw new Error('config.imageWidthPt must be positive.');
  if (config.numberedHeadings !== undefined) {
    requiredString(config.numberedHeadings, 'prefix');
    range(config.numberedHeadings, 'numberedHeadings');
  }
  if (config.pdf !== undefined) {
    requiredString(config.pdf, 'outputFile');
    requiredString(config.pdf, 'creator');
    range(config.pdf.includeNumberedFiles, 'pdf.includeNumberedFiles');
  }
  if (config.labels !== undefined) {
    for (const key of ['tabReference', 'unresolvedReference', 'screenExamplesHeading', 'screenExample']) {
      requiredString(config.labels, key);
    }
  }
  if (config.commentReference !== undefined) {
    for (const key of ['label', 'directPattern', 'nearbyPattern']) {
      requiredString(config.commentReference, key);
    }
    for (const key of ['directPattern', 'nearbyPattern']) {
      try {
        new RegExp(config.commentReference[key], 'gi');
      } catch (error) {
        throw new Error(`config.commentReference.${key} must be a valid regular expression.`, { cause: error });
      }
    }
  }
  if (config.allowPublicTemporaryImages !== undefined && typeof config.allowPublicTemporaryImages !== 'boolean') {
    throw new Error('config.allowPublicTemporaryImages must be a boolean when set.');
  }
  for (const key of ['tabLinkDocumentId', 'screenLabelFile', 'screenDirectory', 'temporaryImagePrefix', 'repoRoot', 'stateDir']) {
    if (config[key] !== undefined && (typeof config[key] !== 'string' || !config[key])) {
      throw new Error(`config.${key} must be a non-empty string when set.`);
    }
  }
  return config;
}

export async function loadConfig() {
  const suppliedPath = argument('config') || process.env.GOOGLE_DOCS_SYNC_CONFIG;
  if (!suppliedPath) throw new Error('Set --config=<path> or GOOGLE_DOCS_SYNC_CONFIG.');
  const configPath = path.resolve(process.cwd(), suppliedPath);
  const configDir = path.dirname(configPath);
  const config = validateConfig(JSON.parse(await fs.readFile(configPath, 'utf8')));
  const resolve = (value) => path.resolve(configDir, value);
  return {
    config,
    configPath,
    configDir,
    sourceDir: resolve(config.sourceDir),
    buildDir: resolve(config.buildDir),
    stateDir: resolve(config.stateDir || '.'),
    repoRoot: config.repoRoot ? resolve(config.repoRoot) : null,
    screenDirectory: config.screenDirectory || 'screens',
    screenLabelFile: config.screenLabelFile ? resolve(config.screenLabelFile) : null,
  };
}
