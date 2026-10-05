import {
  readFileSync,
  readdirSync,
  lstatSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { validateListing, buildCatalog, validateChanges } from "./catalog.mjs";
const root = resolve(process.argv[2] || ".");
function readListing(path) {
  const full = join(root, path);
  if (lstatSync(full).isSymbolicLink() || lstatSync(full).size > 16384)
    throw new Error("清单文件类型或大小无效");
  return validateListing(JSON.parse(readFileSync(full, "utf8")), path);
}
const listings = [];
for (const id of readdirSync(join(root, "plugins"))) {
  if (id === ".gitkeep") continue;
  const dir = join(root, "plugins", id);
  if (!lstatSync(dir).isDirectory() || lstatSync(dir).isSymbolicLink())
    throw new Error("插件目录类型无效");
  for (const version of readdirSync(dir))
    listings.push(readListing(`plugins/${id}/${version}`));
}
const catalog = buildCatalog(listings);
if (process.env.BASE_SHA && process.env.HEAD_SHA) {
  const diff = execFileSync(
    "git",
    ["diff", "--name-status", process.env.BASE_SHA, process.env.HEAD_SHA],
    { cwd: root, encoding: "utf8" },
  );
  for (const path of validateChanges(diff)) {
    const listing = readListing(path),
      [owner, repo] = listing.repository
        .slice("https://github.com/".length)
        .split("/");
    const release = JSON.parse(
      execFileSync(
        "gh",
        [
          "release",
          "view",
          `v${listing.version}`,
          "--repo",
          `${owner}/${repo}`,
          "--json",
          "tagName,isDraft,isPrerelease,assets",
        ],
        { encoding: "utf8" },
      ),
    );
    if (
      release.isDraft ||
      release.isPrerelease ||
      release.tagName !== `v${listing.version}` ||
      !release.assets.some((a) => a.url === listing.artifact.url)
    )
      throw new Error("需要有效正式Release资产");
    const response = await fetch(listing.artifact.url, {
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error("无法下载安装包");
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 2000000) throw new Error("安装包超限");
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    if (
      size !== listing.artifact.size ||
      createHash("sha256").update(bytes).digest("hex") !==
        listing.artifact.sha256
    )
      throw new Error("Release字节与登记摘要不同");
    const { validatePluginPackage } = await import("@vitalk/plugin-sdk");
    const pkg = validatePluginPackage(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
    );
    for (const field of [
      "id",
      "name",
      "description",
      "version",
      "sdkVersion",
      "permissions",
    ])
      if (
        JSON.stringify(pkg.manifest[field]) !== JSON.stringify(listing[field])
      )
        throw new Error(`安装包与清单${field}不一致`);
  }
}
if (process.argv.includes("--build")) {
  mkdirSync("public", { recursive: true });
  writeFileSync("public/catalog.json", JSON.stringify(catalog, null, 2) + "\n");
  writeFileSync(
    "public/index.html",
    '<!doctype html><meta charset="utf-8"><title>ViTalk Plugin Registry</title><h1>ViTalk Plugin Registry</h1><p><a href="catalog.json">插件目录 catalog.json</a></p>',
  );
}
console.log(`目录校验通过：${listings.length}个固定版本`);
