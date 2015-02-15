'use strict';

// same as copier, but written as a non-looper

module.exports = function copier_nonlooper(proc) {
  var inport = proc.openInputPort('IN');
  var outport = proc.openOutputPort('OUT');
  var ip = inport.receive();
  var i = ip.contents;
  outport.send(ip);
};
