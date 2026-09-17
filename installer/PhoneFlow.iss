#ifndef MyAppVersion
  #define MyAppVersion "0.0.0"
#endif

#define MyAppName "PhoneFlow"
#define MyAppPublisher "PhoneFlow"
#define MyAppUrl "http://localhost:5000"
#define MyAppId "2D854510-0EA8-4A4F-A6EC-31BD01A8FA9C"

[Setup]
AppId={{{#MyAppId}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppUrl}
AppSupportURL={#MyAppUrl}
DefaultDirName={autopf}\PhoneFlow
DefaultGroupName=PhoneFlow
DisableProgramGroupPage=yes
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
WizardStyle=modern dynamic
Compression=lzma2/max
SolidCompression=yes
SetupLogging=yes
CloseApplications=force
RestartApplications=no
UsePreviousAppDir=yes
OutputDir=.build\output
OutputBaseFilename=PhoneFlow-Setup-{#MyAppVersion}
UninstallDisplayName=PhoneFlow
ChangesAssociations=no
ChangesEnvironment=no

[Files]
Source: ".build\stage\release\*"; DestDir: "{app}\releases\{#MyAppVersion}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: ".build\stage\service\PhoneFlowService.exe"; DestDir: "{app}\service"; Flags: ignoreversion
Source: ".build\stage\service\PhoneFlowService.xml"; DestDir: "{app}\service"; Flags: ignoreversion
Source: "support\health-check.ps1"; DestDir: "{app}\tools"; Flags: ignoreversion
Source: "support\validate-config.ps1"; Flags: dontcopy
Source: "README.md"; DestDir: "{app}"; DestName: "INSTALLER_README.md"; Flags: ignoreversion

[Icons]
Name: "{autodesktop}\Open PhoneFlow"; Filename: "{#MyAppUrl}"
Name: "{group}\Open PhoneFlow"; Filename: "{#MyAppUrl}"
Name: "{group}\Uninstall PhoneFlow"; Filename: "{uninstallexe}"

[Run]
Filename: "{#MyAppUrl}"; Description: "Open PhoneFlow"; Flags: shellexec postinstall skipifsilent nowait

[UninstallRun]
Filename: "{app}\service\PhoneFlowService.exe"; Parameters: "stop"; Flags: runhidden waituntilterminated skipifdoesntexist; RunOnceId: "StopPhoneFlowService"
Filename: "{app}\service\PhoneFlowService.exe"; Parameters: "uninstall"; Flags: runhidden waituntilterminated skipifdoesntexist; RunOnceId: "UninstallPhoneFlowService"
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=&quot;PhoneFlow Private LAN&quot;"; Flags: runhidden waituntilterminated; RunOnceId: "RemovePhoneFlowFirewallRule"

[Code]
var
  ConfigModePage: TInputOptionWizardPage;
  ConfigFilePage: TInputFileWizardPage;
  ExistingConfig: Boolean;
  ServiceWasInstalled: Boolean;
  ConfigWasReplaced: Boolean;
  ConfigBackupMade: Boolean;
  PreviousServiceXmlSaved: Boolean;
  StartupCheckPassed: Boolean;

function ProgramDataRoot: String;
begin
  Result := ExpandConstant('{commonappdata}\PhoneFlow');
end;

function InstalledConfigPath: String;
begin
  Result := ProgramDataRoot + '\.env';
end;

function ServiceExecutable: String;
begin
  Result := ExpandConstant('{app}\service\PhoneFlowService.exe');
end;

function ServiceXmlPath: String;
begin
  Result := ExpandConstant('{app}\service\PhoneFlowService.xml');
end;

function StateDirectory: String;
begin
  Result := ProgramDataRoot + '\installer-state';
end;

function PreviousServiceXmlPath: String;
begin
  Result := StateDirectory + '\PhoneFlowService.previous.xml';
end;

function PreviousConfigPath: String;
begin
  Result := StateDirectory + '\.env.previous';
end;

function PowerShellExecutable: String;
begin
  Result := ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe');
end;

function QuoteArgument(Value: String): String;
begin
  Result := '"' + Value + '"';
end;

function RunHidden(FileName, Parameters: String; var ResultCode: Integer): Boolean;
begin
  Result := Exec(FileName, Parameters, '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

function ReadResultFile(FileName, DefaultMessage: String): String;
var
  FileContents: AnsiString;
begin
  Result := DefaultMessage;
  if FileExists(FileName) and LoadStringFromFile(FileName, FileContents) then
    Result := String(FileContents);
end;

function WantsNewConfiguration: Boolean;
begin
  Result := (not ExistingConfig) or
    ((ConfigModePage <> nil) and (ConfigModePage.SelectedValueIndex = 1));
end;

function SelectedConfiguration: String;
begin
  Result := '';
  if (ConfigFilePage <> nil) and (ConfigFilePage.Values[0] <> '') then
    Result := ConfigFilePage.Values[0];
end;

function ValidateSelectedConfiguration: Boolean;
var
  ResultCode: Integer;
  ResultFile: String;
  ScriptFile: String;
  Parameters: String;
  MessageText: String;
begin
  Result := False;
  if not FileExists(SelectedConfiguration) then
  begin
    MsgBox('Select the .env file supplied for this PhoneFlow installation.', mbError, MB_OK);
    Exit;
  end;

  ExtractTemporaryFile('validate-config.ps1');
  ScriptFile := ExpandConstant('{tmp}\validate-config.ps1');
  ResultFile := ExpandConstant('{tmp}\phoneflow-config-validation.txt');
  DeleteFile(ResultFile);
  Parameters := '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File ' +
    QuoteArgument(ScriptFile) + ' -Path ' + QuoteArgument(SelectedConfiguration) +
    ' -ResultFile ' + QuoteArgument(ResultFile);

  if (not RunHidden(PowerShellExecutable, Parameters, ResultCode)) or (ResultCode <> 0) then
  begin
    MessageText := ReadResultFile(ResultFile, 'The selected configuration is not valid.');
    MsgBox(MessageText, mbError, MB_OK);
    Exit;
  end;

  Result := True;
end;

function InitializeSetup: Boolean;
begin
  Result := True;
  ExistingConfig := FileExists(InstalledConfigPath);
  ServiceWasInstalled := RegKeyExists(HKLM64, 'SYSTEM\CurrentControlSet\Services\PhoneFlow');
end;

procedure InitializeWizard;
begin
  ConfigModePage := CreateInputOptionPage(
    wpSelectDir,
    'PhoneFlow configuration',
    'Choose how this release should handle the existing configuration.',
    'Keeping the existing configuration is recommended for normal application updates.',
    True,
    False
  );
  ConfigModePage.Add('Keep the existing configuration (Recommended)');
  ConfigModePage.Add('Replace the configuration with a new .env file');
  ConfigModePage.SelectedValueIndex := 0;

  ConfigFilePage := CreateInputFilePage(
    ConfigModePage.ID,
    'Select PhoneFlow configuration',
    'Choose the .env file supplied for this installation.',
    'Setup validates the file before changing the installed application. The source file is never embedded in PhoneFlow.'
  );
  ConfigFilePage.Add('Environment file:', 'Environment files|*.env|All files|*.*', '.env');
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := False;
  if PageID = ConfigModePage.ID then
    Result := not ExistingConfig
  else if PageID = ConfigFilePage.ID then
    Result := ExistingConfig and (ConfigModePage.SelectedValueIndex = 0);
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if (CurPageID = ConfigFilePage.ID) and WantsNewConfiguration then
    Result := ValidateSelectedConfiguration;
end;

procedure StopPhoneFlowService;
var
  ResultCode: Integer;
begin
  if FileExists(ServiceExecutable) then
    RunHidden(ServiceExecutable, 'stop', ResultCode)
  else if ServiceWasInstalled then
    RunHidden(ExpandConstant('{sys}\sc.exe'), 'stop PhoneFlow', ResultCode);
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  ForceDirectories(StateDirectory);
  DeleteFile(PreviousServiceXmlPath);
  PreviousServiceXmlSaved := FileExists(ServiceXmlPath) and
    CopyFile(ServiceXmlPath, PreviousServiceXmlPath, False);
  StopPhoneFlowService;
end;

procedure PrepareProgramData;
begin
  if not ForceDirectories(ProgramDataRoot) or
     not ForceDirectories(ProgramDataRoot + '\backups') or
     not ForceDirectories(ProgramDataRoot + '\uploads') or
     not ForceDirectories(ProgramDataRoot + '\logs') or
     not ForceDirectories(StateDirectory) then
    RaiseException('Setup could not create the PhoneFlow data directories.');
end;

procedure InstallSelectedConfiguration;
var
  TemporaryConfig: String;
begin
  if not WantsNewConfiguration then
    Exit;

  TemporaryConfig := StateDirectory + '\.env.new';
  DeleteFile(TemporaryConfig);
  if not CopyFile(SelectedConfiguration, TemporaryConfig, False) then
    RaiseException('Setup could not copy the selected configuration.');

  DeleteFile(PreviousConfigPath);
  ConfigBackupMade := FileExists(InstalledConfigPath) and
    CopyFile(InstalledConfigPath, PreviousConfigPath, False);
  if FileExists(InstalledConfigPath) and not ConfigBackupMade then
    RaiseException('Setup could not back up the existing configuration.');

  DeleteFile(InstalledConfigPath);
  if not RenameFile(TemporaryConfig, InstalledConfigPath) then
  begin
    if ConfigBackupMade then
      CopyFile(PreviousConfigPath, InstalledConfigPath, False);
    RaiseException('Setup could not activate the selected configuration.');
  end;
  ConfigWasReplaced := True;
end;

procedure ProtectProgramData;
var
  ResultCode: Integer;
  Parameters: String;
begin
  Parameters := QuoteArgument(ProgramDataRoot) +
    ' /inheritance:r /grant:r *S-1-5-18:(OI)(CI)F *S-1-5-32-544:(OI)(CI)F /Q';
  if (not RunHidden(ExpandConstant('{sys}\icacls.exe'), Parameters, ResultCode)) or
     (ResultCode <> 0) then
    RaiseException('Setup could not protect the PhoneFlow configuration directory.');

  { Only the root has inheritance disabled. Reset descendants so files such as
    .env and service logs inherit the SYSTEM/Administrators grants from it. }
  Parameters := QuoteArgument(ProgramDataRoot + '\*') + ' /reset /T /Q';
  if (not RunHidden(ExpandConstant('{sys}\icacls.exe'), Parameters, ResultCode)) or
     (ResultCode <> 0) then
    RaiseException('Setup could not repair PhoneFlow data file permissions.');
end;

procedure ConfigurePrivateFirewall;
var
  ResultCode: Integer;
begin
  RunHidden(
    ExpandConstant('{sys}\netsh.exe'),
    'advfirewall firewall delete rule name="PhoneFlow Private LAN"',
    ResultCode
  );
  if (not RunHidden(
    ExpandConstant('{sys}\netsh.exe'),
    'advfirewall firewall add rule name="PhoneFlow Private LAN" dir=in action=allow protocol=TCP localport=5000 profile=private',
    ResultCode
  )) or (ResultCode <> 0) then
    RaiseException('Setup could not create the private-network firewall rule.');
end;

procedure ConfigureAndStartService;
var
  ResultCode: Integer;
  Command: String;
begin
  if ServiceWasInstalled then
    Command := 'refresh'
  else
    Command := 'install';

  if (not RunHidden(ServiceExecutable, Command, ResultCode)) or (ResultCode <> 0) then
    RaiseException('Setup could not register the PhoneFlow Windows service.');

  if (not RunHidden(ServiceExecutable, 'start', ResultCode)) or (ResultCode <> 0) then
    RaiseException('Setup could not start the PhoneFlow Windows service.');
end;

function RunStartupCheck(var FailureMessage: String): Boolean;
var
  ResultCode: Integer;
  ResultFile: String;
  Parameters: String;
begin
  ResultFile := StateDirectory + '\startup-check.txt';
  DeleteFile(ResultFile);
  Parameters := '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File ' +
    QuoteArgument(ExpandConstant('{app}\tools\health-check.ps1')) +
    ' -Url "http://127.0.0.1:5000/api/health" -TimeoutSeconds 90 -ResultFile ' +
    QuoteArgument(ResultFile);
  Result := RunHidden(PowerShellExecutable, Parameters, ResultCode) and (ResultCode = 0);
  if not Result then
    FailureMessage := ReadResultFile(ResultFile, 'PhoneFlow failed its startup health check.');
end;

procedure RestorePreviousInstallation;
var
  ResultCode: Integer;
begin
  StopPhoneFlowService;

  if ConfigWasReplaced then
  begin
    DeleteFile(InstalledConfigPath);
    if ConfigBackupMade then
      CopyFile(PreviousConfigPath, InstalledConfigPath, False);
  end;

  if ServiceWasInstalled and PreviousServiceXmlSaved then
  begin
    CopyFile(PreviousServiceXmlPath, ServiceXmlPath, False);
    RunHidden(ServiceExecutable, 'refresh', ResultCode);
    RunHidden(ServiceExecutable, 'start', ResultCode);
  end
  else if not ServiceWasInstalled then
  begin
    RunHidden(ServiceExecutable, 'uninstall', ResultCode);
    RunHidden(
      ExpandConstant('{sys}\netsh.exe'),
      'advfirewall firewall delete rule name="PhoneFlow Private LAN"',
      ResultCode
    );
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  FailureMessage: String;
begin
  if CurStep <> ssPostInstall then
    Exit;

  try
    PrepareProgramData;
    InstallSelectedConfiguration;
    ProtectProgramData;
    ConfigurePrivateFirewall;
    ConfigureAndStartService;
    StartupCheckPassed := RunStartupCheck(FailureMessage);
    if not StartupCheckPassed then
    begin
      RaiseException(FailureMessage + #13#10 + #13#10 +
        'The previous PhoneFlow service configuration has been restored. Check ' +
        ProgramDataRoot + '\logs before trying again.');
    end;
  except
    RestorePreviousInstallation;
    RaiseException(GetExceptionMessage);
  end;
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if (CurPageID = wpFinished) and StartupCheckPassed then
    WizardForm.FinishedLabel.Caption :=
      'PhoneFlow is installed, running, and connected to its database.' + #13#10 + #13#10 +
      'You can now delete the original .env file that you supplied to Setup.';
end;
