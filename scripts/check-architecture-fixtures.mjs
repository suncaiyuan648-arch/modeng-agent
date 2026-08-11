import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  analyzeModule,
  analyzePublicApi,
  evaluateContractChanges,
  findCircularDependencies,
} from './architecture-guard.mjs';
import { repositoryRoot } from './repository.mjs';

const fixtureRoot = path.join(repositoryRoot, 'tests', 'architecture-fixtures');

async function fixtureFiles(directory) {
  return (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(directory, entry.name))
    .sort();
}

function moduleFiles(files = {}) {
  return Object.entries(files).map(([filePath, content]) => ({ path: filePath, content }));
}

function runFixture(fixture) {
  switch (fixture.kind) {
    case 'module':
      return analyzeModule({
        module: fixture.module,
        manifest: fixture.manifest,
        packageJson: fixture.packageJson ?? {},
        files: moduleFiles(fixture.files),
      });
    case 'public-api':
      return analyzePublicApi({
        module: fixture.module,
        manifest: fixture.manifest,
        packageJson: fixture.packageJson ?? {},
        indexSource: fixture.indexSource ?? '',
        indexExists: fixture.indexExists ?? true,
      });
    case 'graph':
      return [findCircularDependencies(fixture.modules)].filter(Boolean);
    case 'contract':
      return evaluateContractChanges({
        files: fixture.files ?? [],
        proposals: fixture.proposals ?? [],
      });
    default:
      throw new Error(`ARCH_FIXTURE_UNKNOWN unsupported fixture kind ${fixture.kind}`);
  }
}

for (const category of ['valid', 'invalid']) {
  const directory = path.join(fixtureRoot, category);
  for (const file of await fixtureFiles(directory)) {
    const fixture = JSON.parse(await readFile(file, 'utf8'));
    const violations = runFixture(fixture);
    const codes = violations.map((violation) => violation.code);
    const relative = path.relative(repositoryRoot, file).replaceAll('\\', '/');

    if (category === 'valid') {
      if (codes.length > 0) {
        throw new Error(`ARCH_FIXTURE_UNEXPECTED ${relative} produced ${codes.join(', ')}`);
      }
      continue;
    }

    if (codes.length !== 1 || codes[0] !== fixture.expectedCode) {
      throw new Error(
        `ARCH_FIXTURE_MISMATCH ${relative} expected ${fixture.expectedCode}, got ${codes.join(', ') || 'none'}`,
      );
    }
  }
}

const validCount = (await fixtureFiles(path.join(fixtureRoot, 'valid'))).length;
const invalidCount = (await fixtureFiles(path.join(fixtureRoot, 'invalid'))).length;
console.info(`Architecture fixture checks passed (${validCount} valid, ${invalidCount} invalid).`);
