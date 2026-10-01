import { spawn } from "node:child_process";
import path from "node:path";

const root = process.argv[2];
if (!root) throw new Error("Usage: remote-app-host-smoke.mjs <installed-root>");
const helper = path.join(root, "bin", "palmtty-remote-app-host.exe");
const child = spawn(helper, [], {
  windowsHide: true, stdio: ["pipe", "pipe", "pipe"]
});
let stderr = "";
child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => {
  stderr = (stderr + chunk).slice(-4096);
});

const result = await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => {
    child.kill();
    reject(new Error("Native Remote App host failed to report its launch error"));
  }, 8000);
  child.once("error", (error) => { clearTimeout(timeout); reject(error); });
  child.once("close", (code) => { clearTimeout(timeout); resolve(code); });
  child.stdin.end(JSON.stringify({
    kind: "packaged",
    appUserModelId: "InvalidAumid",
    packageFamilyName: "InvalidPackage",
    cwd: root,
    args: [],
    frameRate: 12,
    maxWidth: 1280,
    maxHeight: 800
  }) + "\n");
});
if (result !== 1 || !/PALMTTY_APP_HOST_ERROR stage=validate-profile type=InvalidDataException hresult=0x[0-9A-F]{8}/.test(stderr))
  throw new Error("Native Host must exit 1 and publish a structured bootstrap failure");
console.log("Remote App native host failure-stage smoke: passed");
