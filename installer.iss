[Setup]
AppName=Civ1Better
AppVersion=1.0.0.0
AppPublisher=Your Name
AppPublisherURL=https://example.com
DefaultDirName={autopf}\Civ1Better
DefaultGroupName=Civ1Better
OutputDir=Output
OutputBaseFilename=Civ1Better-setup
Compression=lzma
SolidCompression=yes
PrivilegesRequired=lowest
SetupIconFile=icon.ico  ; Add an icon file if you have one
UninstallDisplayIcon={app}\Civ1Better.exe
VersionInfoVersion=1.0.0.0
VersionInfoCompany=Your Name
VersionInfoDescription=Civ1Better Installer
VersionInfoTextVersion=1.0

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "dist\Civ1Better.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "index.html"; DestDir: "{app}"; Flags: ignoreversion
Source: "game.js"; DestDir: "{app}"; Flags: ignoreversion
; Add more files like README.txt if needed
Source: "README.txt"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\Civ1Better"; Filename: "{app}\Civ1Better.exe"
Name: "{group}\Civ1Better Web"; Filename: "{app}\index.html"; IconFilename: "{app}\Civ1Better.exe"  ; Use EXE icon for web shortcut
Name: "{autodesktop}\Civ1Better"; Filename: "{app}\Civ1Better.exe"; Tasks: desktopicon
Name: "{autodesktop}\Civ1Better Web"; Filename: "{app}\index.html"; Tasks: desktopicon; IconFilename: "{app}\Civ1Better.exe"

[Run]
Filename: "{app}\Civ1Better.exe"; Description: "{cm:LaunchProgram,Civ1Better}"; Flags: nowait postinstall skipifsilent

[UninstallDeleteFiles]
; Optional: Clean up web files on uninstall if desired

[Code]
function InitializeSetup(): Boolean;
begin
  Result := True;
  // Add custom logic here if needed, e.g., check for updates
end;