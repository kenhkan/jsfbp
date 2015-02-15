'use strict';

var fbp = require('..');

module.exports = function lbal(proc) {
  var inport = proc.openInputPort('IN');
  var array = proc.openOutputPortArray('OUT');

  while (true) {
    var ip = inport.receive();
    if (ip === null) {
      break;
    }
    var sizes = fbp.getPortBufferSizes(array);
    var i = indexOfSmallest(sizes);
    array[i].send(ip);
  }
};

function indexOfSmallest (a) {
   return a.indexOf(Math.min.apply(Math, a));
}
