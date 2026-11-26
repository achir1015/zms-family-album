; 資料助秘家庭相簿編輯 — Windows 安裝程式（Inno Setup 6）
; 建置：python tools\build_windows.py（會先打包程式再呼叫 ISCC）
#ifndef AppVer
  #define AppVer "0.9.0"
#endif
#define AppName "資料助秘家庭相簿編輯"
#define AppExe "ZMSFamilyAlbum.exe"

[Setup]
AppId={{6B63218B-7D93-491F-97D3-35F837DE7706}
AppName={#AppName}
AppVersion={#AppVer}
AppVerName={#AppName} {#AppVer}
AppPublisher=吳玉柱
AppCopyright=系統開發：吳玉柱 先生 與 Claude AI Opus 5.5
VersionInfoVersion={#AppVer}
DefaultDirName={autopf}\ZMSFamilyAlbum
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=commandline dialog
OutputDir=..\dist-installer
OutputBaseFilename=ZMSFamilyAlbum-Setup-{#AppVer}
SetupIconFile=icon.ico
UninstallDisplayIcon={app}\{#AppExe}
UninstallDisplayName={#AppName}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.17763
CloseApplications=force
RestartApplications=no

[Languages]
Name: "cht"; MessagesFile: "ChineseTraditional.isl"

[Tasks]
Name: "desktopicon"; Description: "建立桌面捷徑"; GroupDescription: "捷徑："

[Files]
Source: "..\dist\ZMSFamilyAlbum\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "mariadb\*"; DestDir: "{app}\mariadb"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "ffmpeg\*"; DestDir: "{app}\ffmpeg"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExe}"; IconFilename: "{app}\{#AppExe}"
Name: "{group}\家庭相簿資料與素材資料夾"; Filename: "{localappdata}\ZMSFamilyAlbum"
Name: "{group}\解除安裝 {#AppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; IconFilename: "{app}\{#AppExe}"; Tasks: desktopicon

[Dirs]
Name: "{localappdata}\ZMSFamilyAlbum"

[Run]
Filename: "{app}\{#AppExe}"; Description: "立即開啟 {#AppName}"; Flags: nowait postinstall skipifsilent
; 程式內「版本更新」以靜默模式安裝後，自動重新開啟
Filename: "{app}\{#AppExe}"; Flags: nowait; Check: WizardSilent

[Messages]
cht.FinishedLabel=安裝完成。%n%n家庭相簿資料與設定存放在：%n%LOCALAPPDATA%\ZMSFamilyAlbum%n（更新或解除安裝都不會刪除資料，請記得定期備份）

[Code]
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then
    if not UninstallSilent then
      MsgBox('程式已移除。您的家庭相簿資料仍保留在：' + #13#10 + ExpandConstant('{localappdata}\ZMSFamilyAlbum') + #13#10 + '如確定不再需要，可自行刪除該資料夾。', mbInformation, MB_OK);
end;
