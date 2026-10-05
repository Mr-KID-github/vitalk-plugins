#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { buildListing, publicationPlan } from "./publish.mjs";
const args=process.argv.slice(2);
if(args.includes("--help")) {
  console.log("vitalk-plugin-publish --repository owner/repo --tag v1.0.0 --asset id.vitalk-plugin.json --min-host 0.6.10 [--registry orulink-ai/vitalk-plugins] [--dry-run]");
  process.exit(0);
}
function option(name,fallback) { const i=args.indexOf(name); if(i<0) {if(fallback!==undefined)return fallback;throw new Error(`缺少 ${name}`);} if(!args[i+1] || args[i+1].startsWith("--"))throw new Error(`缺少 ${name} 的值`);return args[i+1]; }
function run(bin,argv,cwd) {return execFileSync(bin,argv,{cwd,encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();}
let root;
try {
  const repository=option("--repository"),tag=option("--tag"),asset=option("--asset"),minimum=option("--min-host"),registry=option("--registry","orulink-ai/vitalk-plugins");
  if(!/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(repository) || !/^v\d+\.\d+\.\d+$/.test(tag) || !/^[a-zA-Z0-9_.-]+\.json$/.test(asset))throw new Error("仓库、版本或资产文件名无效");
  run("gh",["auth","status"]);
  const access=JSON.parse(run("gh",["repo","view",repository,"--json","viewerPermission"]));
  if(!["ADMIN","MAINTAIN","WRITE"].includes(access.viewerPermission))throw new Error("当前gh账号没有插件源码仓库写权限");
  const release=JSON.parse(run("gh",["release","view",tag,"--repo",repository,"--json","tagName,isDraft,isPrerelease,assets"]));
  root=mkdtempSync(join(tmpdir(),"vitalk-plugin-publish-"));
  run("gh",["release","download",tag,"--repo",repository,"--pattern",asset,"--dir",root]);
  const listing=buildListing({bytes:readFileSync(join(root,asset)),release,repository,asset,minHostVersion:minimum});
  const plan=publicationPlan(listing,registry);
  if(args.includes("--dry-run")) {console.log(JSON.stringify({mode:"仅生成计划，未创建PR",listing,plan},null,2));}
  else {
    const login=run("gh",["api","user","--jq",".login"]);
    const repoName=registry.split("/")[1];
    const base=run("gh",["repo","view",registry,"--json","defaultBranchRef","--jq",".defaultBranchRef.name"]);
    run("gh",["repo","fork",registry,"--clone=false","--default-branch-only"]);
    const checkout=join(root,"registry");
    run("gh",["repo","clone",registry,checkout,"--","--depth=1"]);
    run("git",["remote","set-url","--push","origin",`https://github.com/${login}/${repoName}.git`],checkout);
    const file=join(checkout,plan.path);
    const json=JSON.stringify(listing,null,2)+"\n";
    if(existsSync(file)) {if(readFileSync(file,"utf8")!==json)throw new Error("已发布的同版本记录不能覆盖");console.log("该固定版本已登记，无需再次提交。");}
    else {
      const existing=JSON.parse(run("gh",["pr","list","--repo",registry,"--head",plan.branch,"--author",login,"--state","open","--json","url"]));
      if(existing.length) {run("gh",["pr","checkout",existing[0].url],checkout);if(!existsSync(file)||readFileSync(file,"utf8")!==json)throw new Error("待审同版本记录不同，请检查原PR；不会覆盖");console.log(`已提交，等待审核：${existing[0].url}`);}
      else {
        run("git",["switch","-c",plan.branch],checkout);
        mkdirSync(dirname(file),{recursive:true});writeFileSync(file,json);
        run("git",["add","--",plan.path],checkout);
        run("git",["commit","-m",plan.title,"-m",`目的：登记独立插件的固定Release版本。\n关键变更：仅提交${plan.path}，不包含插件源码或本地工作区文件。\n验证：公开SDK清单验证、实际Release字节SHA256和版本校验通过。`],checkout);
        run("git",["-c","credential.helper=","-c","credential.helper=!gh auth git-credential","push","origin",`HEAD:refs/heads/${plan.branch}`],checkout);
        const body=join(root,"pr-body.md");writeFileSync(body,plan.body);
        const url=run("gh",["pr","create","--repo",registry,"--head",`${login}:${plan.branch}`,"--base",base,"--title",plan.title,"--body-file",body],checkout);
        console.log(`已提交，等待管理员审核：${url}`);
      }
    }
  }
} catch(error) {
  console.error(`发布未完成：${error.message}`);
  process.exitCode=1;
} finally {if(root)rmSync(root,{recursive:true,force:true});}
