import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  computeChangeRange,
  evaluateContractChanges,
  validateContractChangeProposal,
} from './architecture-guard.mjs';
import { repositoryRoot } from './repository.mjs';

export async function readAuthorizationDocuments(files, root = repositoryRoot) {
  const documents = [];
  for (const file of files) {
    if (!/^docs\/(?:contract-changes\/CCR-\d+|work-packages\/WP-\d+[^/]*)\.md$/u.test(file)) {
      continue;
    }
    documents.push({ file, content: await readFile(path.join(root, file), 'utf8') });
  }
  return documents;
}

export async function runContractChangeCheck({ env, runGit, root = repositoryRoot } = {}) {
  const range = computeChangeRange({ env, runGit });
  const documents = await readAuthorizationDocuments(range.files, root);
  const proposals = documents.filter((document) =>
    /^docs\/contract-changes\/CCR-\d+\.md$/u.test(document.file),
  );
  const workPackages = documents.filter((document) =>
    /^docs\/work-packages\/WP-\d+[^/]*\.md$/u.test(document.file),
  );

  const violations = evaluateContractChanges({
    files: range.files,
    proposals,
    workPackages,
  });
  if (violations.length > 0) {
    throw violations[0];
  }

  const invalidProposal = proposals
    .map((proposal) => validateContractChangeProposal(proposal.file, proposal.content))
    .find((errors) => errors.length > 0);
  if (invalidProposal !== undefined) {
    throw new Error(`ARCH006 PUBLIC_CONTRACT_UNAUTHORIZED_CHANGE ${invalidProposal.join('; ')}`);
  }

  return range;
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const range = await runContractChangeCheck();
  console.info(`Contract change check passed against ${range.baseRef} (${range.source}).`);
}
