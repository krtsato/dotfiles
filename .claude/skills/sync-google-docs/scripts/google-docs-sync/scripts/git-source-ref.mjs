import { execFileSync } from 'node:child_process';
import path from 'node:path';

export function gitObjectPath(repoRoot, absolutePath, relativePath = path.relative) {
  return relativePath(repoRoot, absolutePath).replaceAll('\\', '/');
}

export function assertSourceRef(images, sourceRef, options = {}) {
  if (!sourceRef) return;
  const { sourceDir, repoRoot } = options;
  if (!sourceDir || !repoRoot) {
    throw new Error('sourceDir and repoRoot are required when sourceRef is set.');
  }
  for (const image of images) {
    const absolutePath = path.join(sourceDir, image);
    const repoPath = gitObjectPath(repoRoot, absolutePath);
    const localHash = execFileSync('git', ['hash-object', absolutePath], { encoding: 'utf8' }).trim();
    const refHash = execFileSync('git', ['rev-parse', `${sourceRef}:${repoPath}`], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim();
    if (localHash !== refHash) throw new Error(`Local image does not match ${sourceRef}: ${repoPath}`);
  }
}
