# 启动开发版，并与已打包的 Kairos 使用彼此隔离的用户数据目录。

$ErrorActionPreference = "Stop"
$kairosDevRoot = Join-Path $env:LOCALAPPDATA "KairosDev"

Set-Location $PSScriptRoot
$env:KAIROS_USER_DATA_DIR = $kairosDevRoot

try {
    npm start
}
finally {
    Remove-Item Env:KAIROS_USER_DATA_DIR -ErrorAction SilentlyContinue
}
