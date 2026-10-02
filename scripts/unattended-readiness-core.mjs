// v0.3 Windows-native gateway diagnostic. It checks host configuration only;
// it cannot prove a real Windows login or authorize a browser RDP connection.
const isProbeBoolean = (value) => value === true || value === false || value === null;
const gatewayFields = [
  "serviceFound", "serviceRunning", "automaticStart", "configReadable",
  "webAppEnabled", "customAuthEnabled", "provisionerConfigured", "loopbackOnly"
];

export function evaluateUnattendedReadiness(probe) {
  if (!probe || typeof probe !== "object" || Array.isArray(probe) || probe.schema !== 2) {
    throw new Error("Unexpected native-gateway readiness probe format");
  }
  if (typeof probe.osEdition !== "string" || !Number.isSafeInteger(probe.osBuild) ||
      probe.osBuild < 0 || !probe.gateway || typeof probe.gateway !== "object" ||
      Array.isArray(probe.gateway)) {
    throw new Error("Invalid native-gateway readiness probe metadata");
  }
  for (const key of ["windows11Pro", "rdpEnabled", "nlaRequired", "rdpServiceRunning"]) {
    if (!isProbeBoolean(probe[key])) throw new Error("Invalid readiness probe field: " + key);
  }
  for (const key of gatewayFields) {
    if (!isProbeBoolean(probe.gateway[key])) throw new Error("Invalid gateway readiness field: " + key);
  }

  const blocking = [];
  const requireTrue = (value, message) => { if (value !== true) blocking.push(message); };
  requireTrue(probe.windows11Pro, "Windows 11 Pro was not verified.");
  requireTrue(probe.rdpEnabled, "Windows Remote Desktop is disabled or was not verified.");
  requireTrue(probe.nlaRequired, "Windows RDP NLA is disabled or was not verified.");
  requireTrue(probe.rdpServiceRunning, "Windows TermService is stopped or its state is unknown.");
  requireTrue(probe.gateway.serviceFound, "Native Devolutions Gateway Windows service was not verified.");
  requireTrue(probe.gateway.serviceRunning, "Native Gateway Windows service must be running.");
  requireTrue(probe.gateway.automaticStart, "Native Gateway Windows service must start automatically at boot.");
  requireTrue(probe.gateway.configReadable, "Gateway configuration could not be inspected.");
  requireTrue(probe.gateway.webAppEnabled, "Gateway standalone web app is not explicitly enabled.");
  requireTrue(probe.gateway.customAuthEnabled, "Gateway standalone web app must use Custom authentication, never None.");
  requireTrue(probe.gateway.provisionerConfigured, "Gateway provisioner private-key configuration is missing.");
  requireTrue(probe.gateway.loopbackOnly, "Gateway listener must be explicitly restricted to local loopback for PalmTTY integration.");

  return {
    schema: 2,
    target: "windows-native",
    observed: {
      osEdition: probe.osEdition, osBuild: probe.osBuild,
      windows11Pro: probe.windows11Pro, rdpEnabled: probe.rdpEnabled,
      nlaRequired: probe.nlaRequired, rdpServiceRunning: probe.rdpServiceRunning,
      gateway: Object.fromEntries(gatewayFields.map((key) => [key, probe.gateway[key]]))
    },
    blocking,
    warnings: [
      "A Windows-native Gateway standalone web app is suitable for a local feasibility test, not yet the PalmTTY-authenticated production tunnel.",
      "Verify Gateway licensing/standalone deployment and a pinned, security-patched Windows MSI; this check does not inspect the installed version.",
      "Gateway standalone UI can accept destinations; production PalmTTY integration must enforce only the provisioned localhost RDP target through scoped tokens."
    ],
    requiredManualChecks: [
      "Test monitor-free Windows cold boot before any Windows sign-in: native Gateway service and authenticated web UI must be reachable.",
      "Test iPhone Safari Windows NLA authentication, actual RDP desktop input, and certificate/TLS validation.",
      "Verify login/lock/RDP-disconnect/reconnect states with existing PalmTTY Remote App, with zero deferred input replay.",
      "Verify strict Gateway and token-key file ACLs, fixed RDP destination, trusted HTTPS/WSS access and no public 3389.",
      "Repeat after Windows update/reboot, Safari suspension and Wi-Fi/cellular transition."
    ],
    endToEndCertified: false
  };
}
