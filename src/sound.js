/**
 * 声音模块：微信 InnerAudioContext / 浏览器 Audio 双端适配
 * 素材位于 assets/audio/；静音状态持久化到 wg_mute
 * 用法：var s = Sound.create({ isWx, getStorage, setStorage });
 *   s.play('tap') / s.startPour() / s.stopPour() / s.startBgm() / s.toggleMute()
 */
(function (root) {
  var isNode = (typeof module !== 'undefined' && module.exports);

  // 一次性音效清单（assets/audio/<name>.mp3）
  var ONESHOT = ['pour_start', 'pour_end', 'splash', 'success', 'perfect', 'fail', 'lucky', 'tap'];

  function create(opts) {
    var isWx = opts.isWx;
    var getStorage = opts.getStorage || function () { return ''; };
    var setStorage = opts.setStorage || function () {};
    var muted = getStorage('mute') === '1';
    var cache = {};      // name -> audio 实例（一次性音效复用，播放前重置进度）
    var pourLoop = null; // 倒水循环音
    var bgm = null;      // 背景音乐
    var bgmStarted = false;

    function mk(name) {
      var src = 'assets/audio/' + name + '.mp3';
      var a;
      if (isWx) {
        a = wx.createInnerAudioContext();
        a.src = src;
      } else {
        a = new Audio(src);
        a.preload = 'auto';
      }
      return a;
    }

    function setRate(a, rate) {
      try {
        if (rate && 'playbackRate' in a) a.playbackRate = rate;
      } catch (e) {}
    }

    // 播放一次性音效；rate 用于完美连击变调（浏览器/微信基础库≥2.11 支持）
    function play(name, o) {
      if (muted) return;
      o = o || {};
      try {
        var a = cache[name];
        if (!a) { a = mk(name); cache[name] = a; }
        a.loop = false;
        a.volume = o.volume != null ? o.volume : 1;
        setRate(a, o.rate);
        if (isWx) { a.stop(); a.play(); }
        else { a.currentTime = 0; var p = a.play(); if (p && p.catch) p.catch(function () {}); }
      } catch (e) {}
    }

    // 倒水开始：起音 + 水流循环
    function startPour() {
      if (muted) return;
      try {
        play('pour_start', { volume: 0.8 });
        if (!pourLoop) pourLoop = mk('pour_loop');
        pourLoop.loop = true;
        pourLoop.volume = 0.7;
        if (isWx) { pourLoop.stop(); pourLoop.play(); }
        else { pourLoop.currentTime = 0; var p = pourLoop.play(); if (p && p.catch) p.catch(function () {}); }
      } catch (e) {}
    }

    // 倒水结束：停循环 + 收尾音
    function stopPour() {
      try {
        if (pourLoop) { if (isWx) pourLoop.stop(); else pourLoop.pause(); }
      } catch (e) {}
      play('pour_end', { volume: 0.7 });
    }

    // 背景音乐（低音量循环；浏览器需在首次用户手势后启动）
    function startBgm() {
      if (muted || bgmStarted) return;
      bgmStarted = true;
      try {
        if (!bgm) bgm = mk('bgm');
        bgm.loop = true;
        bgm.volume = 0.22;
        if (isWx) bgm.play();
        else { var p = bgm.play(); if (p && p.catch) p.catch(function () { bgmStarted = false; }); }
      } catch (e) { bgmStarted = false; }
    }

    function stopBgm() {
      try { if (bgm) { if (isWx) bgm.stop(); else bgm.pause(); } } catch (e) {}
    }

    // 静音开关：静音时立即停掉循环类声音；返回新状态
    function toggleMute() {
      muted = !muted;
      setStorage('mute', muted ? '1' : '0');
      if (muted) {
        try { if (pourLoop) { if (isWx) pourLoop.stop(); else pourLoop.pause(); } } catch (e) {}
        stopBgm();
        bgmStarted = false;
      } else {
        startBgm();
      }
      return muted;
    }

    return {
      play: play,
      startPour: startPour,
      stopPour: stopPour,
      startBgm: startBgm,
      toggleMute: toggleMute,
      isMuted: function () { return muted; },
      ONESHOT: ONESHOT
    };
  }

  var Sound = { create: create };
  if (isNode) module.exports = Sound;
  else root.Sound = Sound;
})(typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof self !== 'undefined' ? self : this));
