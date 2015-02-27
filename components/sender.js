'use strict';

module.exports = function sender(proc) {
  var inport = proc.openInputPort('COUNT');
  var outport = proc.openOutputPort('OUT');
  var ip = inport.receive();
  var count = ip.content;
  proc.dropIP(ip);
  for (var i = 0; i < count; i++) {
    var ip = proc.createIP(i + '');
    if (-1 == outport.send(ip)) {
      return;
    }
  }
};
