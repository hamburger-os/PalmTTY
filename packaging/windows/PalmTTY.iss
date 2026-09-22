#ifndef Version
  #error Version is required
#endif
#ifndef SourceDir
  #error SourceDir is required
#endif
#ifndef OutputDir
  #error OutputDir is required
#endif

[Setup]
AppId={{7B33BC73-E537-49B2-B4E2-A5B6A7C6B9D8}
AppName=PalmTTY
AppVersion={#Version}
AppPublisher=PalmTTY contributors
AppPublisherURL=https://github.com/hamburger-os/PalmTTY
AppSupportURL=https://github.com/hamburger-os/PalmTTY/issues
DefaultDirName={localappdata}\Programs\PalmTTY
DefaultGroupName=PalmTTY
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
DisableProgramGroupPage=yes
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
OutputDir={#OutputDir}
OutputBaseFilename=PalmTTY-Setup-{#Version}-win-x64
UninstallDisplayName=PalmTTY
ChangesEnvironment=no
CloseApplications=yes
RestartApplications=no

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\PalmTTY setup info"; Filename: "{cmd}"; Parameters: "/K ""{app}\bin\palmtty.cmd"" info"; WorkingDir: "{app}"
Name: "{group}\PalmTTY service status"; Filename: "{cmd}"; Parameters: "/K ""{app}\bin\palmtty.cmd"" service status"; WorkingDir: "{app}"
Name: "{group}\Open PalmTTY"; Filename: "{cmd}"; Parameters: "/C start """" http://127.0.0.1:17688/"; WorkingDir: "{app}"

[Run]
Filename: "{app}\bin\palmtty.cmd"; Parameters: "init --install-service --quiet"; WorkingDir: "{app}"; Flags: runhidden; StatusMsg: "Initializing PalmTTY..."
Filename: "{cmd}"; Parameters: "/K ""{app}\bin\palmtty.cmd"" info"; WorkingDir: "{app}"; Description: "Show PalmTTY address and access token"; Flags: postinstall nowait skipifsilent

[UninstallRun]
Filename: "{app}\bin\palmtty.cmd"; Parameters: "service uninstall"; WorkingDir: "{app}"; Flags: runhidden; RunOnceId: "PalmTTYServiceUninstall"

[Code]
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
  CliPath: String;
begin
  Result := '';
  CliPath := ExpandConstant('{app}\bin\palmtty.cmd');
  if FileExists(CliPath) then
  begin
    Exec(
      ExpandConstant('{cmd}'),
      '/C ""' + CliPath + '" service uninstall',
      ExpandConstant('{app}'),
      SW_HIDE,
      ewWaitUntilTerminated,
      ResultCode
    );
  end;
end;
