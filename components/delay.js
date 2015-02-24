'use strict';

module.exports = function delay(proc) {
  var inport = proc.openInputPort('IN');
  var intvlport = proc.openInputPort('INTVL');
  var outport = proc.openOutputPort('OUT');
  var intvl_ip = intvlport.receive();
  var intvl = intvl_ip.contents;
  proc.dropIP(intvl_ip);

  while (true) {
    var ip = inport.receive();
    if (ip === null) {
      break;
    }
    sleep(proc.name, intvl, ip, function (ip) {
      outport.send(ip);
    });
  }
} 

function sleep(name, ms, ip, done) {
  console.log(name + ' start sleep: ' + Math.round(ms * 100) / 100 + ' msecs');
  setTimeout(function () { done(ip); }, ms);
}
