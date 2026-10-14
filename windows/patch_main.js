"use strict";
/* ============================================================
 * patch_main.js — Typora 1.14.9 (Windows x64) license patch
 * 由打补丁后的 launch.dist.js 在加载主进程字节码
 * (atom.compiled.dist.jsc) 之前 require。
 *
 * 思路对齐 macOS 补丁 (../patch_1.13.8):
 *   Mac补丁1  cannotContonueUse: → 恒返回 0 (允许多标签/继续使用)
 *     ⇒ 拦截 native-reg.getValue 读到的 IDate(试用起点),
 *       恒返回当天 ⇒ dayRemains 恒为满额 ⇒ 试用永不过期。
 *   Mac补丁2/3 showLicense: / showLicenseIfNeeded → 静默返回(不弹窗)
 *     ⇒ 拦截 BrowserWindow/WebContents.loadURL, 丢弃 license.html
 *       (许可/购买弹窗) 的加载并隐藏其空壳窗口。
 *   Windows 附加: [LC] 自检会读 app.asar/launch.dist.js 做完整性比对,
 *     ⇒ fs 钩子对该文件返回剥掉补丁标记的原始内容, 使自检通过。
 *
 * 调试: 设环境变量 TYPORA_PATCH_DEBUG=1, 日志写 %TEMP%\typora_patch.log
 * ============================================================ */
(function () {
  var DEBUG = process.env.TYPORA_PATCH_DEBUG === "1";
  var LOG = require("os").tmpdir() + "/typora_patch.log";
  function L() {
    if (!DEBUG) return;
    var parts = [];
    for (var i = 0; i < arguments.length; i++) {
      var x = arguments[i];
      if (typeof x === "string") { parts.push(x); continue; }
      try { parts.push(JSON.stringify(x)); } catch (e) { try { parts.push(String(x)); } catch (e2) {} }
    }
    try { require("fs").appendFileSync(LOG, new Date().toISOString() + " " + parts.join(" | ") + "\n"); } catch (e) {}
  }
  L("=== typora patch_main loaded ===");

  /* 注入形态两种 (就地模式=绝对路径 require; 打包模式=./ 相对路径 require),
   * 统一用正则剥除, 保证 [LC] 自检看到的是原始 launch.dist.js */
  var PATCH_MARKER_RE = /require\((["'])[^"']*patch_main\.js\1\),/g;

  /* 注册表 IDate 恒返回今天 (M/D/YYYY, 与 WindowsLicenseLocalStore 格式一致) */
  function todayMUSA() {
    var d = new Date();
    return (d.getMonth() + 1) + "/" + d.getDate() + "/" + d.getFullYear();
  }

  /* 给 [LC] 自检看的"原始" launch.dist.js: 剥掉补丁标记 */
  function pristineLaunch(buf) {
    try {
      var s = buf.toString("utf8");
      var out = s.replace(PATCH_MARKER_RE, "");
      if (out !== s) return Buffer.from(out, "utf8");
    } catch (e) {}
    return buf;
  }
  function isLaunchPath(p) {
    var s = String(p);
    return s.indexOf("app.asar") >= 0 && /launch\.dist\.js$/.test(s);
  }

  /* ---- 安装日期防篡改副本: profile.data 里的 "_iD" ----
   * 除了注册表 IDate, Typora 还在 userData/profile.data 里留了一份
   * "incorrupted InstallDate"(_iD, 十六进制编码的 JSON), 试用天数按它算,
   * 且它优先于注册表值 —— 只覆盖注册表读取不足以让试用永不过期。
   * 这里对 profile.data 的读取返回 _iD=今天, 写入时也强制改写为今天。 */
  function isProfilePath(p) {
    return /(^|[\\/])profile\.data$/.test(String(p));
  }
  function fixProfileJson(json) {
    var out = json.replace(/("_iD"\s*:\s*")[^"]*(")/, "$1" + todayMUSA() + "$2");
    return out;
  }
  function patchProfileData(buf) {
    try {
      var isStr = typeof buf === "string";
      if (!isStr && !Buffer.isBuffer(buf)) return buf;
      var s = (isStr ? buf : buf.toString("utf8")).trim();
      if (!/^[0-9a-fA-F]+$/.test(s)) return buf;          // 不是 hex 编码就放弃
      var json = Buffer.from(s, "hex").toString("utf8");
      if (json.indexOf('"_iD"') < 0) return buf;
      var fixed = fixProfileJson(json);
      if (fixed === json) return buf;
      L("profile.data _iD -> today on read");
      var hexOut = Buffer.from(fixed, "utf8").toString("hex");
      return isStr ? hexOut : Buffer.from(hexOut, "utf8");
    } catch (e) { L("profile patch err", e && e.message); return buf; }
  }
  function patchProfileWrite(buf) {
    try {
      var isStr = typeof buf === "string";
      if (!isStr && !Buffer.isBuffer(buf)) return buf;
      var hex = (isStr ? buf : buf.toString("utf8")).trim();
      if (!/^[0-9a-fA-F]+$/.test(hex)) return buf;         // 只处理 hex 形式
      var json = Buffer.from(hex, "hex").toString("utf8");
      if (json.indexOf('"_iD"') < 0) return buf;
      var fixed = fixProfileJson(json);
      if (fixed === json) return buf;
      L("profile.data _iD -> today on write");
      var hexOut = Buffer.from(fixed, "utf8").toString("hex");
      return isStr ? hexOut : Buffer.from(hexOut, "utf8");
    } catch (e) { return buf; }
  }

  var Module = require("module");
  var origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    var m = origLoad.apply(this, arguments);
    try {
      /* ---- Mac补丁1: IDate 读取覆盖 ---- */
      if (request.indexOf("native-reg") >= 0 && m && !m.__tpHooked) {
        m.__tpHooked = true;
        ["getValue", "queryValue"].forEach(function (fname) {
          var orig = m[fname];
          if (typeof orig !== "function") return;
          m[fname] = function () {
            var out = orig.apply(this, arguments);
            try {
              var name = null;
              for (var i = arguments.length - 1; i >= 0; i--) {
                if (typeof arguments[i] === "string") { name = arguments[i]; break; }
              }
              if (name === "IDate") {
                L("override IDate", String(out), "->", todayMUSA());
                return todayMUSA();
              }
            } catch (e) { L("reg hook err", e && e.message); }
            return out;
          };
        });
        L("native-reg hooked");
      }

      /* ---- fs 钩子: launch.dist.js 返回原始内容 (绕过 [LC] 自检) ---- */
      if (request === "fs" && m && !m.__tpHooked) {
        m.__tpHooked = true;
        var origRFS = m.readFileSync;
        m.readFileSync = function (p, opt) {
          var out = origRFS.apply(this, arguments);
          try {
            if (isLaunchPath(p)) { out = pristineLaunch(out); L("readFileSync launch.dist.js -> pristine"); }
            else if (isProfilePath(p)) { out = patchProfileData(out); }
          } catch (e) {}
          return out;
        };
        var origWFS = m.writeFileSync;
        if (typeof origWFS === "function") {
          m.writeFileSync = function (p, data, opt) {
            try {
              if (isProfilePath(p)) {
                var d2 = patchProfileWrite(data);
                var a2 = Array.prototype.slice.call(arguments);
                a2[1] = d2;
                return origWFS.apply(this, a2);
              }
            } catch (e) {}
            return origWFS.apply(this, arguments);
          };
        }
        if (m.promises && m.promises.readFile) {
          var origPFR = m.promises.readFile;
          m.promises.readFile = function (p, opt) {
            var pr = origPFR.apply(this, arguments);
            try {
              if (isLaunchPath(p)) {
                L("promises.readFile launch.dist.js -> pristine");
                return pr.then(function (v) { return pristineLaunch(v); });
              }
              if (isProfilePath(p)) {
                return pr.then(function (v) { return patchProfileData(v); });
              }
            } catch (e) {}
            return pr;
          };
        }
        if (m.promises && m.promises.writeFile) {
          var origPWF = m.promises.writeFile;
          m.promises.writeFile = function (p, data, opt) {
            try {
              if (isProfilePath(p)) {
                var d3 = patchProfileWrite(data);
                var a3 = Array.prototype.slice.call(arguments);
                a3[1] = d3;
                return origPWF.apply(this, a3);
              }
            } catch (e) {}
            return origPWF.apply(this, arguments);
          };
        }
        L("fs hooked");
      }

      /* ---- Mac补丁2/3: 丢弃许可弹窗的加载 ---- */
      if (request === "electron" && m && !m.__tpHooked) {
        m.__tpHooked = true;
        var BW = m.BrowserWindow;
        if (BW && BW.prototype && typeof BW.prototype.loadURL === "function") {
          var origLU = BW.prototype.loadURL;
          BW.prototype.loadURL = function (u, o) {
            if (typeof u === "string" && u.indexOf("license.html") >= 0) {
              L("blocked license window:", u.slice(0, 200));
              this.__tpLicenseShell = true;
              var self = this;
              setTimeout(function () {
                try { self.hide(); } catch (e) {}
                try { self.setSkipTaskbar(true); } catch (e) {}
              }, 0);
              return Promise.resolve();
            }
            return origLU.call(this, u, o);
          };
          var origShow = BW.prototype.show;
          if (typeof origShow === "function") {
            BW.prototype.show = function () {
              if (this.__tpLicenseShell) { L("suppressed show of license shell"); return; }
              return origShow.apply(this, arguments);
            };
          }
        }
        var wcp = m.webContents && m.webContents.prototype;
        if (wcp && typeof wcp.loadURL === "function") {
          var origWLU = wcp.loadURL;
          wcp.loadURL = function (u, o) {
            if (typeof u === "string" && u.indexOf("license.html") >= 0) {
              L("blocked wc license load:", String(u).slice(0, 200));
              return Promise.resolve();
            }
            return origWLU.apply(this, arguments);
          };
        }
        /* ---- 移除 "未激活/UNREGISTERED" 水印按钮: 拦截主进程向渲染窗口
                注入的水印代码(onUnfillLicense, 每个新窗口都会注入一次)。
                注入可能走 webContents.executeJavaScript 或
                webContents.mainFrame.executeJavaScript (WebFrameMain) ---- */
        function watermarkFilter(orig, ctx) {
          return function (code) {
            if (typeof code === "string" && code.indexOf("UNREGISTERED") >= 0) {
              L("blocked UNREGISTERED watermark via", ctx, "(", code.length, "chars )");
              return Promise.resolve();
            }
            return orig.apply(this, arguments);
          };
        }
        if (wcp && typeof wcp.executeJavaScript === "function") {
          wcp.executeJavaScript = watermarkFilter(wcp.executeJavaScript, "wc.executeJavaScript");
        }
        var WFM = m.WebFrameMain;
        if (WFM && WFM.prototype && typeof WFM.prototype.executeJavaScript === "function") {
          WFM.prototype.executeJavaScript = watermarkFilter(WFM.prototype.executeJavaScript, "frame.executeJavaScript");
        }
        if (DEBUG && wcp && typeof wcp.send === "function") {
          var origSend = wcp.send;
          wcp.send = function (ch) {
            L("wc.send", ch, String(arguments[1]).slice(0, 120));
            return origSend.apply(this, arguments);
          };
        }
        L("electron hooked");
      }
    } catch (e) {
      L("hook error", e && e.stack);
    }
    return m;
  };
})();
