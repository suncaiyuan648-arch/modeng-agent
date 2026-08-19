import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  computeChangeRange,
  evaluateContractChanges,
  readBaseGovernanceBaseline,
} from './architecture-guard.mjs';
import { repositoryRoot } from './repository.mjs';

function defaultGit(args, root = repositoryRoot) {
  return spawnSync('git', args, { cwd: root, encoding: 'utf8' });
}

function gitOutput(result, description) {
  if (result.status !== 0) {
    throw new Error(`ARCH_GIT_RANGE ${description}: ${(result.stderr ?? '').trim()}`);
  }
  return result.stdout.trim();
}

export async function readBaseAuthorizationDocuments(baseRef, runGit = defaultGit) {
  const tree = gitOutput(
    runGit(['ls-tree', '-r', '--name-only', baseRef, '--', 'docs/contract-changes', 'docs/adr']),
    `git ls-tree ${baseRef}`,
  );
  const documents = [];
  for (const file of tree.split(/\r?\n/u).filter(Boolean)) {
    if (!/^docs\/(?:contract-changes\/CCR-\d+|adr\/ADR-\d+[^/]*)\.md$/u.test(file)) {
      continue;
    }
    const content = gitOutput(
      runGit(['show', `${baseRef}:${file}`]),
      `git show ${baseRef}:${file}`,
    );
    documents.push({ file: file.replaceAll('\\', '/'), content });
  }
  return documents;
}

const ARCHITECTURE_FIELDS = Object.freeze([
  'schemaVersion',
  'name',
  'kind',
  'ownsState',
  'ownsTables',
  'readOnlyTables',
  'migrationScopes',
  'allowedDependencies',
]);

function stableValue(value) {
  return JSON.stringify(value ?? null);
}

function readJsonOrUndefined(content) {
  try {
    return JSON.parse(content);
  } catch {
    return undefined;
  }
}

export function detectManifestDecisionPaths({ entries, baseRef, runGit, root = repositoryRoot }) {
  const architectureChangePaths = [];
  const contractChangePaths = [];
  const manifestPaths = [
    ...new Set(
      entries
        .flatMap((entry) => entry.paths ?? [])
        .filter(
          (file) => file.endsWith('/module.manifest.json') || file === 'module.manifest.json',
        ),
    ),
  ];

  for (const file of manifestPaths) {
    const baseResult = runGit(['show', `${baseRef}:${file}`]);
    const currentPath = path.join(root, file);
    const baseManifest =
      baseResult.status === 0 ? readJsonOrUndefined(baseResult.stdout) : undefined;
    const headManifest = existsSync(currentPath)
      ? readJsonOrUndefined(readFileSync(currentPath, 'utf8'))
      : undefined;

    if (baseManifest === undefined || headManifest === undefined) {
      architectureChangePaths.push(file);
      continue;
    }
    if (
      ARCHITECTURE_FIELDS.some(
        (field) => stableValue(baseManifest[field]) !== stableValue(headManifest[field]),
      )
    ) {
      architectureChangePaths.push(file);
    }
    if (stableValue(baseManifest.contracts) !== stableValue(headManifest.contracts)) {
      contractChangePaths.push(file);
    }
  }

  return { architectureChangePaths, contractChangePaths };
}

export async function runContractChangeCheck({ env, runGit, root = repositoryRoot } = {}) {
  const gitRunner = runGit ?? ((args) => defaultGit(args, root));
  const range = computeChangeRange({ env, runGit: gitRunner });
  readBaseGovernanceBaseline(range.baseRef, gitRunner);
  const baseDocuments = await readBaseAuthorizationDocuments(range.baseRef, gitRunner);
  const decisionPaths = detectManifestDecisionPaths({
    entries: range.entries,
    baseRef: range.baseRef,
    runGit: gitRunner,
    root,
  });
  const violations = evaluateContractChanges({
    entries: range.entries,
    baseDocuments,
    ...decisionPaths,
  });
  if (violations.length > 0) {
    throw violations[0];
  }
  return range;
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const range = await runContractChangeCheck();
  console.info(`Contract change check passed against ${range.baseRef} (${range.source}).`);
}
