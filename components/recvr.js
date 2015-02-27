'use strict';

module.exports = function recvr(proc) {
  var inport = proc.openInputPort('IN');
  while (true) {
    var ip = inport.receive();
    if (ip === null) {
      break;
    }
    console.log('recvr');
    console.log(ip);
    var data = ip.content;
    console.log('data: ' + data);
    proc.dropIP(ip);
  }
};
