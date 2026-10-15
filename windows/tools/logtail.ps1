param([int]$N = 30)
$p = "$env:APPDATA\Typora\typora.log"
if (Test-Path $p) {
    Write-Output ("=== tail " + $N + " of " + $p + " ===")
    Get-Content $p -Tail $N
} else {
    Write-Output ("no log at " + $p)
}