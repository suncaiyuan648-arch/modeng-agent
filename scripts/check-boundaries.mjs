import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { fail, listWorkspaceModules, readJson, relativePath, walkFiles } from './repository.mjs';

const sourceExtensions = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);
const infrastructurePackages = new Set([
  '@prisma/client',
  'bullmq',
  'openai',
  '@anthropic-ai/sdk',
  '@google/generative-ai',
  '@aws-sdk/client-s3',
]);
const importPattern = /(?:from\s*|import\s*\(|require\s*\()\s*['"]([^'"]+)['"]/g;

for (const module of await listWorkspaceModules()) {
  const manifest = await readJson(path.join(module.root, 'module.manifest.json'));
  const packageJson = await readJson(path.join(module.root, 'package.json'));
  const layer = module.group === 'apps' ? 'apps' : module.relative.split('/')[0];
  const declaredDependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
    ...packageJson.peerDependencies,
  };

  for (const dependency of Object.keys(declaredDependencies)) {
    if (!dependency.startsWith('@modern-agent/')) {
      continue;
    }
    const target = dependency.slice('@modern-agent/'.length);
    if (!manifest.allowedDependencies.includes(target)) {
      fail(
        'ARCH_DEPENDENCY_UNDECLARED',
        `${module.name} depends on ${target} outside its manifest`,
      );
    }
  }

  for (const filePath of await walkFiles(path.join(module.root, 'src'), sourceExtensions)) {
    const content = await readFile(filePath, 'utf8');
    const imports = [...content.matchAll(importPattern)].map((match) => match[1]);

    for (const specifier of imports) {
      if (specifier.startsWith('@modern-agent/')) {
        const segments = specifier.split('/');
        if (segments.length > 2) {
          fail('ARCH_DEEP_IMPORT', `${relativePath(filePath)} imports ${specifier}`);
        }
      }

      const target = specifier.startsWith('@modern-agent/')
        ? specifier.slice('@modern-agent/'.length)
        : undefined;

      if (target !== undefined) {
        const targetLayer = target.split('-')[0];
        const forbiddenDirection =
          (layer === 'shared' && targetLayer !== 'shared') ||
          (layer === 'frontend' &&
            (targetLayer === 'backend' || targetLayer === 'infrastructure')) ||
          (layer === 'backend' &&
            (targetLayer === 'frontend' || targetLayer === 'infrastructure')) ||
          (module.group === 'apps' &&
            module.name === 'web' &&
            targetLayer !== 'frontend' &&
            targetLayer !== 'shared') ||
          (module.group === 'apps' &&
            (module.name === 'api' || module.name === 'worker') &&
            targetLayer === 'frontend');

        if (forbiddenDirection) {
          fail('ARCH_RUNTIME_DIRECTION', `${relativePath(filePath)} imports ${specifier}`);
        }
      }

      if (
        (layer === 'backend' ||
          (module.group === 'apps' && (module.name === 'api' || module.name === 'worker'))) &&
        infrastructurePackages.has(specifier)
      ) {
        fail('ARCH_INFRASTRUCTURE_LEAK', `${relativePath(filePath)} imports ${specifier}`);
      }

      if (
        (layer === 'backend' || layer === 'infrastructure' || layer === 'shared') &&
        (specifier === 'react' || specifier.startsWith('react-dom'))
      ) {
        fail('ARCH_BACKEND_REACT', `${relativePath(filePath)} imports ${specifier}`);
      }
    }

    if (
      (layer === 'frontend' || (module.group === 'apps' && module.name === 'web')) &&
      manifest.name !== 'frontend-realtime' &&
      (/\bEventSource\b/.test(content) || /text\/event-stream/.test(content))
    ) {
      fail('ARCH_PAGE_SSE', `${relativePath(filePath)} handles SSE outside realtime`);
    }
  }
}

console.info('Dependency boundary checks passed.');
