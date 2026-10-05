import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const cli = fileURLToPath(new URL("./cli.mjs", import.meta.url));
function exercise(mode) {
  const root = mkdtempSync(join(tmpdir(), "publisher-contract-")),
    bin = join(root, "bin"),
    source = join(root, "source");
  mkdirSync(bin);
  mkdirSync(source);
  writeFileSync(join(source, "private.txt"), "uncommitted private content");
  const pkg = {
    format: "vitalk-plugin/v1",
    manifest: {
      id: "example.daily",
      name: "今日简报",
      description: "fixture",
      version: "1.0.0",
      sdkVersion: 1,
      permissions: [],
      page: { title: "今日简报" },
    },
    html: "<h1>fixture</h1>",
  };
  const script = `#!${process.execPath}
const fs=require('node:fs'),path=require('node:path');const a=process.argv.slice(2),tool=path.basename(process.argv[1]);fs.appendFileSync(process.env.CALL_LOG,JSON.stringify({tool,args:a,cwd:process.cwd()})+'\\n');const pkg=JSON.parse(process.env.PKG);
if(tool==='gh'){
if(a[0]==='auth')process.exit(0);
if(a[0]==='api'){if(a[1]==='user'){console.log('developer');process.exit(0);}console.error('HTTP 404');process.exit(1);}
if(a[0]==='repo'&&a[1]==='view'){console.log(a.includes('viewerPermission')?JSON.stringify({viewerPermission:'WRITE'}):'main');process.exit(0);}
if(a[0]==='release'&&a[1]==='view'){console.log(JSON.stringify({tagName:'v1.0.0',isDraft:false,isPrerelease:false,assets:[{name:'daily.json',url:'https://github.com/example/daily/releases/download/v1.0.0/daily.json'}]}));process.exit(0);}
if(a[0]==='release'&&a[1]==='download'){fs.writeFileSync(path.join(a[a.indexOf('--dir')+1],'daily.json'),JSON.stringify(pkg));process.exit(0);}
if(a[0]==='repo'&&a[1]==='clone'){fs.mkdirSync(a[3],{recursive:true});process.exit(0);}
if(a[0]==='pr'&&a[1]==='list'){console.log(JSON.stringify(process.env.MODE==='repeat'?[{url:'https://github.com/orulink-ai/vitalk-plugins/pull/1'}]:[]));process.exit(0);}
if(a[0]==='pr'&&a[1]==='checkout'){
 const crypto=require('node:crypto'),bytes=Buffer.from(JSON.stringify(pkg));const x={id:pkg.manifest.id,name:pkg.manifest.name,description:pkg.manifest.description,version:'1.0.0',sdkVersion:1,permissions:[],publisher:'example',repository:'https://github.com/example/daily',minHostVersion:'0.6.10',artifact:{url:'https://github.com/example/daily/releases/download/v1.0.0/daily.json',sha256:crypto.createHash('sha256').update(bytes).digest('hex'),size:bytes.length}};
 fs.mkdirSync('plugins/example.daily',{recursive:true});fs.writeFileSync('plugins/example.daily/1.0.0.json',JSON.stringify(x,null,2)+'\\n');process.exit(0);}
if(a[0]==='pr'&&a[1]==='create'){console.log('https://github.com/orulink-ai/vitalk-plugins/pull/1');process.exit(0);}
}
if(tool==='git'&&a.includes('push')&&process.env.MODE==='push-failure')process.exit(1);
`;
  for (const tool of ["gh", "git"])
    writeFileSync(join(bin, tool), script, { mode: 0o755 });
  const log = join(root, "calls.jsonl");
  const args = [
    cli,
    "--repository",
    "example/daily",
    "--tag",
    "v1.0.0",
    "--asset",
    "daily.json",
    "--min-host",
    "0.6.10",
  ];
  if (mode === "dry-run") args.push("--dry-run");
  const result = spawnSync(process.execPath, args, {
    cwd: source,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: bin + ":" + process.env.PATH,
      CALL_LOG: log,
      PKG: JSON.stringify(pkg),
      MODE: mode,
    },
  });
  const calls = readFileSync(log, "utf8")
    .trim()
    .split("\n")
    .map((x) => JSON.parse(x));
  assert.equal(
    readFileSync(join(source, "private.txt"), "utf8"),
    "uncommitted private content",
  );
  rmSync(root, { recursive: true, force: true });
  return { ...result, calls };
}
test("dry run validates bytes without fork, commit, push or PR", () => {
  const x = exercise("dry-run");
  assert.equal(x.status, 0, x.stderr);
  assert.equal(
    x.calls.some(
      (c) =>
        c.tool === "git" ||
        c.args.includes("fork") ||
        c.args.includes("create"),
    ),
    false,
  );
});
test("publishing clones upstream, pushes only listing to fork and reports pending review", () => {
  const x = exercise("new");
  assert.equal(x.status, 0, x.stderr);
  assert.deepEqual(
    x.calls
      .find((c) => c.tool === "gh" && c.args[1] === "clone")
      .args.slice(0, 3),
    ["repo", "clone", "orulink-ai/vitalk-plugins"],
  );
  assert.deepEqual(
    x.calls.find((c) => c.tool === "git" && c.args[0] === "add").args,
    ["add", "--", "plugins/example.daily/1.0.0.json"],
  );
  assert.match(x.stdout, /等待管理员审核/);
});
test("repeat finds existing PR using supported head filter and creates no new PR", () => {
  const x = exercise("repeat");
  assert.equal(x.status, 0, x.stderr);
  assert.equal(
    x.calls.some((c) => c.args[0] === "pr" && c.args[1] === "create"),
    false,
  );
  const list = x.calls.find((c) => c.args[0] === "pr" && c.args[1] === "list");
  assert.equal(list.args[list.args.indexOf("--head") + 1].includes(":"), false);
});
test("failed push never reports publication success or attempts PR creation", () => {
  const x = exercise("push-failure");
  assert.equal(x.status, 1);
  assert.match(x.stderr, /发布未完成/);
  assert.equal(
    x.calls.some((c) => c.args[0] === "pr" && c.args[1] === "create"),
    false,
  );
});
