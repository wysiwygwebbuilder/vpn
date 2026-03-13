Write-Host "=== EMERGENCY CLEANUP ===" -ForegroundColor Red

# Get free space BEFORE
$disk = Get-Volume -DriveLetter C
$freeBefore = $disk.SizeRemaining
Write-Host "FREE SPACE BEFORE: $([math]::Round($freeBefore/1GB, 2)) GB" -ForegroundColor Yellow

# Clean Android AVD logs (NOT the images themselves)
Write-Host "`n=== Cleaning Android AVD logs ===" -ForegroundColor Cyan
if (Test-Path "$env:USERPROFILE\.android\avd") {
    $avdLogs = Get-ChildItem "$env:USERPROFILE\.android\avd" -Recurse -File -Include *.log,*.bak -ErrorAction SilentlyContinue
    $avdSize = ($avdLogs | Measure-Object -Property Length -Sum).Sum
    Write-Host "AVD logs size: $([math]::Round($avdSize/1MB, 2)) MB" -ForegroundColor Gray
    $avdLogs | Remove-Item -Force -ErrorAction SilentlyContinue
    Write-Host "AVD logs: CLEANED" -ForegroundColor Green
}

# Clean puppeteer cache
Write-Host "`n=== Cleaning Puppeteer cache ===" -ForegroundColor Cyan
if (Test-Path "$env:USERPROFILE\.cache\puppeteer") {
    $puppeteerSize = (Get-ChildItem "$env:USERPROFILE\.cache\puppeteer" -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
    Write-Host "Puppeteer cache size: $([math]::Round($puppeteerSize/1MB, 2)) MB" -ForegroundColor Gray
    Remove-Item "$env:USERPROFILE\.cache\puppeteer\*" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "Puppeteer cache: CLEANED" -ForegroundColor Green
}

# Clean continue cache
Write-Host "`n=== Cleaning Continue cache ===" -ForegroundColor Cyan
if (Test-Path "$env:USERPROFILE\.continue\.utils\.chromium-browser-snapshots") {
    $continueSize = (Get-ChildItem "$env:USERPROFILE\.continue\.utils\.chromium-browser-snapshots" -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
    Write-Host "Continue chromium cache size: $([math]::Round($continueSize/1MB, 2)) MB" -ForegroundColor Gray
    Remove-Item "$env:USERPROFILE\.continue\.utils\.chromium-browser-snapshots\*" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "Continue chromium cache: CLEANED" -ForegroundColor Green
}

# Clean codeium cache
Write-Host "`n=== Cleaning Codeium cache ===" -ForegroundColor Cyan
if (Test-Path "$env:USERPROFILE\.codeium") {
    $codeiumSize = (Get-ChildItem "$env:USERPROFILE\.codeium" -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
    Write-Host "Codeium cache size: $([math]::Round($codeiumSize/1MB, 2)) MB" -ForegroundColor Gray
    Remove-Item "$env:USERPROFILE\.codeium\*" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "Codeium cache: CLEANED" -ForegroundColor Green
}

# Clean local share opencode
Write-Host "`n=== Cleaning Opencode snapshots ===" -ForegroundColor Cyan
if (Test-Path "$env:USERPROFILE\.local\share\opencode\snapshot") {
    $opencodeSize = (Get-ChildItem "$env:USERPROFILE\.local\share\opencode\snapshot" -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
    Write-Host "Opencode snapshot size: $([math]::Round($opencodeSize/1MB, 2)) MB" -ForegroundColor Gray
    Remove-Item "$env:USERPROFILE\.local\share\opencode\snapshot\*" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "Opencode snapshot: CLEANED" -ForegroundColor Green
}

# Clean Windows error reports
Write-Host "`n=== Cleaning Windows Error Reporting ===" -ForegroundColor Cyan
if (Test-Path "$env:LOCALAPPDATA\CrashDumps") {
    Remove-Item "$env:LOCALAPPDATA\CrashDumps\*" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "CrashDumps: CLEANED" -ForegroundColor Green
}

# Clean DeliveryOptimization cache
Write-Host "`n=== Cleaning DeliveryOptimization cache ===" -ForegroundColor Cyan
if (Test-Path "C:\Windows\ServiceProfiles\NetworkService\AppData\Local\Microsoft\Windows\DeliveryOptimization\Cache") {
    Remove-Item "C:\Windows\ServiceProfiles\NetworkService\AppData\Local\Microsoft\Windows\DeliveryOptimization\Cache\*" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "DeliveryOptimization cache: CLEANED" -ForegroundColor Green
}

# Get free space AFTER
$disk = Get-Volume -DriveLetter C
$freeAfter = $disk.SizeRemaining
Write-Host "`nFREE SPACE AFTER: $([math]::Round($freeAfter/1GB, 2)) GB" -ForegroundColor Yellow
Write-Host "TOTAL FREED: $([math]::Round(($freeAfter - $freeBefore)/1GB, 2)) GB" -ForegroundColor Green

Write-Host "`n=== EMERGENCY CLEANUP COMPLETE ===" -ForegroundColor Green
