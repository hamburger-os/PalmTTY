# OS autostart and service-management references

This note records the upstream operating-system behavior PalmTTY relies on for current-user autostart. It is not an implementation-status document.

## Windows Task Scheduler

Authoritative Microsoft references:

- Task Scheduler overview: https://learn.microsoft.com/windows/win32/taskschd/task-scheduler-start-page
- Exec action and working directory: https://learn.microsoft.com/windows/win32/taskschd/execaction
- Task Scheduler schema `LogonType`: https://learn.microsoft.com/windows/win32/taskschd/taskschedulerschema-logontype-principaltype-element
- Restart-on-failure schema: https://learn.microsoft.com/windows/win32/taskschd/taskschedulerschema-restartonfailure-settingstype-element
- `schtasks` commands: https://learn.microsoft.com/windows-server/administration/windows-commands/schtasks

PalmTTY interpretation:

- `InteractiveToken` intentionally binds the task to an already logged-on real user instead of storing a password or using LocalSystem/S4U.
- The action runs the exact Node executable and built PalmTTY Agent using absolute paths and the repository as working directory.
- The task may restart a failed Agent, but this does not redefine Session Worker ownership or OS-reboot persistence.

## Linux systemd user service

Authoritative systemd references:

- systemd service units: https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html
- process killing and `KillMode=`: https://www.freedesktop.org/software/systemd/man/latest/systemd.kill.html
- `systemctl --user`: https://www.freedesktop.org/software/systemd/man/latest/systemctl.html
- user lingering: https://www.freedesktop.org/software/systemd/man/latest/loginctl.html

PalmTTY interpretation:

- the Agent is installed as a user service, never root by default;
- `Restart=on-failure` supervises the Agent control plane;
- `KillMode=process` is deliberate because detached Session Workers are independent from the Agent lifetime and must not be treated as ordinary service child processes during an Agent restart;
- lingering is an operator/host-policy choice and is never enabled automatically by PalmTTY.

## Secret transport

PalmTTY may pass an **environment-file path** in OS service/task arguments, but secret values themselves must not be placed in those arguments. The Agent reads strict `NAME=value` entries before configuration/auth bootstrap. Operators remain responsible for file permissions; Linux autostart installation requires no group/world access.
