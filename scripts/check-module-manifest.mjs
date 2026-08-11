import { readFile } from 'node:fs/promises';
import path from 'node:path';

import Ajv2020 from 'ajv/dist/2020.js';

import {
  fail,
  listWorkspaceModules,
  readJson,
  relativePath,
  repositoryRoot,
} from './repository.mjs';

const schemaPath = path.join(repositoryRoot, 'docs', 'governance', 'module-manifest.schema.json');
const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validate = ajv.compile(schema);
const modules = await listWorkspaceModules();
const stateOwners = new Map();
const tableOwners = new Map();

for (const module of modules) {
  const manifestPath = path.join(module.root, 'module.manifest.json');
  let manifest;

  try {
    manifest = await readJson(manifestPath);
  } catch (error) {
    fail('SCHEMA_MANIFEST_MISSING', `${relativePath(manifestPath)}: ${String(error)}`);
  }

  if (!validate(manifest)) {
    fail(
      'SCHEMA_MANIFEST_INVALID',
      `${relativePath(manifestPath)}: ${ajv.errorsText(validate.errors, { separator: '; ' })}`,
    );
  }

  const packageJson = await readJson(path.join(module.root, 'package.json'));
  if (packageJson.name !== `@modern-agent/${manifest.name}`) {
    fail(
      'ARCH_PACKAGE_NAME',
      `${module.group}/${module.relative} has package name ${packageJson.name}`,
    );
  }

  for (const state of manifest.ownsState) {
    if (stateOwners.has(state)) {
      fail(
        'ARCH_STATE_OWNER',
        `${state} is owned by ${stateOwners.get(state)} and ${manifest.name}`,
      );
    }
    stateOwners.set(state, manifest.name);
  }

  for (const table of manifest.ownsTables) {
    if (tableOwners.has(table)) {
      fail(
        'ARCH_TABLE_OWNER',
        `${table} is owned by ${tableOwners.get(table)} and ${manifest.name}`,
      );
    }
    tableOwners.set(table, manifest.name);
  }
}

console.info(`Validated ${modules.length} module manifests.`);
