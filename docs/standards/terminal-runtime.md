# Terminal runtime references

Last reviewed: 2026-09-19.

## Microsoft Windows Pseudoconsole (ConPTY)

Authoritative sources:

- https://learn.microsoft.com/windows/console/pseudoconsoles
- https://learn.microsoft.com/windows/console/creating-a-pseudoconsole-session

Microsoft describes a pseudoconsole as a hostable character-mode session whose input/output can be relayed to another terminal application, including a remote terminal. ConPTY transports terminal data as UTF-8.

PalmTTY uses `node-pty` as the Node.js binding layer instead of calling the Win32 pseudoconsole APIs directly.

## PowerShell 7

Authoritative sources:

- https://learn.microsoft.com/powershell/module/microsoft.powershell.core/about/about_pwsh
- https://learn.microsoft.com/powershell/scripting/install/install-powershell-on-windows

PowerShell 7 is launched with `pwsh` / `pwsh.exe` and can coexist with Windows PowerShell 5.1. PalmTTY treats PowerShell 7 as the primary Windows shell.

## node-pty

Upstream source: https://github.com/microsoft/node-pty

PalmTTY relies on node-pty for PTY spawn, input, output, resize and termination. On modern Windows this maps to ConPTY. The PTY child process inherits the privileges of the PalmTTY Agent, which is why the Agent must not run elevated by default.

## xterm.js

Upstream source: https://github.com/xtermjs/xterm.js

PalmTTY uses:

- `@xterm/xterm` in the browser;
- `@xterm/headless` on the Agent;
- `@xterm/addon-serialize` for a reconnectable terminal-state snapshot;
- `@xterm/addon-fit` for browser sizing.

The xterm.js project explicitly lists a server-side headless terminal plus serialize addon as a remote-reconnect use case.
