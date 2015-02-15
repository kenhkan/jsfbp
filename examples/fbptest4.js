var fbp = require('..');

// --- define network ---
var sender = fbp.defProc('sender');
var repl   = fbp.defProc('repl');
var recvr  = fbp.defProc('recvr');

fbp.initialize(sender, 'COUNT', '20');
fbp.connect(sender, 'OUT', repl, 'IN', 5);
fbp.connect(repl, 'OUT[0]', recvr, 'IN', 5);
fbp.connect(repl, 'OUT[1]', recvr, 'IN', 5);
fbp.connect(repl, 'OUT[2]', recvr, 'IN', 5);

// --- run ---
fbp.run({ trace: false });