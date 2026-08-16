// 手机试玩启动器：打印局域网地址并启动静态服务器
var os = require('os');
process.argv = process.argv.slice(0, 2).concat(['--port', '7100', '--host', '0.0.0.0']);

var ips = [];
var ifs = os.networkInterfaces();
Object.keys(ifs).forEach(function (name) {
  ifs[name].forEach(function (it) {
    if (it.family === 'IPv4' && !it.internal) ips.push(it.address);
  });
});

console.log('');
console.log('  人生一杯 · 手机试玩');
console.log('  ----------------------------------------');
console.log('  手机和电脑连接同一个 Wi-Fi，手机浏览器打开：');
ips.forEach(function (ip) { console.log('    http://' + ip + ':7100/'); });
console.log('');
console.log('  首次运行若弹出 Windows 防火墙提示，请点「允许访问」');
console.log('  关闭此窗口即停止服务');
console.log('');

require('./server.js');
