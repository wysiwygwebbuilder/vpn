Write-Host "=== FINDING LARGE FILES ON C: ===" -ForegroundColor Green

# Find files > 100MB
Write-Host "`nFiles larger than 100MB:" -ForegroundColor Yellow
$largeFiles = Get-ChildItem C:\ -Recurse -File -ErrorAction SilentlyContinue | Where-Object {$_.Length -gt 100MB} | Select-Object FullName, @{N='SizeMB';E={[math]::Round($_.Length/1MB,2)}} | Sort-Object SizeMB -Descending | Select-Object -First 30

$largeFiles | Format-Table -AutoSize

# Find largest folders
Write-Host "`n=== LARGEST FOLDERS ===" -ForegroundColor Yellow
$folders = @(
    "C:\Windows",
    "C:\Program Files",
    "C:\Program Files (x86)",
    "C:\Users",
    "C:\PerfLogs",
    "C:\Intel",
    "C:\MSOCache"
)

foreach ($folder in $folders) {
    if (Test-Path $folder) {
        $size = (Get-ChildItem $folder -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
        if ($size -gt 0) {
            Write-Host "$folder : $([math]::Round($size/1GB, 2)) GB" -ForegroundColor Gray
        }
    }
}

Write-Host "`n=== DONE ===" -ForegroundColor Green
