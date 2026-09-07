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
          } catch (e) {}
          return out;
        };
        if (m.promises && m.promises.readFile) {
          var origPFR = m.promises.readFile;
          m.promises.readFile = function (p, opt) {
            var pr = origPFR.apply(this, arguments);
            try {
              if (isLaunchPath(p)) {
                L("promises.readFile launch.dist.js -> pristine");
                return pr.then(function (v) { return pristineLaunch(v); });
              }
            } catch (e) {}
            return pr;
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
