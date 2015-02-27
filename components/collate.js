module.exports = function collate(proc) {
  var ctlfields = proc.openInputPort('CTLFIELDS');
  var inportArray = proc.openInputPortArray('IN');
  var outport = proc.openOutputPort('OUT');

  var ctlfieldsP = ctlfields.receive();
  proc.dropIP(ctlfieldsP);

  var fields = ctlfieldsP.content.split(',').map(function(str) { return parseInt(str); });
  var totalFieldLength = fields.reduce(function(acc, n) { return acc + n; }, 0);

  var portCount = inportArray.length;
  var ips = [];
  inportArray.forEach(function(port, index) {
    ips[index] = port.receive();
    if (ips[index] === null) {
      portCount--;
    }
  });

  while (portCount) {
    var lowestIndex = 0;
    var lowestKey = "\uffff";
    ips.forEach(function(ip, portIndex) {
      if (ip !== null) {
        var key = ip.content.substring(0, totalFieldLength);
        if (key < lowestKey) {
          lowestKey = key;
          lowestIndex = portIndex;
        }
      }
    });

    outport.send(ips[lowestIndex]);

    ips[lowestIndex] = inportArray[lowestIndex].receive();
    if (ips[lowestIndex] === null) {
      portCount--;
    }
  }
}
