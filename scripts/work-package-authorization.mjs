import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';

import { repositoryRoot } from './repository.mjs';

export const AUTHORIZATION_SCHEMA_PATH = 'docs/governance/work-package-auth.schema.json';
export const EXECUTION_CONTEXT_SCHEMA_PATH = 'docs/governance/execution-context.schema.json';
export const EXECUTION_CONTEXT_PATH = 'docs/governance/execution-context.json';

export const YELLOW_CAPABILITIES = Object.freeze([
  'compile-config',
  'dependency-sync',
  'public-facade',
  'package-export',
  'manifest-metadata',
  'asset-export',
  'shared-fixture',
  'feature-config',
]);

export const RED_CAPABILITIES = Object.freeze([
  'owner-change',
  'dependency-direction-change',
  'contract-change',
  'state-machine-change',
  'migration',
  'governance-change',
]);

export const AUTHORIZATION_CODES = Object.freeze({
  INVALID_SCHEMA: 'WP_AUTH_SCHEMA_INVALID',
  ACTIVE_CONTEXT_INVALID: 'WP_ACTIVE_CONTEXT_INVALID',
  ACTIVE_AUTHORIZATION_MISSING: 'WP_ACTIVE_AUTHORIZATION_MISSING',
  ACTIVE_WORK_PACKAGE_MISMATCH: 'WP_ACTIVE_WORK_PACKAGE_MISMATCH',
  AUTHORIZATION_NOT_APPROVED: 'WP_AUTHORIZATION_NOT_APPROVED',
  MODULE_NOT_TARGETED: 'WP_SCOPE_MODULE_NOT_TARGETED',
  ZONE_NOT_AUTHORIZED: 'WP_SCOPE_ZONE_NOT_AUTHORIZED',
  CAPABILITY_REQUIRED: 'WP_SCOPE_CAPABILITY_REQUIRED',
  CAPABILITY_UNKNOWN: 'WP_SCOPE_CAPABILITY_UNKNOWN',
  CAPABILITY_FORBIDDEN: 'WP_SCOPE_CAPABILITY_FORBIDDEN',
  RED_CAPABILITY: 'WP_SCOPE_RED_CAPABILITY',
  REQUIRED_CCR_MISSING: 'WP_REQUIRED_CCR_MISSING',
  REQUIRED_ADR_MISSING: 'WP_REQUIRED_ADR_MISSING',
  REQUIRED_PREREQUISITE_MISSING: 'WP_REQUIRED_GOVERNANCE_PREREQUISITE_MISSING',
  BASE_MISSING: 'TRUSTED_BASE_REQUIRED',
});

const WORK_PACKAGE_ID_PATTERN = /^(?:WP|GOV)-\d{3,}$/u;
const APPROVED_DOCUMENT_PATTERN = /(?:^|\n)\s*(?:>\s*)?-?\s*Status:\s*APPROVED\b/imu;
const ALL_CAPABILITIES = new Set([...YELLOW_CAPABILITIES, ...RED_CAPABILITIES]);
const YELLOW_CAPABILITY_SET = new Set(YELLOW_CAPABILITIES);
const RED_CAPABILITY_SET = new Set(RED_CAPABILITIES);

const authSchema = JSON.parse(
  readFileSync(path.join(repositoryRoot, AUTHORIZATION_SCHEMA_PATH), 'utf8'),
);
const executionContextSchema = JSON.parse(
  readFileSync(path.join(repositoryRoot, EXECUTION_CONTEXT_SCHEMA_PATH), 'utf8'),
);
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateAuthSchema = ajv.compile(authSchema);
const validateExecutionContextSchema = ajv.compile(executionContextSchema);

export class WorkPackageAuthorizationError extends Error {
  constructor(code, message) {
    super(`${code} ${message}`);
    this.name = 'WorkPackageAuthorizationError';
    this.code = code;
  }
}

function validationMessage(validate, label) {
  return `${label}: ${ajv.errorsText(validate.errors, { separator: '; ' })}`;
}

export function validateAuthorizationDocument(document) {
  const valid = validateAuthSchema(document);
  return Object.freeze({
    valid,
    errors: valid ? [] : [...(validateAuthSchema.errors ?? [])],
  });
}

export function validateExecutionContextDocument(document) {
  const valid = validateExecutionContextSchema(document);
  return Object.freeze({
    valid,
    errors: valid ? [] : [...(validateExecutionContextSchema.errors ?? [])],
  });
}

export function parseAuthorizationDocument(content, label = 'authorization') {
  let document;
  try {
    document = JSON.parse(content);
  } catch (error) {
    throw new WorkPackageAuthorizationError(
      AUTHORIZATION_CODES.INVALID_SCHEMA,
      `${label} is not valid JSON: ${String(error)}`,
    );
  }

  const validation = validateAuthorizationDocument(document);
  if (!validation.valid) {
    throw new WorkPackageAuthorizationError(
      AUTHORIZATION_CODES.INVALID_SCHEMA,
      validationMessage(validateAuthSchema, label),
    );
  }
  return document;
}

export function parseExecutionContextDocument(content, label = EXECUTION_CONTEXT_PATH) {
  let document;
  try {
    document = JSON.parse(content);
  } catch (error) {
    throw new WorkPackageAuthorizationError(
      AUTHORIZATION_CODES.ACTIVE_CONTEXT_INVALID,
      `${label} is not valid JSON: ${String(error)}`,
    );
  }

  const validation = validateExecutionContextDocument(document);
  if (!validation.valid) {
    throw new WorkPackageAuthorizationError(
      AUTHORIZATION_CODES.ACTIVE_CONTEXT_INVALID,
      validationMessage(validateExecutionContextSchema, label),
    );
  }
  return document;
}

function defaultGit(args, cwd = repositoryRoot) {
  return spawnSync('git', args, { cwd, encoding: 'utf8' });
}

function readWorkingTreeFile(relativePath, root = repositoryRoot) {
  try {
    return readFileSync(path.join(root, relativePath), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

function readBaseFile(baseRef, relativePath, runGit = defaultGit) {
  const result = runGit(['show', `${baseRef}:${relativePath}`]);
  if (result.status !== 0) {
    return undefined;
  }
  return result.stdout;
}

function readSourceFile({ baseRef, relativePath, root, runGit }) {
  return baseRef === undefined
    ? readWorkingTreeFile(relativePath, root)
    : readBaseFile(baseRef, relativePath, runGit);
}

function listWorkingTreeFiles(relativeDirectory, root = repositoryRoot) {
  const absoluteDirectory = path.join(root, relativeDirectory);
  if (!statSafe(absoluteDirectory)?.isDirectory()) {
    return [];
  }

  const files = [];
  for (const entry of readdirSync(absoluteDirectory, { withFileTypes: true })) {
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listWorkingTreeFiles(relativePath, root));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files.sort();
}

function listBaseFiles(baseRef, relativeDirectory, runGit = defaultGit) {
  const result = runGit(['ls-tree', '-r', '--name-only', baseRef, '--', relativeDirectory]);
  if (result.status !== 0) {
    return [];
  }
  return result.stdout
    .split(/\r?\n/u)
    .map((file) => file.trim().replaceAll('\\', '/'))
    .filter(Boolean)
    .sort();
}

function listSourceFiles({ baseRef, relativeDirectory, root, runGit }) {
  return baseRef === undefined
    ? listWorkingTreeFiles(relativeDirectory, root)
    : listBaseFiles(baseRef, relativeDirectory, runGit);
}

function statSafe(file) {
  try {
    return statSync(file);
  } catch {
    return undefined;
  }
}

function parseAuthorizationId(id) {
  if (!WORK_PACKAGE_ID_PATTERN.test(id)) {
    throw new WorkPackageAuthorizationError(
      AUTHORIZATION_CODES.ACTIVE_CONTEXT_INVALID,
      `invalid Work Package ID ${id}`,
    );
  }
  return id;
}

export function authorizationPathForId(id) {
  return `docs/work-packages/${parseAuthorizationId(id)}.auth.json`;
}

function readJsonFromSource({ baseRef, relativePath, root, runGit, parser }) {
  const content = readSourceFile({ baseRef, relativePath, root, runGit });
  if (content === undefined) {
    return undefined;
  }
  return parser(content, relativePath);
}

function verifyBaseRef(baseRef, runGit) {
  if (baseRef === undefined) {
    return;
  }
  const result = runGit(['rev-parse', '--verify', `${baseRef}^{commit}`]);
  if (result.status !== 0) {
    throw new WorkPackageAuthorizationError(
      AUTHORIZATION_CODES.BASE_MISSING,
      `BASE_SHA ${baseRef} is unavailable`,
    );
  }
}

export function loadActiveAuthorization({
  requestedWorkPackage,
  baseRef,
  root = repositoryRoot,
  runGit = defaultGit,
} = {}) {
  verifyBaseRef(baseRef, runGit);
  const context = readJsonFromSource({
    baseRef,
    relativePath: EXECUTION_CONTEXT_PATH,
    root,
    runGit,
    parser: parseExecutionContextDocument,
  });

  if (context === undefined) {
    throw new WorkPackageAuthorizationError(
      AUTHORIZATION_CODES.ACTIVE_CONTEXT_INVALID,
      `${EXECUTION_CONTEXT_PATH} is missing from ${baseRef ?? 'the working tree'}`,
    );
  }

  const activeWorkPackage = parseAuthorizationId(context.activeWorkPackage);
  const authorizationPath = authorizationPathForId(activeWorkPackage);
  if (context.authorizationPath !== undefined && context.authorizationPath !== authorizationPath) {
    throw new WorkPackageAuthorizationError(
      AUTHORIZATION_CODES.ACTIVE_CONTEXT_INVALID,
      `${EXECUTION_CONTEXT_PATH} must resolve ${activeWorkPackage} to ${authorizationPath}`,
    );
  }

  const authorization = readJsonFromSource({
    baseRef,
    relativePath: authorizationPath,
    root,
    runGit,
    parser: parseAuthorizationDocument,
  });

  if (authorization !== undefined && authorization.id !== activeWorkPackage) {
    throw new WorkPackageAuthorizationError(
      AUTHORIZATION_CODES.ACTIVE_WORK_PACKAGE_MISMATCH,
      `authorization ID ${authorization.id} does not match Active WP ${activeWorkPackage}`,
    );
  }

  return Object.freeze({
    requestedWorkPackage,
    activeWorkPackage,
    context,
    authorization,
    authorizationPath,
    source: baseRef === undefined ? 'working-tree' : 'BASE_SHA',
    baseRef,
  });
}

function artifactStatus(content) {
  return content !== undefined && APPROVED_DOCUMENT_PATTERN.test(content);
}

function artifactFileForId({ id, directory, baseRef, root, runGit }) {
  const prefix = `${id}.`;
  return listSourceFiles({ baseRef, relativeDirectory: directory, root, runGit }).find((file) => {
    const basename = path.posix.basename(file);
    return basename === `${id}.md` || basename.startsWith(prefix);
  });
}

function inspectApprovalArtifact({ id, directory, baseRef, root, runGit }) {
  const file = artifactFileForId({ id, directory, baseRef, root, runGit });
  const content =
    file === undefined ? undefined : readSourceFile({ baseRef, relativePath: file, root, runGit });
  return Object.freeze({
    id,
    file,
    exists: content !== undefined,
    approved: artifactStatus(content),
  });
}

export function collectRequiredApprovals({
  loaded,
  root = repositoryRoot,
  runGit = defaultGit,
} = {}) {
  const authorization = loaded?.authorization;
  if (authorization === undefined) {
    return Object.freeze({ ccr: [], adr: [], prerequisites: [] });
  }

  const { baseRef } = loaded;
  const ccr = authorization.requiredCCR.map((id) =>
    inspectApprovalArtifact({
      id,
      directory: 'docs/contract-changes',
      baseRef,
      root,
      runGit,
    }),
  );
  const adr = authorization.requiredADR.map((id) =>
    inspectApprovalArtifact({ id, directory: 'docs/adr', baseRef, root, runGit }),
  );
  const prerequisites = authorization.requiredGovernancePrerequisites.map((file) => {
    const content = readSourceFile({ baseRef, relativePath: file, root, runGit });
    return Object.freeze({
      file,
      exists: content !== undefined,
      approved: artifactStatus(content),
    });
  });

  return Object.freeze({ ccr, adr, prerequisites });
}

function blockedReason(code, message) {
  return Object.freeze({ code, message });
}

export function computeReadiness({
  requestedWorkPackage,
  loaded,
  requiredApprovals = collectRequiredApprovals({ loaded }),
} = {}) {
  const blockedReasons = [];
  const authorization = loaded?.authorization;
  const activeWorkPackage = loaded?.activeWorkPackage;

  if (loaded?.source !== 'BASE_SHA') {
    blockedReasons.push(
      blockedReason(
        AUTHORIZATION_CODES.BASE_MISSING,
        'BASE_SHA is required; working-tree authorization is advisory only',
      ),
    );
  }
  if (requestedWorkPackage !== undefined && requestedWorkPackage !== activeWorkPackage) {
    blockedReasons.push(
      blockedReason(
        AUTHORIZATION_CODES.ACTIVE_WORK_PACKAGE_MISMATCH,
        `requested ${requestedWorkPackage}, but Active WP is ${activeWorkPackage ?? 'unset'}`,
      ),
    );
  }
  if (authorization === undefined) {
    blockedReasons.push(
      blockedReason(
        AUTHORIZATION_CODES.ACTIVE_AUTHORIZATION_MISSING,
        `authorization for Active WP ${activeWorkPackage ?? 'unset'} is missing`,
      ),
    );
  } else {
    if (authorization.id !== activeWorkPackage) {
      blockedReasons.push(
        blockedReason(
          AUTHORIZATION_CODES.ACTIVE_WORK_PACKAGE_MISMATCH,
          `authorization ID ${authorization.id} does not match Active WP ${activeWorkPackage}`,
        ),
      );
    }
    if (authorization.status !== 'APPROVED') {
      blockedReasons.push(
        blockedReason(
          AUTHORIZATION_CODES.AUTHORIZATION_NOT_APPROVED,
          `authorization status is ${authorization.status}, not APPROVED`,
        ),
      );
    }

    for (const entry of requiredApprovals.ccr) {
      if (!entry.approved) {
        blockedReasons.push(
          blockedReason(
            AUTHORIZATION_CODES.REQUIRED_CCR_MISSING,
            `${entry.id} is missing or not approved${entry.file === undefined ? '' : ` (${entry.file})`}`,
          ),
        );
      }
    }
    for (const entry of requiredApprovals.adr) {
      if (!entry.approved) {
        blockedReasons.push(
          blockedReason(
            AUTHORIZATION_CODES.REQUIRED_ADR_MISSING,
            `${entry.id} is missing or not approved${entry.file === undefined ? '' : ` (${entry.file})`}`,
          ),
        );
      }
    }
    for (const entry of requiredApprovals.prerequisites) {
      if (!entry.exists) {
        blockedReasons.push(
          blockedReason(
            AUTHORIZATION_CODES.REQUIRED_PREREQUISITE_MISSING,
            `${entry.file} is missing from ${loaded.source}`,
          ),
        );
      }
    }
  }

  return Object.freeze({
    ready: blockedReasons.length === 0,
    blockedReasons: Object.freeze(blockedReasons),
    source: loaded?.source,
    baseRef: loaded?.baseRef,
    activeWorkPackage,
    authorization,
    targetModules: authorization?.targetModules ?? [],
    yellowCapabilities: authorization?.capabilities ?? [],
    requiredCCR: authorization?.requiredCCR ?? [],
    requiredADR: authorization?.requiredADR ?? [],
    requiredGovernancePrerequisites: authorization?.requiredGovernancePrerequisites ?? [],
    requiredApprovals,
  });
}

function scopeForModule(authorization, moduleName) {
  return authorization.scope.find((entry) => entry.module === moduleName)?.zones ?? [];
}

function scopeViolation(code, change, message) {
  return Object.freeze({ code, path: change.path, message });
}

export function evaluateWpScope({ context, authorization, changes = [] } = {}) {
  const violations = [];
  if (authorization?.status !== 'APPROVED') {
    violations.push(
      scopeViolation(
        AUTHORIZATION_CODES.AUTHORIZATION_NOT_APPROVED,
        { path: '<authorization>' },
        `authorization status ${authorization?.status ?? 'UNKNOWN'} is not APPROVED`,
      ),
    );
    return violations;
  }
  if (context?.activeWorkPackage !== authorization?.id) {
    violations.push(
      scopeViolation(
        AUTHORIZATION_CODES.ACTIVE_WORK_PACKAGE_MISMATCH,
        { path: '<execution-context>' },
        `Active WP ${context?.activeWorkPackage ?? 'unset'} does not match authorization ${authorization?.id ?? 'unset'}`,
      ),
    );
    return violations;
  }

  for (const change of changes) {
    const moduleName = change.module;
    const capability = change.capability;
    if (!authorization.targetModules.includes(moduleName)) {
      violations.push(
        scopeViolation(
          AUTHORIZATION_CODES.MODULE_NOT_TARGETED,
          change,
          `${moduleName ?? 'unknown module'} is not targeted by ${authorization.id}`,
        ),
      );
      continue;
    }
    if (capability !== undefined && RED_CAPABILITY_SET.has(capability)) {
      violations.push(
        scopeViolation(
          AUTHORIZATION_CODES.RED_CAPABILITY,
          change,
          `${capability} is RED and requires CCR / ADR / Owner approval`,
        ),
      );
      continue;
    }
    if (capability !== undefined && !ALL_CAPABILITIES.has(capability)) {
      violations.push(
        scopeViolation(
          AUTHORIZATION_CODES.CAPABILITY_UNKNOWN,
          change,
          `${capability} is not in the Rules V2 capability vocabulary`,
        ),
      );
      continue;
    }

    const authorizedZones = scopeForModule(authorization, moduleName);
    if (!authorizedZones.includes(change.zone)) {
      violations.push(
        scopeViolation(
          AUTHORIZATION_CODES.ZONE_NOT_AUTHORIZED,
          change,
          `${change.zone ?? 'unknown zone'} is not authorized for ${moduleName}`,
        ),
      );
      continue;
    }
    if (change.zone === 'implementation') {
      continue;
    }
    if (change.zone === 'frozen') {
      violations.push(
        scopeViolation(
          AUTHORIZATION_CODES.RED_CAPABILITY,
          change,
          'frozen changes require a protected-change approval and cannot be authorized as GREEN/YELLOW',
        ),
      );
      continue;
    }
    if (capability === undefined) {
      violations.push(
        scopeViolation(
          AUTHORIZATION_CODES.CAPABILITY_REQUIRED,
          change,
          `controlled change ${change.path} requires a semantic capability`,
        ),
      );
      continue;
    }
    if (!YELLOW_CAPABILITY_SET.has(capability)) {
      violations.push(
        scopeViolation(
          AUTHORIZATION_CODES.CAPABILITY_UNKNOWN,
          change,
          `${capability} is not a YELLOW capability`,
        ),
      );
      continue;
    }
    if (authorization.forbiddenCapabilities.includes(capability)) {
      violations.push(
        scopeViolation(
          AUTHORIZATION_CODES.CAPABILITY_FORBIDDEN,
          change,
          `${capability} is forbidden by ${authorization.id}`,
        ),
      );
      continue;
    }
    if (!authorization.capabilities.includes(capability)) {
      violations.push(
        scopeViolation(
          AUTHORIZATION_CODES.CAPABILITY_REQUIRED,
          change,
          `${authorization.id} does not grant ${capability}`,
        ),
      );
    }
  }
  return violations;
}

export function formatReadiness(readiness) {
  const authorization = readiness.authorization;
  const lines = [
    'Authorization',
    `  ID: ${authorization?.id ?? 'MISSING'}`,
    `  Status: ${authorization?.status ?? 'MISSING'}`,
    `  Source: ${readiness.source ?? 'unknown'}${readiness.source === 'working-tree' ? ' (advisory)' : ''}`,
    `Mode: ${readiness.source === 'BASE_SHA' ? 'TRUSTED BASE' : 'ADVISORY / UNTRUSTED'}`,
    `Active WP: ${readiness.activeWorkPackage ?? 'MISSING'}`,
    `Target Modules: ${readiness.targetModules.join(', ') || '(none)'}`,
    `YELLOW Capabilities: ${readiness.yellowCapabilities.join(', ') || '(none)'}`,
    `CCR: ${readiness.requiredCCR.join(', ') || '(none)'}`,
    `ADR: ${readiness.requiredADR.join(', ') || '(none)'}`,
    `Governance prerequisites: ${readiness.requiredGovernancePrerequisites.join(', ') || '(none)'}`,
  ];
  if (readiness.blockedReasons.length === 0) {
    lines.push('Blocked Reasons: none', 'READY');
  } else {
    lines.push('Blocked Reasons:');
    for (const reason of readiness.blockedReasons) {
      lines.push(`  - ${reason.code}: ${reason.message}`);
    }
    lines.push('NOT READY');
  }
  return lines.join('\n');
}

function parseCliArguments(argv) {
  const requestedWorkPackage = argv[0];
  const baseFlagIndex = argv.indexOf('--base-sha');
  const baseRef = baseFlagIndex >= 0 ? argv[baseFlagIndex + 1] : process.env.BASE_SHA?.trim();
  return {
    requestedWorkPackage,
    baseRef,
  };
}

export function runCli(argv = process.argv.slice(2)) {
  const options = parseCliArguments(argv);
  if (options.requestedWorkPackage === undefined) {
    console.error('usage: pnpm wp:doctor <WP-ID> [--base-sha <trusted-base>]');
    return 2;
  }
  try {
    const readiness = runWorkPackageDoctor(options);
    console.info(formatReadiness(readiness));
    return readiness.ready ? 0 : 1;
  } catch (error) {
    console.error(String(error));
    return 2;
  }
}

export function runWorkPackageDoctor({
  requestedWorkPackage,
  baseRef,
  root = repositoryRoot,
  runGit = defaultGit,
} = {}) {
  if (requestedWorkPackage === undefined || !WORK_PACKAGE_ID_PATTERN.test(requestedWorkPackage)) {
    throw new WorkPackageAuthorizationError(
      AUTHORIZATION_CODES.ACTIVE_CONTEXT_INVALID,
      'usage: pnpm wp:doctor <WP-ID> [--base-sha <trusted-base>] [--require-base]',
    );
  }
  const loaded = loadActiveAuthorization({ requestedWorkPackage, baseRef, root, runGit });
  const requiredApprovals = collectRequiredApprovals({ loaded, root, runGit });
  return computeReadiness({
    requestedWorkPackage,
    loaded,
    requiredApprovals,
  });
}

const isMain =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  process.exitCode = runCli();
}
