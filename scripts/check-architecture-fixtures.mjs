import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

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

export function runFixture(fixture) {
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
        workPackages: fixture.workPackages ?? [],
      });
    default:
      throw new Error(`ARCH_FIXTURE_UNKNOWN unsupported fixture kind ${fixture.kind}`);
  }
}

export function evaluateFixtureResults(results) {
  const failures = [];
  for (const result of results) {
    const codes = result.violations.map((violation) => violation.code);
    if (result.category === 'valid') {
      if (codes.length > 0) {
        failures.push(`ARCH_FIXTURE_UNEXPECTED ${result.file} produced ${codes.join(', ')}`);
      }
      continue;
    }

    if (codes.length !== 1 || codes[0] !== result.expectedCode) {
      failures.push(
        `ARCH_FIXTURE_MISMATCH ${result.file} expected ${result.expectedCode}, got ${codes.join(', ') || 'none'}`,
      );
    }
  }
  return failures;
}

export async function runArchitectureFixtures(root = fixtureRoot) {
  const results = [];
  for (const category of ['valid', 'invalid']) {
    const directory = path.join(root, category);
    for (const file of await fixtureFiles(directory)) {
      const fixture = JSON.parse(await readFile(file, 'utf8'));
      results.push({
        category,
        file: path.relative(repositoryRoot, file).replaceAll('\\', '/'),
        expectedCode: fixture.expectedCode,
        violations: runFixture(fixture),
      });
    }
  }

  const failures = evaluateFixtureResults(results);
  if (failures.length > 0) {
    throw new Error(failures.join('\n'));
  }
  return results;
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const results = await runArchitectureFixtures();
  const validCount = results.filter((result) => result.category === 'valid').length;
  const invalidCount = results.filter((result) => result.category === 'invalid').length;
  console.info(
    `Architecture fixture checks passed (${validCount} valid, ${invalidCount} invalid).`,
  );
}
