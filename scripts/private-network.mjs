import { createHash, X509Certificate } from "node:crypto";
import { readFile, writeFile, mkdir, mkdtemp, rename, rm, copyFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { PRIVATE_NETWORK_TOOLS, privateNetworkRoot } from "../apps/agent/dist/private-gateway.js";

export async function provisionPrivateNetwork(config) {
  if (!config.server.privateGateway) return;
  if (process.platform !== "win32" || process.arch !== "x64") throw new Error("Private gateway provisioning currently supports Windows x64.");
  const root = privateNetworkRoot();
  await mkdir(root, { recursive: true });
  for (const tool of PRIVATE_NETWORK_TOOLS) {
    const target = path.join(root, `${tool.name}-${tool.version}.exe`);
    try { if (!(await stat(target)).isFile()) throw new Error("Tool target must be a regular file"); continue; } catch (error) { if (error.code !== "ENOENT") throw error; }
    const staging = await mkdtemp(path.join(root, "download-"));
    try {
      const response = await fetch(`https://api.github.com/repos/${tool.repository}/releases/assets/${tool.assetId}`, { headers: { Accept: "application/octet-stream", "User-Agent": "PalmTTY-setup" }, signal: AbortSignal.timeout(600_000) });
      if (!response.ok) throw new Error(`Could not download official ${tool.name} archive: ${response.status}`);
      const chunks = []; let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > 64 * 1024 * 1024) throw new Error("Official tool archive exceeds 64 MiB limit.");
        chunks.push(chunk);
      }
      const archive = Buffer.concat(chunks);
      if (createHash("sha256").update(archive).digest("hex") !== tool.sha256) throw new Error(`${tool.name} archive integrity check failed.`);
      const archivePath = path.join(staging, "tool.zip");
      await writeFile(archivePath, archive);
      const unpack = spawnSync("tar.exe", ["-xf", archivePath, "-C", staging, `${tool.name}.exe`], { windowsHide: true, stdio: "ignore", timeout: 30_000 });
      if (unpack.status !== 0) throw new Error(`Could not unpack ${tool.name}.`);
      await rename(path.join(staging, `${tool.name}.exe`), target);
      console.log(`[PalmTTY] Verified ${tool.name} ${tool.version}.`);
    } finally { await rm(staging, { recursive: true, force: true }); }
  }
}

export async function exportPrivateNetworkSetup(config) {
  const gateway = config.server.privateGateway;
  if (!gateway) return;
  const root = privateNetworkRoot();
  const caPath = path.join(root, "pki", "pki", "authorities", "local", "root.crt");
  const certificate = new X509Certificate(await readFile(caPath));
  await mkdir(path.join(root, "public"), { recursive: true });
  await copyFile(caPath, path.join(root, "PalmTTY-root.crt"));
  // Public root certificate only: never copy CA or application private keys.
  const profile = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>PayloadType</key><string>Configuration</string><key>PayloadVersion</key><integer>1</integer>
<key>PayloadIdentifier</key><string>home.arpa.palmtty.root</string>
<key>PayloadUUID</key><string>1E60905C-46F7-4B16-A8B5-1542B1448A76</string>
<key>PayloadDisplayName</key><string>PalmTTY Private HTTPS</string>
<key>PayloadContent</key><array><dict>
<key>PayloadType</key><string>com.apple.security.root</string><key>PayloadVersion</key><integer>1</integer>
<key>PayloadIdentifier</key><string>home.arpa.palmtty.root.certificate</string>
<key>PayloadUUID</key><string>B35712DC-FDB0-4A66-A281-D18C6F4DC526</string>
<key>PayloadDisplayName</key><string>PalmTTY Private Root</string>
<key>PayloadContent</key><data>${certificate.raw.toString("base64")}</data>
</dict></array></dict></plist>`;
  await writeFile(path.join(root, "PalmTTY-HTTPS.mobileconfig"), profile);
  await writeFile(path.join(root, "public", "PalmTTY-HTTPS.mobileconfig"), profile);
  await copyFile(caPath, path.join(root, "public", "PalmTTY-root.crt"));
  const names = [config.server.exposure.origins[0], ...Object.values(config.integrations).map((entry) => entry.url)].map((value) => new URL(value).hostname);
  const instructions = `PalmTTY 私有网络配置

入口：https://${names[0]}/
Code：https://${names[1]}/
Harness：https://${names[2]}/

WireGuard 客户端 DNS 改为 ${gateway.listenHost}，确认 AllowedIPs 包含此地址。
其他域名查询由主机转发到既有 DNS ${gateway.upstreamDns}。

iPhone：安装 PalmTTY-HTTPS.mobileconfig，再到 设置 > 通用 > 关于本机 > 证书信任设置，启用根证书完全信任。
Windows：certutil -user -addstore Root "${path.join(root, "PalmTTY-root.crt")}"
Windows 可使用以下 hosts 记录，或明确将网络适配器 DNS 指向上述地址：
${gateway.listenHost} ${names.join(" ")}

根证书 SHA-256：${certificate.fingerprint256}

如需放行 Windows 入站防火墙，请由操作者在管理员 PowerShell 明确运行：
& "${path.join(root, "configure-firewall.ps1")}"
脚本只更改三个具名 PalmTTY 规则，限制指定网关程序、内网地址和私有来源，放行 HTTPS、公开证书配置页及 TCP/UDP DNS；不自动提权。

手机首次配置页：http://${gateway.listenHost}:${config.server.port}/
不需要路由器公网端口转发。分别完成应用首次授权后，在 PalmTTY 页内使用。
`;
  await writeFile(path.join(root, "连接说明.txt"), instructions, "utf8");
  await writeFile(path.join(root, "public", "index.html"), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PalmTTY 私有网络配置</title><body><h1>PalmTTY 私有网络配置</h1><p>这是证书安装页。不要在此输入访问令牌。</p><ol><li>将 WireGuard 客户端 DNS 设置为 <strong>${gateway.listenHost}</strong>，确认隧道路由包含此地址。</li><li>iPhone：<a href="/PalmTTY-HTTPS.mobileconfig">安装 HTTPS 根证书描述文件</a>，随后到“设置 → 通用 → 关于本机 → 证书信任设置”启用完全信任。</li><li>其他设备：<a href="/PalmTTY-root.crt">下载公开根证书</a>并明确导入受信任根证书。</li><li>打开 <a href="https://${names[0]}/">PalmTTY HTTPS 工作台</a>，分别完成 Code、Harness 首次授权。</li></ol><p>根证书 SHA-256：${certificate.fingerprint256}</p></body></html>`, "utf8");
  const tools = Object.fromEntries(PRIVATE_NETWORK_TOOLS.map((tool) => [tool.name, path.join(root, `${tool.name}-${tool.version}.exe`)]));
  const literal = (value) => "'" + String(value).replaceAll("'", "''") + "'";
  const firewall = `# Requires an explicit administrator PowerShell. No elevation is requested by this script.
$ErrorActionPreference = 'Stop'
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Run this reviewed script in an administrator PowerShell.' }
$privateSources = @('LocalSubnet','10.0.0.0/8','172.16.0.0/12','192.168.0.0/16','100.64.0.0/10')
$rules = @(
  @{ Name='PalmTTY-PrivateHTTPS'; Program=${literal(tools.caddy)}; Protocol='TCP'; Ports=@(443,${config.server.port}) },
  @{ Name='PalmTTY-PrivateDNS-UDP'; Program=${literal(tools.coredns)}; Protocol='UDP'; Ports=@(53) },
  @{ Name='PalmTTY-PrivateDNS-TCP'; Program=${literal(tools.coredns)}; Protocol='TCP'; Ports=@(53) }
)
foreach ($rule in $rules) {
  if (Get-NetFirewallRule -Name $rule.Name -ErrorAction SilentlyContinue) { Remove-NetFirewallRule -Name $rule.Name }
  New-NetFirewallRule -Name $rule.Name -DisplayName $rule.Name -Direction Inbound -Action Allow -Profile Any -Program $rule.Program -Protocol $rule.Protocol -LocalAddress ${gateway.listenHost} -LocalPort $rule.Ports -RemoteAddress $privateSources | Out-Null
}
Write-Output 'PalmTTY private-source firewall rules configured.'
`;
  await writeFile(path.join(root, "configure-firewall.ps1"), firewall, "utf8");
  console.log(`[PalmTTY] Private HTTPS client setup: ${path.join(root, "连接说明.txt")}`);
}
