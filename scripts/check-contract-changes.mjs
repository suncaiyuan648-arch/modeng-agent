import { spawnSync } from 'node:child_process';
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
    runGit([
      'ls-tree',
      '-r',
      '--name-only',
      baseRef,
      '--',
      'docs/work-packages',
      'docs/contract-changes',
      'docs/adr',
      'docs/governance',
    ]),
    `git ls-tree ${baseRef}`,
  );
  const documents = [];
  for (const file of tree.split(/\r?\n/u).filter(Boolean)) {
    if (
      !/^docs\/(?:work-packages\/WP-\d+[^/]*|contract-changes\/CCR-\d+|adr\/ADR-\d+[^/]*|governance\/GOV-\d+[^/]*)\.md$/u.test(
        file,
      )
    ) {
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

export async function runContractChangeCheck({ env, runGit, root = repositoryRoot } = {}) {
  const gitRunner = runGit ?? ((args) => defaultGit(args, root));
  const range = computeChangeRange({ env, runGit: gitRunner });
  readBaseGovernanceBaseline(range.baseRef, gitRunner);
  const baseDocuments = await readBaseAuthorizationDocuments(range.baseRef, gitRunner);
  const violations = evaluateContractChanges({
    entries: range.entries,
    baseDocuments,
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
