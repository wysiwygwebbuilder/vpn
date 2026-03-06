@echo off
chcp 65001 > nul
powershell -Command "Write-Host 'Начинаю очистку...' -ForegroundColor Cyan; $paths = @('$env:LocalAppData\npm-cache', '$env:AppData\npm-cache', '$env:UserProfile\.gradle', '$env:TEMP\*'); foreach ($path in $paths) { if (Test-Path $path) { Write-Host 'Удаляю: $path'; Remove-Item -Path $path -Recurse -Force -ErrorAction SilentlyContinue } else { Write-Host 'Пропускаю (не найдено): $path' -ForegroundColor Yellow } }; Write-Host 'Готово! Диск C: должен задышать.' -ForegroundColor Green"
pause