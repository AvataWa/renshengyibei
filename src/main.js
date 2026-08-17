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
        ? function (title) { try { wx.shareAppMessage({ title: title, imageUrl: 'assets/share.png' }); } catch (e) {} }
        : function (title) { console.log('[分享]', title); }
    };

    var game = new Game(env);
    game.start();
  }

  boot();
})(typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof self !== 'undefined' ? self : this));
