// Fails if package.json declares a direct dependency missing from
// dependency-allowlist.json, or the lockfile's root entry disagrees with package.json.
// Backs the "no account, no tracking" claim in docs/claims-checklist.md.
import { readFileSync } from 'node:fs';

export function directDeps(pkg) {
  return [
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
    ...Object.keys(pkg.optionalDependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
  ].sort();
}

export function findViolations(pkg, lock, allowlist) {
  const allowed = new Set(allowlist.allowed);
  const problems = [];
  for (const name of directDeps(pkg)) {
    if (!allowed.has(name)) problems.push(`"${name}" is in package.json but not in the allowlist`);
  }
  const root = lock.packages?.[''] ?? {};
  for (const name of directDeps(root)) {
    if (!allowed.has(name))
      problems.push(`"${name}" is in package-lock.json but not in the allowlist`);
  }
  const a = directDeps(pkg).join(',');
  const b = directDeps(root).join(',');
  if (a !== b)
    problems.push('package.json and package-lock.json direct dependencies differ; run npm install');
  return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const read = (f) => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));
  const problems = findViolations(
    read('package.json'),
    read('package-lock.json'),
    read('dependency-allowlist.json'),
  );
  if (problems.length) {
    console.error(`Dependency audit failed:\n - ${problems.join('\n - ')}`);
    console.error(
      'Adding a dependency needs a captain decision; see AGENTS.md. Then add it to dependency-allowlist.json.',
    );
    process.exit(1);
  }
  console.log('Dependency audit passed.');
}
