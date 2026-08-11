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
  UNSUPPORTED_MODULE_LOADING: 'ARCH012',
});

export const ARCHITECTURE_BASELINE_PATH = 'docs/governance/architecture-guard-baseline.json';

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

function normalizePath(file) {
  return file.replaceAll('\\', '/');
}

function parseDiffEntries(output) {
  return output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const fields = line.split(/\s+/u);
      const status = fields[0]?.[0];
      if (status === 'R' || status === 'C') {
        const oldPath = normalizePath(fields[1] ?? '');
        const newPath = normalizePath(fields[2] ?? '');
        return { status, oldPath, newPath, paths: [oldPath, newPath].filter(Boolean) };
      }
      const file = normalizePath(fields[1] ?? '');
      return {
        status,
        oldPath: status === 'D' ? file : undefined,
        newPath: status === 'D' ? undefined : file,
        paths: file ? [file] : [],
      };
    });
}

export function computeChangeRange({
  env = process.env,
  runGit = (args) => defaultGit(args),
} = {}) {
  const explicitBase = env.ARCH_BASE_SHA?.trim();
  if (explicitBase === undefined || explicitBase === '') {
    throw new ArchitectureRangeError(
      'ARCH_BASELINE_MISSING',
      'ARCH_BASE_SHA is required; protected checks do not infer a baseline from main, origin/main, tags, or HEAD',
    );
  }

  const baseRef = verifyRef(runGit, explicitBase);
  if (baseRef === undefined) {
    throw new ArchitectureRangeError(
      'ARCH_BASELINE_MISSING',
      `ARCH_BASE_SHA ${explicitBase} is unavailable; fetch the trusted base commit`,
    );
  }

  const diff = gitOutput(
    runGit(['diff', '--name-status', '-M', '--diff-filter=ACMRD', baseRef]),
    `git diff from ${baseRef}`,
  );
  const entries = parseDiffEntries(diff);
  const untrackedResult = runGit(['ls-files', '--others', '--exclude-standard']);
  if (untrackedResult.status === 0 && untrackedResult.stdout.trim() !== '') {
    for (const file of untrackedResult.stdout.split(/\r?\n/u).filter(Boolean)) {
      const normalized = normalizePath(file.trim());
      entries.push({ status: 'A', oldPath: undefined, newPath: normalized, paths: [normalized] });
    }
  }
  const files = [...new Set(entries.flatMap((entry) => entry.paths))];

  return Object.freeze({ baseRef, source: 'explicit-ARCH_BASE_SHA', entries, files });
}

export function parseGovernanceBaseline(content) {
  let baseline;
  try {
    baseline = JSON.parse(content);
  } catch (error) {
    throw new ArchitectureRangeError(
      'ARCH_BASELINE_INVALID',
      `cannot parse ${ARCHITECTURE_BASELINE_PATH}: ${String(error)}`,
    );
  }

  const requiredArrays = [
    'mandatoryChecks',
    'mandatoryRuleIds',
    'mandatoryTestSuites',
    'protectedGovernancePaths',
  ];
  const missing = requiredArrays.filter((field) => !Array.isArray(baseline[field]));
  if (baseline.version !== 1 || missing.length > 0) {
    throw new ArchitectureRangeError(
      'ARCH_BASELINE_INVALID',
      `${ARCHITECTURE_BASELINE_PATH} must declare version 1 and arrays: ${requiredArrays.join(', ')}`,
    );
  }
  return baseline;
}

export function readBaseGovernanceBaseline(baseRef, runGit = defaultGit) {
  const result = runGit(['show', `${baseRef}:${ARCHITECTURE_BASELINE_PATH}`]);
  if (result.status !== 0) {
    throw new ArchitectureRangeError(
      'ARCH_BASELINE_MISSING',
      `${ARCHITECTURE_BASELINE_PATH} is missing from BASE_SHA ${baseRef}`,
    );
  }
  return parseGovernanceBaseline(result.stdout);
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

function moduleReference(specifier, kind) {
  return { specifier: specifier ?? '<unsupported>', kind };
}

function unsupportedLoaderKind(expression) {
  if (expression.kind === ts.SyntaxKind.ImportKeyword) {
    return 'dynamic-import';
  }
  if (ts.isIdentifier(expression)) {
    if (expression.text === 'require') return 'require';
    if (expression.text === 'eval') return 'unsupported-module-loading';
    return undefined;
  }
  if (!ts.isPropertyAccessExpression(expression) || !ts.isIdentifier(expression.expression)) {
    return undefined;
  }
  if (expression.expression.text === 'require' && expression.name.text === 'resolve') {
    return 'require.resolve';
  }
  if (expression.expression.text === 'module' && expression.name.text === 'require') {
    return 'module.require';
  }
  return undefined;
}

function unsupportedAliasKind(initializer) {
  if (
    ts.isIdentifier(initializer) &&
    (initializer.text === 'require' || initializer.text === 'eval')
  ) {
    return 'unsupported-module-loading';
  }
  if (
    ts.isPropertyAccessExpression(initializer) &&
    ts.isIdentifier(initializer.expression) &&
    ((initializer.expression.text === 'require' && initializer.name.text === 'resolve') ||
      (initializer.expression.text === 'module' && initializer.name.text === 'require'))
  ) {
    return 'unsupported-module-loading';
  }
  return undefined;
}

function collectModuleReferences(content, fileName = 'fixture.ts', includeExports = true) {
  const result = [];
  const file = sourceFile(content, fileName);

  function visit(node) {
    if (ts.isImportDeclaration(node) && isStringLiteral(node.moduleSpecifier)) {
      result.push(moduleReference(node.moduleSpecifier.text, 'import'));
    }

    if (includeExports && ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined) {
      if (isStringLiteral(node.moduleSpecifier)) {
        result.push(moduleReference(node.moduleSpecifier.text, 'export'));
      }
    }

    if (ts.isImportEqualsDeclaration(node)) {
      const expression =
        ts.isExternalModuleReference(node.moduleReference) &&
        isStringLiteral(node.moduleReference.expression)
          ? node.moduleReference.expression.text
          : undefined;
      result.push(moduleReference(expression, 'import-equals'));
    }

    if (ts.isVariableDeclaration(node) && node.initializer !== undefined) {
      const aliasKind = unsupportedAliasKind(node.initializer);
      if (aliasKind !== undefined) {
        result.push(moduleReference(undefined, aliasKind));
      }
    }

    if (ts.isCallExpression(node)) {
      const kind = unsupportedLoaderKind(node.expression);
      if (kind !== undefined) {
        const argument = node.arguments.length === 1 ? node.arguments[0] : undefined;
        if (kind === 'dynamic-import' && argument !== undefined && isStringLiteral(argument)) {
          result.push(moduleReference(argument.text, 'dynamic-import'));
        } else {
          result.push(
            moduleReference(
              undefined,
              kind === 'dynamic-import' ? 'unsupported-dynamic-import' : kind,
            ),
          );
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(file);
  return result;
}

export function parseImportReferences(content, fileName = 'fixture.ts') {
  return collectModuleReferences(content, fileName, true);
}

export function parseImports(content, fileName = 'fixture.ts') {
  return parseImportReferences(content, fileName).map((reference) => reference.specifier);
}

export function parseExports(content, fileName = 'fixture.ts') {
  return parseImportReferences(content, fileName)
    .filter((reference) => reference.kind === 'export')
    .map((reference) => reference.specifier);
}

export function packageSpecifier(specifier) {
  const match = /^(@modern-agent\/[^/]+)(?:\/(.*))?$/u.exec(specifier);
  if (match === null) {
    return undefined;
  }
  return { packageName: match[1], subpath: match[2] };
}

export function isDeepImportSpecifier(specifier) {
  const packageInfo = packageSpecifier(specifier);
  if (packageInfo !== undefined) {
    return packageInfo.subpath !== undefined;
  }
  const segments = specifier.split('/').filter((segment) => segment !== '.' && segment !== '..');
  return segments.some((segment) => segment === 'internal');
}

export function isReactSpecifier(specifier) {
  return (
    specifier === 'react' ||
    specifier.startsWith('react/') ||
    specifier === 'react-dom' ||
    specifier.startsWith('react-dom/')
  );
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
  const packageInfo = packageSpecifier(specifier);
  return packageInfo === undefined
    ? undefined
    : packageInfo.packageName.slice('@modern-agent/'.length);
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

function moduleRoot(module) {
  return path.resolve(module.root ?? path.join(repositoryRoot, module.group, module.relative));
}

function isWithin(target, root) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function findTargetModule(resolvedPath, workspaceModules = []) {
  return workspaceModules.find((candidate) => isWithin(resolvedPath, moduleRoot(candidate)));
}

function layerBoundary(layer, importedLayer, module) {
  return (
    (layer === 'frontend' && (importedLayer === 'backend' || importedLayer === 'infrastructure')) ||
    (layer === 'backend' && importedLayer === 'frontend') ||
    (layer === 'shared' && importedLayer !== 'shared') ||
    (layer === 'infrastructure' && importedLayer === 'frontend') ||
    (module.group === 'apps' &&
      module.name === 'web' &&
      (importedLayer === 'backend' || importedLayer === 'infrastructure')) ||
    (module.group === 'apps' &&
      (module.name === 'api' || module.name === 'worker') &&
      importedLayer === 'frontend')
  );
}

function resolveRelativeReference(module, filePath, specifier, workspaceModules) {
  const fileAbsolute = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(repositoryRoot, filePath);
  const resolved = path.resolve(path.dirname(fileAbsolute), specifier);
  const owner = findTargetModule(resolved, workspaceModules);
  return { resolved, owner, sameModule: isWithin(resolved, moduleRoot(module)) };
}

function analyzeRelativeReference({
  module,
  filePath,
  specifier,
  workspaceModules,
  layer,
  violations,
}) {
  const reference = resolveRelativeReference(module, filePath, specifier, workspaceModules);
  if (reference.sameModule) {
    return;
  }

  const importedLayer = reference.owner === undefined ? undefined : classifyLayer(reference.owner);
  if (importedLayer !== undefined && layerBoundary(layer, importedLayer, module)) {
    addViolation(
      violations,
      ARCHITECTURE_CODES.LAYER_BOUNDARY,
      `${filePath} imports a relative module across a frozen layer boundary: ${specifier}`,
    );
    return;
  }

  addViolation(
    violations,
    ARCHITECTURE_CODES.DEEP_IMPORT,
    `${filePath} imports a module outside its public package boundary: ${specifier}`,
  );
}

export function analyzeModule({ module, manifest, packageJson, files, workspaceModules = [] }) {
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
    const packageInfo = packageSpecifier(dependency);
    if (packageInfo?.subpath !== undefined) {
      addViolation(
        violations,
        ARCHITECTURE_CODES.DEEP_IMPORT,
        `${module.name} declares a non-root workspace dependency ${dependency}`,
      );
      continue;
    }
    if (target !== undefined && !allowedDependencies.has(target)) {
      addViolation(
        violations,
        ARCHITECTURE_CODES.FORBIDDEN_DEPENDENCY,
        `${module.name} declares ${target} outside its manifest`,
      );
    }

    if (
      (layer === 'backend' || layer === 'shared' || layer === 'infrastructure') &&
      isReactSpecifier(dependency)
    ) {
      addViolation(
        violations,
        ARCHITECTURE_CODES.LAYER_BOUNDARY,
        `${module.name} declares React in a non-frontend module`,
      );
    }

    if (infrastructurePackages.has(dependency)) {
      if (capability) {
        addViolation(
          violations,
          ARCHITECTURE_CODES.CAPABILITY_INFRASTRUCTURE_LEAK,
          `${module.name} declares infrastructure dependency ${dependency}`,
        );
      } else if (
        layer === 'backend' ||
        (module.group === 'apps' && (module.name === 'api' || module.name === 'worker'))
      ) {
        addViolation(
          violations,
          ARCHITECTURE_CODES.DOMAIN_INFRASTRUCTURE_LEAK,
          `${module.name} declares infrastructure dependency ${dependency}`,
        );
      }
    }
  }

  for (const file of files) {
    const filePath = sourcePath(file);
    const imports = parseImportReferences(file.content, filePath);

    for (const reference of imports) {
      const { specifier } = reference;

      if (
        reference.kind === 'require' ||
        reference.kind === 'require.resolve' ||
        reference.kind === 'module.require' ||
        reference.kind === 'import-equals' ||
        reference.kind === 'unsupported-dynamic-import' ||
        reference.kind === 'unsupported-module-loading'
      ) {
        addViolation(
          violations,
          ARCHITECTURE_CODES.UNSUPPORTED_MODULE_LOADING,
          `${filePath} uses unsupported module loading syntax (${reference.kind})`,
        );
        continue;
      }

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

      if (specifier.startsWith('.')) {
        analyzeRelativeReference({
          module,
          filePath,
          specifier,
          workspaceModules,
          layer,
          violations,
        });
        continue;
      }

      if (packageSpecifier(specifier)?.subpath !== undefined) {
        addViolation(
          violations,
          ARCHITECTURE_CODES.DEEP_IMPORT,
          `${filePath} imports non-root package subpath ${specifier}`,
        );
        continue;
      }

      if (target !== undefined) {
        const importedLayer = targetLayer(target);
        const forbiddenLayerDirection = layerBoundary(layer, importedLayer, module);

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
  sourceFiles = [],
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
  const exportKeys =
    exportsObject !== null && typeof exportsObject === 'object'
      ? Object.keys(exportsObject).sort()
      : [];
  const manifestKeys = [...manifest.publicExports].sort();
  const publicContractFiles = [...(manifest.publicContractFiles ?? [])].map((file) =>
    normalizePath(file),
  );
  if (publicContractFiles.length === 0 && manifest.publicExports.length > 0) {
    addViolation(
      violations,
      ARCHITECTURE_CODES.INVALID_PUBLIC_EXPORT,
      `${module.name} is missing manifest publicContractFiles`,
    );
  }
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

  const exportTargets = [];
  function collectTargets(value) {
    if (typeof value === 'string') {
      exportTargets.push(value);
      return;
    }
    if (value !== null && typeof value === 'object') {
      for (const nested of Object.values(value)) {
        collectTargets(nested);
      }
    }
  }
  collectTargets(exportsObject);

  if (
    exportKeys.some((key) => key !== '.' || key.includes('*') || key.includes('/internal')) ||
    manifestKeys.some((key) => key !== '.' || key.includes('*')) ||
    exportTargets.some((target) => target.includes('*') || isInternalPath(target))
  ) {
    addViolation(
      violations,
      ARCHITECTURE_CODES.INVALID_PUBLIC_EXPORT,
      `${module.name} exposes an unsupported, wildcard, or internal package entry`,
    );
  }

  const sourceMap = new Map();
  sourceMap.set('src/index.ts', indexSource ?? '');
  for (const file of sourceFiles) {
    const filePath = normalizePath(sourcePath(file));
    const root = moduleRoot(module);
    const absolute = path.isAbsolute(filePath) ? filePath : path.resolve(repositoryRoot, filePath);
    sourceMap.set(normalizePath(path.relative(root, absolute)), file.content);
  }

  for (const reference of parseImportReferences(indexSource ?? '', 'src/index.ts').filter(
    (candidate) => candidate.kind === 'export',
  )) {
    if (!reference.specifier.startsWith('.')) {
      addViolation(
        violations,
        ARCHITECTURE_CODES.INVALID_PUBLIC_EXPORT,
        `${module.name} public entry may only re-export declared local contract files`,
      );
      continue;
    }

    if (isInternalPath(reference.specifier)) {
      addViolation(
        violations,
        ARCHITECTURE_CODES.INVALID_PUBLIC_EXPORT,
        `${module.name} re-exports internal code from its public entry`,
      );
      continue;
    }

    const target = resolveSourceMapPath('src/index.ts', reference.specifier, sourceMap);
    if (target === undefined || !publicContractFiles.includes(target)) {
      addViolation(
        violations,
        ARCHITECTURE_CODES.INVALID_PUBLIC_EXPORT,
        `${module.name} public entry re-exports an undeclared contract file: ${reference.specifier}`,
      );
    }
  }

  return violations;
}

function isInternalPath(specifier) {
  return specifier.split('/').some((segment) => segment === 'internal');
}

function resolveSourceMapPath(currentFile, specifier, sourceMap) {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(currentFile), specifier));
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}/index.ts`];
  return candidates.find((candidate) => sourceMap.has(candidate));
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
  if (isManifestPath(file) || isControlledPackagePath(file)) {
    return false;
  }
  return frozenContractPattern.test(file);
}

export function isManifestPath(file) {
  return file.endsWith('/module.manifest.json') || file === 'module.manifest.json';
}

export function isControlledPackagePath(file) {
  return /^(?:apps|packages)\/[^/]+(?:\/[^/]+)*\/package\.json$/u.test(file);
}

function isApprovedDocument(content) {
  return /(?:^|\n)\s*-?\s*Status:\s*APPROVED\s*(?:\n|$)/iu.test(content ?? '');
}

function authorizationDocuments(documents, pattern) {
  return documents.filter(
    (document) => pattern.test(document.file) && isApprovedDocument(document.content),
  );
}

export function extractAllowedWritePaths(content) {
  const source = content ?? '';
  const header =
    /^##\s+(?:Allowed implementation paths|Allowed write paths|Additional Implementation Scope for Remediation Round 2)\s*$/imu.exec(
      source,
    );
  if (header === null) {
    return [];
  }
  const remainder = source.slice(header.index + header[0].length);
  const nextHeading = /^##\s+/mu.exec(remainder);
  return remainder
    .slice(0, nextHeading?.index ?? remainder.length)
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .flatMap((line) => {
      const value = line.slice(2).trim();
      const fenced = [...value.matchAll(/`([^`]+)`/gu)].map((match) => match[1]);
      return fenced.length > 0 ? fenced : [value];
    })
    .map((value) => value.trim())
    .filter((value) =>
      /^(?:\.github|AGENTS\.md|apps|packages|scripts|tests|docs|package\.json)/u.test(value),
    );
}

function pathMatchesPattern(file, pattern) {
  if (pattern === file) {
    return true;
  }
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/gu, '\\$&');
  const glob = escaped
    .replaceAll('**', '\u0000')
    .replaceAll('*', '[^/]*')
    .replaceAll('\u0000', '.*');
  return new RegExp(`^${glob}$`, 'u').test(file);
}

function approvedWorkPackages(documents) {
  return authorizationDocuments(documents, /^docs\/work-packages\/WP-\d+[^/]*\.md$/u).sort(
    (left, right) => left.file.localeCompare(right.file),
  );
}

function approvedArtifactForPath(documents, pattern, targetPath) {
  return authorizationDocuments(documents, pattern).find((document) =>
    isCurrentAuthorizationDocument({
      file: document.file,
      files: [document.file],
      content: document.content,
      targetPath,
    }),
  );
}

function entryPaths(entries = [], files = []) {
  if (entries.length > 0) {
    return [...new Set(entries.flatMap((entry) => entry.paths ?? []))];
  }
  return [...new Set(files)];
}

export function evaluateContractChanges({
  files = [],
  entries = [],
  proposals = [],
  baseDocuments,
}) {
  const violations = [];
  const changedPaths = entryPaths(entries, files);
  const contractPaths = changedPaths.filter(isFrozenContractPath);
  const manifestPaths = changedPaths.filter(
    (file) => isManifestPath(file) || isControlledPackagePath(file),
  );
  const authorizationSource = baseDocuments ?? [];
  const workPackages = approvedWorkPackages(authorizationSource);
  const allowedPaths = workPackages.flatMap((workPackage) =>
    extractAllowedWritePaths(workPackage.content),
  );
  const baselinePathChanged = changedPaths.includes(ARCHITECTURE_BASELINE_PATH);

  if (baseDocuments !== undefined) {
    const outOfScope = changedPaths.filter((file) =>
      baselinePathChanged && file === ARCHITECTURE_BASELINE_PATH
        ? true
        : !allowedPaths.some((pattern) => pathMatchesPattern(file, pattern)),
    );
    if (outOfScope.length > 0) {
      addViolation(
        violations,
        ARCHITECTURE_CODES.ARCHITECTURE_REVIEW_REQUIRED,
        `changed paths are outside the approved BASE_SHA Work Package scope: ${outOfScope.join(', ')}`,
      );
    }
  }

  const baseContractAuthorization = contractPaths.every(
    (contractPath) =>
      approvedArtifactForPath(
        authorizationSource,
        /^docs\/contract-changes\/CCR-\d+\.md$/u,
        contractPath,
      ) !== undefined,
  );
  const currentContractAuthorization = contractPaths.every((contractPath) =>
    proposals.some(
      (proposal) =>
        validateContractChangeProposal(proposal.file, proposal.content).length === 0 &&
        isCurrentAuthorizationDocument({
          file: proposal.file,
          files: [proposal.file],
          content: proposal.content,
          targetPath: contractPath,
        }),
    ),
  );
  const authorizedContractChange =
    contractPaths.length > 0 &&
    (baseDocuments !== undefined ? baseContractAuthorization : false) &&
    (baseDocuments === undefined ? currentContractAuthorization : true);

  if (contractPaths.length > 0 && !authorizedContractChange) {
    addViolation(
      violations,
      ARCHITECTURE_CODES.UNAUTHORIZED_CONTRACT_CHANGE,
      'frozen Contract changed without an approved BASE_SHA CCR authorizing each changed path',
    );
  }

  const manifestScopeAuthorized =
    manifestPaths.length === 0 ||
    (workPackages.length > 0 &&
      manifestPaths.every((file) =>
        allowedPaths.some((pattern) => pathMatchesPattern(file, pattern)),
      ));
  if (manifestPaths.length > 0 && !manifestScopeAuthorized) {
    addViolation(
      violations,
      ARCHITECTURE_CODES.ARCHITECTURE_REVIEW_REQUIRED,
      'Manifest or controlled package.json changed outside an approved BASE_SHA Work Package scope',
    );
  }

  const architectureProtectedPaths = changedPaths.filter(
    (file) => isManifestPath(file) || isControlledPackagePath(file),
  );
  if (
    baseDocuments !== undefined &&
    architectureProtectedPaths.some(
      (file) =>
        approvedArtifactForPath(authorizationSource, /^docs\/adr\/ADR-\d+[^/]*\.md$/u, file) ===
          undefined &&
        !workPackages.some(
          (workPackage) =>
            workPackage.file === 'docs/work-packages/WP-002-amendment-a1-trust-root.md' &&
            extractAllowedWritePaths(workPackage.content).some((pattern) =>
              pathMatchesPattern(file, pattern),
            ),
        ),
    )
  ) {
    addViolation(
      violations,
      ARCHITECTURE_CODES.ARCHITECTURE_REVIEW_REQUIRED,
      'manifest or controlled package.json changes require an approved BASE_SHA ADR or Architecture Review',
    );
  }

  return [...new Map(violations.map((violation) => [violation.code, violation])).values()];
}

export { sourceExtensions };
