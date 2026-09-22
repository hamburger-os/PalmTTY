import assert from "node:assert/strict";
import test from "node:test";
import {
  extractReleaseSection,
  inspectLicenseReport,
  isUnreleasedEmpty,
  normalizeVersion
} from "./release-tools.mjs";

test("normalizes supported release versions", () => {
  assert.equal(normalizeVersion("v0.1.0"), "0.1.0");
  assert.equal(normalizeVersion("0.2.0-rc.3"), "0.2.0-rc.3");
  assert.throws(() => normalizeVersion("0.1"));
});

test("extracts one changelog release and detects an empty Unreleased section", () => {
  const changelog = `# Changelog

## [Unreleased]

<!-- Add pending changes here. -->

## [0.1.0]

### Added

- First release.

## Release history

No extra release-note text.

## [0.0.1]

- Old release.
`;

  assert.equal(
    extractReleaseSection(changelog, "0.1.0"),
    "### Added\n\n- First release."
  );
  assert.equal(isUnreleasedEmpty(changelog), true);
  assert.equal(
    isUnreleasedEmpty(changelog.replace("<!-- Add pending changes here. -->", "- Pending.")),
    false
  );
  assert.equal(
    isUnreleasedEmpty(changelog.replace(
      "<!-- Add pending changes here. -->",
      "<!-- multiline\ncomment -->"
    )),
    false
  );
});

test("accepts reviewed permissive production dependency licenses", () => {
  const result = inspectLicenseReport({
    MIT: [
      { name: "a", versions: ["1.0.0"], license: "MIT" }
    ],
    "MIT OR Apache-2.0": [
      { name: "b", versions: ["2.0.0"], license: "MIT OR Apache-2.0" }
    ]
  });

  assert.equal(result.packageCount, 2);
  assert.deepEqual(result.licenses, ["MIT", "MIT OR Apache-2.0"]);
});

test("fails closed for unknown or restricted-only licenses", () => {
  assert.throws(() =>
    inspectLicenseReport({
      "GPL-3.0-only": [
        { name: "restricted", versions: ["1.0.0"], license: "GPL-3.0-only" }
      ]
    })
  );
  assert.throws(() =>
    inspectLicenseReport({
      Unknown: [
        { name: "unknown", versions: ["1.0.0"], license: "Unknown" }
      ]
    })
  );
});
