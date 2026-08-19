import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import process from 'node:process';

const MAX_FILE_BYTES = 1_000_000;

const highConfidencePatterns = [
  ['private-key', /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/],
  ['aws-access-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['openai-key', /\bsk-[A-Za-z0-9_-]{20,}\b/],
  ['google-api-key', /\bAIza[0-9A-Za-z_-]{20,}\b/],
  ['slack-token', /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/],
  ['jwt', /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/],
  ['connection-string', /\b(?:postgres(?:ql)?|mysql|redis):\/\/[^\s/:]+:[^\s@]+@/i],
];

const assignmentPattern =
  /(?:^|[\s,{"])(?:[A-Z][A-Z0-9]*(?:[_-](?:API[_-]?KEY|SECRET|TOKEN|PASSWORD|ACCESS[_-]?KEY|PRIVATE[_-]?KEY))|API[_-]?KEY|SECRET|TOKEN|PASSWORD|ACCESS[_-]?KEY|PRIVATE[_-]?KEY|[a-z][A-Za-z0-9]*(?:ApiKey|Secret|Token|Password|AccessKey|PrivateKey))["']?\s*[:=]\s*["'`]?([^\s"'`,}{\]]+)/g;

const placeholderPattern =
  /^(?:$|\$\{|\?|process\.env|undefined|null|true|false|example|placeholder|dummy|test|local[_-]development|replace|change[_-]?me|your[_-]|<|\.\.\.)/i;

function isPlaceholder(value) {
  return placeholderPattern.test(value.trim());
}

export function scanText(text) {
  const findings = [];
  const lines = text.split(/\r?\n/);

  for (const [lineIndex, line] of lines.entries()) {
    for (const [rule, pattern] of highConfidencePatterns) {
      if (pattern.test(line)) {
        findings.push({ line: lineIndex + 1, rule });
      }
      pattern.lastIndex = 0;
    }

    assignmentPattern.lastIndex = 0;
    for (const match of line.matchAll(assignmentPattern)) {
      const value = match[1]?.trim() ?? '';
      if (!isPlaceholder(value) && value.length >= 8) {
        findings.push({ line: lineIndex + 1, rule: 'secret-assignment' });
      }
    }
  }

  return [
    ...new Map(findings.map((finding) => [`${finding.line}:${finding.rule}`, finding])).values(),
  ];
}

function gitFileList(staged) {
  const args = staged
    ? ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']
    : ['ls-files', '--cached', '--others', '--exclude-standard', '-z'];
  const output = execFileSync('git', args, { encoding: 'utf8' });
  return [...new Set(output.split('\0').filter(Boolean))];
}

export function readGitFile(file, staged) {
  if (staged) {
    return execFileSync('git', ['show', `:${file}`], { encoding: 'utf8' });
  }

  if (!existsSync(file)) {
    return null;
  }
  const stats = statSync(file);
  if (!stats.isFile() || stats.size > MAX_FILE_BYTES) {
    return null;
  }

  const buffer = readFileSync(file);
  if (buffer.includes(0)) {
    return null;
  }

  return buffer.toString('utf8');
}

function main() {
  const staged = process.argv.includes('--staged');
  const files = gitFileList(staged);
  const findings = [];

  for (const file of files) {
    const text = readGitFile(file, staged);
    if (text === null) {
      continue;
    }

    for (const finding of scanText(text)) {
      findings.push({ file, ...finding });
    }
  }

  if (findings.length > 0) {
    console.error(`Secret scan failed: ${findings.length} possible secret(s) detected.`);
    for (const finding of findings) {
      console.error(`- ${finding.file}:${finding.line} (${finding.rule})`);
    }
    console.error('Remove the secret, rotate it if exposed, and use an approved secret store.');
    process.exitCode = 1;
    return;
  }

  const scope = staged ? 'staged files' : 'tracked and unignored files';
  console.info(`Secret scan passed: ${scope} contain no detected credentials.`);
}

if (process.argv[1]?.endsWith('check-secrets.mjs')) {
  main();
}
