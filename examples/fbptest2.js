var fbp = require('..')
  , path = require('path');

// --- define network ---
var reader = fbp.defProc('reader');
var copier = fbp.defProc('copier');
var recvr  = fbp.defProc('recvr');

fbp.initialize(reader, 'FILE', path.resolve(__dirname, 'data/text.txt'));
fbp.connect(reader, 'OUT', copier, 'IN', 1);
fbp.connect(copier, 'OUT', recvr, 'IN', 1);

// --- run ---
fbp.run({ trace: false });
