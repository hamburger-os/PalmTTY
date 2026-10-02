// Read-only host qualification for the proposed unattended browser-RDP mode.
// This never treats a positive registry/VM probe as successful end-to-end login.
export function evaluateUnattendedReadiness(probe, vmRequested = false) {
  if (!probe || probe.schema !== 1 || typeof probe !== "object") {
    throw new Error("Unexpected Windows readiness probe format");
  }
  const booleanOrNull = (value) => value === true || value === false || value === null;
  for (const field of ["windows11Pro", "rdpEnabled", "nlaRequired", "rdpServiceRunning", "hyperVAvailable"]) {
    if (!booleanOrNull(probe[field])) throw new Error("Invalid readiness probe field: " + field);
  }
  if (typeof probe.osEdition !== "string" || typeof probe.osBuild !== "number" ||
      !Number.isSafeInteger(probe.osBuild) || probe.osBuild < 0 ||
      typeof probe.vm !== "object" || probe.vm === null) {
    throw new Error("Invalid readiness probe metadata");
  }
  for (const field of ["found", "running", "automaticStart"]) {
    if (!booleanOrNull(probe.vm[field])) throw new Error("Invalid VM probe field: " + field);
  }
  const blocking = [];
  const warnings = [];
  if (probe.windows11Pro !== true) blocking.push("Windows 11 Pro was not verified; this deployment target requires the native Windows RDP host.");
  if (probe.rdpEnabled !== true) blocking.push("Windows Remote Desktop is disabled or could not be verified.");
  if (probe.nlaRequired !== true) blocking.push("RDP Network Level Authentication is disabled or could not be verified.");
  if (probe.rdpServiceRunning === false) warnings.push("TermService is not currently running; confirm the RDP listener after enabling Remote Desktop.");
  if (probe.rdpServiceRunning === null) warnings.push("TermService status could not be queried.");
  if (vmRequested) {
    if (probe.hyperVAvailable !== true) blocking.push("Hyper-V management was not available to the current user.");
    if (probe.vm.found !== true) blocking.push("The named gateway VM could not be verified.");
    if (probe.vm.automaticStart !== true) blocking.push("The gateway VM must use AutomaticStartAction=Start.");
    if (probe.vm.running !== true) warnings.push("The named gateway VM is not currently running or its state could not be queried.");
  } else {
    warnings.push("No --vm was supplied. Verify the gateway runs on an always-on host before user login.");
  }
  return {
    schema: 1,
    observed: {
      osEdition: probe.osEdition,
      osBuild: probe.osBuild,
      windows11Pro: probe.windows11Pro,
      rdpEnabled: probe.rdpEnabled,
      nlaRequired: probe.nlaRequired,
      rdpServiceRunning: probe.rdpServiceRunning,
      hyperVAvailable: probe.hyperVAvailable,
      ...(vmRequested ? { vm: { ...probe.vm } } : {})
    },
    blocking,
    warnings,
    // Neither a running VM nor an enabled RDP registry key proves a usable browser session.
    requiredManualChecks: [
      "Verify the Guacamole gateway is patched, authenticated, TLS-protected and isolated from public RDP access.",
      "Complete a real cold-boot, monitor-disconnected, pre-login iPhone Safari -> Guacamole -> NLA -> Windows test.",
      "Verify Windows lock, RDP disconnect/reconnect, credential handling, desktop input and Remote App ownership.",
      "Confirm Windows and VM reboot recovery, timeouts, network loss and shutdown behavior."
    ],
    endToEndCertified: false
  };
}
