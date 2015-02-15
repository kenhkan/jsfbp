//var fbp = require('..');

//// --- define network ---
//var sender = fbp.defProc('sender');
//var repl   = fbp.defProc('repl');
//var concat = fbp.defProc('concat');
//var recvr  = fbp.defProc('recvr');

//fbp.initialize(sender, 'COUNT', '20');
//fbp.connect(sender, 'OUT', repl, 'IN', 5);
//fbp.connect(repl, 'OUT[0]', concat, 'IN[0]', 5);
//fbp.connect(repl, 'OUT[1]', concat, 'IN[1]', 5);
//fbp.connect(repl, 'OUT[2]', concat, 'IN[2]', 5);
//fbp.connect(concat, 'OUT', recvr, 'IN', 5);

//// --- run ---
//fbp.run({ trace: false });
