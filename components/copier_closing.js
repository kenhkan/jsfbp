'use strict';

module.exports = function copier_closing(proc) {
  var inport = proc.openInputPort('IN');
  var outport = proc.openOutputPort('OUT');
  var count = 0;
  while (true) {
    var ip = inport.receive();
    if (ip === null) {
      break;
    }
    count++;
    if (count === 20) {
      inport.close();
      proc.dropIP(ip);
      return;
    }
    var i = ip.content;
    outport.send(ip);
  }
};
