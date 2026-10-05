import test from "node:test";
import assert from "node:assert/strict";
import { validateListing, buildCatalog, validateChanges } from "./catalog.mjs";
const listing = {
  id: "example.daily",
  name: "今日简报",
  description: "每日复盘",
  version: "1.0.0",
  sdkVersion: 1,
  permissions: ["history.read"],
  publisher: "example",
  repository: "https://github.com/example/daily",
  minHostVersion: "0.6.10",
  artifact: {
    url: "https://github.com/example/daily/releases/download/v1.0.0/daily.json",
    sha256: "a".repeat(64),
    size: 150,
  },
};
test("fixed release listing matches its registry path", () =>
  assert.deepEqual(
    validateListing(listing, "plugins/example.daily/1.0.0.json"),
    listing,
  ));
test("path mismatch, latest URL, checksum and capabilities reject", () => {
  for (const x of [
    { ...listing, id: "../x" },
    { ...listing, sdkVersion: 2 },
    { ...listing, permissions: ["native.invoke"] },
    {
      ...listing,
      artifact: {
        ...listing.artifact,
        url: "https://github.com/example/daily/releases/latest/download/daily.json",
      },
    },
    { ...listing, artifact: { ...listing.artifact, sha256: "bad" } },
  ])
    assert.throws(() => validateListing(x, "plugins/example.daily/1.0.0.json"));
});
test("catalog keeps version history and orders semver numerically", () => {
  const newer = {
    ...listing,
    version: "1.10.0",
    artifact: {
      ...listing.artifact,
      url: listing.artifact.url.replace("v1.0.0", "v1.10.0"),
    },
  };
  const x = buildCatalog([
    listing,
    newer,
    {
      ...listing,
      version: "1.2.0",
      artifact: {
        ...listing.artifact,
        url: listing.artifact.url.replace("v1.0.0", "v1.2.0"),
      },
    },
  ]);
  assert.deepEqual(
    x.plugins.map((v) => v.version),
    ["1.10.0", "1.2.0", "1.0.0"],
  );
  assert.equal(x.format, "vitalk-plugin-catalog/v1");
});
test("same version duplicate or publisher takeover reject", () => {
  assert.throws(() => buildCatalog([listing, listing]));
  assert.throws(() =>
    buildCatalog([
      listing,
      {
        ...listing,
        version: "2.0.0",
        publisher: "other",
        repository: "https://github.com/other/daily",
        artifact: {
          ...listing.artifact,
          url: "https://github.com/other/daily/releases/download/v2.0.0/daily.json",
        },
      },
    ]),
  );
});
test("submission can add only immutable version JSON; cannot edit workflow or previous record", () => {
  assert.deepEqual(validateChanges("A\tplugins/example.daily/1.0.0.json\n"), [
    "plugins/example.daily/1.0.0.json",
  ]);
  for (const diff of [
    "M\tplugins/example.daily/1.0.0.json",
    "A\t.github/workflows/x.yml",
    "D\tREADME.md",
    "A\tplugins/../x.json",
    "",
  ])
    assert.throws(() => validateChanges(diff));
});
