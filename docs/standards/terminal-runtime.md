# Terminal runtime references

Last reviewed: 2026-09-21.

## Microsoft Windows Pseudoconsole (ConPTY)

Authoritative sources:

- https://learn.microsoft.com/windows/console/pseudoconsoles
- https://learn.microsoft.com/windows/console/creating-a-pseudoconsole-session

Microsoft describes a pseudoconsole as a hostable character-mode session whose input/output can be relayed to another terminal application, including a remote terminal. ConPTY transports terminal data as UTF-8.

PalmTTY uses node-pty as the Node.js binding layer instead of calling the Win32 pseudoconsole APIs directly. ConPTY is owned by the per-session Worker process, not by the HTTP/API Agent.

## PowerShell 7

Authoritative sources:

- https://learn.microsoft.com/powershell/module/microsoft.powershell.core/about/about_pwsh
- https://learn.microsoft.com/powershell/scripting/install/install-powershell-on-windows

PowerShell 7 is launched with `pwsh` / `pwsh.exe` and can coexist with Windows PowerShell 5.1. PalmTTY treats PowerShell 7 as the primary Windows shell.

Microsoft documents Microsoft Store/MSIX as a supported PowerShell installation form. Windows App Execution Aliases are special reparse points exposed under the current user's `%LOCALAPPDATA%\Microsoft\WindowsApps` directory. Node's upstream Windows filesystem issue #36790 documents that ordinary `stat`/existence traversal can return `EACCES` for these AppExecLink entries even though the alias exists. PalmTTY therefore preserves a current-user WindowsApps alias as an absolute activation path instead of trying to traverse it to the protected package target.

### Windows environment refresh

Authoritative source:

- https://learn.microsoft.com/dotnet/api/system.environment.getenvironmentvariables

.NET documents that `Environment.GetEnvironmentVariables(EnvironmentVariableTarget.User)` and `Machine` read the Windows operating-system registry sources rather than the already-created process block. PalmTTY uses the inbox Windows PowerShell host only as a bounded bridge to those APIs when constructing a new Windows terminal environment. This allows a newly created/restarted PTY to observe current User/Machine environment values while the long-running Node Agent retains process-local PalmTTY settings.

Additional references:

- https://learn.microsoft.com/windows/msix/psf/create-shortcut-with-script-package-support-framework
- https://github.com/nodejs/node/issues/36790

## Windows Subsystem for Linux (WSL)

Authoritative sources:

- https://learn.microsoft.com/windows/wsl/basic-commands
- https://learn.microsoft.com/windows/wsl/filesystems

PalmTTY's WSL runtime is a Windows-host adapter around `wsl.exe`. Terminal-profile discovery enumerates registered distributions with `wsl.exe --list --quiet` and does not enter/start each distribution merely to populate the selector. PalmTTY also follows Windows Terminal's user-facing profile behavior by excluding the well-known `docker-desktop*` and `rancher-desktop*` WSL utility distributions from the selector. A selected WSL profile therefore represents the distribution itself; unless Custom overrides it, launch uses that distribution's default shell. Distribution selection, Linux working directory and any optional explicit executable are passed as distinct argv values. PalmTTY does not construct one interpolated shell command for launch. The selected Linux path and optional shell are validated through WSL before the workspace is persisted and again before Session creation/restart.

Microsoft documents `WSLENV` as a **colon-delimited** list of variable names; each entry may carry slash flags such as `/p`, `/l`, `/u`, or `/w`. PalmTTY preserves existing entries/flags and appends configured Workspace variable names as additional colon-delimited entries when launching WSL. Workspace values are already expressed for the target Linux environment, so PalmTTY does not add path-translation flags implicitly.

Repository CI does not currently provide a real WSL environment, so WSL remains an implemented adapter with real-host validation still required.

## node-pty

Upstream source: https://github.com/microsoft/node-pty

PalmTTY relies on node-pty for PTY spawn, input, output, resize and termination. On modern Windows this maps to ConPTY. The PTY child process inherits the normal-user launch context carried into the Session Worker, which is why PalmTTY must not be launched elevated by default.

For node-pty 1.1.0, the default Windows ConPTY `kill()` path forks an internal `conpty_console_list_agent` helper before tearing down the pseudoconsole. Upstream issue #952 documents a teardown race in that helper path, and issue #937 tracks the lack of a `windowsHide`-style option for ConPTY child-process windows. PalmTTY therefore selects node-pty's bundled ConPTY DLL path on Windows (`useConptyDll: true`), which avoids that explicit-kill console-list helper while retaining real PTY semantics. This remains an upstream-specific integration choice: Windows CI must exercise it, and release validation must still confirm on a real desktop that explicit termination does not flash a visible console window.

Additional node-pty references:

- https://github.com/microsoft/node-pty/issues/937
- https://github.com/microsoft/node-pty/issues/952

## xterm.js

Upstream source: https://github.com/xtermjs/xterm.js

PalmTTY uses:

- @xterm/xterm in the browser;
- @xterm/headless inside each Session Worker;
- @xterm/addon-serialize for a reconnectable terminal-state snapshot;
- @xterm/addon-fit for browser sizing.

The xterm.js project explicitly lists a server-side headless terminal plus serialize addon as a remote-reconnect use case. The serialize addon restores state by writing its serialized escape-sequence stream back into a terminal, while terminal resizing changes buffer geometry/reflow. PalmTTY therefore treats terminal geometry as part of the recovery boundary: the Worker and browser must agree on rows/columns before a snapshot is serialized/restored, and a geometry change invalidates raw replay as the preferred recovery path.

PalmTTY enables allowProposedApi on the Worker's headless terminal because current serialize-addon usage with headless xterm depends on xterm APIs behind that opt-in. The Node Worker also isolates the current xterm 6 CommonJS-loading workaround behind session-runtime.ts because native Node ESM named imports are not reliable with the published headless package. Re-review both assumptions when upgrading xterm.


## Local session-worker IPC

Windows Worker IPC uses Node's named-pipe support. Recovery does not rely on pipe reachability alone: every Worker requires a high-entropy per-session application secret before accepting control messages.

Current non-Windows CI uses Unix domain sockets with the runtime directory and socket mode restricted to the current user.

PalmTTY intentionally does not use a persisted PID as process identity. A recovery record is accepted only after the Agent reaches the recorded endpoint and authenticates the Worker with the matching session secret. This avoids PID-reuse mistakes during stale-state cleanup.

## Windows TCP endpoint availability

Authoritative sources:

- https://learn.microsoft.com/windows-server/administration/windows-commands/netsh-interface
- https://learn.microsoft.com/troubleshoot/windows-server/networking/error-10013-wsaeacces-is-returned

Windows exposes TCP excluded-port ranges through `netsh interface ipv4/ipv6 show excludedportrange`. Microsoft documents WSAEACCES/10013 as a possible bind failure for excluded ports. PalmTTY does not assume every Windows `EACCES` has that single cause: preflight probes the configured Agent endpoint and reports excluded/reserved ranges, exclusive listeners, and local policy as diagnostic possibilities.
