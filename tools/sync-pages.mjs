import { createHash } from 'node:crypto';
import { cp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const expectedTopLevel = [
  'THIRD_PARTY_NOTICES.md',
  'asset-manifest.json',
  'assets',
  'index.html',
  'manifest.webmanifest',
  'service-worker.js',
  'vendor'
].sort((left, right) => left.localeCompare(right));

async function listFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relative = prefix ? path.posix.join(prefix, entry.name) : entry.name;
    if (entry.isDirectory()) files.push(...await listFiles(path.join(directory, entry.name), relative));
    else if (entry.isFile()) files.push(relative);
    else throw new Error(`Refusing to publish a symlink or special file: ${relative}`);
  }
  return files;
}

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function requireFile(target) {
  const details = await stat(target);
  if (!details.isFile()) throw new Error(`Expected a regular file: ${target}`);
}

async function requireDirectory(target) {
  const details = await stat(target);
  if (!details.isDirectory()) throw new Error(`Expected a directory: ${target}`);
}

async function requireIdentical(relative) {
  const [source, built] = await Promise.all([
    readFile(path.join(root, relative)),
    readFile(path.join(dist, relative))
  ]);
  if (!source.equals(built)) throw new Error(`${relative} differs between source and dist; update the source before publishing.`);
}

const actualTopLevel = (await readdir(dist)).sort((left, right) => left.localeCompare(right));
if (JSON.stringify(actualTopLevel) !== JSON.stringify(expectedTopLevel)) {
  throw new Error(`Unexpected dist layout: ${actualTopLevel.join(', ')}`);
}

await listFiles(dist);

await Promise.all([
  requireFile(path.join(dist, 'service-worker.js')),
  requireFile(path.join(dist, 'asset-manifest.json')),
  requireDirectory(path.join(dist, 'assets')),
  requireDirectory(path.join(dist, 'vendor')),
  requireIdentical('index.html'),
  requireIdentical('manifest.webmanifest'),
  requireIdentical('THIRD_PARTY_NOTICES.md')
]);

const builtWorker = await readFile(path.join(dist, 'service-worker.js'), 'utf8');
if (builtWorker.includes('__CM_')) throw new Error('The built service worker still contains an unreplaced placeholder.');

for (const directory of ['assets', 'vendor']) {
  const target = path.join(root, directory);
  await rm(target, { recursive: true, force: true });
  await cp(path.join(dist, directory), target, { recursive: true, force: false });
}

for (const file of ['service-worker.js', 'asset-manifest.json']) {
  await cp(path.join(dist, file), path.join(root, file), { force: true });
}

await writeFile(path.join(root, '.nojekyll'), '');

const manifest = JSON.parse(await readFile(path.join(root, 'asset-manifest.json'), 'utf8'));
for (const [relative, expected] of Object.entries(manifest.files)) {
  const bytes = await readFile(path.join(root, relative.replace(/^\.\//, '')));
  if (bytes.length !== expected.bytes || digest(bytes) !== expected.sha256) {
    throw new Error(`Published runtime verification failed for ${relative}`);
  }
}

await requireIdentical('asset-manifest.json');

console.log('Synchronized the generated Comment Master runtime to the GitHub Pages branch root.');
