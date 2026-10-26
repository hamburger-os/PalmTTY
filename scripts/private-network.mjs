import { createHash, X509Certificate } from "node:crypto";
import { readFile, writeFile, mkdir, mkdtemp, rename, rm, copyFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { integrationAccessUrl } from "../packages/config/dist/index.js";
import { PRIVATE_NETWORK_TOOLS, privateNetworkRoot, privateGatewayPorts } from "../apps/agent/dist/private-gateway.js";

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
  const publicRoot = path.join(root, "public");
  await mkdir(publicRoot, { recursive: true });
  const codeEnabled = config.integrations.vscodeWeb?.mode === "managed";
  let certificate;
  if (codeEnabled) {
    const caPath = path.join(root, "pki", "pki", "authorities", "local", "root.crt");
    certificate = new X509Certificate(await readFile(caPath));
    for (const destination of [root, publicRoot]) await copyFile(caPath, path.join(destination, "PalmTTY-root.crt"));
    // Preserve the existing profile identity and CA; only the new IP leaf changes.
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
    for (const destination of [root, publicRoot]) await writeFile(path.join(destination,"PalmTTY-HTTPS.mobileconfig"),profile);
  } else {
    for (const name of ["PalmTTY-root.crt", "PalmTTY-HTTPS.mobileconfig"]) await rm(path.join(publicRoot,name),{force:true});
  }
  const palmRoot = `http://${gateway.listenHost}:${config.server.port}/`;
  const setupRoot = palmRoot + "network-setup/";
  const applications = Object.keys(config.integrations).filter(id=>config.integrations[id]?.mode==="managed")
    .map(id=>({id,url:integrationAccessUrl(config,id)}));
  const trustInstructions = certificate ? `Code HTTPS 首次使用需信任根证书；已有根信任无需重装。
iPhone：安装 PalmTTY-HTTPS.mobileconfig，在 设置 > 通用 > 关于本机 > 证书信任设置 启用完全信任。
Windows：certutil -user -addstore Root "${path.join(root,"PalmTTY-root.crt")}"
根证书 SHA-256：${certificate.fingerprint256}` : "当前只有 HTTP 应用，不需要证书。";
  await writeFile(path.join(root,"连接说明.txt"),`PalmTTY 内网 IP 访问

入口：${palmRoot}
${applications.map(app=>app.id+"："+app.url).join("\n")}

家中 Wi-Fi 与 5G + WireGuard 使用相同地址，无需设置私有 DNS 或 hosts。
主机 IP 应固定；WireGuard AllowedIPs 需包含 ${gateway.listenHost}。
若旧 WireGuard DNS 仍为此主机，请先恢复为隧道可达的正常 DNS；本软件不再提供 DNS。
${trustInstructions}

应用仍有各自认证。同 IP 不同端口不隔离 Cookie，仅适用于同一可信主机上的自用应用。
如需更新防火墙，请在管理员 PowerShell 明确运行：
& "${path.join(root,"configure-firewall.ps1")}"
脚本只更新具名、程序/私有 IP/私有来源受限的 HTTP/HTTPS 规则，并移除旧 DNS 规则；不自动提权。

公开证书配置页：${setupRoot}
不需要公网端口转发。`,"utf8");
  const certificateLinks = certificate ? `<li>Code HTTPS：<a href="${setupRoot}PalmTTY-HTTPS.mobileconfig">iPhone 根证书描述文件</a>；<a href="${setupRoot}PalmTTY-root.crt">公开根证书</a>。已信任无需重装。</li><li>根证书 SHA-256：${certificate.fingerprint256}</li>` : "";
  await writeFile(path.join(publicRoot,"index.html"),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PalmTTY 内网 IP 访问</title><body><h1>PalmTTY 内网 IP 访问</h1><p>Wi-Fi 和 WireGuard 使用相同 IP 地址，无需私有 DNS。不要在此输入访问令牌。</p><ul><li><a href="${palmRoot}">打开 PalmTTY</a></li>${applications.map(app=>`<li>${app.id}：${app.url}</li>`).join("")}${certificateLinks}</ul><p>WireGuard 路由需包含主机 IP。首次根信任需明确操作，iPhone 安装后需启用完全信任。</p></body></html>`,"utf8");
  const caddy = path.join(root,`caddy-${PRIVATE_NETWORK_TOOLS[0].version}.exe`);
  const literal = value=>"'"+String(value).replaceAll("'","''")+"'";
  const firewall = `# Requires an explicit administrator PowerShell. No automatic elevation.
$ErrorActionPreference = 'Stop'
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Run this reviewed script in an administrator PowerShell.' }
$privateSources = @('LocalSubnet','10.0.0.0/8','172.16.0.0/12','192.168.0.0/16','100.64.0.0/10')
foreach ($retired in @('PalmTTY-PrivateDNS-UDP','PalmTTY-PrivateDNS-TCP')) {
  if (Get-NetFirewallRule -Name $retired -ErrorAction SilentlyContinue) { Remove-NetFirewallRule -Name $retired }
}
$rules = @(
  @{ Name='PalmTTY-PrivateHTTPS'; Program=${literal(caddy)}; Ports=@(${privateGatewayPorts(config).join(",")}) },
  @{ Name='PalmTTY-PrivateHTTP'; Program=${literal(process.execPath)}; Ports=@(${config.server.port}) }
)
foreach ($rule in $rules) {
  if (Get-NetFirewallRule -Name $rule.Name -ErrorAction SilentlyContinue) { Remove-NetFirewallRule -Name $rule.Name }
  New-NetFirewallRule -Name $rule.Name -DisplayName $rule.Name -Direction Inbound -Action Allow -Profile Any -Program $rule.Program -Protocol TCP -LocalAddress ${gateway.listenHost} -LocalPort $rule.Ports -RemoteAddress $privateSources | Out-Null
}
Write-Output 'PalmTTY private-source HTTP/HTTPS firewall rules configured; retired DNS rules removed.'
`;
  await writeFile(path.join(root,"configure-firewall.ps1"),firewall,"utf8");
  console.log(`[PalmTTY] Private IP client setup: ${path.join(root,"连接说明.txt")}`);
}
