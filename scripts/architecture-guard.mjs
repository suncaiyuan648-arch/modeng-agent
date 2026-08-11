import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';

import { repositoryRoot } from './repository.mjs';

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

export class ArchitectureRangeError extends Error {
  constructor(code, message) {
    super(`${code} ${message}`);
    this.name = 'ArchitectureRangeError';
    this.code = code;
  }
}

function defaultGit(args, cwd = repositoryRoot) {
  return spawnSync('git', args, { cwd, encoding: 'utf8' });
}

function gitOutput(result, description) {
  if (result.status !== 0) {
    throw new ArchitectureRangeError(
      'ARCH_GIT_RANGE',
      `${description}: ${(result.stderr ?? '').trim() || 'git command failed'}`,
    );
  }
  return result.stdout.trim();
}

function verifyRef(runGit, ref) {
  const result = runGit(['rev-parse', '--verify', `${ref}^{commit}`]);
  return result.status === 0 ? result.stdout.trim() : undefined;
}

export function computeChangeRange({
  env = process.env,
  runGit = (args) => defaultGit(args),
} = {}) {
  const pullRequestBase = env.GITHUB_BASE_SHA?.trim() || env.ARCH_BASE_SHA?.trim();
  let baseRef;
  let source;

  if (pullRequestBase !== undefined && pullRequestBase !== '') {
    baseRef = verifyRef(runGit, pullRequestBase);
    if (baseRef === undefined) {
      throw new ArchitectureRangeError(
        'ARCH_BASELINE_MISSING',
        `PR base ${pullRequestBase} is unavailable; fetch the PR base commit`,
      );
    }
    source = 'pull-request-base';
  } else {
    for (const candidate of ['origin/main', 'main']) {
      const verified = verifyRef(runGit, candidate);
      if (verified !== undefined) {
        baseRef = verified;
        source = `merge-base(${candidate})`;
        break;
      }
    }

    if (baseRef === undefined) {
      throw new ArchitectureRangeError(
        'ARCH_BASELINE_MISSING',
        'no PR base SHA or local main/origin-main ref is available; bootstrap-v0.1.0 is not a valid ordinary WP baseline',
      );
    }

    const mergeBase = gitOutput(
      runGit(['merge-base', 'HEAD', baseRef]),
      'git merge-base HEAD and main',
    );
    if (mergeBase === '') {
      throw new ArchitectureRangeError(
        'ARCH_BASELINE_MISSING',
        `cannot compute merge-base between HEAD and ${baseRef}`,
      );
    }
    baseRef = mergeBase;
  }

  const files = gitOutput(
    runGit(['diff', '--name-only', '--diff-filter=ACMR', baseRef]),
    `git diff from ${baseRef}`,
  )
    .split(/\r?\n/u)
    .map((file) => file.trim().replaceAll('\\', '/'))
    .filter(Boolean);

  return Object.freeze({ baseRef, source, files });
}

export function exactPathInAuthorization(content, targetPath) {
  const normalizedTarget = targetPath.replaceAll('\\', '/');
  return (content ?? '').split(/\r?\n/u).some((line) => {
    const normalized = line.trim().replaceAll('`', '');
    return normalized === `- ${normalizedTarget}` || normalized === normalizedTarget;
  });
}

function authorizationSection(content) {
  const source = content ?? '';
  const header = /^##\s+Authorization\s*$/mu.exec(source);
  if (header === null) {
    return '';
  }
  const sectionStart = header.index + header[0].length;
  const remainder = source.slice(sectionStart);
  const nextHeading = /^##\s+/mu.exec(remainder);
  return remainder.slice(0, nextHeading?.index ?? remainder.length);
}

export function isCurrentAuthorizationDocument({ file, files, content, targetPath }) {
  return (
    files.includes(file) &&
    authorizationSection(content) !== '' &&
    exactPathInAuthorization(authorizationSection(content), targetPath)
  );
}

export function findCurrentAuthorization({ files, documents = [], targetPath, kind }) {
  const pattern =
    kind === 'ccr'
      ? /^docs\/contract-changes\/CCR-\d+\.md$/u
      : /^docs\/work-packages\/WP-\d+[^/]*\.md$/u;
  return documents.find(
    (document) =>
      pattern.test(document.file) &&
      isCurrentAuthorizationDocument({
        file: document.file,
        files,
        content: document.content,
        targetPath,
      }),
  );
}

export function mergeBaseAuthorization({ files, documents = [], targetPaths, kind }) {
  return targetPaths.every(
    (targetPath) => findCurrentAuthorization({ files, documents, targetPath, kind }) !== undefined,
  );
}

function sourceFile(content, fileName = 'fixture.ts') {
  const scriptKind = /\.tsx?$/u.test(fileName) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, true, scriptKind);
}

function isStringLiteral(node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

function collectModuleSpecifiers(content, fileName = 'fixture.ts', includeExports = false) {
  const result = [];
  const file = sourceFile(content, fileName);

  function visit(node) {
    if (ts.isImportDeclaration(node) && isStringLiteral(node.moduleSpecifier)) {
      result.push(node.moduleSpecifier.text);
    }

    if (includeExports && ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined) {
      if (isStringLiteral(node.moduleSpecifier)) {
        result.push(node.moduleSpecifier.text);
      }
    }

    if (ts.isCallExpression(node) && node.arguments.length === 1) {
      const argument = node.arguments[0];
      if (!isStringLiteral(argument)) {
        ts.forEachChild(node, visit);
        return;
      }

      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
      if (isDynamicImport || isRequire) {
        result.push(argument.text);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(file);
  return result;
}

export function parseImports(content, fileName = 'fixture.ts') {
  return collectModuleSpecifiers(content, fileName, true);
}

export function parseExports(content, fileName = 'fixture.ts') {
  const file = sourceFile(content, fileName);
  const result = [];

  function visit(node) {
    if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined) {
      if (isStringLiteral(node.moduleSpecifier)) {
        result.push(node.moduleSpecifier.text);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(file);
  return result;
}

export function isDeepImportSpecifier(specifier) {
  const segments = specifier.split('/').filter((segment) => segment !== '.' && segment !== '..');
  return segments.some((segment) => segment === 'internal');
}

export function isReactSpecifier(specifier) {
  return specifier === 'react' || specifier === 'react-dom' || specifier.startsWith('react/');
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
    const imports = parseImports(file.content, filePath);

    for (const specifier of imports) {
      const target = internalTarget(specifier);

      if (
        (layer === 'backend' || layer === 'shared' || layer === 'infrastructure') &&
        isReactSpecifier(specifier)
      ) {
        addViolation(
          violations,
          ARCHITECTURE_CODES.LAYER_BOUNDARY,
          `${filePath} imports React from a non-frontend module`,
        );
        continue;
      }

      if (isDeepImportSpecifier(specifier)) {
        addViolation(
          violations,
          ARCHITECTURE_CODES.DEEP_IMPORT,
          `${filePath} imports internal module path ${specifier}`,
        );
        continue;
      }

      if (target !== undefined) {
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
      for (const specifier of parseImports(file.content, sourcePath(file))) {
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

  if (parseExports(indexSource ?? '', 'src/index.ts').some(isDeepImportSpecifier)) {
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

export function isFrozenContractPath(file) {
  return frozenContractPattern.test(file);
}

export function isManifestPath(file) {
  return file.endsWith('/module.manifest.json') || file === 'module.manifest.json';
}

export function evaluateContractChanges({ files, proposals = [], workPackages = [] }) {
  const violations = [];
  const contractPaths = files.filter(isFrozenContractPath);
  const manifestPaths = files.filter(isManifestPath);

  const authorizedContractChange =
    contractPaths.length > 0 &&
    mergeBaseAuthorization({
      files,
      documents: proposals.filter((proposal) =>
        /^docs\/contract-changes\/CCR-\d+\.md$/u.test(proposal.file),
      ),
      targetPaths: contractPaths,
      kind: 'ccr',
    }) &&
    contractPaths.every((contractPath) =>
      proposals.some(
        (proposal) =>
          files.includes(proposal.file) &&
          validateContractChangeProposal(proposal.file, proposal.content).length === 0 &&
          mergeBaseAuthorization({
            files,
            documents: [proposal],
            targetPaths: [contractPath],
            kind: 'ccr',
          }),
      ),
    );

  const authorizedManifestChange =
    manifestPaths.length > 0 &&
    mergeBaseAuthorization({
      files,
      documents: workPackages.filter((document) =>
        /^docs\/work-packages\/WP-\d+[^/]*\.md$/u.test(document.file),
      ),
      targetPaths: manifestPaths,
      kind: 'wp',
    });

  if (contractPaths.length > 0 && !authorizedContractChange) {
    addViolation(
      violations,
      ARCHITECTURE_CODES.UNAUTHORIZED_CONTRACT_CHANGE,
      'frozen Contract changed without a valid current-range CCR authorizing each changed path',
    );
  }

  if (manifestPaths.length > 0 && !authorizedManifestChange) {
    addViolation(
      violations,
      ARCHITECTURE_CODES.ARCHITECTURE_REVIEW_REQUIRED,
      'module.manifest.json changed without a current-range Work Package authorizing each changed manifest',
    );
  }

  return violations;
}

export { sourceExtensions };
