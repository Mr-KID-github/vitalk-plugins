import { createHash } from "node:crypto";
import { validatePluginPackage } from "@vitalk/plugin-sdk";
const REPO = /^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/;
export function buildListing({bytes,release,repository,asset,minHostVersion}) {
  if (!REPO.test(repository) || !/^\d+\.\d+\.\d+$/.test(minHostVersion)) throw new Error("仓库或最低宿主版本无效");
  if (bytes.length>2000000) throw new Error("插件包超过2MB");
  const {manifest:m}=validatePluginPackage(JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes)));
  if (release.isDraft || release.isPrerelease || release.tagName!==`v${m.version}` || !/^\d+\.\d+\.\d+$/.test(m.version)) throw new Error("必须使用与包版本匹配的正式Release");
  const a=release.assets.find(x=>x.name===asset);
  if (!a || a.url!==`https://github.com/${repository}/releases/download/v${m.version}/${encodeURIComponent(asset)}`) throw new Error("安装包不是所选仓库的固定Release资产");
  return {id:m.id,name:m.name,description:m.description,version:m.version,sdkVersion:m.sdkVersion,permissions:[...m.permissions],publisher:repository.split("/")[0],repository:`https://github.com/${repository}`,minHostVersion,artifact:{url:a.url,sha256:createHash("sha256").update(bytes).digest("hex"),size:bytes.length}};
}
export function publicationPlan(listing,registry) {
  if (!REPO.test(registry) || !/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/.test(listing.id) || !/^\d+\.\d+\.\d+$/.test(listing.version)) throw new Error("目录仓库或插件身份不合法");
  return {registry,path:`plugins/${listing.id}/${listing.version}.json`,branch:`codex/plugin-${listing.id}-${listing.version}`,title:`feat(插件): 上架 ${listing.name} ${listing.version}`,body:`## 插件版本\n${listing.id} ${listing.version}\n\n源码：${listing.repository}\n最低ViTalk版本：${listing.minHostVersion}\n权限：${listing.permissions.join("、") || "无"}\n\n安装包摘要：${listing.artifact.sha256}\n\n申请管理员审核固定版本；PR创建成功不等于已经上架。`};
}
