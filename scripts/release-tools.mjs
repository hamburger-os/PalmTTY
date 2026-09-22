export const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-(?:alpha|beta|rc)\.\d+)?$/;

export const APPROVED_LICENSE_IDS = new Set([
  "0BSD",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "BlueOak-1.0.0",
  "CC0-1.0",
  "ISC",
  "MIT",
  "Python-2.0",
  "Unicode-3.0",
  "Unlicense",
  "Zlib"
]);

export function normalizeVersion(value) {
  const version = String(value ?? "").trim().replace(/^v/, "");
  if (!VERSION_PATTERN.test(version)) {
    throw new Error(
      `Unsupported version: ${version || "<empty>"}; use X.Y.Z or X.Y.Z-alpha.N / beta.N / rc.N`
    );
  }
  return version;
}

function extractSection(markdown, label) {
  const lines = markdown.split(/\r?\n/);
  const prefix = `## [${label}]`;
  const start = lines.findIndex(
    (line) => line === prefix || line.startsWith(`${prefix} `)
  );
  if (start < 0) return undefined;

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) {
      end = index;
      break;
    }
  }

  return lines.slice(start + 1, end).join("\n").trim();
}

export function extractReleaseSection(markdown, version) {
  return extractSection(markdown, normalizeVersion(version));
}

function isStandaloneHtmlComment(line) {
  if (!line.startsWith("<!--") || !line.endsWith("-->")) return false;
  const body = line.slice(4, -3);
  return !body.includes("<!--") && !body.includes("-->");
}

export function isUnreleasedEmpty(markdown) {
  const body = extractSection(markdown, "Unreleased");
  if (body === undefined) return false;

  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .every((line) => line.length === 0 || isStandaloneHtmlComment(line));
}

function isApprovedLicenseExpression(expression) {
  const value = String(expression ?? "").trim();
  if (
    !value ||
    /unknown|unlicensed|see license in|proprietary|custom/i.test(value) ||
    !/^[A-Za-z0-9.+()\-\s]+$/.test(value)
  ) {
    return false;
  }

  const tokens = value.match(/[A-Za-z0-9][A-Za-z0-9.+-]*/g) ?? [];
  let licenseCount = 0;

  for (const token of tokens) {
    if (/^(?:AND|OR)$/i.test(token)) continue;
    if (/^WITH$/i.test(token)) return false;
    licenseCount += 1;
    if (!APPROVED_LICENSE_IDS.has(token)) return false;
  }

  return licenseCount > 0;
}

export function inspectLicenseReport(report) {
  const packages = [];

  if (Array.isArray(report)) {
    for (const item of report) {
      if (item && typeof item === "object") {
        packages.push({
          name: String(item.name ?? "<unknown>"),
          versions: Array.isArray(item.versions)
            ? item.versions.map(String)
            : [String(item.version ?? "<unknown>")],
          license: String(item.license ?? "Unknown")
        });
      }
    }
  } else if (report && typeof report === "object") {
    for (const [groupLicense, entries] of Object.entries(report)) {
      if (!Array.isArray(entries)) continue;
      for (const item of entries) {
        if (!item || typeof item !== "object") continue;
        packages.push({
          name: String(item.name ?? "<unknown>"),
          versions: Array.isArray(item.versions)
            ? item.versions.map(String)
            : [String(item.version ?? "<unknown>")],
          license: String(item.license ?? groupLicense ?? "Unknown")
        });
      }
    }
  }

  if (packages.length === 0) {
    throw new Error("pnpm returned no production dependency license records");
  }

  const failures = [];
  for (const pkg of packages) {
    if (!isApprovedLicenseExpression(pkg.license)) {
      failures.push(
        `${pkg.name}@${pkg.versions.join(",")} = ${pkg.license}`
      );
    }
  }

  if (failures.length > 0) {
    throw new Error(
      "Production dependency licenses require explicit review:\n  - " +
        failures.join("\n  - ")
    );
  }

  return {
    packageCount: packages.length,
    licenses: [...new Set(packages.map((pkg) => pkg.license))].sort()
  };
}
