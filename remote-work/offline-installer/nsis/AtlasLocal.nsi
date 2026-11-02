; AtlasLocal offline installer (NSIS) — no Cursor dependency
; Build: makensis -DOUTFILE=../dist/AtlasLocal-Setup.exe AtlasLocal.nsi

!ifndef OUTFILE
  !define OUTFILE "..\bin\AtlasLocal-Setup.exe"
!endif

Name "Atlas Local"
OutFile "${OUTFILE}"
InstallDir "$LOCALAPPDATA\AtlasLocal"
RequestExecutionLevel user
Unicode true
SetCompressor /SOLID lzma

Page directory
Page instfiles

Section "Install"
  SetOutPath "$INSTDIR"
  File "..\bin\AtlasLocal.exe"
  File /r "..\scripts"
  File "..\README.md"

  CreateDirectory "$SMPROGRAMS\Atlas Local"
  CreateShortcut "$SMPROGRAMS\Atlas Local\Install Atlas.lnk" "$INSTDIR\AtlasLocal.exe" "install"
  CreateShortcut "$SMPROGRAMS\Atlas Local\Update Atlas.lnk" "$INSTDIR\AtlasLocal.exe" "update"
  CreateShortcut "$SMPROGRAMS\Atlas Local\Start Atlas.lnk" "$INSTDIR\AtlasLocal.exe" "start"
  CreateShortcut "$SMPROGRAMS\Atlas Local\Stop Atlas.lnk" "$INSTDIR\AtlasLocal.exe" "stop"
  CreateShortcut "$SMPROGRAMS\Atlas Local\Watch updates.lnk" "$INSTDIR\AtlasLocal.exe" "watch"
  CreateShortcut "$SMPROGRAMS\Atlas Local\README.lnk" "$INSTDIR\README.md"

  ; Desktop shortcut: Install then Start
  CreateShortcut "$DESKTOP\Atlas Local.lnk" "$INSTDIR\AtlasLocal.exe" "status"

  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateShortcut "$SMPROGRAMS\Atlas Local\Uninstall.lnk" "$INSTDIR\Uninstall.exe"
SectionEnd

Section "Uninstall"
  Delete "$SMPROGRAMS\Atlas Local\*.lnk"
  RMDir "$SMPROGRAMS\Atlas Local"
  Delete "$DESKTOP\Atlas Local.lnk"
  Delete "$INSTDIR\AtlasLocal.exe"
  Delete "$INSTDIR\README.md"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir /r "$INSTDIR\scripts"
  RMDir "$INSTDIR"
SectionEnd
