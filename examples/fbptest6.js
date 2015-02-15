var fbp = require('..');

// --- define network ---
var sender  = fbp.defProc('sender');
var repl    = fbp.defProc('repl');
var rrmerge = fbp.defProc('rrmerge');
var recvr   = fbp.defProc('recvr');

fbp.initialize(sender, 'COUNT', '20');
fbp.connect(sender, 'OUT', repl, 'IN', 5);
fbp.connect(repl, 'OUT[0]', rrmerge, 'IN[0]', 5);
fbp.connect(repl, 'OUT[1]', rrmerge, 'IN[1]', 5);
fbp.connect(repl, 'OUT[2]', rrmerge, 'IN[2]', 5);
fbp.connect(rrmerge, 'OUT', recvr, 'IN', 5);

// --- run ---
fbp.run({ trace: false });
