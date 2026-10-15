# typora-patch

Typora (macOS arm64 / Windows x64) 本地补丁研究与工具集。**私有仓库, 仅限本人使用。**

## 内容

| 平台 | 版本 | 方式 | 说明 |
|---|---|---|---|
| macOS (arm64) | 1.13.8 | Mach-O 二进制补丁 | `macos/typora_patch_1.13.8.sh` + 指南 |
| Windows x64 | 1.14.9(基线) / **1.14.10(实测直接可用, 未改代码)** | Electron asar 注入 + 运行时钩子 + 字节码补丁 | `windows/` 脚本 + 四份文档 |

## Windows 快速使用

1. 已装官方 Typora → 双击 `windows/patch.bat`(需 Node.js)
2. 全新机器 → 用构建工作区产出的 `Typora_<版本>_Patched_Setup.exe`(不入库)
3. 换版本/换机器 → 先读 `windows/docs/使用教程.md`, 再按
   `windows/docs/通用方法论.md` 操作(`windows/tools/find_anchors.py` 侦查锚点)

文档地图: `docs/使用教程.md`(日常) → `通用方法论.md`(通用做法) →
`过程记录.md`(实施时间线) → `Typora_1.14.9_Patch_Guide.md`(技术细节, 含「版本适配记录」)。

**换新版 Typora 时**: 先看 `Typora_1.14.9_Patch_Guide.md` §九「版本适配记录」与
`通用方法论.md` §十二「版本演进」——两处给出"两分钟核对流程"和
"什么变化才需要改方法"的分类表(结论示例: 1.14.9→1.14.10 无需改代码)。

## tools 一览(均在 `windows/tools/`)

| 工具 | 用途 |
|---|---|
| `find_anchors.py` | 新版侦查: 检查补丁依赖的全部锚点是否命中(打补丁前先跑) |
| `asar_tool.py` | asar 解包/重打包/头哈希 四合一 |
| `profile_idate.py` | 查看/修改试用日期副本 `profile.data` 的 `_iD`(排查用) |
| `gen_patch_bat.py` | 重新生成 GBK 编码的 `patch.bat` |
| `enum_windows.ps1` / `logtail.ps1` | 窗口枚举(含隐藏) / 日志尾巴, 排查"看不到窗口"类问题 |
| `rebuild_installer.ps1` | 用当前安装树重新编译预打补丁安装包(路径需按本机填写) |

## 约束(重要)

- 仅用于对**已合法安装的副本**做本地修改与个人使用;
  打补丁的 exe/asar、安装包等**二进制产物一律不入库、不分发**。
- `windows/patch.bat` 必须保持 **GBK + CRLF** 编码(Windows cmd 的中文批处理约束),
  需要修改时用 `windows/tools/gen_patch_bat.py` 重新生成。
- 文档中所有 `<尖括号>` 均为路径占位符, 与任何具体机器无关。
- **多版本备份不要混用**: 还原时 `Typora.exe` 与 `app.asar` 必须取自同一时间戳的那一对
  (不同时间戳可能属于不同 Typora 版本)。
