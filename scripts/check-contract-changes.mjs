import { spawnSync } from 'node:child_process';

function git(...args) {
  return spawnSync('git', args, { encoding: 'utf8' });
}

const head = git('rev-parse', '--verify', 'HEAD');
if (head.status !== 0) {
  console.info('Contract change check skipped: repository has no baseline commit yet.');
  process.exit(0);
}

const diff = git('diff', '--name-only', 'HEAD');
if (diff.status !== 0) {
  throw new Error(`ARCH_GIT_DIFF ${diff.stderr.trim()}`);
}

const files = diff.stdout.split(/\r?\n/u).filter(Boolean);
const contractChanged = files.some((file) => file.startsWith('packages/contracts/src/'));
const proposalChanged = files.some(
  (file) => file.startsWith('docs/contract-changes/') && !file.endsWith('.gitkeep'),
);

if (contractChanged && !proposalChanged) {
  throw new Error(
    'ARCH_CONTRACT_CHANGE packages/contracts changed without a Contract Change Proposal',
  );
}

console.info('Contract change check passed.');
