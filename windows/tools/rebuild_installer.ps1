# 仓库副本: 下列默认路径已脱敏为占位符, 使用前请改成实际路径
param(
    [string]$TyporaRoot = "<项目根目录>",          # 项目根(含 installed\ 与本补丁目录)
    [string]$PatchDir   = "<补丁目录>",
    [string]$Version    = "1.14.10",                      # 打包进安装包的 Typora 版本
    [string]$PristineExeStamp  = "20261015125915",        # 该版本纯净 Typora.exe 备份的时间戳
    [string]$PristineAsarStamp = "20261015125915"         # 该版本纯净 app.asar 备份的时间戳
)
# ============================================================
# rebuild_installer.ps1 — 用当前安装树重新编译预打补丁安装包
#   前提:      1) 已用纯净 exe/asar 备份(见参数) ; 2) stage\app 作为打包树
#   流程:      镜像安装树 → 放入纯净 exe/asar → bundle 补丁 → ISCC 编译 → 交付
#   说明:      参数默认值对应本机上一次构建; 换版本时改 Version 与两个备份戳
# ============================================================
$ErrorActionPreference = "Continue"
$winpatch = Join-Path $TyporaRoot "winpatch"
$stage    = Join-Path $winpatch "stage\app"
$inst     = Join-Path $TyporaRoot "installed"

Write-Output "=== 1. 镜像安装树到 stage (排除卸载器/备份/两个待替换文件) ==="
robocopy $inst $stage /MIR /XF "unins000.dat" "unins000.exe" "Typora.exe" "app.asar" "*.backup.*" /NFL /NDL /NJH | Select-Object -Last 3

Write-Output "=== 2. 放入 $Version 纯净 exe + asar ==="
$exeBak  = Join-Path $inst ("Typora.exe.backup." + $PristineExeStamp)
$asarBak = Join-Path $inst ("resources\app.asar.backup." + $PristineAsarStamp)
if (-not (Test-Path $exeBak))  { Write-Output ("  [中止] 缺少纯净 exe 备份: " + $exeBak);  exit 1 }
if (-not (Test-Path $asarBak)) { Write-Output ("  [中止] 缺少纯净 asar 备份: " + $asarBak); exit 1 }
Copy-Item $exeBak  (Join-Path $stage "Typora.exe") -Force
Copy-Item $asarBak (Join-Path $stage "resources\app.asar") -Force
Write-Output ("  exe=" + (Get-Item (Join-Path $stage "Typora.exe")).Length + "  asar=" + (Get-Item (Join-Path $stage "resources\app.asar")).Length)

Write-Output "=== 3. bundle 模式打补丁 (patch_main.js 打入 asar) ==="
& "node" (Join-Path $PatchDir "patch_typora.js") $stage --bundle
if ($LASTEXITCODE -ne 0) { Write-Output "  [中止] 补丁脚本失败"; exit 1 }

Write-Output "=== 4. 编译安装包 (.iss 的 MyAppVersion 需与 Version 一致) ==="
& (Join-Path $winpatch "inno605\app\ISCC.exe") (Join-Path $winpatch "typora_patched.iss") 2>&1 | Select-Object -Last 3

Write-Output "=== 5. 交付到项目根 ==="
$out = Join-Path $winpatch ("Output\Typora_" + $Version + "_Patched_Setup.exe")
if (Test-Path $out) {
    Copy-Item $out (Join-Path $TyporaRoot ("Typora_" + $Version + "_Patched_Setup.exe")) -Force
    $f = Get-Item (Join-Path $TyporaRoot ("Typora_" + $Version + "_Patched_Setup.exe"))
    Write-Output ("  " + $f.FullName + "  " + $f.Length + "B")
} else {
    Write-Output "  [失败] 未找到编译产物"
}