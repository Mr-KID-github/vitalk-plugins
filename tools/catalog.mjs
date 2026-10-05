import { validatePluginPackage } from "@vitalk/plugin-sdk";
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const REPOSITORY =
  /^https:\/\/github\.com\/([A-Za-z0-9][A-Za-z0-9_.-]*)\/([A-Za-z0-9][A-Za-z0-9_.-]*)$/;
export function validateListing(value, path) {
  if (!value || typeof value !== "object") throw new Error("清单必须是对象");
  const { id, version, repository, publisher, artifact, minHostVersion } =
    value;
  if (!VERSION.test(version) || !VERSION.test(minHostVersion))
    throw new Error("需要正式版本号");
  if (path !== `plugins/${id}/${version}.json`)
    throw new Error("插件身份与文件路径不一致");
  const repo = REPOSITORY.exec(repository);
  if (!repo || repo[1] !== publisher) throw new Error("发布者与源码仓库不一致");
  validatePluginPackage({
    format: "vitalk-plugin/v1",
    manifest: {
      id,
      name: value.name,
      description: value.description,
      version,
      sdkVersion: value.sdkVersion,
      permissions: value.permissions,
      page: { title: value.name },
    },
    html: "<p>metadata validation</p>",
  });
  if (
    !artifact ||
    !/^[a-f0-9]{64}$/.test(artifact.sha256) ||
    !Number.isInteger(artifact.size) ||
    artifact.size < 1 ||
    artifact.size > 2000000
  )
    throw new Error("安装包摘要或大小无效");
  const prefix = `${repository}/releases/download/v${version}/`;
  if (
    typeof artifact.url !== "string" ||
    !artifact.url.startsWith(prefix) ||
    !/^[A-Za-z0-9_.-]+\.json$/.test(artifact.url.slice(prefix.length))
  )
    throw new Error("需要同仓库固定Release的JSON资产");
  const expected = [
    "id",
    "name",
    "description",
    "version",
    "sdkVersion",
    "permissions",
    "publisher",
    "repository",
    "minHostVersion",
    "artifact",
  ];
  if (
    Object.keys(value).some((key) => !expected.includes(key)) ||
    Object.keys(artifact).some(
      (key) => !["url", "sha256", "size"].includes(key),
    )
  )
    throw new Error("清单包含未知字段");
  return value;
}
export function buildCatalog(listings) {
  const identities = new Map(),
    versions = new Set();
  for (const listing of listings) {
    validateListing(listing, `plugins/${listing.id}/${listing.version}.json`);
    const key = `${listing.id}@${listing.version}`;
    if (versions.has(key)) throw new Error("重复版本");
    versions.add(key);
    const owner = `${listing.publisher}|${listing.repository}`;
    if (identities.has(listing.id) && identities.get(listing.id) !== owner)
      throw new Error("同一插件不能更换仓库或发布者，转移需要单独管理员审核");
    identities.set(listing.id, owner);
  }
  return {
    format: "vitalk-plugin-catalog/v1",
    plugins: [...listings].sort(
      (a, b) =>
        a.id.localeCompare(b.id) || compareVersion(b.version, a.version),
    ),
  };
}
function compareVersion(a, b) {
  const x = a.split(".").map(BigInt),
    y = b.split(".").map(BigInt);
  for (let i = 0; i < 3; i++) {
    if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
  }
  return 0;
}
export function validateChanges(diff) {
  const lines = diff.trim().split("\n");
  const files = lines.map((line) => {
    const [status, path, ...rest] = line.split("\t");
    if (
      status !== "A" ||
      rest.length ||
      !/^plugins\/[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+\/(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.json$/.test(
        path,
      )
    )
      throw new Error("上架PR只能添加新的固定版本清单");
    return path;
  });
  if (files.length > 20) throw new Error("单次上架最多20个版本");
  return files;
}
