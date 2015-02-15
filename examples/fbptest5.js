var fbp = require('..')
  , path = require('path');

// --- define network ---
var reader  = fbp.defProc('reader');
var reader2 = fbp.defProc('reader', 'reader2');
var copier  = fbp.defProc('copier');
var recvr   = fbp.defProc('recvr');
var rrmerge = fbp.defProc('rrmerge');

fbp.initialize(reader, 'FILE', path.resolve(__dirname, 'data/text.txt'));
fbp.connect(reader, 'OUT', copier, 'IN', 2);
fbp.initialize(reader2, 'FILE', path.resolve(__dirname, 'data/zzzs.txt'));
fbp.connect(reader2, 'OUT', rrmerge, 'IN[0]', 2);
fbp.connect(copier, 'OUT', rrmerge, 'IN[1]', 2);
fbp.connect(rrmerge, 'OUT', recvr, 'IN', 2);

// --- run ---
fbp.run({ trace: false });
