; Test variant: per-user (no UAC), no registry associations —
; used only to verify the payload installs and runs. Payload identical.
#define MyAppName "Typora"
#define MyAppVersion "1.14.9"
#define MyAppPublisher "abnerworks"
#define MyAppExeName "Typora.exe"
#define StageRoot "stage\app"

[Setup]
AppId={{37771A20-7167-44C0-B322-FD3E54C56156}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
ArchitecturesInstallIn64BitMode=x64
ArchitecturesAllowed=x64
PrivilegesRequired=lowest
DisableProgramGroupPage=yes
OutputDir=Output
OutputBaseFilename=Typora_1.14.9_Patched_Setup_TEST
SetupIconFile={#StageRoot}\resources\assets\installer.ico
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName={#MyAppName}
UninstallDisplayIcon={app}\{#MyAppExeName}

[Files]
Source: "{#StageRoot}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{userdesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#MyAppName}}"; Flags: nowait postinstall skipifsilent
