'use strict';

module.exports = function concat(proc) {
  var array = proc.openInputPortArray('IN');
  var outport = proc.openOutputPort('OUT');
  var ip = null;

  for (var i = 0; i < array.length; i++) {
    while (true) {
      ip = array[i].receive();
      if (ip === null) {
        break;
      }
      outport.send(ip);
    }
  }
};
