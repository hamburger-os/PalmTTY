import assert from "node:assert/strict";
import test from "node:test";
import { evaluateUnattendedReadiness } from "./unattended-readiness-core.mjs";

const probe = () => ({
  schema: 1,
  osEdition: "Professional",
  osBuild: 26100,
  windows11Pro: true,
  rdpEnabled: true,
  nlaRequired: true,
  rdpServiceRunning: true,
  hyperVAvailable: true,
  vm: { found: true, running: true, automaticStart: true }
});
test("readiness always requires real browser-to-Windows qualification", () => {
  const result = evaluateUnattendedReadiness(probe(), true);
  assert.deepEqual(result.blocking, []);
  assert.equal(result.endToEndCertified, false);
  assert.equal(result.requiredManualChecks.length, 4);
});
test("missing NLA fails closed even when RDP works", () => {
  const result = evaluateUnattendedReadiness({ ...probe(), nlaRequired: null }, true);
  assert.match(result.blocking.join(" "), /Network Level Authentication/);
});
test("missing Hyper-V and unverified VM cannot be certified", () => {
  const result = evaluateUnattendedReadiness({
    ...probe(), hyperVAvailable: false,
    vm: { found: null, running: null, automaticStart: null }
  }, true);
  assert.ok(result.blocking.length >= 3);
});
test("external gateway does not accidentally require a local VM", () => {
  const result = evaluateUnattendedReadiness({
    ...probe(), hyperVAvailable: false,
    vm: { found: null, running: null, automaticStart: null }
  });
  assert.deepEqual(result.blocking, []);
  assert.match(result.warnings.join(" "), /gateway/);
  assert.equal(result.endToEndCertified, false);
});
test("tampered probe cannot masquerade as verified", () => {
  assert.throws(() => evaluateUnattendedReadiness({ ...probe(), rdpEnabled: "yes" }), /Invalid/);
  assert.throws(() => evaluateUnattendedReadiness({ ...probe(), schema: 2 }), /Unexpected/);
});
test("unsupported OS and disabled RDP both block readiness", () => {
  const result = evaluateUnattendedReadiness({
    ...probe(), windows11Pro: false, rdpEnabled: false
  });
  assert.equal(result.blocking.length, 2);
});
