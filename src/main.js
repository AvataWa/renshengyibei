/**
 * 启动引导：同一套代码兼容微信小游戏与浏览器预览
 * 微信环境：wx.createCanvas() + wx.onTouchStart...
 * 浏览器环境：#game canvas + mouse/touch 事件 + localStorage
 */
(function (root) {
  var Game = (typeof module !== 'undefined' && module.exports) ? require('./game.js') : root.Game;

  function boot() {
    var isWx = (typeof wx !== 'undefined') && (typeof wx.createCanvas === 'function');
    var canvas, sysInfo;

    if (isWx) {
      canvas = wx.createCanvas();
      // 优先用新版 API（wx.getSystemInfoSync 已废弃，会触发警告）
      sysInfo = (typeof wx.getWindowInfo === 'function') ? wx.getWindowInfo() : wx.getSystemInfoSync();
    } else {
      canvas = document.getElementById('game');
      sysInfo = {
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
        pixelRatio: window.devicePixelRatio || 1
      };
    }

    var W = sysInfo.windowWidth, H = sysInfo.windowHeight;
    var dpr = sysInfo.pixelRatio || 1;
    // 安全区顶部（刘海/灵动岛高度，逻辑像素）：局内顶部 UI 让位用
    var safeTop = (sysInfo.safeArea && typeof sysInfo.safeArea.top === 'number') ? sysInfo.safeArea.top : 0;

    // 微信：开启右上角分享菜单 + 默认转发卡片 + 朋友圈分享
    if (isWx) {
      try {
        wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] });
        wx.onShareAppMessage(function () {
          return { title: '这一杯敬给自己：从小孩倒奶到老人喝奶，看你倒到哪一段！', imageUrl: 'assets/share.jpg' };
        });
        if (wx.onShareTimeline) {
          wx.onShareTimeline(function () {
            return { title: '这一杯敬给自己 · 人生一杯', imageUrl: 'assets/share.jpg' };
          });
        }
      } catch (e) {}
    }

    canvas.width = W * dpr;
    canvas.height = H * dpr;
    if (!isWx) {
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
    }
    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    // 美术素材加载（加载完成前游戏自动回退到矢量绘制）
    function loadAsset(path) {
      var rec = { img: null, ready: false };
      var img;
      if (isWx) {
        img = wx.createImage();
      } else {
        img = new Image();
      }
      img.onload = function () { rec.img = img; rec.ready = true; };
      img.onerror = function () {};
      img.src = path;
      return rec;
    }
    var assets = {
      // 注意：bg.png / mascot.png / icon.png 运行时未使用且已在 packOptions 中忽略，勿在此加载
      bucket: loadAsset('assets/bucket.png'),
      heroes: loadAsset('assets/menu-heroes.png'),
      containers: [1, 2, 3, 4, 5, 6, 7].map(function (i) {
        return loadAsset('assets/containers/c' + i + '.png');
      }),
      cups: {
        'cup-milk': loadAsset('assets/cups/cup-milk.png')
      }
    };

    // 调试摆拍：?pose=1&tier=1 直接摆出指定段位的倒水画面（仅本地预览排查用）
    var pose = null;
    if (!isWx && typeof location !== 'undefined' && /[?&]pose=1/.test(location.search)) {
      var tm = /[?&]tier=(\d)/.exec(location.search);
      pose = { tier: tm ? parseInt(tm[1], 10) : 0 };
    }

    // 清档调试：?reset=1 清空全部本地存档（最高分等 wg_* 键），仅浏览器预览生效
    if (!isWx && typeof location !== 'undefined' && /[?&]reset=1/.test(location.search)) {
      try {
        var rm = [];
        for (var si = 0; si < localStorage.length; si++) {
          var sk = localStorage.key(si);
          if (sk && sk.indexOf('wg_') === 0) rm.push(sk);
        }
        rm.forEach(function (k) { localStorage.removeItem(k); });
      } catch (e) {}
    }

    var rankShared = null, rankErr = ''; // 排行榜共享画布（微信开放数据域）+ 失败诊断

    // 隐私授权：好友关系类接口（setUserCloudStorage/getFriendCloudStorage）需先获得隐私授权
    // MP 后台需声明「微信朋友关系」并开启官方隐私授权弹窗；用户拒绝时不阻断游戏，仅排行不可用
    var privacyReady = false, privacyAsked = false;
    function ensurePrivacy(ok, no) {
      if (!isWx || !wx.getPrivacySetting || !wx.requirePrivacyAuthorize) { privacyReady = true; ok(); return; }
      if (privacyReady) { ok(); return; }
      try {
        wx.getPrivacySetting({
          success: function (res) {
            if (res && res.needAuthorization) {
              privacyAsked = true;
              wx.requirePrivacyAuthorize({
                success: function () { privacyReady = true; ok(); },
                fail: function () { if (no) no(); }
              });
            } else { privacyReady = true; ok(); }
          },
          fail: function () { ok(); } // 接口异常时不阻断，交由后续调用自行报错
        });
      } catch (e) { ok(); }
    }
    // 启动即主动拉起一次（合规要求：处理个人信息前主动弹窗）
    if (isWx) ensurePrivacy(function () {}, function () {});

    var env = {
      canvas: canvas,
      ctx: ctx,
      W: W,
      H: H,
      safeTop: safeTop,
      assets: assets,
      pose: pose,
      onTouchStart: isWx
        ? function (cb) { wx.onTouchStart(function (e) { var t = e.touches[0]; if (t) cb(t.clientX, t.clientY); }); }
        : function (cb) {
            function pos(e) {
              var r = canvas.getBoundingClientRect();
              var p = (e.changedTouches && e.changedTouches[0]) || e;
              cb(p.clientX - r.left, p.clientY - r.top);
            }
            canvas.addEventListener('mousedown', pos);
            canvas.addEventListener('touchstart', function (e) { e.preventDefault(); pos(e); }, { passive: false });
          },
      onTouchEnd: isWx
        ? function (cb) { wx.onTouchEnd(function () { cb(); }); }
        : function (cb) {
            window.addEventListener('mouseup', function () { cb(); });
            canvas.addEventListener('touchend', function (e) { e.preventDefault(); cb(); }, { passive: false });
          },
      onTouchMove: isWx
        ? function (cb) { wx.onTouchMove(function (e) { var t = e.touches[0]; if (t) cb(t.clientX, t.clientY); }); }
        : function (cb) {
            function pos(e) {
              var r = canvas.getBoundingClientRect();
              var p = (e.touches && e.touches[0]) || e;
              if (p && p.clientX != null) cb(p.clientX - r.left, p.clientY - r.top);
            }
            canvas.addEventListener('mousemove', function (e) { if (e.buttons) pos(e); });
            canvas.addEventListener('touchmove', function (e) { e.preventDefault(); pos(e); }, { passive: false });
          },
      // 中断保护：切后台/窗口失焦/触摸被取消时撤销进行中的按压（防止切回来后自动倒水）
      onInterrupt: isWx
        ? function (cb) { wx.onHide(function () { cb(); }); }
        : function (cb) {
            document.addEventListener('visibilitychange', function () { if (document.hidden) cb(); });
            window.addEventListener('blur', function () { cb(); });
            canvas.addEventListener('touchcancel', function () { cb(); });
          },
      getStorage: isWx
        ? function (k) { try { return wx.getStorageSync('wg_' + k) || ''; } catch (e) { return ''; } }
        : function (k) { try { return localStorage.getItem('wg_' + k) || ''; } catch (e) { return ''; } },
      setStorage: isWx
        ? function (k, v) { try { wx.setStorageSync('wg_' + k, v); } catch (e) {} }
        : function (k, v) { try { localStorage.setItem('wg_' + k, v); } catch (e) {} },
      vibrate: isWx
        ? function () { try { wx.vibrateShort({ type: 'medium' }); } catch (e) {} }
        : function () { try { if (navigator.vibrate) navigator.vibrate(60); } catch (e) {} },
      share: isWx
        ? function (title) { try { wx.shareAppMessage({ title: title, imageUrl: 'assets/share.jpg' }); } catch (e) {} }
        : function (title) { console.log('[分享]', title); },
      // 好友排行：最高分上报微信托管数据（开放数据域读取用）；未通过隐私授权时不上报
      uploadScore: isWx
        ? function (score) {
            if (!privacyReady) return;
            try { wx.setUserCloudStorage({ KVDataList: [{ key: 'score', value: String(score) }] }); } catch (e) {}
          }
        : function () {},
      // 排行榜面板：打开时通知开放数据域渲染共享画布；rankCanvas() 供主屏 drawImage
      showRank: isWx
        ? function (rect) {
            ensurePrivacy(function () {
              try {
                var oc = wx.getOpenDataContext();
                // 官方姿势：主域通过 openDataContext.canvas 拿共享画布（wx.getSharedCanvas 仅开放数据域可用）
                rankShared = oc.canvas || (typeof wx.getSharedCanvas === 'function' ? wx.getSharedCanvas() : null);
                if (rankShared) {
                  // sharedCanvas 的宽高只能由主域设置（重设会清空画布，开放数据域随后重绘）
                  rankShared.width = Math.round(rect.w * dpr);
                  rankShared.height = Math.round(rect.h * dpr);
                  oc.postMessage({ cmd: 'render', w: rect.w, h: rect.h, dpr: dpr });
                  rankErr = '';
                } else {
                  rankErr = 'openDataContext.canvas 不可用';
                }
              } catch (e) { rankShared = null; rankErr = String((e && e.message) || e); }
            }, function () {
              rankShared = null;
              rankErr = '未同意隐私协议，好友排行不可用';
            });
          }
        : function () { rankErr = '非微信环境'; },
      hideRank: function () { rankShared = null; },
      rankCanvas: function () { return rankShared; },
      rankError: function () { return rankErr; }
    };

    var game = new Game(env);
    game.start();
  }

  boot();
})(typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof self !== 'undefined' ? self : this));
