# Typora 1.14.9 (Windows x64) 许可证绕过补丁指南

> **日常使用/排错请看 `使用教程.md`**(同目录);本文件是技术参考(原理、校验层、验证记录)。
> 制作过程、踩坑与结论依据见 `过程记录.md`(可追溯);
> 换版本/换机器的通用做法见 `通用方法论.md`。
> **适用版本**: Typora 1.14.9 (Electron 42.2.0 / Chromium 148 / V8 14.8.178.14)
> **适用架构**: Windows x64
> **效果**: 试用永不过期(多标签/继续使用不受限) + 消除许可证弹窗
> **思路来源**: 同目录思路对齐 `../../macos/`(macOS arm64 补丁)

---

## 一、补丁概览

macOS 版直接改 Mach-O 里 `LicenseManager` 的 3 个方法;Windows 版是 Electron 应用,
主程序逻辑在 `resources/app.asar → atom.compiled.dist.jsc`(V8 编译字节码,无法直接改),
所以改为 **运行时 JS 钩子**,在主进程字节码加载前生效,补丁点一一对应:

| Mac 补丁 | Mac 方法 | Windows 对应实现(本补丁) | 效果 |
|:---:|------|------|------|
| 1 | `cannotContonueUse:` 恒返回 0 | ① 拦截 `native-reg.getValue`,读注册表 `IDate`(试用起点)时恒返回当天日期;② fs 钩子改写 `userData/profile.data` 的 `_iD` 字段(见补丁 5) | `dayRemains` 恒为满额(15 天),试用永不过期,多标签/新建/新建窗口不受限 |
| 2 | `showLicense:` 静默返回 | 拦截 `BrowserWindow.loadURL`,丢弃 `license.html` 的加载并隐藏空壳窗口 | 不再弹出许可证/购买窗口 |
| 3 | `showLicenseIfNeeded` 静默返回 | 同上(启动时 `needLicense=true` 的弹窗走同一路径,已验证被拦截) | 启动无弹窗 |
| 4 | (macOS 无对应) | 字节补丁 .jsc 水印片段: 把 `if(window.File.option){` 改为 `if(window.File.optio0){` | 移除左下角"未激活/UNREGISTERED"按钮(含叉号),新窗口不再出现 |
| 5 | (macOS 无对应) | fs 钩子改写 `%APPDATA%\Typora\profile.data` 里 `_iD`(防篡改安装日期副本,hex 编码 JSON)为当天,**读取与写入双向** | **试用天数真正不衰减**;不修则试用到期后 Typora 锁掉"新建/新建窗口" |
| — | (macOS 无此层) | fs 钩子:读 `app.asar/launch.dist.js` 时返回剥掉补丁标记的原始内容 | 绕过 `[LC]` 启动自检,否则应用秒退 |

补丁本体在 `patch_main.js`,由注入后的 `launch.dist.js` 在 `require("./atom.compiled.dist.jsc")`
**之前**加载,之后修改 `patch_main.js` 无需重打 asar/exe。

---

## 二、Windows 版架构与 macOS 的差异

```
macOS                          Windows (本补丁)
─────────────────────          ─────────────────────────────────
Typora.app/Contents/MacOS/     Typora.exe (Electron 42.2.0, 内嵌 Node)
  Typora (fat binary)          resources/app.asar
  ├ ObjC LicenseManager        ├ atom.compiled.dist.jsc  ← 主进程(V8字节码,不可改)
  ├ cannotContonueUse:         ├ launch.dist.js          ← 明文 JS 入口(注入点)
  ├ showLicense:               └ package.json
  └ showLicenseIfNeeded        resources/node_modules/native-reg/.../reg.node ← 注册表
许可状态: 本地文件              许可状态: 注册表 HKCU\Software\Typora
                                 IDate = 试用起点, SLicense = 许可证
```

试用期 = `IDate + 15 天`,每次启动由主进程经 native-reg 读注册表计算
(`typora.log`: `[L] installDate is ..., trail remains: N days`)。
试用到期或未激活时,主进程直接 `BrowserWindow.loadURL("typora://app/typemark/page-dist/license.html?...dayRemains=0&needLicense=true...")`
弹出独立许可窗口。

## 三、两层完整性校验(本补丁需要处理的)

1. **Electron fuse 层**: `Typora.exe` 内嵌 PE 资源(`ELECTRONASAR`/`INTEGRITY`):
   `[{"file":"resources\\app.asar","alg":"SHA256","value":"<asar头JSON的sha256>"}]`。
   修改 app.asar 后必须同步替换该 64 位 hex(定长,原位替换,不改 PE 结构)。
2. **应用自检 `[LC]`**: 主进程启动约 1 秒后读 `app.asar/package.json` 与
   `app.asar/launch.dist.js` 做完整性比对,失败则记日志
   `Integrity check failed` 并退出。对策: fs 钩子让它读到原始内容。

## 四、一键补丁

```
patch_1.14.9_win/
├── patch.bat          ← 双击一键补丁 (推荐; 自动找 Node/Typora、关进程、打完启动)
├── patch_typora.js    ← 补丁执行脚本 (node)
├── patch_main.js      ← 补丁逻辑本体 (注入后可随时修改)
└── Typora_1.14.9_Patch_Guide.md
```

**方式一(推荐)**: 关闭 Typora, 双击 `patch.bat`。自动定位 Node.js(PATH →
Program Files → 注册表 → nvm 目录)与 Typora 安装目录(常用路径, 找不到会提示输入),
自动关闭 Typora、应用补丁并启动。也可命令行指定目录: `patch.bat "D:\Typora"`。

**方式二**: 装有 Node.js 的机器上手动执行:

```
node patch_typora.js "<Typora安装目录>"
```

脚本流程:
1. 备份 `Typora.exe` 与 `resources/app.asar` 为 `*.backup.<时间戳>`
2. 解包 app.asar,向 `launch.dist.js` 末尾注入
   `require("<本目录>/patch_main.js")`(幂等,重复执行会先去掉旧注入)
3. 重打包 app.asar(复刻 asar 头格式与逐文件 SHA256 完整性),其中:
   - 向 `launch.dist.js` 注入 `require("<本目录>/patch_main.js")`
   - 字节补丁 `atom.compiled.dist.jsc` 内的"未激活"水印注入代码
     (片段条件 `window.File.option` → `window.File.optio0`,同长度替换)
4. 重算 asar 头哈希并原位替换 `Typora.exe` 内嵌校验值
5. 完成,启动 Typora 即生效

## 五、预打补丁安装包 (免 Node, 装完即用)

**成品**: `<项目根目录>\Typora_1.14.10_Patched_Setup.exe` (113.7MB, Inno Setup 打包;
文件名随打包版本变化, 规则 `Typora_<版本>_Patched_Setup.exe`)

- 原版安装器即 Inno Setup (6.0.0) 构建, 本包用 6.0.5 编译器产出, 安装行为一致
- **AppId 与原版相同** `{37771A20-7167-44C0-B322-FD3E54C56156}`:
  装在已装官方版的机器上识别为同一程序 (升级式覆盖安装, 卸载入口共用)
- 补丁内容与 patch.bat 完全一致 (试用起点覆盖 + 弹窗拦截 + [LC] 绕过 + 水印移除),
  且 patch_main.js 已作为文件打进 app.asar、以相对路径 require —
  **目标机器不需要 Node.js, 装完即打完补丁**
- 文件关联与原版一致: md/markdown/mdown/mkd/mmd/text 六种扩展名 (HKLM, 卸载时清理)
- 快捷方式: 公共桌面 (与原版一致; 无开始菜单项)
- 静默安装: `Typora_1.14.10_Patched_Setup.exe /VERYSILENT /NORESTART [/DIR="D:\xxx"]`
- 需管理员权限 (写 HKLM 关联与 Program Files)

### 重新构建 (换 Typora 版本时)

构建目录 `../winpatch/`:

| 项 | 说明 |
|---|---|
| `stage\app\` | 打包用安装树 (当前已含 bundle 补丁; 重建前先把 Typora.exe 与 resources\app.asar 还原为纯净版) |
| `inno605\app\ISCC.exe` | Inno Setup 6.0.5 编译器 (innoextract 从官方安装器解包而来, 免安装免提权) |
| `typora_patched.iss` | 正式版脚本; `typora_patched_test.iss` 为免提权测试变体 (无注册表关联) |
| `Output\` | 编译产物目录 |

步骤:

```
1. 还原 stage\app 中 Typora.exe / resources\app.asar 为纯净版
2. node ..\patch_1.14.9_win\patch_typora.js <构建工作区>\stage\app --bundle
3. inno605\app\ISCC.exe typora_patched.iss
```

> 新版本的 jsc 水印锚点 / asar 结构可能变化; 补丁脚本带锚点校验, 不匹配会中止
> 而不是打坏文件。innoextract(1.9) 只能解包 Inno 6.0.5 及以下的安装器。

## 六、验证结果(2026-09-04 实测)

把注册表 `IDate` 故意改为过期值 `9/4/2025` 后启动(调试日志):

```
override IDate | 9/4/2025 -> | 9/4/2026          ← 试用起点被虚拟化
blocked license window: typora://app/typemark/page-dist/license.html?...dayRemains=15&needLicense=true
promises.readFile launch.dist.js -> pristine     ← [LC] 自检拿到原始内容
suppressed show of license shell                 ← 弹窗空壳被隐藏
```

typora.log: `installDate is 9/4/2026, trail remains: 15 days`,应用正常启动,
连续打开两个 md 文件均为正常标签页,无任何许可证弹窗,长时间运行不退出。

### 追加验证:安装日期第二来源 (2026-10-15 实测)

上面那次验证成立有个隐含前提:**当天就是安装日**(9/4),所以注册表覆盖看起来"够用"。
41 天后(10/15)试用被判过期,暴露出第二个来源 —— Typora 把安装日期另存了一份
在 `%APPDATA%\Typora\profile.data`(`_iD` 字段,hex 编码 JSON,jsc 中叫
"incorrupted InstallDate"),**试用天数按它算**,只覆盖注册表无效:

```
override IDate | 9/4/2026 -> | 10/15/2026     ← 注册表读取覆盖成功
[L] installDate is 9/4/2026, trail remains: 0 days   ← 但权威值来自 profile.data

# 修复后(把磁盘上的 _iD 故意留成旧日期,考验钩子):
profile.data _iD -> today on read
[L] installDate is 10/15/2026, trail remains: 15 days
```

试用过期时 Typora 会**静默禁用**"文件→新建 / 新建窗口"(点了无任何反应,不报错),
许可证提示窗口又被本补丁藏掉,所以表面上"什么都没发生"。修复后
Ctrl+N 新建文档、Ctrl+Shift+N 新建窗口均实测可用。

## 七、恢复

```
cd <安装目录>
copy /y Typora.exe.backup.<时间戳> Typora.exe
copy /y resources\app.asar.backup.<时间戳> resources\app.asar
```

⚠ **多代备份要选对版本**:Typora 更新过之后,安装目录里会同时存在不同版本的
纯净备份(每次重打补丁生成一对)。`Typora.exe` 与 `app.asar` 必须取自**同一对**,
否则是"旧版 exe 配新版 asar",启动即失败。
**例**(本机):`*.backup.20260904052906` = 1.14.9 原版;
`*.backup.20261015125915` = 1.14.10 原版。

注册表(如需): `HKCU\Software\Typora` 的 `IDate`/`SLicense`。
试用副本(如需): `%APPDATA%\Typora\profile.data` 的 `_iD`(见 §八)。

## 八、注意事项

- **更新后需重新打补丁**: Typora 自动更新会替换 Typora.exe 与 app.asar,补丁失效,
  重新运行 `patch.bat` 即可(脚本幂等)。
- **试用天数有两个来源**: 注册表 `IDate` 与 `%APPDATA%\Typora\profile.data` 的 `_iD`
  (防篡改副本,权威)。补丁对两者都做了覆盖(后者由 `patch_main.js` 在 fs 读/写上强制改写)。
  排查"试用像是过期了"时,先看 typora.log 的 `trail remains: N days` 再动手。
- **Typora 拒绝调试启动参数**: 传 `--remote-debugging-port` 等会弹
  `Arguments not allowed debug in production main thread` 并退出;
  排查请用 `TYPORA_PATCH_DEBUG=1` 日志,不要指望 CDP/远程调试。
- **patch_main.js 可随时改**: 它是 asar 外部的明文 JS,改完重启 Typora 生效,
  无需重跑补丁脚本。
- **不要移动 patch_main.js**: 就地补丁模式下 launch.dist.js 写的是它的绝对路径;
  如需移动,重跑 `node patch_typora.js`(会更新注入路径)。
- **适用版本见第九节**: 1.14.9 与 1.14.10 均已实测,方法完全相同;
  其他版本请按第九节的流程先核对再打。
- 调试: 设环境变量 `TYPORA_PATCH_DEBUG=1`,日志写 `%TEMP%\typora_patch.log`。
- 左下角"未激活"角标为 Typora 正常试用态 UI,与本补丁无关(macOS 补丁同样不处理)。

---

## 九、版本适配记录(不同版本是否需要不同方法)

### 已实测版本

| 项 | 1.14.9 (基线) | 1.14.10 (2026-10-15 实测) | 是否需要改方法 |
|---|---|---|---|
| asar 结构 | 3 文件:package.json / launch.dist.js / atom.compiled.dist.jsc | **完全相同**(3 文件) | 否 |
| `launch.dist.js` | 1381 B,sha256 `3ec9df88…` | **逐字节相同**(长度与 sha256 一致) | 否 —— 注入锚点 `require("./atom.compiled.dist.jsc");` 原样存在 |
| `atom.compiled.dist.jsc` | 388352 B | 388344 B(小 8 B) | 否 —— 锚点整体位移约 8 字节,结构不变 |
| jsc 锚点 | 许可页 `license.html`、`IDate`、`dayRemains`、`UNREGISTERED`、水印赋值锚 `File.option.hasLicense = false;`、条件锚 `if(window.File.option){` | 全部命中(偏移见 find_anchors 输出) | 否 —— 水印字节补丁同长度替换照常生效 |
| exe 内嵌完整性串 | `{"file":"resources\\app.asar","alg":"SHA256","value":…}` | 格式相同,仅 value 不同 | 否 |
| 试用状态来源 | 注册表 `IDate` + `profile.data` 的 `_iD` | **两者都在用**(hook 均命中;`profile.data` 的 uuid 也沿用) | 否 |
| `[LC]` 启动自检 | 读 `app.asar/launch.dist.js` 比对 | 相同 | 否 |
| 实测结果 | 试用 15 天、无弹窗、无水印、新建/新建窗口正常 | 同左(hook 日志与 typora.log 均确认) | — |

**结论:1.14.9 → 1.14.10 属于"只改 jsc 内容"的常规更新,方法完全不变,
补丁脚本未改一行代码即可套用。**

### 遇到新版本时的核对流程(约 2 分钟)

```bat
:: 1) 静态锚点核对(会列出所有依赖的锚点是否命中)
python patch_1.14.9_win\tools\find_anchors.py <Typora安装目录>

:: 2) 直接打补丁(带锚点校验, 对不上会中止而不是打坏文件)
node patch_1.14.9_win\patch_typora.js <Typora安装目录>

:: 3) 验证: 带调试日志启动, 看 hook 是否全部命中
set TYPORA_PATCH_DEBUG=1
::   %TEMP%\typora_patch.log 应有: override IDate / profile.data _iD -> today /
::   blocked license window / launch.dist.js -> pristine
::   %APPDATA%\Typora\typora.log 应有: trail remains: 15 days
```

### 什么情况才需要改方法(按变化类型对号)

| 新版变化 | 表现 | 需要做的事 |
|---|---|---|
| jsc 内容变化(最常见,如 1.14.10) | 锚点偏移变化但字符串仍在 | **无需改动**,直接重打(脚本自带锚点校验) |
| 水印片段改写法(锚点字符串变了) | 脚本报 `未在水印片段定位锚点` / `水印片段条件与预期不符` | 在 jsc 里重新定位(搜 `UNREGISTERED` / `hasLicense`),更新 `patch_typora.js` 里的锚点常量 |
| 入口结构变化(`launch.dist.js` 不再是明文入口/加载器改写) | 脚本报 `launch.dist.js 结构与预期不符` | 按 `通用方法论.md` §三 路线 A/B 重新设计注入点 |
| 完整性机制变化(新增校验层/换哈希算法) | 启动 1 秒退出、日志有 `Integrity check failed` | 按 `Typora_1.14.9_Patch_Guide.md` §三 重新处理校验层 |
| 试用状态来源变化(键名/新增来源) | `trail remains` 不随覆盖变化 | 按 `通用方法论.md` §三 路线 C「状态往往不止一份」重新定位 |
| 架构变化(不再是 Electron / asar) | `find_anchors.py` 第 2 步就报缺失 | 整套方法不适用,需按新架构重新评估 |
