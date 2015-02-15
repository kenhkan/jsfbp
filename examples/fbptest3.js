var fbp = require('..')
  , path = require('path');

// --- define network ---
var sender = fbp.defProc('sender');
var reader = fbp.defProc('reader');
var copier = fbp.defProc('copier');
var recvr  = fbp.defProc('recvr');

fbp.initialize(sender, 'COUNT', '20');
fbp.connect(sender, 'OUT', copier, 'IN', 5);
fbp.initialize(reader, 'FILE', path.resolve(__dirname, 'data/text.txt'));
fbp.connect(reader, 'OUT', copier, 'IN', 5);
fbp.connect(copier, 'OUT', recvr, 'IN', 5);

// --- run ---
fbp.run({ trace: false });