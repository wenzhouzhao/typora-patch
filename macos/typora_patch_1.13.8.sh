#!/bin/bash
# ============================================================
# Typora 1.13.8 (7712) 许可证绕过补丁脚本
# 适用架构: Apple Silicon (arm64) macOS
# 效果: 允许多标签页 + 消除许可证弹窗
# ============================================================
set -euo pipefail

TYPORA="/Applications/Typora.app/Contents/MacOS/Typora"
BACKUP="${TYPORA}.backup.$(date +%Y%m%d_%H%M%S)"

# 检查是否为 arm64 fat binary
if ! file "$TYPORA" | grep -q "arm64"; then
    echo "错误: Typora 不是 arm64 二进制文件"
    exit 1
fi

# 备份原文件
cp "$TYPORA" "$BACKUP"
echo "已备份: $BACKUP"

# fat binary 中 arm64 切片的偏移 (通过 otool -f 获取)
ARM64_OFFSET=1605632

# ----------------------------------------------------------
# 补丁 1: cannotContonueUse: — 始终返回 0 (允许多标签页)
# 方法入口: arm64 切片 + 0x6BA78
# 原指令: stp x20, x19, [sp, #-0x20]!
# 改为:    mov w0, #0; ret
# ----------------------------------------------------------
printf '\x00\x00\x80\x52\xC0\x03\x5F\xD6' | \
    dd of="$TYPORA" bs=1 seek=$((ARM64_OFFSET + 0x6BA78)) conv=notrunc 2>/dev/null
echo "补丁 1/3: cannotContonueUse: → 始终返回 0"

# ----------------------------------------------------------
# 补丁 2: showLicense: — 直接返回，不弹窗
# 方法入口: arm64 切片 + 0x6F634
# 原指令: sub sp, sp, #0x130
# 改为:    ret
# ----------------------------------------------------------
printf '\xC0\x03\x5F\xD6' | \
    dd of="$TYPORA" bs=1 seek=$((ARM64_OFFSET + 0x6F634)) conv=notrunc 2>/dev/null
echo "补丁 2/3: showLicense: → 静默返回"

# ----------------------------------------------------------
# 补丁 3: showLicenseIfNeeded — 直接返回，不弹窗
# 方法入口: arm64 切片 + 0x6F5F0
# 原指令: stp x20, x19, [sp, #-0x20]!
# 改为:    ret
# ----------------------------------------------------------
printf '\xC0\x03\x5F\xD6' | \
    dd of="$TYPORA" bs=1 seek=$((ARM64_OFFSET + 0x6F5F0)) conv=notrunc 2>/dev/null
echo "补丁 3/3: showLicenseIfNeeded → 静默返回"

# 重签名
codesign --force --deep --sign - "$TYPORA"
echo "签名完成"

# 清理隔离属性
xattr -d com.apple.quarantine "$TYPORA" 2>/dev/null || true

# 重启 Typora
killall Typora 2>/dev/null || true
sleep 1
open /Applications/Typora.app
echo "Typora 已重启，补丁完成。"
