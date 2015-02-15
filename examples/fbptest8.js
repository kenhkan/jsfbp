var fbp = require('..')
  , path = require('path');

// --- define network ---
var reader   = fbp.defProc('reader');
var reverse  = fbp.defProc('reverse');
var reverse2 = fbp.defProc('reverse', 'reverse2');
var recvr    = fbp.defProc('recvr');

fbp.initialize(reader, 'FILE', path.resolve(__dirname, 'data/text.txt'));
fbp.connect(reader, 'OUT', reverse, 'IN', 5);
fbp.connect(reverse, 'OUT', reverse2, 'IN', 5);
fbp.connect(reverse2, 'OUT', recvr, 'IN', 1);

// --- run ---
fbp.run({ trace: true });
