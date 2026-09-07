$ErrorActionPreference = "SilentlyContinue"
$out = Join-Path $PSScriptRoot "orig_registry"
New-Item -ItemType Directory -Force -Path $out | Out-Null

$keys = @(
  "HKLM\SOFTWARE\Typora",
  "HKLM\SOFTWARE\Classes\Typora.md",
  "HKLM\SOFTWARE\Classes\Typora.markdown",
  "HKLM\SOFTWARE\Classes\Typora.mdown",
  "HKLM\SOFTWARE\Classes\Typora.mkd",
  "HKLM\SOFTWARE\Classes\Typora.mmd",
  "HKLM\SOFTWARE\Classes\Typora.text",
  "HKLM\SOFTWARE\Classes\typora",
  "HKLM\SOFTWARE\Classes\.md",
  "HKLM\SOFTWARE\Classes\.markdown",
  "HKLM\SOFTWARE\Classes\.mdown",
  "HKLM\SOFTWARE\Classes\.mkd",
  "HKLM\SOFTWARE\Classes\.mmd",
  "HKLM\SOFTWARE\Classes\.text",
  "HKLM\SOFTWARE\Classes\.mdwn",
  "HKLM\SOFTWARE\Classes\.apib"
)
foreach ($k in $keys) {
  $name = ($k -replace '[\\/:*?"<>|]', '_')
  reg export $k ("$out\" + $name + ".reg") /y | Out-Null
  if ($LASTEXITCODE -eq 0) { Write-Output ("exported: " + $k) } else { Write-Output ("MISSING : " + $k) }
}
Write-Output "=== RegisteredApplications Typora entry:"
reg query "HKLM\SOFTWARE\RegisteredApplications" /v Typora
Write-Output "=== done"
