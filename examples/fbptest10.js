var fbp = require('..');

// --- define network ---
var sender = fbp.defProc('sender');
var copier = fbp.defProc('copier_nonlooper');
var recvr  = fbp.defProc('recvr');

fbp.initialize(sender, 'COUNT', '200');
fbp.connect(sender, 'OUT', copier, 'IN', 5);
fbp.connect(copier, 'OUT', recvr, 'IN', 5);

// --- run ---
fbp.run({ trace: false });
