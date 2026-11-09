; Atlas v1 Windows installer (NSIS) — platform UI with Scan.
; Directory chooser (default Program Files), app + AppData, desktop/Start Menu
; for Atlas.exe, finish-page launch.

!define PRODUCT_NAME "Atlas"
!define PRODUCT_VERSION "1.3.2"
!define PRODUCT_PUBLISHER "Pragma / Gabawaru"
!define PRODUCT_DIR_REGKEY "Software\Microsoft\Windows\CurrentVersion\App Paths\Atlas.exe"
!define PRODUCT_UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}"

Name "${PRODUCT_NAME}"
OutFile "..\dist\Atlas-Setup.exe"
InstallDir "$PROGRAMFILES64\Atlas"
InstallDirRegKey HKLM "Software\Atlas" "InstallDir"
RequestExecutionLevel admin
Unicode true
SetCompressor /SOLID lzma
BrandingText "Atlas v1"

!include "MUI2.nsh"
!define MUI_ABORTWARNING
!define MUI_ICON "${NSISDIR}\Contrib\Graphics\Icons\modern-install.ico"
!define MUI_UNICON "${NSISDIR}\Contrib\Graphics\Icons\modern-uninstall.ico"
!define MUI_FINISHPAGE_RUN "$INSTDIR\Atlas.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Lancer Atlas"
!define MUI_FINISHPAGE_NOAUTOCLOSE

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "French"
!insertmacro MUI_LANGUAGE "English"

Section "Atlas" SecMain
  SectionIn RO
  SetOutPath "$INSTDIR"
  File "..\payload\Atlas.exe"
  File "..\payload\AtlasLocal.exe"
  File "..\payload\README.txt"
  SetOutPath "$INSTDIR\tools"
  File "..\payload\tools\Install-AtlasPrereqs.cmd"
  File "..\payload\tools\Install-AtlasPrereqs.ps1"

  CreateDirectory "$APPDATA\Atlas"
  FileOpen $0 "$APPDATA\Atlas\install-path.txt" w
  FileWrite $0 "$INSTDIR"
  FileClose $0

  CreateDirectory "$SMPROGRAMS\Atlas"
  CreateShortCut "$SMPROGRAMS\Atlas\Atlas.lnk" "$INSTDIR\Atlas.exe"
  CreateShortCut "$SMPROGRAMS\Atlas\Demarrer l'API.lnk" "$INSTDIR\AtlasLocal.exe" "start"
  CreateShortCut "$SMPROGRAMS\Atlas\Installer le stack.lnk" "$INSTDIR\AtlasLocal.exe" "install"
  CreateShortCut "$SMPROGRAMS\Atlas\Desinstaller Atlas.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortCut "$DESKTOP\Atlas.lnk" "$INSTDIR\Atlas.exe"

  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKLM "Software\Atlas" "InstallDir" "$INSTDIR"
  WriteRegStr HKLM "${PRODUCT_DIR_REGKEY}" "" "$INSTDIR\Atlas.exe"
  WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "DisplayName" "${PRODUCT_NAME}"
  WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "DisplayVersion" "${PRODUCT_VERSION}"
  WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "Publisher" "${PRODUCT_PUBLISHER}"
  WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "DisplayIcon" "$INSTDIR\Atlas.exe"
  WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "UninstallString" "$INSTDIR\Uninstall.exe"
  WriteRegDWORD HKLM "${PRODUCT_UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKLM "${PRODUCT_UNINST_KEY}" "NoRepair" 1

  MessageBox MB_YESNO|MB_ICONQUESTION "Voulez-vous créer une icône pour le désinstalleur ?" IDNO skipUninstDesktop
  CreateShortCut "$DESKTOP\Desinstaller Atlas.lnk" "$INSTDIR\Uninstall.exe"
  skipUninstDesktop:
SectionEnd

Section "Uninstall"
  Delete "$INSTDIR\Atlas.exe"
  Delete "$INSTDIR\AtlasLocal.exe"
  Delete "$INSTDIR\README.txt"
  Delete "$INSTDIR\tools\Install-AtlasPrereqs.cmd"
  Delete "$INSTDIR\tools\Install-AtlasPrereqs.ps1"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR\tools"
  RMDir "$INSTDIR"
  Delete "$DESKTOP\Atlas.lnk"
  Delete "$DESKTOP\Desinstaller Atlas.lnk"
  Delete "$SMPROGRAMS\Atlas\Atlas.lnk"
  Delete "$SMPROGRAMS\Atlas\Demarrer l'API.lnk"
  Delete "$SMPROGRAMS\Atlas\Installer le stack.lnk"
  Delete "$SMPROGRAMS\Atlas\Desinstaller Atlas.lnk"
  RMDir "$SMPROGRAMS\Atlas"
  DeleteRegKey HKLM "${PRODUCT_UNINST_KEY}"
  DeleteRegKey HKLM "${PRODUCT_DIR_REGKEY}"
  DeleteRegKey HKLM "Software\Atlas"
SectionEnd
