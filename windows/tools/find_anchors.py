#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""find_anchors.py — 新版本适配前侦查: 检查补丁依赖的全部锚点

用法:
  python find_anchors.py <Typora安装目录>

检查项 (对应通用方法论各阶段):
  1. 安装目录基本结构 (主 exe / resources\\app.asar 是否存在)
  2. asar 内文件清单与 package.json 入口
  3. 入口 JS 的注入锚点: require("./xxx.jsc") 形态 (补丁脚本要替换的目标)
  4. 各 .jsc 内关键字符串锚点: 许可页 / 试用起点 / 水印 / 自检特征
  5. exe 内嵌 asar 完整性校验串: 是否存在、与 asar 实际头哈希是否一致
     (一致=纯净, 不一致=已被补丁同步过)

退出码: 0=关键锚点齐备 (现有补丁流程大概率适用); 1=有缺失 (需人工适配)。
只用 Python 标准库 (3.8+)。
"""
import hashlib
import json
import os
import re
import struct
import sys

# jsc 内要探查的特征串 (按"用途 → 字节串"组织, 新版本变了就在这里补)
JSC_ANCHORS = {
    "许可页路由": b"license.html",
    "试用起点(注册表值名)": b"IDate",
    "许可文件(注册表值名)": b"SLicense",
    "试用天数": b"dayRemains",
    "水印文字": b"UNREGISTERED",
    "水印片段(赋值锚)": b"hasLicense",
    "水印片段(条件锚)": b"File.option",
    "应用自检特征": b"Integrity check failed",
}
EXE_RE = re.compile(rb'"file":"([^"]*app\.asar)","alg":"SHA256","value":"([0-9a-f]{64})"')


def parse_header(buf):
    jlen = struct.unpack_from("<I", buf, 12)[0]
    js = buf[16:16 + jlen]
    data_off = (16 + jlen + 3) & ~3
    return json.loads(js.decode("utf-8")), data_off, js


def iter_files(node, prefix=""):
    for name, child in node.get("files", {}).items():
        rel = prefix + name
        if "files" in child:
            yield from iter_files(child, rel + "/")
        else:
            yield rel, child


def ascii_ctx(buf, pos, span=48):
    s = buf[max(0, pos - span): pos + span]
    return "".join(chr(b) if 32 <= b < 127 else "." for b in s)


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    root = sys.argv[1]
    problems = []

    print("== 1. 基本结构 ==")
    exes = [f for f in os.listdir(root) if f.lower().endswith(".exe")]
    asar = os.path.join(root, "resources", "app.asar")
    print("  exe: %s" % ", ".join(sorted(exes)) or "(无)")
    print("  resources\\app.asar: %s" % ("存在" if os.path.isfile(asar) else "缺失!"))
    if not os.path.isfile(asar):
        sys.exit("中止: 未找到 app.asar, 目录不是 Electron 形态?")
    main_exe = os.path.join(root, "Typora.exe")
    if not os.path.isfile(main_exe):
        problems.append("未找到 Typora.exe (主程序名可能不同)")

    buf = open(asar, "rb").read()
    hdr, data_off, js = parse_header(buf)
    files = list(iter_files(hdr))
    actual_hdr_sha = hashlib.sha256(js).hexdigest()

    print("== 2. asar 内容 (%d 个文件) ==" % len(files))
    entry_name = None
    for rel, e in files:
        print("  %-56s %10d B" % (rel, e.get("size", -1)))
        if rel.endswith("package.json"):
            pkg = json.loads(buf[data_off + int(e["offset"]): data_off + int(e["offset"]) + e["size"]])
            entry_name = pkg.get("main")
            print("  package.json main = %r  版本 = %r" % (entry_name, pkg.get("version")))
    if not entry_name:
        problems.append("asar 内没有 package.json / main 入口")

    print("== 3. 入口 JS 注入锚点 ==")
    entry_buf = None
    if entry_name:
        for rel, e in files:
            if rel == entry_name:
                entry_buf = buf[data_off + int(e["offset"]): data_off + int(e["offset"]) + e["size"]]
    if entry_buf is None:
        problems.append("找不到入口文件 %r" % entry_name)
    else:
        text = entry_buf.decode("utf-8", "replace")
        jsc_reqs = re.findall(r'require\("\./([^"]+\.jsc)"\)', text)
        print("  入口最终加载的 .jsc: %s" % jsc_reqs)
        if jsc_reqs:
            anchor = 'require("./%s");' % jsc_reqs[-1]
            print("  注入锚点 %r: %s" % (anchor, "存在" if anchor in text else "缺失!"))
            if anchor not in text:
                problems.append("入口 JS 里没有预期注入锚点 " + anchor)
        else:
            problems.append("入口 JS 里没有 require(\"./xxx.jsc\") 形态 (结构可能已变)")

    print("== 4. .jsc 特征串锚点 ==")
    jscs = [rel for rel, _ in files if rel.endswith(".jsc")]
    if not jscs:
        problems.append("asar 内没有 .jsc (主逻辑可能在别处)")
    found_any = False
    for rel, e in files:
        if not rel.endswith(".jsc"):
            continue
        blob = buf[data_off + int(e["offset"]): data_off + int(e["offset"]) + e["size"]]
        for label, pat in JSC_ANCHORS.items():
            positions = []
            start = 0
            while True:
                i = blob.find(pat, start)
                if i < 0:
                    break
                positions.append(i)
                start = i + 1
            if positions:
                found_any = True
                print("  [%s] %s @ %s ×%d" % (rel, label, ", ".join(hex(p) for p in positions[:4]), len(positions)))
                if label in ("水印片段(赋值锚)", "水印片段(条件锚)"):
                    p = positions[0]
                    print("        上下文: %s" % ascii_ctx(blob, p))
    if not found_any:
        problems.append("所有 .jsc 都没有命中任何特征串 (加密/改版?)")

    print("== 5. exe 内嵌 asar 完整性 ==")
    if os.path.isfile(main_exe):
        exe = open(main_exe, "rb").read()
        m = EXE_RE.search(exe)
        if not m:
            problems.append("exe 里没有找到 ELECTRONASAR/INTEGRITY 校验串 (格式变了)")
        else:
            print("  路径: %s" % m.group(1).decode("latin1"))
            print("  内嵌哈希: %s" % m.group(2).decode())
            print("  asar 实际头哈希: %s" % actual_hdr_sha)
            print("  状态: %s" % ("一致(纯净/已同步)" if m.group(2).decode() == actual_hdr_sha
                                    else "不一致(exe 与 asar 不配套!)"))

    print("== 结论 ==")
    if problems:
        print("  有 %d 项需要人工确认, 现有补丁流程不能直接套用:" % len(problems))
        for p in problems:
            print("   - %s" % p)
        sys.exit(1)
    print("  关键锚点齐备, 现有补丁流程 (patch_typora.js) 大概率直接适用。")
    print("  建议先跑 --bundle 到临时目录验证再编译安装包 (见通用方法论 §7.5)。")


if __name__ == "__main__":
    main()
