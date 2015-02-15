'use strict';

module.exports = function rrmerge(proc) {
  var array = proc.openInputPortArray('IN');
  var outport = proc.openOutputPort('OUT');
  var ip = null;
  while (true) {
    for (var i = 0; i < array.length; i++) {
      ip = array[i].receive();
      if (ip !== null) {
        outport.send(ip);
      }
    }
    if (ip === null) {
      break;
    }
  }
};
