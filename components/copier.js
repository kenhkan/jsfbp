'use strict';

module.exports = function copier(proc) {
  var inport = proc.openInputPort('IN');
  var outport = proc.openOutputPort('OUT');
  while (true) {
    var ip = inport.receive();
    if (ip === null) {
      break;
    }
    var i = ip.content;
    outport.send(ip);
  }
};
