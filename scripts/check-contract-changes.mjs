import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

import { evaluateContractChanges, validateContractChangeProposal } from './architecture-guard.mjs';
import { repositoryRoot } from './repository.mjs';

function git(...args) {
  return spawnSync('git', args, { cwd: repositoryRoot, encoding: 'utf8' });
}

const baseline = process.env['ARCH_BASELINE'] ?? 'bootstrap-v0.1.0';
const baselineRef = git('rev-parse', '--verify', `${baseline}^{commit}`);
if (baselineRef.status !== 0) {
  throw new Error(
    `ARCH_BASELINE_MISSING baseline ${baseline} is unavailable; fetch tags or set ARCH_BASELINE`,
  );
}

const diff = git('diff', '--name-only', '--diff-filter=ACMR', baseline);
if (diff.status !== 0) {
  throw new Error(`ARCH_GIT_DIFF ${diff.stderr.trim()}`);
}

const files = diff.stdout.split(/\r?\n/u).filter(Boolean);
const proposals = [];
for (const file of files.filter((candidate) =>
  /^docs\/contract-changes\/CCR-\d+\.md$/u.test(candidate),
)) {
  const content = await readFile(path.join(repositoryRoot, file), 'utf8');
  proposals.push({ file, content });
}

const violations = evaluateContractChanges({ files, proposals });
if (violations.length > 0) {
  throw violations[0];
}

const invalidProposal = proposals
  .map((proposal) => validateContractChangeProposal(proposal.file, proposal.content))
  .find((errors) => errors.length > 0);
if (invalidProposal !== undefined) {
  throw new Error(`ARCH006 PUBLIC_CONTRACT_UNAUTHORIZED_CHANGE ${invalidProposal.join('; ')}`);
}

console.info(`Contract change check passed against ${baseline}.`);
