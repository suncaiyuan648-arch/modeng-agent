import { spawnSync } from 'node:child_process';
import process from 'node:process';

console.info(
  'WP-000 uses full verification for changed files; WP-001 may safely narrow this later.',
);
const windows = process.platform === 'win32';
const executable = windows ? (process.env['ComSpec'] ?? 'cmd.exe') : 'pnpm';
const args = windows ? ['/d', '/s', '/c', 'pnpm', 'verify'] : ['verify'];
const result = spawnSync(executable, args, {
  cwd: process.cwd(),
  stdio: 'inherit',
});

if (result.error !== undefined) {
  throw result.error;
}

process.exit(result.status ?? 1);
