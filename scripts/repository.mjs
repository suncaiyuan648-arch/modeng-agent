import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

export const repositoryRoot = process.cwd();

export async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

export async function listWorkspaceModules() {
  const result = [];

  for (const group of ['apps', 'packages']) {
    const groupPath = path.join(repositoryRoot, group);
    async function collect(current) {
      try {
        await access(path.join(current, 'package.json'));
        const relative = path.relative(groupPath, current).replaceAll('\\', '/');
        result.push({
          group,
          name: path.basename(current),
          relative,
          root: current,
        });
        return;
      } catch {
        // Grouping directories intentionally have no package.json.
      }

      const entries = await readdir(current, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist') {
          await collect(path.join(current, entry.name));
        }
      }
    }

    await collect(groupPath);
  }

  return result.sort((left, right) =>
    `${left.group}/${left.relative}`.localeCompare(`${right.group}/${right.relative}`),
  );
}

export async function walkFiles(root, extensions) {
  const files = [];

  async function walk(current) {
    const entries = await readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name === 'dist' || entry.name === 'node_modules' || entry.name === 'coverage') {
        continue;
      }

      const target = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(target);
      } else if (extensions.has(path.extname(entry.name))) {
        files.push(target);
      }
    }
  }

  await walk(root);
  return files.sort();
}

export function relativePath(filePath) {
  return path.relative(repositoryRoot, filePath).replaceAll('\\', '/');
}

export function fail(code, message) {
  throw new Error(`${code} ${message}`);
}
