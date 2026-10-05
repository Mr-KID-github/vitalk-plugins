import test from "node:test";
import assert from "node:assert/strict";
import { buildListing, publicationPlan } from "./publish.mjs";
const pkg = {
  format: "vitalk-plugin/v1",
  manifest: {
    id: "example.daily",
    name: "今日简报",
    description: "每日复盘",
    version: "1.0.0",
    sdkVersion: 1,
    permissions: ["history.read", "ai.generate", "storage"],
    page: { title: "今日简报" },
  },
  html: "<h1>fixture</h1>",
};
const bytes = Buffer.from(JSON.stringify(pkg));
const release = {
  tagName: "v1.0.0",
  isDraft: false,
  isPrerelease: false,
  assets: [
    {
      name: "example.daily.vitalk-plugin.json",
      url: "https://github.com/example/daily/releases/download/v1.0.0/example.daily.vitalk-plugin.json",
    },
  ],
};
const make = (r = release, b = bytes) =>
  buildListing({
    bytes: b,
    release: r,
    repository: "example/daily",
    asset: "example.daily.vitalk-plugin.json",
    minHostVersion: "0.6.10",
  });
test("listing binds downloaded bytes to a fixed release and public manifest", () => {
  const x = make();
  assert.equal(x.id, "example.daily");
  assert.equal(x.artifact.size, bytes.length);
  assert.match(x.artifact.sha256, /^[a-f0-9]{64}$/);
  assert.equal(x.repository, "https://github.com/example/daily");
});
test("draft, prerelease and wrong tag cannot be submitted", () => {
  for (const change of [
    { isDraft: true },
    { isPrerelease: true },
    { tagName: "v2.0.0" },
  ])
    assert.throws(() => make({ ...release, ...change }));
});
test("unknown format, permissions and oversized bytes are rejected", () => {
  for (const p of [
    { ...pkg, format: "vitalk-feature/v1" },
    { ...pkg, manifest: { ...pkg.manifest, permissions: ["invoke"] } },
  ])
    assert.throws(() => make(release, Buffer.from(JSON.stringify(p))));
  assert.throws(() => make(release, Buffer.alloc(2000001)));
});
test("asset must match the declared repository and cannot use latest", () => {
  assert.throws(() =>
    make({
      ...release,
      assets: [
        {
          ...release.assets[0],
          url: "https://github.com/evil/repo/releases/download/latest/x.json",
        },
      ],
    }),
  );
});
test("path and branch are derived from validated id/version and only carry metadata", () => {
  const p = publicationPlan(make(), "orulink-ai/vitalk-plugins");
  assert.equal(p.path, "plugins/example.daily/1.0.0.json");
  assert.equal(p.branch, "codex/plugin-example.daily-1.0.0");
  assert.equal(p.registry, "orulink-ai/vitalk-plugins");
  assert.equal(p.body.includes("<h1>fixture"), false);
  assert.throws(() => publicationPlan(make(), "../evil"));
});
test("SDK version, malformed id and invalid version are rejected", () => {
  for (const change of [
    { sdkVersion: 2 },
    { id: "../evil" },
    { version: "latest" },
  ])
    assert.throws(() =>
      make(
        release,
        Buffer.from(
          JSON.stringify({ ...pkg, manifest: { ...pkg.manifest, ...change } }),
        ),
      ),
    );
});

test("publisher rejects leading-zero versions accepted by the older SDK", () => {
  const version = "01.0.0";
  const invalid = Buffer.from(
    JSON.stringify({ ...pkg, manifest: { ...pkg.manifest, version } }),
  );
  const changed = {
    ...release,
    tagName: `v${version}`,
    assets: [
      {
        ...release.assets[0],
        url: release.assets[0].url.replace("v1.0.0", `v${version}`),
      },
    ],
  };
  assert.throws(() => make(changed, invalid));
});
