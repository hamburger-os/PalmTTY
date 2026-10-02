import assert from "node:assert/strict";
import test from "node:test";
import { evaluateUnattendedReadiness as evaluate } from "./unattended-readiness-core.mjs";
const ready = () => ({
  schema: 2, osEdition: "Professional", osBuild: 26300,
  windows11Pro: true, rdpEnabled: true, nlaRequired: true, rdpServiceRunning: true,
  gateway: {
    serviceFound: true, serviceRunning: true, automaticStart: true, configReadable: true,
    webAppEnabled: true, customAuthEnabled: true, provisionerConfigured: true, loopbackOnly: true
  }
});
test("all-green configuration is never actual unattended certification", () => {
  const result = evaluate(ready());
  assert.equal(result.blocking.length, 0);
  assert.equal(result.endToEndCertified, false);
  assert.ok(result.requiredManualChecks.length >= 4);
  assert.equal(result.target, "windows-native");
});
test("Hyper-V is absent from Windows-native readiness requirements", () => {
  const { observed } = evaluate(ready());
  assert.ok(!Object.hasOwn(observed, "hyperVAvailable"));
});
test("absent gateway blocks without silently falling back to an open RDP listener", () => {
  const input = ready();
  for (const key of Object.keys(input.gateway)) input.gateway[key] = null;
  assert.ok(evaluate(input).blocking.length >= 7);
});
test("NLA disabled and loopback misconfiguration both block", () => {
  const input = ready();
  input.nlaRequired = false;
  input.gateway.loopbackOnly = false;
  input.gateway.customAuthEnabled = false;
  const result = evaluate(input);
  assert.ok(result.blocking.some((s) => /NLA/.test(s)));
  assert.ok(result.blocking.some((s) => /loopback/.test(s)));
  assert.ok(result.blocking.some((s) => /Custom authentication/.test(s)));
});
test("unknown gateway ACL/config fails closed", () => {
  const input = ready();
  input.gateway.configReadable = null;
  input.gateway.provisionerConfigured = null;
  assert.ok(evaluate(input).blocking.length >= 2);
});
test("unsupported Windows and stopped TermService fail closed", () => {
  const input = ready();
  input.windows11Pro = false;
  input.rdpServiceRunning = false;
  assert.equal(evaluate(input).blocking.length, 2);
});
test("malformed and type-coerced probes cannot appear valid", () => {
  assert.throws(() => evaluate({ ...ready(), schema: 1 }), /Unexpected/);
  assert.throws(() => evaluate({ ...ready(), gateway: { ...ready().gateway, loopbackOnly: "yes" } }), /Invalid/);
  assert.throws(() => evaluate({ ...ready(), gateway: null }), /Invalid/);
  assert.throws(() => evaluate({ ...ready(), osBuild: -1 }), /Invalid/);
});
