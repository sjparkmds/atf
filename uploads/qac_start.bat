@echo off

:: Set Project Path
set Project_Path=C:\ProgramData\Jenkins\.jenkins\workspace\helix

:: Set QACLI Path
set QACLI=C:\Perforce\Helix-QAC-2023.1\common\bin\qacli.exe

:: Set License Server IP
%QACLI% admin --set-license-server 5055@127.0.0.1
 
 
:: Create QAC Project 
%QACLI% admin -P %Project_Path% --qaf-project-config -C generated_cct_C.cct -A Helix.acf -R Helix.rcf
 

:: Synchronize Proejct
cd C:\ProgramData\Jenkins\.jenkins\workspace\helix
make clean
%QACLI% sync -P %Project_Path% -t MONITOR make

:: Analyze Project
%QACLI% analyze -P %Project_Path% -cf

:: Generate Rule Compliance Report
%QACLI% report -P %Project_Path% -t SCR
:: Upload
%QACLI% upload -P %Project_Path% --qav-upload --upload-project HelixQAC --snapshot-name "" --upload-source ALL --url http://127.0.0.1:8090 --username admin --password admin --path-format ROOT