/* ============================================================
 * patch_typora.js — Typora 1.14.9 (Windows x64) 一键补丁
 * 用法: node patch_typora.js [安装目录] [--bundle]
 *   --bundle: 打包模式 — patch_main.js 以相对路径 require 并作为
 *             新文件打进 app.asar (用于制作免依赖的安装包/绿色目录);
 *             不写备份。默认模式为就地修补已安装的 Typora。
 *
 * 流程 (对齐 macOS 版思路，见 Typora_1.14.9_Patch_Guide.md):
 *   1. 备份 Typora.exe 与 resources/app.asar (bundle 模式跳过)
 *   2. 解包 app.asar，向 launch.dist.js 注入 patch_main.js 的
 *      require (先于主进程字节码 atom.compiled.dist.jsc 执行)
 *   3. 重打包 app.asar (复刻 asar 头格式与逐文件 SHA256 完整性)
 *   4. 重算 asar 头哈希并原位替换 Typora.exe 内嵌的
 *      ELECTRONASAR/INTEGRITY 校验值 (定长 hex, 不改动 PE 结构)
 *   5. 补丁逻辑本体在 patch_main.js，之后修改它无需重跑本脚本
 * ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const BUNDLE = process.argv.includes("--bundle");

function findInstallDir() {
  const argDir = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const candidates = [];
  if (argDir) candidates.push(argDir);
  candidates.push(
    "C:\\Program Files\\Typora",
    "C:\\Program Files (x86)\\Typora",
    process.env.LOCALAPPDATA + "\\Programs\\Typora"
  );
  for (const c of candidates) {
    if (c && fs.existsSync(path.join(c, "Typora.exe"))) return c;
  }
  throw new Error("未找到 Typora.exe，请把安装目录作为参数传入");
}

const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
const INSTALL = findInstallDir();
const EXE = path.join(INSTALL, "Typora.exe");
const ASAR = path.join(INSTALL, "resources", "app.asar");
const PATCH_MAIN = path.resolve(__dirname, "patch_main.js").replace(/\\/g, "/");

console.log("安装目录:", INSTALL);
console.log("补丁模块:", PATCH_MAIN);

// ---------- asar 头解析 ----------
function parseAsarHeader(buf) {
  const [, , , jlen] = ["", "", "", ""].map((_, i) => buf.readUInt32LE(i * 4));
  const json = buf.slice(16, 16 + jlen).toString("utf8");
  const dataOff = (16 + jlen + 3) & ~3;
  return { json: JSON.parse(json), dataOff };
}

function sha256hex(buf) { return crypto.createHash("sha256").update(buf).digest("hex"); }

function fileIntegrity(blob) {
  const BLOCK = 4194304;
  const blocks = [];
  for (let off = 0; off < blob.length; off += BLOCK) {
    blocks.push(sha256hex(blob.slice(off, off + BLOCK)));
  }
  return { algorithm: "SHA256", hash: blocks.join(""), blockSize: BLOCK, blocks };
}

// ---------- 1. 备份 (bundle 模式从纯净原件构建, 无需备份) ----------
if (!BUNDLE) {
  for (const f of [EXE, ASAR]) {
    const bak = f + ".backup." + ts;
    if (!fs.existsSync(bak)) {
      fs.copyFileSync(f, bak);
      console.log("已备份:", bak);
    }
  }
}

// ---------- 2. 解包 + 改 launch.dist.js ----------
const asarBuf = fs.readFileSync(ASAR);
const { json, dataOff } = parseAsarHeader(asarBuf);
const files = json.files;
const order = Object.keys(files); // 保持原顺序

const contents = {};
for (const name of order) {
  const e = files[name];
  contents[name] = asarBuf.slice(dataOff + Number(e.offset), dataOff + Number(e.offset) + e.size);
}

const INSERT_ANCHOR = 'require("./atom.compiled.dist.jsc");';
let launch = contents["launch.dist.js"].toString("utf8");
// 幂等: 若此前已注入过，先移除旧注入 (兼容绝对路径与 ./ 相对路径两种形式)
launch = launch.replace(/,\s*require\("[^"]*patch_main\.js"\)/g, "");
if (!launch.includes(INSERT_ANCHOR)) throw new Error("launch.dist.js 结构与预期不符，中止");
const requireExpr = BUNDLE ? 'require("./patch_main.js")' : `require("${PATCH_MAIN}")`;
launch = launch.replace(INSERT_ANCHOR, requireExpr + "," + INSERT_ANCHOR);
contents["launch.dist.js"] = Buffer.from(launch, "utf8");
console.log("launch.dist.js 已注入 patch_main.js 引用" + (BUNDLE ? " (相对路径)" : ""));

// ---- 字节补丁: 废掉 .jsc 里的 "未激活/UNREGISTERED" 水印注入代码 ----
// 片段: if(window.File.option){ File.option.hasLicense = false; ... 创建水印DIV ... }
// 把条件改为 if(window.File.optio0){  → undefined 恒 falsy → 整段静默跳过
// (同长度字节替换, 不影响 V8 常量池结构; 幂等)
{
  const jsc = contents["atom.compiled.dist.jsc"];
  const anchor = Buffer.from("File.option.hasLicense = false;", "latin1");
  const condOld = Buffer.from("if(window.File.option){", "latin1");
  const condNew = Buffer.from("if(window.File.optio0){", "latin1");
  const i = jsc.indexOf(anchor);
  if (i < 0) throw new Error("未在水印片段定位锚点，中止");
  const from = Math.max(0, i - 64);
  const region = jsc.slice(from, i);
  const ci = region.indexOf(condOld);
  if (ci >= 0) {
    condNew.copy(jsc, from + ci);
    console.log("atom.compiled.dist.jsc: 水印注入条件已失效 (window.File.optio0)");
  } else if (region.indexOf(Buffer.from("if(window.File.optio0){", "latin1")) >= 0) {
    console.log("atom.compiled.dist.jsc: 水印注入已是失效状态(跳过)");
  } else {
    throw new Error("水印片段条件与预期不符，中止");
  }
}

// ---------- 3. 重打包 ----------
if (BUNDLE) {
  contents["patch_main.js"] = fs.readFileSync(path.join(__dirname, "patch_main.js"));
  order.push("patch_main.js");
  console.log("patch_main.js 已作为独立文件打入 app.asar");
}
const entries = {};
const blobs = [];
let off = 0;
for (const name of order) {
  const blob = contents[name];
  entries[name] = { size: blob.length, offset: String(off), integrity: fileIntegrity(blob) };
  blobs.push(blob);
  off += blob.length;
}
const js = Buffer.from(JSON.stringify({ files: entries }), "utf8");
const pad = (4 - (js.length % 4)) % 4;
const pickleSize = 4 + js.length + pad;
const header = Buffer.alloc(16 + js.length + pad);
header.writeUInt32LE(4, 0);
header.writeUInt32LE(4 + pickleSize, 4);
header.writeUInt32LE(pickleSize, 8);
header.writeUInt32LE(js.length, 12);
js.copy(header, 16);
const newAsar = Buffer.concat([header, ...blobs]);
const newHeaderSha = sha256hex(js);
console.log("新 app.asar:", newAsar.length, "字节; 头哈希:", newHeaderSha);

// ---------- 4. 替换 exe 内嵌校验值 ----------
const exe = fs.readFileSync(EXE);
const latin = exe.toString("latin1");
const re = /("file":"resources\\\\app\.asar","alg":"SHA256","value":")([0-9a-f]{64})(")/;
const m = latin.match(re);
if (!m) throw new Error("未在 Typora.exe 中找到 asar 完整性校验串，中止");
const replaced = latin.replace(re, "$1" + newHeaderSha + "$3");
const newExe = Buffer.from(replaced, "latin1");
if (newExe.length !== exe.length) throw new Error("exe 长度发生变化，中止");
console.log("Typora.exe 完整性校验值已替换:", m[2].slice(0, 16) + "… ->", newHeaderSha.slice(0, 16) + "…");

// ---------- 原子写入 ----------
fs.writeFileSync(ASAR + ".new", newAsar); fs.renameSync(ASAR + ".new", ASAR);
fs.writeFileSync(EXE + ".new", newExe);   fs.renameSync(EXE + ".new", EXE);
console.log("完成。请启动 Typora 验证。卸载/还原: 将 .backup." + ts + " 文件改回原名。");
