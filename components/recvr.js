'use strict';

module.exports = function recvr(proc) {
  var inport = proc.openInputPort('IN');
  while (true) {
    var ip = inport.receive();
    if (ip === null) {
      break;
    }
    var data = ip.contents;
    console.log('data: ' + data);
    proc.dropIP(ip);
  }
};
