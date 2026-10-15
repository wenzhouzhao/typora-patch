; ============================================================
; Typora (Windows x64) — patched build
; Payload version follows {#MyAppVersion} below; the same patch kit
; applies to 1.14.9 and 1.14.10 (see docs: 版本适配记录).
; Inno Setup script, mirrors the original 6.0.0-built installer:
;   - same AppId, same file set, Public Desktop shortcut,
;     HKLM file associations for md/markdown/mdown/mkd/mmd/text
; Payload is the PATCHED tree (stage\app) — installs ready-to-use.
; Compile: ISCC.exe typora_patched.iss
; ============================================================

#define MyAppName "Typora"
#define MyAppVersion "1.14.10"
#define MyAppPublisher "abnerworks"
#define MyAppExeName "Typora.exe"
#define StageRoot "stage\app"

[Setup]
AppId={{37771A20-7167-44C0-B322-FD3E54C56156}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
VersionInfoVersion={#MyAppVersion}
VersionInfoTextVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
ArchitecturesInstallIn64BitMode=x64
ArchitecturesAllowed=x64
PrivilegesRequired=admin
DisableProgramGroupPage=yes
OutputDir=Output
OutputBaseFilename=Typora_{#MyAppVersion}_Patched_Setup
SetupIconFile={#StageRoot}\resources\assets\installer.ico
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName={#MyAppName}
UninstallDisplayIcon={app}\{#MyAppExeName}

[Files]
Source: "{#StageRoot}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"

[Registry]
; ---- ProgIDs (uninstall removes them) ----
Root: HKLM; SubKey: "SOFTWARE\Classes\Typora.md"; ValueType: string; ValueName: ""; ValueData: "Markdown File"; Flags: uninsdeletekey
Root: HKLM; SubKey: "SOFTWARE\Classes\Typora.md"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "abnerworks.Typora"
Root: HKLM; SubKey: "SOFTWARE\Classes\Typora.md\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\assets\file.ico"
Root: HKLM; SubKey: "SOFTWARE\Classes\Typora.md\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\Typora.exe"" ""%1"""
Root: HKLM; SubKey: "SOFTWARE\Classes\Typora.markdown"; ValueType: string; ValueName: ""; ValueData: "Markdown File"; Flags: uninsdeletekey
Root: HKLM; SubKey: "SOFTWARE\Classes\Typora.markdown"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "abnerworks.Typora"
Root: HKLM; SubKey: "SOFTWARE\Classes\Typora.markdown\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\assets\file.ico"
Root: HKLM; SubKey: "SOFTWARE\Classes\Typora.markdown\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\Typora.exe"" ""%1"""
Root: HKLM; SubKey: "SOFTWARE\Classes\Typora.mdown"; ValueType: string; ValueName: ""; ValueData: "Markdown File"; Flags: uninsdeletekey
Root: HKLM; SubKey: "SOFTWARE\Classes\Typora.mdown"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "abnerworks.Typora"
Root: HKLM; SubKey: "SOFTWARE\Classes\Typora.mdown\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\assets\file.ico"
Root: HKLM; SubKey: "SOFTWARE\Classes\Typora.mdown\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\Typora.exe"" ""%1"""
Root: HKLM; SubKey: "SOFTWARE\Classes\Typora.mkd"; ValueType: string; ValueName: ""; ValueData: "Markdown File"; Flags: uninsdeletekey
Root: HKLM; SubKey: "SOFTWARE\Classes\Typora.mkd"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "abnerworks.Typora"
Root: HKLM; SubKey: "SOFTWARE\Classes\Typora.mkd\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\assets\file.ico"
Root: HKLM; SubKey: "SOFTWARE\Classes\Typora.mkd\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\Typora.exe"" ""%1"""
Root: HKLM; SubKey: "SOFTWARE\Classes\Typora.mmd"; ValueType: string; ValueName: ""; ValueData: "Markdown File"; Flags: uninsdeletekey
Root: HKLM; SubKey: "SOFTWARE\Classes\Typora.mmd"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "abnerworks.Typora"
Root: HKLM; SubKey: "SOFTWARE\Classes\Typora.mmd\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\assets\file.ico"
Root: HKLM; SubKey: "SOFTWARE\Classes\Typora.mmd\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\Typora.exe"" ""%1"""
Root: HKLM; SubKey: "SOFTWARE\Classes\Typora.text"; ValueType: string; ValueName: ""; ValueData: "Text File"; Flags: uninsdeletekey
Root: HKLM; SubKey: "SOFTWARE\Classes\Typora.text"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "abnerworks.Typora"
Root: HKLM; SubKey: "SOFTWARE\Classes\Typora.text\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\assets\file.ico"
Root: HKLM; SubKey: "SOFTWARE\Classes\Typora.text\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\Typora.exe"" ""%1"""
; ---- extension -> ProgID (value-level cleanup, keys shared with other apps) ----
Root: HKLM; SubKey: "SOFTWARE\Classes\.md\OpenWithProgids"; ValueType: string; ValueName: "Typora.md"; ValueData: ""; Flags: uninsdeletevalue
Root: HKLM; SubKey: "SOFTWARE\Classes\.markdown\OpenWithProgids"; ValueType: string; ValueName: "Typora.markdown"; ValueData: ""; Flags: uninsdeletevalue
Root: HKLM; SubKey: "SOFTWARE\Classes\.mdown\OpenWithProgids"; ValueType: string; ValueName: "Typora.mdown"; ValueData: ""; Flags: uninsdeletevalue
Root: HKLM; SubKey: "SOFTWARE\Classes\.mkd\OpenWithProgids"; ValueType: string; ValueName: "Typora.mkd"; ValueData: ""; Flags: uninsdeletevalue
Root: HKLM; SubKey: "SOFTWARE\Classes\.mmd\OpenWithProgids"; ValueType: string; ValueName: "Typora.mmd"; ValueData: ""; Flags: uninsdeletevalue
Root: HKLM; SubKey: "SOFTWARE\Classes\.text\OpenWithProgids"; ValueType: string; ValueName: "Typora.text"; ValueData: ""; Flags: uninsdeletevalue
Root: HKLM; SubKey: "SOFTWARE\Classes\.text"; ValueType: string; ValueName: "PerceivedType"; ValueData: "text"; Flags: uninsdeletevalue

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#MyAppName}}"; Flags: nowait postinstall skipifsilent
