import { spawn } from "node:child_process";
import { expect, it } from "vitest";
import { spawnOwnedProcess, stopOwnedProcess } from "./owned-process.js";
import { runBoundedProcess } from "./bounded-process.js";

const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function gone(pid: number) {
  for (let i = 0; i < 50 && alive(pid); i++) await new Promise((r) => setTimeout(r, 50));
  expect(alive(pid)).toBe(false);
}
async function firstLine(child: ReturnType<typeof spawnOwnedProcess>): Promise<number> {
  return new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error("Fixture did not become ready")), 4000);
    child.once("error", reject);
    child.stdout.on("data", (data: Buffer) => {
      output += data.toString();
      if (output.includes("\n")) { clearTimeout(timer); resolve(Number(output.split("\n")[0])); }
    });
    child.stderr.resume();
  });
}
const fixture = `const {spawn}=require('node:child_process');
const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
console.log(child.pid);`;

it("closing the lease removes the entire owned tree", async () => {
  const child = spawnOwnedProcess({ executable: process.execPath, args: ["-e", fixture + "setInterval(()=>{},1000)"], cwd: process.cwd(), env: process.env });
  let descendant: number | undefined;
  try { descendant = await firstLine(child); expect(alive(descendant)).toBe(true); }
  finally { await stopOwnedProcess(child); }
  await gone(descendant!);
});

it("reclaims descendants when the workload wrapper exits first", async () => {
  const child = spawnOwnedProcess({ executable: process.execPath, args: ["-e", fixture + "setTimeout(()=>process.exit(0),300)"], cwd: process.cwd(), env: process.env });
  let descendant: number | undefined;
  try { descendant = await firstLine(child); await gone(descendant); }
  finally { await stopOwnedProcess(child); }
});

it("creator termination closes the lease and reclaims its service", async () => {
  const moduleUrl = new URL("../dist/owned-process.js", import.meta.url).href;
  const script = `import {spawnOwnedProcess} from ${JSON.stringify(moduleUrl)};
const child=spawnOwnedProcess({executable:process.execPath,args:['-e','console.log(process.pid);setInterval(()=>{},1000)'],cwd:process.cwd(),env:process.env});
child.stdout.pipe(process.stdout);child.stderr.resume();`;
  const creator = spawn(process.execPath, ["--input-type=module", "-e", script], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  let service: number | undefined;
  try { service = await firstLine(creator); expect(alive(service)).toBe(true); }
  finally { creator.kill(); }
  await gone(service!);
});

it("bounded installation output can truncate without terminating a successful installer", async () => {
  const result = await runBoundedProcess({ executable: process.execPath,
    args: ["-e", "process.stdout.write('x'.repeat(9000))"],
    owned: true, maxStdoutBytes: 8192, truncateStdout: true });
  expect(result.code).toBe(0);
  expect(result.stdoutTruncated).toBe(true);
  expect(result.stdout.byteLength).toBe(8192);
});
