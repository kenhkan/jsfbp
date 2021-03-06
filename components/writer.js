'use strict';

var fbp = require('..')
  , Fiber = require('fibers')
  , fs = require('fs')
  , InputPort = require('../core/InputPort')
  , IP = require('../core/IP');

module.exports = function writer() {
   var proc = fbp.getCurrentProc();
   var inport = InputPort.openInputPort('FILE');
   var dataport = InputPort.openInputPort('IN');
   var ip = inport.receive();
   var fname = ip.contents;
   IP.drop(ip);
   var string = '';
   while (true) {
      ip = dataport.receive();
      if (ip === null) {
        break;
      }
      string += ip.contents + '\n';
      IP.drop(ip);
   }
   fbp.setCallbackPending(true);
   myWriteFile(fname, string, "utf8", proc);
   console.log('write complete: ' + proc.name);
   fbp.setCallbackPending(false);
};

function myWriteFile(path, data, options, proc) {
  console.log('write started: ' + proc.name);
  fs.writeFile(path, data, options, function(err, data) {
    console.log('running callback for: ' + proc.name);
    fbp.queueCallback(proc);
  });
  console.log('write pending: ' + proc.name);
  return Fiber.yield();
}