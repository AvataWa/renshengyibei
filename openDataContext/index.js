/**
 * 微信开放数据域入口：好友排行榜
 * 主屏打开「排名」面板时 postMessage({cmd:'render', w, h, dpr})，
 * 这里读取好友托管数据（key: score），按分数降序渲染到共享画布。
 */
(function () {
  var sharedCanvas = wx.getSharedCanvas();
  var ctx = sharedCanvas.getContext('2d');

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawList(list, w, h, dpr) {
    // 尺寸由主域设置（重设会清空画布并重置状态），这里只需重新缩放
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#FFFFFF';
    roundRect(0, 0, w, h, 10);
    ctx.fill();

    ctx.textBaseline = 'middle';

    if (!list.length) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#8A857A';
      ctx.font = Math.round(h * 0.055) + 'px sans-serif';
      ctx.fillText('还没有好友上榜', w / 2, h * 0.42);
      ctx.fillText('分享给好友，比比谁是倒水长青树', w / 2, h * 0.56);
      return;
    }

    var rowH = Math.min(h / 5.2, 64);
    var topPad = (h - rowH * Math.min(list.length, 5)) / 2;
    var medals = ['#E8A33D', '#9AA5B1', '#C08A5A'];

    for (var i = 0; i < Math.min(list.length, 8); i++) {
      var it = list[i];
      var y = topPad + i * rowH;
      if (y + rowH > h + 1) break;

      // 名次
      ctx.textAlign = 'left';
      ctx.fillStyle = medals[i] || '#8A857A';
      ctx.font = 'bold ' + Math.round(rowH * 0.34) + 'px sans-serif';
      ctx.fillText(String(i + 1), w * 0.06, y + rowH / 2);

      // 头像（圆形）
      var av = rowH * 0.62, ax = w * 0.14, ay = y + (rowH - av) / 2;
      if (it.avatarUrl) {
        var img = wx.createImage();
        img.onload = (function (im, axx, ayy, avv) {
          return function () {
            ctx.save();
            ctx.beginPath();
            ctx.arc(axx + avv / 2, ayy + avv / 2, avv / 2, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(im, axx, ayy, avv, avv);
            ctx.restore();
          };
        })(img, ax, ay, av);
        img.src = it.avatarUrl;
      } else {
        ctx.fillStyle = '#E8E3D6';
        ctx.beginPath();
        ctx.arc(ax + av / 2, ay + av / 2, av / 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // 昵称（超长截断）
      var name = it.nickname || '微信好友';
      if ([...name].length > 8) name = [...name].slice(0, 8).join('') + '…';
      ctx.fillStyle = '#2B2A26';
      ctx.font = Math.round(rowH * 0.30) + 'px sans-serif';
      ctx.fillText(name, ax + av + w * 0.04, y + rowH / 2);

      // 分数（右对齐）
      ctx.textAlign = 'right';
      ctx.fillStyle = '#2B2A26';
      ctx.font = 'bold ' + Math.round(rowH * 0.32) + 'px sans-serif';
      ctx.fillText(it.score + ' 分', w * 0.94, y + rowH / 2);

      // 分隔线
      ctx.strokeStyle = 'rgba(43,42,38,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(w * 0.05, y + rowH);
      ctx.lineTo(w * 0.95, y + rowH);
      ctx.stroke();
    }
  }

  wx.onMessage(function (msg) {
    if (!msg || msg.cmd !== 'render') return;
    var w = msg.w || 300, h = msg.h || 200, dpr = msg.dpr || 1;
    try {
      wx.getFriendCloudStorage({
        keyList: ['score'],
        success: function (res) {
          try {
            var list = (res.data || []).map(function (it) {
              var kv = it.KVDataList || [];
              var score = 0;
              for (var i = 0; i < kv.length; i++) {
                if (kv[i].key === 'score') score = parseInt(kv[i].value, 10) || 0;
              }
              return { nickname: it.nickname, avatarUrl: it.avatarUrl, score: score };
            });
            list.sort(function (a, b) { return b.score - a.score; });
            drawList(list, w, h, dpr);
          } catch (e) { drawErr(e, w, h, dpr); }
        },
        fail: function (err) { drawErr((err && err.errMsg) || 'getFriendCloudStorage fail', w, h, dpr); }
      });
    } catch (e) { drawErr(e, w, h, dpr); }
  });

  // 拉取失败兜底：友好提示（不再暴露错误细节）
  function drawErr(e, w, h, dpr) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#FFFFFF';
    roundRect(0, 0, w, h, 10);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#8A857A';
    ctx.font = Math.round(h * 0.055) + 'px sans-serif';
    ctx.fillText('排行榜暂时加载失败', w / 2, h * 0.44);
    ctx.fillText('请稍后再来', w / 2, h * 0.58);
  }
})();
