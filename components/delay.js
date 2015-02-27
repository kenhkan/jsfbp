'use strict';

module.exports = function delay(proc) {
  var inport = proc.openInputPort('IN');
  var intvlport = proc.openInputPort('INTVL');
  var outport = proc.openOutputPort('OUT');
  var intvl_ip = intvlport.receive();
  console.log('delay');
  console.log(intvl_ip);
  var intvl = intvl_ip.content;
  proc.dropIP(intvl_ip);

  proc.loop(function (await, done) {
    var ip = inport.receive();
    if (ip === null) {
      done();
      return;
    }
    console.log('delay start sleep: ' + Math.round(intvl * 100) / 100 + ' msecs');
    await(function (defer) {
      setTimeout(function () {
        outport.send(ip);
        defer();
      }, intvl);
    });
  });
}
