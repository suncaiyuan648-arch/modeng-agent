import path from 'node:path';

export const ARCHITECTURE_CODES = Object.freeze({
  DEEP_IMPORT: 'ARCH001',
  FORBIDDEN_DEPENDENCY: 'ARCH002',
  LAYER_BOUNDARY: 'ARCH003',
  DOMAIN_INFRASTRUCTURE_LEAK: 'ARCH004',
  CAPABILITY_INFRASTRUCTURE_LEAK: 'ARCH005',
  UNAUTHORIZED_CONTRACT_CHANGE: 'ARCH006',
  UNOWNED_DATABASE_ACCESS: 'ARCH007',
  CIRCULAR_DEPENDENCY: 'ARCH008',
  INVALID_PUBLIC_EXPORT: 'ARCH009',
  MANIFEST_CONTRACT_MISMATCH: 'ARCH010',
  ARCHITECTURE_REVIEW_REQUIRED: 'ARCH011',
});

export const infrastructurePackages = new Set([
  '@prisma/client',
  'bullmq',
  'ioredis',
  'redis',
  'openai',
  '@anthropic-ai/sdk',
  '@google/generative-ai',
  '@aws-sdk/client-s3',
  'ali-oss',
]);

const importPattern = /(?:from\s*|import\s*\(|require\s*\()\s*['"]([^'"]+)['"]/g;
const internalModulePattern = /^@modern-agent\/(.+)$/;
const sourceExtensions = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);
const tableWritePatterns = [
  /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+["`]?([A-Za-z_][A-Za-z0-9_]*)/gi,
  /\bprisma\.([A-Za-z_][A-Za-z0-9_]*)\.(?:create|update|delete|upsert|createMany|updateMany|deleteMany)\b/g,
];

export class ArchitectureViolation extends Error {
  constructor(code, message) {
    super(`${code} ${message}`);
    this.name = 'ArchitectureViolation';
    this.code = code;
  }
}

export function parseImports(content) {
  return [...content.matchAll(importPattern)].map((match) => match[1]);
}

export function classifyLayer(module) {
  if (module.group === 'apps') {
    return 'apps';
  }

  return module.relative.split('/')[0];
}

export function isCapability(module) {
  return module.group === 'packages' && module.relative.startsWith('backend/capabilities/');
}

export function internalTarget(specifier) {
  return internalModulePattern.exec(specifier)?.[1];
}

function targetLayer(target) {
  return target?.split('-')[0];
}

function sourcePath(file) {
  return file.path ?? file;
}

function addViolation(violations, code, message) {
  violations.push(new ArchitectureViolation(code, message));
}

export function analyzeModule({ module, manifest, packageJson, files }) {
  const violations = [];
  const layer = classifyLayer(module);
  const capability = isCapability(module);
  const allowedDependencies = new Set(manifest.allowedDependencies);
  const declaredDependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
    ...packageJson.peerDependencies,
  };
  const declaredInternalDependencies = new Set(
    Object.keys(declaredDependencies)
      .map((dependency) => internalTarget(dependency))
      .filter((target) => target !== undefined),
  );

  for (const dependency of Object.keys(declaredDependencies)) {
    const target = internalTarget(dependency);
    if (target !== undefined && !allowedDependencies.has(target)) {
      addViolation(
        violations,
        ARCHITECTURE_CODES.FORBIDDEN_DEPENDENCY,
        `${module.name} declares ${target} outside its manifest`,
      );
    }
  }

  for (const file of files) {
    const filePath = sourcePath(file);
    const imports = parseImports(file.content);

    for (const specifier of imports) {
      const target = internalTarget(specifier);

      if (target !== undefined) {
        if (specifier.split('/').length > 2) {
          addViolation(
            violations,
            ARCHITECTURE_CODES.DEEP_IMPORT,
            `${filePath} imports internal module path ${specifier}`,
          );
          continue;
        }

        const importedLayer = targetLayer(target);
        const forbiddenLayerDirection =
          (layer === 'frontend' &&
            (importedLayer === 'backend' || importedLayer === 'infrastructure')) ||
          (layer === 'backend' && importedLayer === 'frontend') ||
          (layer === 'shared' && importedLayer !== 'shared') ||
          (layer === 'infrastructure' && importedLayer === 'frontend') ||
          (module.group === 'apps' &&
            module.name === 'web' &&
            (importedLayer === 'backend' || importedLayer === 'infrastructure')) ||
          (module.group === 'apps' &&
            (module.name === 'api' || module.name === 'worker') &&
            importedLayer === 'frontend');

        if (forbiddenLayerDirection) {
          addViolation(
            violations,
            ARCHITECTURE_CODES.LAYER_BOUNDARY,
            `${filePath} imports ${specifier} across a frozen layer boundary`,
          );
          continue;
        }

        if (importedLayer === 'infrastructure' && capability) {
          addViolation(
            violations,
            ARCHITECTURE_CODES.CAPABILITY_INFRASTRUCTURE_LEAK,
            `${filePath} imports infrastructure module ${specifier}`,
          );
          continue;
        }

        if (importedLayer === 'infrastructure' && layer === 'backend') {
          addViolation(
            violations,
            ARCHITECTURE_CODES.DOMAIN_INFRASTRUCTURE_LEAK,
            `${filePath} imports infrastructure module ${specifier}`,
          );
          continue;
        }

        if (!allowedDependencies.has(target) || !declaredInternalDependencies.has(target)) {
          addViolation(
            violations,
            ARCHITECTURE_CODES.MANIFEST_CONTRACT_MISMATCH,
            `${filePath} imports ${target}, but manifest/package dependencies do not declare it`,
          );
        }
        continue;
      }

      if (infrastructurePackages.has(specifier)) {
        if (capability) {
          addViolation(
            violations,
            ARCHITECTURE_CODES.CAPABILITY_INFRASTRUCTURE_LEAK,
            `${filePath} imports ${specifier} directly from a Capability`,
          );
        } else if (
          layer === 'backend' ||
          (module.group === 'apps' && (module.name === 'api' || module.name === 'worker'))
        ) {
          addViolation(
            violations,
            ARCHITECTURE_CODES.DOMAIN_INFRASTRUCTURE_LEAK,
            `${filePath} imports infrastructure dependency ${specifier}`,
          );
        }
      }
    }

    if (
      (layer === 'frontend' || (module.group === 'apps' && module.name === 'web')) &&
      module.name !== 'realtime' &&
      (/\bEventSource\b/.test(file.content) || /text\/event-stream/.test(file.content))
    ) {
      addViolation(
        violations,
        ARCHITECTURE_CODES.LAYER_BOUNDARY,
        `${filePath} handles SSE outside the realtime module`,
      );
    }

    if (layer !== 'infrastructure') {
      for (const pattern of tableWritePatterns) {
        pattern.lastIndex = 0;
        for (const match of file.content.matchAll(pattern)) {
          const table = match[1];
          if (table !== undefined && !manifest.ownsTables.includes(table)) {
            addViolation(
              violations,
              ARCHITECTURE_CODES.UNOWNED_DATABASE_ACCESS,
              `${filePath} writes unowned table ${table}`,
            );
          }
        }
      }
    }
  }

  return violations;
}

export function findCircularDependencies(modules) {
  const known = new Set(modules.map((module) => module.manifest.name));
  const graph = new Map();

  for (const module of modules) {
    const targets = new Set();
    const packageJson = module.packageJson ?? {};
    const dependencies = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
      ...packageJson.peerDependencies,
    };

    for (const dependency of Object.keys(dependencies)) {
      const target = internalTarget(dependency);
      if (target !== undefined && known.has(target)) {
        targets.add(target);
      }
    }

    for (const file of module.files ?? []) {
      for (const specifier of parseImports(file.content)) {
        const target = internalTarget(specifier);
        if (target !== undefined && known.has(target)) {
          targets.add(target);
        }
      }
    }

    graph.set(module.manifest.name, targets);
  }

  const visiting = new Set();
  const visited = new Set();
  const stack = [];

  function visit(name) {
    if (visiting.has(name)) {
      const start = stack.indexOf(name);
      const cycle = [...stack.slice(start), name].join(' -> ');
      return new ArchitectureViolation(
        ARCHITECTURE_CODES.CIRCULAR_DEPENDENCY,
        `module dependency cycle detected: ${cycle}`,
      );
    }
    if (visited.has(name)) {
      return undefined;
    }

    visiting.add(name);
    stack.push(name);
    for (const target of graph.get(name) ?? []) {
      const violation = visit(target);
      if (violation !== undefined) {
        return violation;
      }
    }
    stack.pop();
    visiting.delete(name);
    visited.add(name);
    return undefined;
  }

  for (const name of graph.keys()) {
    const violation = visit(name);
    if (violation !== undefined) {
      return violation;
    }
  }

  return undefined;
}

export function analyzePublicApi({
  module,
  manifest,
  packageJson,
  indexSource,
  indexExists = true,
}) {
  const violations = [];

  if (module.group === 'apps') {
    if (manifest.publicExports.length !== 0) {
      addViolation(
        violations,
        ARCHITECTURE_CODES.INVALID_PUBLIC_EXPORT,
        `${module.name} must not publish package exports`,
      );
    }
    return violations;
  }

  if (!indexExists) {
    addViolation(
      violations,
      ARCHITECTURE_CODES.INVALID_PUBLIC_EXPORT,
      `${module.name} is missing src/index.ts`,
    );
  }

  const exportsObject = packageJson.exports ?? {};
  const exportKeys = Object.keys(exportsObject).sort();
  const manifestKeys = [...manifest.publicExports].sort();
  if (
    exportsObject['.'] === undefined ||
    JSON.stringify(exportKeys) !== JSON.stringify(manifestKeys)
  ) {
    addViolation(
      violations,
      ARCHITECTURE_CODES.INVALID_PUBLIC_EXPORT,
      `${module.name} package exports do not match its manifest`,
    );
  }

  if (exportKeys.some((key) => key.includes('/internal'))) {
    addViolation(
      violations,
      ARCHITECTURE_CODES.INVALID_PUBLIC_EXPORT,
      `${module.name} exposes an internal package entry`,
    );
  }

  if (/from\s+['"][^'"]*\/internal\//.test(indexSource ?? '')) {
    addViolation(
      violations,
      ARCHITECTURE_CODES.INVALID_PUBLIC_EXPORT,
      `${module.name} re-exports internal code from its public entry`,
    );
  }

  return violations;
}

const requiredProposalFields = [
  /^#\s+CR-\S+/mu,
  /^-\s+Contract owner[:：]\s*\S+/mu,
  /^-\s+Requested by[:：]\s*\S+/mu,
  /^-\s+Current version[:：]\s*\S+/mu,
  /^-\s+Proposed version[:：]\s*\S+/mu,
  /^-\s+Compatibility[:：]\s*(?:patch|additive-minor|breaking-major)\s*$/mu,
  /^##\s+Problem\s*$/mu,
  /^##\s+Proposed change\s*$/mu,
  /^##\s+Compatibility and affected modules\s*$/mu,
  /^##\s+Fixtures and conformance\s*$/mu,
  /^##\s+Migration \/ rollout \/ rollback\s*$/mu,
];

export function validateContractChangeProposal(file, content) {
  const errors = [];
  if (!/^CCR-\d{4,}\.md$/u.test(path.basename(file))) {
    errors.push(`${file} must use CCR-####.md naming`);
  }
  for (const field of requiredProposalFields) {
    if (!field.test(content)) {
      errors.push(`${file} is missing a required Contract Change Proposal field`);
    }
  }
  return errors;
}

const frozenContractPattern =
  /^(?:packages\/shared\/contracts\/|packages\/(?:frontend|backend|infrastructure)\/.*\/src\/index\.ts$|packages\/.*(?:contract|state[-_]machine|operation-status).*\.(?:ts|tsx|mts|cts|json))/u;

function isFrozenContractPath(file) {
  return frozenContractPattern.test(file);
}

function isManifestPath(file) {
  return file.endsWith('/module.manifest.json') || file === 'module.manifest.json';
}

function isWorkPackageEvidence(file) {
  return /^docs\/work-packages\/WP-\d+[^/]*\.md$/u.test(file);
}

function isReviewEvidence(file) {
  return isWorkPackageEvidence(file) || /^docs\/adr\/ADR-\d+[^/]*\.md$/u.test(file);
}

export function evaluateContractChanges({ files, proposals = [] }) {
  const violations = [];
  const changedProposals = proposals.filter((proposal) => files.includes(proposal.file));
  const validProposal = changedProposals.find(
    (proposal) => validateContractChangeProposal(proposal.file, proposal.content).length === 0,
  );
  const contractChanged = files.some(isFrozenContractPath);
  const manifestChanged = files.some(isManifestPath);

  if (contractChanged && validProposal === undefined) {
    addViolation(
      violations,
      ARCHITECTURE_CODES.UNAUTHORIZED_CONTRACT_CHANGE,
      'frozen Contract changed without a valid Contract Change Proposal',
    );
  }

  if (manifestChanged && !files.some(isReviewEvidence)) {
    addViolation(
      violations,
      ARCHITECTURE_CODES.ARCHITECTURE_REVIEW_REQUIRED,
      'module.manifest.json changed without Work Package or ADR review evidence',
    );
  }

  return violations;
}

export { sourceExtensions };
