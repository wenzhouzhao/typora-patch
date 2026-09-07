#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""asar_tool.py — Electron asar 通用工具 (list / extract / repack / hash)

用法:
  python asar_tool.py list    <asar>
  python asar_tool.py extract <asar> <输出目录>
  python asar_tool.py repack  <原始.asar> <文件目录> <输出.asar>
  python asar_tool.py hash    <asar>

说明:
  - 只用 Python 标准库 (3.8+), 无第三方依赖。
  - repack 以"原始 asar"的头为模板: 保持文件顺序与目录结构, 逐文件 integrity
    的 algorithm/blockSize 照抄原头, hash/blocks 按新内容重算 (4MB 分块)。
    输出头为紧凑 JSON (与 Node JSON.stringify 行为一致), 并打印新头哈希 ——
    该值即需写入 exe 内嵌 ELECTRONASAR/INTEGRITY 校验的 sha256。
  - hash 子命令打印"现存 asar 头 JSON 的 sha256", 用于与 exe 内嵌值比对,
    判断该 asar 是否已被补丁同步过。
  - repack 要求 <文件目录> 里的文件名集合与原头完全一致 (多或少都会报错中止),
    路径用 / 分隔相对路径。
"""
import hashlib
import json
import os
import struct
import sys

DEFAULT_BLOCK = 4194304


def read_u32(buf, off):
    return struct.unpack_from("<I", buf, off)[0]


def parse_header(buf):
    """返回 (头JSON对象, 数据区起始偏移, 头JSON原始字节)"""
    jlen = read_u32(buf, 12)
    js = buf[16:16 + jlen]
    data_off = (16 + jlen + 3) & ~3
    return json.loads(js.decode("utf-8")), data_off, js


def iter_files(node, prefix=""):
    """深度优先按原顺序产出 (相对路径, 叶子entry)。目录节点的标志是含 'files' 键。"""
    for name, child in node.get("files", {}).items():
        rel = prefix + name
        if "files" in child:
            for item in iter_files(child, rel + "/"):
                yield item
        else:
            yield rel, child


def file_integrity(blob, block_size):
    blocks = [hashlib.sha256(blob[off:off + block_size]).hexdigest()
              for off in range(0, len(blob), block_size)]
    return {"algorithm": "SHA256", "hash": "".join(blocks),
            "blockSize": block_size, "blocks": blocks}


def cmd_list(asar_path):
    buf = open(asar_path, "rb").read()
    hdr, data_off, js = parse_header(buf)
    files = list(iter_files(hdr))
    print("asar: %s" % asar_path)
    print("头 JSON: %d 字节, 对齐后数据区起始于 %d, 文件数: %d" % (len(js), data_off, len(files)))
    for rel, e in files:
        print("  %-60s size=%-10d offset=%s" % (rel, e.get("size", -1), e.get("offset", "?")))


def cmd_extract(asar_path, outdir):
    buf = open(asar_path, "rb").read()
    hdr, data_off, _ = parse_header(buf)
    n = 0
    for rel, e in iter_files(hdr):
        out = os.path.join(outdir, *rel.split("/"))
        os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
        off = int(e["offset"]); size = int(e["size"])
        with open(out, "wb") as f:
            f.write(buf[data_off + off: data_off + off + size])
        n += 1
    print("已解出 %d 个文件 -> %s" % (n, outdir))


def cmd_repack(asar_path, srcdir, out_path):
    buf = open(asar_path, "rb").read()
    hdr, _, _ = parse_header(buf)
    orig = list(iter_files(hdr))  # 保序

    # 读取新内容并校验文件集合一致
    blobs = {}
    for rel, e in orig:
        p = os.path.join(srcdir, *rel.split("/"))
        if not os.path.isfile(p):
            sys.exit("中止: 原头中的文件缺失: %s" % rel)
        blobs[rel] = open(p, "rb").read()
    have = set()
    for root, _dirs, fs in os.walk(srcdir):
        for f in fs:
            rel = os.path.relpath(os.path.join(root, f), srcdir).replace("\\", "/")
            have.add(rel)
    missing = have - set(blobs)
    if missing:
        sys.exit("中止: 目录里存在原头没有的文件 (头中无条目, 请检查): %s" % sorted(missing))

    entries = {}
    off = 0
    for rel, e in orig:
        blob = blobs[rel]
        old_integ = e.get("integrity") or {}
        bs = int(old_integ.get("blockSize", DEFAULT_BLOCK))
        integ = file_integrity(blob, bs)
        if "algorithm" in old_integ:
            integ["algorithm"] = old_integ["algorithm"]
        entries[rel] = {"size": len(blob), "offset": str(off), "integrity": integ}
        off += len(blob)

    # 把扁平 relpath 列表重建为嵌套 {"files": {...}} 结构 (保持原顺序)
    tree = {}
    for rel, entry in entries.items():
        parts = rel.split("/")
        d = tree
        for p in parts[:-1]:
            d = d.setdefault(p, {})
            if "files" not in d:
                d["files"] = {}
            d = d["files"]
        d[parts[-1]] = entry

    def wrap(t):
        out = {}
        for k, v in t.items():
            out[k] = {"files": wrap(v)} if isinstance(v, dict) and "files" in v and "size" not in v else v
        return out

    hdr_obj = {"files": wrap(tree)}
    js = json.dumps(hdr_obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    pad = (4 - (len(js) % 4)) % 4
    pickle_size = 4 + len(js) + pad
    header = bytearray(16 + len(js) + pad)
    struct.pack_into("<IIII", header, 0, 4, 4 + pickle_size, pickle_size, len(js))
    header[16:16 + len(js)] = js
    new_asar = bytes(header) + b"".join(blobs[r] for r, _ in orig)

    with open(out_path + ".new", "wb") as f:
        f.write(new_asar)
    os.replace(out_path + ".new", out_path)
    h = hashlib.sha256(js).hexdigest()
    print("新 asar: %s (%d 字节); 文件数 %d" % (out_path, len(new_asar), len(entries)))
    print("新头哈希 (写入 exe 的 sha256): %s" % h)


def cmd_hash(asar_path):
    buf = open(asar_path, "rb").read()
    _, _, js = parse_header(buf)
    print("头 JSON: %d 字节" % len(js))
    print("头哈希 (exe 内嵌校验值应为): %s" % hashlib.sha256(js).hexdigest())


def main():
    a = sys.argv[1:]
    if len(a) < 2 or a[0] not in ("list", "extract", "repack", "hash"):
        print(__doc__)
        sys.exit(2)
    cmd = a[0]
    if cmd == "list":
        cmd_list(a[1])
    elif cmd == "extract":
        cmd_extract(a[1], a[2])
    elif cmd == "repack":
        cmd_repack(a[1], a[2], a[3])
    elif cmd == "hash":
        cmd_hash(a[1])


if __name__ == "__main__":
    main()
