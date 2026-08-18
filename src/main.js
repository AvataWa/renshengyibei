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
      sysInfo = wx.getSystemInfoSync();
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

    // 微信：开启右上角分享菜单 + 默认转发卡片 + 朋友圈分享
    if (isWx) {
      try {
        wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] });
        wx.onShareAppMessage(function () {
          return { title: '人生一杯：从小孩倒奶到老人喝奶，看你倒到哪一段！', imageUrl: 'assets/share.jpg' };
        });
        if (wx.onShareTimeline) {
          wx.onShareTimeline(function () {
            return { title: '人生一杯：这一杯敬自己', imageUrl: 'assets/share.jpg' };
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
      bg: loadAsset('assets/bg.png'),
      bucket: loadAsset('assets/bucket.png'),
      mascot: loadAsset('assets/mascot.png'),
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

    var rankShared = null; // 排行榜共享画布（微信开放数据域）

    var env = {
      canvas: canvas,
      ctx: ctx,
      W: W,
      H: H,
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
      // 好友排行：最高分上报微信托管数据（开放数据域读取用）
      uploadScore: isWx
        ? function (score) {
            try { wx.setUserCloudStorage({ KVDataList: [{ key: 'score', value: String(score) }] }); } catch (e) {}
          }
        : function () {},
      // 排行榜面板：打开时通知开放数据域渲染共享画布；rankCanvas() 供主屏 drawImage
      showRank: isWx
        ? function (rect) {
            try {
              rankShared = wx.getSharedCanvas();
              wx.getOpenDataContext().postMessage({ cmd: 'render', w: rect.w, h: rect.h, dpr: dpr });
            } catch (e) { rankShared = null; }
          }
        : function () {},
      hideRank: function () { rankShared = null; },
      rankCanvas: function () { return rankShared; }
    };

    var game = new Game(env);
    game.start();
  }

  boot();
})(typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof self !== 'undefined' ? self : this));
