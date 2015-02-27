'use strict';

module.exports = function repl(proc) {
  var inport = proc.openInputPort('IN');
  var array = proc.openOutputPortArray('OUT');

  while (true) {
    var ip = inport.receive();
    if (ip === null) {
      break;
    }
    for (var i = 0; i < array.length; i++) {
      array[i].send(proc.createIP(ip.content));
    }
    proc.dropIP(ip);
  }
};
