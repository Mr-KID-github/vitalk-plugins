import { createHash } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateChanges, validateListing } from './catalog.mjs';
const SHA = /^[a-f0-9]{40}$/;
const REPO = /^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const MAX_FILES = 20, MAX_BYTES = 16384, PAGE_SIZE = 10;
function requireValue(condition, message) { if (!condition) throw new Error(message); }

// Only GitHub JSON responses are accepted. No contributor commands, URLs or filesystem are executed.
export async function collectSubmission({ repository, number, baseSha, headSha, api }) {
  requireValue(REPO.test(repository) && Number.isSafeInteger(number) && number > 0 && SHA.test(baseSha) && SHA.test(headSha), '审核事件参数无效');
  const prRoute = `/repos/${repository}/pulls/${number}`;
  const checkSnapshot = pr => {
    requireValue(pr.state === 'open' && pr.base?.sha === baseSha && pr.head?.sha === headSha && pr.base?.repo?.full_name === repository && REPO.test(pr.head?.repo?.full_name), 'PR已变化或不属于目标仓库，请重新运行检查');
    requireValue(Number.isInteger(pr.changed_files) && pr.changed_files > 0 && pr.changed_files <= MAX_FILES, '单次上架需要1至20个版本清单');
  };
  const pr = await api(prRoute);
  checkSnapshot(pr);
  const files = [];
  for (let page = 1; files.length < pr.changed_files; page++) {
    const batch = await api(`${prRoute}/files?per_page=${PAGE_SIZE}&page=${page}`);
    requireValue(Array.isArray(batch) && batch.length > 0 && batch.length <= PAGE_SIZE && files.length + batch.length <= pr.changed_files, 'PR文件分页数量不完整');
    files.push(...batch);
    requireValue(batch.length === PAGE_SIZE || files.length === pr.changed_files, 'PR文件分页提前结束');
  }
  const names = new Set();
  for (const file of files) {
    requireValue(file.status === 'added' && !file.previous_filename && SHA.test(file.sha) && Number.isSafeInteger(file.changes) && file.changes > 0 && file.changes <= MAX_BYTES, '仅允许新增有限大小的普通JSON清单');
    validateChanges(`A\t${file.filename}`);
    requireValue(!names.has(file.filename), 'PR出现重复文件');
    names.add(file.filename);
  }
  const treeCache = new Map();
  const headRepository = pr.head.repo.full_name;
  const readTree = async sha => {
    if (!treeCache.has(sha)) {
      const value = await api(`/repos/${headRepository}/git/trees/${sha}`);
      requireValue(!value.truncated && Array.isArray(value.tree), 'PR树数据不完整');
      treeCache.set(sha, value.tree);
    }
    return treeCache.get(sha);
  };
  const result = [];
  for (const file of files) {
    let treeSha = headSha;
    const parts = file.filename.split('/');
    for (let i = 0; i < parts.length; i++) {
      const entries = (await readTree(treeSha)).filter(entry => entry.path === parts[i]);
      requireValue(entries.length === 1, 'PR路径与固定提交树不一致');
      const entry = entries[0];
      const leaf = i === parts.length - 1;
      requireValue(SHA.test(entry.sha) && (leaf ? entry.type === 'blob' && entry.mode === '100644' && entry.sha === file.sha : entry.type === 'tree' && entry.mode === '040000'), 'PR路径必须是普通文件，拒绝符号链接和子模块');
      treeSha = entry.sha;
    }
    const blob = await api(`/repos/${headRepository}/git/blobs/${file.sha}`);
    requireValue(blob.encoding === 'base64' && blob.sha === file.sha && Number.isInteger(blob.size) && blob.size > 0 && blob.size <= MAX_BYTES && typeof blob.content === 'string' && blob.content.length <= MAX_BYTES * 2, '清单blob类型或大小无效');
    const encoded = blob.content.replace(/\n/g, '');
    requireValue(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded), 'blob编码无效');
    const bytes = Buffer.from(encoded, 'base64');
    requireValue(bytes.length === blob.size && createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])).digest('hex') === file.sha, '清单blob长度或Git摘要不同');
    // Reject invalid UTF-8/JSON now; schema and Release bytes are revalidated by check.mjs.
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    result.push({ path: file.filename, bytes });
  }
  const finalPr = await api(prRoute);
  checkSnapshot(finalPr);
  requireValue(finalPr.changed_files === pr.changed_files && finalPr.head.repo.full_name === headRepository, 'PR在审核期间发生变化');
  return result;
}

export function prepareSubmission(baseRoot, targetRoot, entries) {
  requireValue(!existsSync(targetRoot), '审核目录必须是全新的目录');
  // Trusted base only, nevertheless fail closed on symlinks rather than copying them.
  const inspect = path => {
    const stat = lstatSync(path);
    requireValue(!stat.isSymbolicLink() && (stat.isDirectory() || stat.isFile()), '基线plugins含非普通文件');
    if (stat.isDirectory()) for (const child of readdirSync(path)) inspect(join(path, child));
  };
  const trustedPlugins = join(baseRoot, 'plugins');
  inspect(trustedPlugins);
  for (const entry of entries) {
    validateChanges(`A\t${entry.path}`);
    requireValue(!existsSync(join(baseRoot, entry.path)), '不可覆盖基线已登记版本');
    validateListing(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(entry.bytes)), entry.path);
  }
  mkdirSync(targetRoot);
  cpSync(trustedPlugins, join(targetRoot, 'plugins'), { recursive: true });
  for (const entry of entries) {
    const path = join(targetRoot, entry.path);
    mkdirSync(resolve(path, '..'), { recursive: true });
    writeFileSync(path, entry.bytes, { flag: 'wx' });
  }
  writeFileSync(join(targetRoot, 'reviewed-paths.json'), JSON.stringify(entries.map(entry => entry.path)), { flag: 'wx' });
}

export async function githubJson(route, token) {
  requireValue(route.startsWith('/repos/') && !route.includes('..') && token, 'GitHub API参数无效');
  const response = await fetch(`https://api.github.com${route}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, redirect: 'error', signal: AbortSignal.timeout(30000) });
  requireValue(response.ok, `GitHub API请求失败(${response.status})`);
  const chunks = []; let size = 0;
  for await (const chunk of response.body) { size += chunk.length; requireValue(size <= 2000000, 'GitHub API响应超限'); chunks.push(chunk); }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  requireValue(event.pull_request && event.repository?.full_name === process.env.GITHUB_REPOSITORY, '需要有效PR事件');
  const entries = await collectSubmission({ repository: process.env.GITHUB_REPOSITORY, number: event.number, baseSha: event.pull_request.base.sha, headSha: event.pull_request.head.sha, api: route => githubJson(route, process.env.GH_TOKEN) });
  prepareSubmission(process.cwd(), resolve(process.argv[2]), entries);
  console.log(`已读取并固定验证${entries.length}个新增清单，未检出PR代码`);
}
