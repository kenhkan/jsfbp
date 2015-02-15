'use strict';

var fs = require('fs');

module.exports = function writer(proc) {
   var inport = proc.openInputPort('FILE');
   var dataport = proc.openInputPort('IN');
   var ip = inport.receive();
   var fname = ip.contents;
   proc.dropIP(ip);
   var string = '';
   while (true) {
      ip = dataport.receive();
      if (ip === null) {
        break;
      }
      string += ip.contents + '\n';
      proc.dropIP(ip);
   }
   myWriteFile(fname, string, "utf8", proc, function () {
     console.log('write complete: ' + proc.name);
   });
};

function myWriteFile(path, data, options, proc, done) {
  console.log('write started: ' + proc.name);
  fs.writeFile(path, data, options, function(err, data) {
    console.log('running callback for: ' + proc.name);
    done();
  });
  console.log('write pending: ' + proc.name);
}
