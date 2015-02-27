'use strict';

var fs = require('fs');

// Reader based on Bruno Jouhier's code
module.exports = function reader(proc) {
  var inport = proc.openInputPort('FILE');
  var ip = inport.receive();
  var fname = ip.content;
  console.log('reader:: ', ip, fname);
  proc.dropIP(ip);

  myReadFile(fname, "utf8", proc, function (data) {
    proc.log('read complete: ' + proc.name);

    var outport = proc.openOutputPort('OUT');
    var array = data.split('\n');
    for (var i = 0; i < array.length; i++) {
      var ip = proc.createIP(array[i]);
      outport.send(ip);
    }
  });
};

function myReadFile(path, options, proc, done) {
  proc.log('read started: ' + proc.name);
  fs.readFile(path, options, function(err, data) {
    proc.log('callback for: ' + proc.name);
    done(data);
  });
  proc.log('read pending: ' + proc.name);
}
