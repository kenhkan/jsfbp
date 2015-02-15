'use strict';

module.exports = function sender(proc) {
  var inport = proc.openInputPort('COUNT');
  var outport = proc.openOutputPort('OUT');
  var ip = inport.receive();
  var count = ip.contents;
  proc.dropIP(ip);
  //console.log(count);
  for (var i = 0; i < count; i++) {
    var ip = proc.createIP(i + '');
    if (-1 == outport.send(ip)) {
      return;
    }
  }
};
