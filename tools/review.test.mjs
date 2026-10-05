import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { collectSubmission, prepareSubmission } from './review.mjs';
const baseSha = 'a'.repeat(40), headSha = 'b'.repeat(40);
const path = 'plugins/example.daily/1.0.0.json';
const bytes = Buffer.from('{"id":"example.daily"}');
const sha = createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])).digest('hex');
function fixture(options = {}) {
  let prReads = 0;
  const files = options.files ?? [{ filename: path, status: 'added', sha, changes: 1 }];
  const routes = [];
  const api = async route => {
    routes.push(route);
    if (route === '/repos/base/registry/pulls/2') {
      prReads++;
      return { state: 'open', changed_files: files.length, base: { sha: baseSha, repo: { full_name: 'base/registry' } }, head: { sha: options.race && prReads > 1 ? 'c'.repeat(40) : headSha, repo: { full_name: 'fork/registry' } } };
    }
    if (route.includes('/pulls/2/files?')) {
      const page = Number(new URL('https://api.github.com' + route).searchParams.get('page'));
      return options.shortPage ? [] : files.slice((page - 1) * 10, page * 10);
    }
    if (route.endsWith(`/git/trees/${headSha}`)) return { tree: [{ path: 'plugins', mode: '040000', type: 'tree', sha: 'd'.repeat(40) }] };
    if (route.endsWith('/git/trees/' + 'd'.repeat(40))) return { tree: [{ path: 'example.daily', mode: '040000', type: 'tree', sha: 'e'.repeat(40) }] };
    if (route.endsWith('/git/trees/' + 'e'.repeat(40))) return { tree: files.map(f => ({ path: f.filename.split('/').at(-1), mode: options.mode ?? '100644', type: 'blob', sha: f.sha })) };
    if (route.includes('/git/blobs/')) return { encoding: 'base64', size: options.size ?? bytes.length, sha, content: (options.corrupt ? Buffer.from('corrupt') : bytes).toString('base64') };
    throw new Error('unexpected route ' + route);
  };
  return { api, routes };
}
const args = { repository: 'base/registry', number: 2, baseSha, headSha };
test('fork data only: fixed SHA trees and blobs, no checkout or raw download', async () => {
  const f = fixture();
  const result = await collectSubmission({ ...args, api: f.api });
  assert.deepEqual(result, [{ path, bytes }]);
  assert.ok(f.routes.includes(`/repos/fork/registry/git/trees/${headSha}`));
  assert.equal(f.routes.filter(r => r === '/repos/base/registry/pulls/2').length, 2);
});
test('paginates all files at bounded ten-entry pages', async () => {
  const files = Array.from({ length: 11 }, (_, i) => ({ filename: `plugins/example.daily/1.0.${i}.json`, status: 'added', sha, changes: 1 }));
  const f = fixture({ files });
  assert.equal((await collectSubmission({ ...args, api: f.api })).length, 11);
  assert.ok(f.routes.some(r => r.endsWith('page=2')));
});
test('rejects modified/deleted/renamed, unsafe paths, duplicate, empty and >20 changes before blobs', async () => {
  const valid = { filename: path, status: 'added', sha, changes: 1 };
  for (const files of [[], [{ ...valid, status: 'modified' }], [{ ...valid, status: 'removed' }], [{ ...valid, status: 'renamed' }], [{ ...valid, filename: '.github/workflows/run.yml' }], [{ ...valid, filename: 'plugins/../x.json' }], [valid, valid], Array.from({ length: 21 }, () => valid), [{ ...valid, sha: 'invalid' }]]) {
    const f = fixture({ files });
    await assert.rejects(collectSubmission({ ...args, api: f.api }));
    assert.ok(!f.routes.some(r => r.includes('/git/blobs/')));
  }
});
test('rejects missing pagination data, raced head or event SHA mismatch', async () => {
  for (const options of [{ shortPage: true }, { race: true }]) await assert.rejects(collectSubmission({ ...args, api: fixture(options).api }));
  await assert.rejects(collectSubmission({ ...args, headSha: 'f'.repeat(40), api: fixture().api }));
});
test('rejects symlink/submodule, size limit, incorrect declared length and blob hash', async () => {
  for (const options of [{ mode: '120000' }, { mode: '160000' }, { size: 16385 }, { size: 1 }, { corrupt: true }]) await assert.rejects(collectSubmission({ ...args, api: fixture(options).api }));
});
test('workflow checks out exactly trusted base and uses API prepared data', () => {
  const workflow = readFileSync(new URL('../.github/workflows/review.yml', import.meta.url), 'utf8');
  assert.equal((workflow.match(/uses: actions\/checkout/g) ?? []).length, 1);
  assert.ok(!workflow.includes('allow-unsafe'));
  assert.ok(workflow.includes('tools/review.mjs'));
  assert.ok(workflow.includes('--changes-file'));
});

const listing = {
  id: 'example.daily', name: 'Daily', description: 'Review', version: '1.0.0', sdkVersion: 1,
  permissions: ['history.read'], publisher: 'example', repository: 'https://github.com/example/daily', minHostVersion: '0.6.11',
  artifact: { url: 'https://github.com/example/daily/releases/download/v1.0.0/daily.json', sha256: 'a'.repeat(64), size: 100 },
};
test('prepares only trusted base plugins and validated new JSON; never copies submitter code', () => {
  const temp = mkdtempSync(join(tmpdir(), 'vitalk-review-test-'));
  try {
    const base = join(temp, 'base'), target = join(temp, 'submission');
    mkdirSync(join(base, 'plugins'), { recursive: true });
    writeFileSync(join(base, 'plugins/.gitkeep'), '');
    writeFileSync(join(base, 'package.json'), '{"scripts":{"postinstall":"bad"}}');
    prepareSubmission(base, target, [{ path, bytes: Buffer.from(JSON.stringify(listing)) }]);
    assert.equal(existsSync(join(target, 'package.json')), false);
    assert.deepEqual(JSON.parse(readFileSync(join(target, path))), listing);
    assert.deepEqual(JSON.parse(readFileSync(join(target, 'reviewed-paths.json'))), [path]);
    assert.throws(() => prepareSubmission(base, target, []), /全新的/);
    mkdirSync(join(base, 'plugins/example.daily'));
    writeFileSync(join(base, path), JSON.stringify(listing));
    const overwritten = join(temp, 'overwritten');
    assert.throws(() => prepareSubmission(base, overwritten, [{ path, bytes: Buffer.from(JSON.stringify(listing)) }]), /不可覆盖/);
    assert.equal(existsSync(overwritten), false);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
test('prepare rejects schema mismatch before creating directory', () => {
  const temp = mkdtempSync(join(tmpdir(), 'vitalk-review-test-'));
  try {
    mkdirSync(join(temp, 'plugins'));
    const target = join(temp, 'submission');
    assert.throws(() => prepareSubmission(temp, target, [{ path, bytes: Buffer.from('{}') }]));
    assert.equal(existsSync(target), false);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
