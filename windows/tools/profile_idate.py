#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""profile_idate.py — 查看/修改 Typora 的"防篡改安装日期" _iD

背景:
  Typora 的试用天数不是只看注册表 IDate, 还看
  %APPDATA%\\Typora\\profile.data 里的 `_iD`(hex 编码的 JSON, 应用内叫
  "incorrupted InstallDate"), 且以后者为准。补丁(patch_main.js)会在运行时
  双向强制改写它为当天; 本工具用于**手工排查/救急**(例如补丁未生效时)。

用法:
  python profile_idate.py show              # 显示当前版本/_iD/文件信息
  python profile_idate.py set               # 把 _iD 设为今天
  python profile_idate.py set 9/4/2026      # 设为指定日期 (M/D/YYYY)
  python profile_idate.py raw               # 打印解码后的 JSON(截断)

注意:
  只操作 profile.data 的 _iD 字段, 其余内容(hex 编码/JSON 结构)原样保留;
  建议先关闭 Typora 再执行(避免与应用的内存态互相覆盖)。
"""
import os
import re
import sys
import json
import binascii
import datetime


def profile_path():
    return os.path.join(os.environ.get("APPDATA", ""), "Typora", "profile.data")


def load(p):
    """返回 (原始 hex 文本, 解码后 JSON 文本)"""
    raw = open(p, "rb").read()
    hextext = raw.decode("latin1").strip()
    if not re.fullmatch(r"[0-9a-fA-F]+", hextext):
        raise SystemExit("profile.data 不是 hex 编码, 未按预期格式 -> 中止")
    return hextext, binascii.unhexlify(hextext.encode()).decode("utf-8")


def save(p, json_text):
    open(p, "wb").write(binascii.hexlify(json_text.encode("utf-8")))


def today():
    d = datetime.date.today()
    return "%d/%d/%d" % (d.month, d.day, d.year)


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in ("show", "set", "raw"):
        print(__doc__)
        raise SystemExit(2)

    cmd = sys.argv[1]
    p = profile_path()
    if not os.path.isfile(p):
        raise SystemExit("找不到 " + p)

    hextext, jtext = load(p)
    m = re.search(r'"_iD"\s*:\s*"([^"]*)"', jtext)
    meta = "文件 %d B (hex) | 解码 %d B" % (len(hextext), len(jtext))

    if cmd == "show":
        j = json.loads(jtext)
        print("profile.data : %s" % p)
        print("  %s" % meta)
        print("  version     : %s" % j.get("version"))
        print("  uuid        : %s" % j.get("uuid"))
        print("  _iD         : %s   <- 试用天数按它算" % (m.group(1) if m else "(缺失)"))
        print("  今天        : %s" % today())
        return

    if cmd == "raw":
        print(jtext[:2000])
        return

    # set
    target = sys.argv[2] if len(sys.argv) > 2 else today()
    if not re.fullmatch(r"\d{1,2}/\d{1,2}/\d{4}", target):
        raise SystemExit("日期格式应为 M/D/YYYY, 例如 9/4/2026")
    new = re.sub(r'("_iD"\s*:\s*")[^"]*(")', r"\g<1>" + target + r"\g<2>", jtext, count=1)
    if new == jtext:
        raise SystemExit("未找到可替换的 _iD 字段 -> 中止")
    save(p, new)
    print("已设置 _iD = %s" % target)
    print("提示: 建议重启 Typora; 补丁生效时它会在运行时自动改写为当天")


if __name__ == "__main__":
    main()
