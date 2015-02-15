var fbp = require('..')
  , path = require('path');

// --- define network ---
var reader = fbp.defProc('reader');
var copier = fbp.defProc('copier');
var writer = fbp.defProc('writer');

fbp.initialize(reader, 'FILE', path.resolve(__dirname, 'data/text.txt'));
fbp.connect(reader, 'OUT', copier, 'IN', 1);
fbp.initialize(writer, 'FILE', path.resolve(__dirname, 'data/text_new.txt'));
fbp.connect(copier, 'OUT', writer, 'IN', 1);

// --- run ---
fbp.run({ trace: false });
