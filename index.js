'use strict';

// ******
// The runtime should be small and performant. Putting everything in one file
// is by design as this encourages a tiny runtime.
//
// An added benefit is that we can share state between any part of the runtime
// without sacrificing privacy such that other modules can retrieve the
// internal state of the runtime via `require()` since modularizing the runtime
// would force us to expose internal details.
//
// Note that many design decisions are made with browser optimization
// opportunities in mind. It does not necessarily mean that it is optimized.
// This style of coding may not normally encouraged, but since this is for just
// the (remember, small!) runtime, and all application-level code should be in
// components and FBP anyway, this approach may be desirable.
//
// In short, these are the design goals:
//
//   * Stand-alone runtime with no dependency: aside from a "standard library"
//     of commonly-used components, this file should be all you need to run an
//     FBP network in JavaScript.
//   * Cross-platform: the runtime should work, without modification, on
//     Node.js/IO.js and in a modern browser environment.
//   * ECMAScript 5: the runtime should be expected to run any FBP network
//     without too much modifications due to platform changes (e.g. Node.js API
//     changes).
//   * When in doubt, use "simple" coding style (think imperative and
//     functional).
//
// TODOs
//
//   * Back-pressure/Capacity -> Transactions and history
//   * Explicit IP ownership (which would prevent the passd-by-reference
//     object issue in JS) -> History (with global queue) and monadic interface
//   * Synchronous coding style -> global error handling?
//   * Clean up IP and port states -> Just refactoring
//   * Nuances between array ports and regular ports -> Synchronous style of
//     `while`?
//   * System-level traces -> Option to turn off traces
//   * Multi-core support (cluster or child processes in Node.js and WebWorkers
//     in browser) -> Explicit components for each type of parallelism
//   * Documentation


// ******
// Trace for debugging

var global_toTrace = false;

function enableTrace (toTrace) {
  global_toTrace = toTrace || global_toTrace;
}


// ******
// The runtime queue for process activation. Each sent IP triggers its
// destination process to be queued for activation and we want to put as many
// activations in a single event loop as possible.
//
// Note that in this implementation each newly sent IP necessarily equates a
// new activation, regardless of whether the process would operate on the IP.
// This is in line with FBP. Because of this guarantee, it also conveniently
// allows the activation queue to be of a fixed size that is known before a
// graph is run.
//
// Note that "acts" used in variable names throughout the runtime is simply a
// contraction of "activations".

// Simply an array of process functions that be activated
var global_acts = [];
// Maximum queue size. This is calculated by the cumulative capacity of the
// graph when the graph is first run.
// TODO: actually caculate the cumulative capcity
var global_acts_size = 1000;
// Pointer to "current" activation
var global_acts_head = 0;
// Pointer to "last" activation. Note that the activation queue is conceptually
// a proper list (just in the body of a fixed-sized array). The "last" queue
// element is always assumed "nil" and ready to be allocated. When this
// intersects with the head pointer, packets will be rejected, just like when
// port fails to accept more IPs because it has reached capacity at the
// component-level.
var global_acts_last = 0;

// The FBP run loop may be called more than once, BUT we only want it to run
// once per event loop, specifically at the end of the current event loop.
var global_runLoopHasRun = false;
// Depending on platform, we have different ways of inserting ourselves into
// the event loop. We assume `global` to be `window` in a browser environment.
var global_nextTick =
  (typeof window !== 'undefined') && window.requestAnimationFrame ||
  global && global.process && global.process.nextTick;

if (typeof global_nextTick !== 'function') {
  err('The platform on which this program is run provides no event loop.');
}


// ******
// Registered processes and their buffers stored in these arrays:
//
//   1. The process functions to be activated;
//   2. Connections between ports;
//   3. In-transit IPs;
//   4. Stored IIPs;
//   5. Ports; and
//   6. Number of sub-ports for each array port.
//
// #1 are indexed by the process ID that is assigned to a particular process
// function upon registration, mapping to the actual function to be called. #2
// is a map indexed by an out-port's address label to an in-port's address
// label. #3 and #4 is a mapping from an address label to an IP or IIP. #5 is
// indexed by the address label (including the sub-port part). #6 is indexed by
// the address label without the sub-port part (e.g. `0.IN` rather than
// `0.IN[0]`).
//
// This setup is preferred because:
//
//   * It allows the JS engine to optimize via type-based specialized code;
//   * It avoids annoying checks for attribute existence that JS requires,
//     especially when dealing with tree data structures; and
//   * It hides the complexity by only exposing the process ID to users and
//     handle all data via simple array and hash lookups.

// #1 of the list above
var global_processes = [];
// #2
var global_connections = {};
// #3
var global_buffers = {};
// #4. Note that the name is singular for a reason. IIPs don't change like IPs.
// They parameterize processes so every time the process `receives` an IIP,
// it's just the same IP set up for it when the system started.
var global_iipBuffer = {};
// #5
var global_ports = {};
// #6. A separate map between array port's address label and the port's size is
// needed because otherwise we need to traverse the entire namespace for ports
// to find the sub-ports, an O(n) operation. The alternative is to use an array
// for storing port information but that'd force non-array ports to be stored
// as arrays as well, which is awkward. Since the FBP protocol is pretty
// well-defined and not likely to change, and array-port naming is sequential,
// this approach offers a solution with minimal impact to the rest of the
// architecture.
var global_arrayPort_sizes = {};


// ******
// Convenience functions. These must be pure functions (using global variables
// is ok) and are perfect candidates for inlining during compilation.

function log (message) {
  if (global_toTrace) {
    console.log(message);
  }
}

function err (message) {
  throw new Error(message);
}

// The address is simply concatenated process ID and port name, as each
// permutation is unique. Playing JavaScript's magical dynamical typing to its
// advantage here (doesn't happen often).
function toAddr (pid, portName) {
  return pid + '.' + portName;
}

// Extract the process ID from an address label.
function getPID (addr) {
  return addr.split('.')[0];
}

// An address is an internal representation. Call this function with an
// internal address label for a user-friendly version.
function prettifyAddr (addr) {
  var parts = addr.split('.');
  var pid = parts.shift();
  var pname = global_processes[pid]._jsfbp_pname;
  parts.unshift(pname);
  return parts.join('.');
}

// Given an out-port address, return the address of the in-port connected to
// it downstream.
function mapAddr (fromProc, fromPort) {
  var fromAddress = toAddr(fromProc, fromPort);
  var toAddress = global_connections[fromAddress] || null;

  if (! toAddress) {
    log('Port ' + prettifyAddr(fromAddress) + ' is not connected to anything.');
  }

  return toAddress;
}

// Given an array-port address, register the sub-port. This assumes that '['
// and ']' are reserved characters in naming for array ports.
function registerSubport (address) {
  var subportName;
  // For readability
  var sizes = global_arrayPort_sizes;
  var idxStart = address.indexOf('[');
  var idxEnd = address.indexOf(']');
  // The address without the subport part
  var addr = address.substring(0, idxStart);

  // Note to self who will be utterly confused when he looks back in the
  // future: implicit in this comparison is that both characters exist and
  // the ending char is after the starting char, so extract everything in
  // between.
  if (idxEnd > idxStart) {
    subportName = parseInt(address.substring(idxStart + 1, idxEnd));
    // We want the subport with the highest index so when we iterate, we get
    // all the ports.
    sizes[addr] = Math.max(subportName, sizes[addr] || 0) + 1;
  }
}


// ******
// IP abstraction

var global_IP_NORMAL = 0;
var global_IP_OPEN   = 1;
var global_IP_CLOSE  = 2;

function createIP (contents) {
  return {
    // TODO: what to do with ownership?
    owner: null,
    type: global_IP_NORMAL,
    contents: contents
  };
}

function dropIP (ip) {
  ip.type = global_IP_CLOSE;
}


// ******
// Port abstraction

var global_port_NORMAL = 0;
var global_port_CLOSE  = 1;

function isPortClosed (address) {
  return global_ports[address].isClosed();
}

function createPort (pid, name) {
  var address = toAddr(pid, name);
  var port = global_ports[address];

  if (!! port) {
    return port;
  }

  var state = global_port_NORMAL;

  port = {
    address: address,

    close: function () {
      state = global_port_CLOSE
    },

    isClosed: function () {
      return state === global_port_CLOSE;
    }
  };

  // Register the port.
  global_ports[address] = port;

  return port;
}

function openInputPort (pid, name) {
  var address = toAddr(pid, name);
  var port = global_ports[address];

  if (!! port) {
    return port;
  }

  var port = createPort(pid, name);

  port.receive = function () {
    return receive(pid, name);
  }

  return port;
}

function openOutputPort (pid, name) {
  var address = toAddr(pid, name);
  var port = global_ports[address];

  if (!! port) {
    return port;
  }

  var port = createPort(pid, name);

  port.send = function (ip) {
    send(pid, name, ip);
  }

  return port;
}

function openArrayPort (openPort, pid, name) {
  var ports = [];
  var addr = toAddr(pid, name);
  var size = global_arrayPort_sizes[addr];
  var subportName;

  for (var i = 0; i < size; i++) {
    subportName = name + '[' + i + ']';
    ports.push(openPort(pid, subportName));
  }

  return ports;
}


// ******
// The Core

function send (pid, portName, ip, isIIP) {
  if (typeof pid !== 'number' && typeof portName === 'string') {
    err('Invalid process with PID of ' + pid + ' and port of ' + portName);
  }

  // If it's an IIP, just send directly to the specified port.
  isIIP = isIIP || false;
  var address;

  // Get the destination address to send to.
  if (isIIP) {
    address = toAddr(pid, portName);
  } else {
    address = mapAddr(pid, portName);
    // Activate the destination process.
    pid = getPID(address);
  }

  // Drop to avoid overflow. We need to check the next one is not the head
  // because the queue must be a proper list, so the next one needs to be
  // "nil".
  if (global_acts_last + 1 === global_acts_head) {
    log('Reached system capacity. Dropping IP "' + ip.contents + '" sent to: ' + prettifyAddr(address));
    return;
  }

  // Push IP to the destination buffer and an activation to the queue.
  (global_buffers[address] = global_buffers[address] || []).push(ip);
  global_acts[global_acts_last] = global_processes[pid];
  log('Sending "' + ip.contents + '" to ' + prettifyAddr(address));

  // For the next IP
  global_acts_last++;
  if (global_acts_last >= global_acts_size) {
    global_acts_last = 0;
  }

  // Trigger the run loop.
  global_runLoopHasRun = false;
  global_nextTick(runLoop);
}

function receive (pid, portName) {
  if (typeof pid !== 'number' && typeof portName === 'string') {
    err('Invalid process with PID of ' + pid + ' and port of ' + portName);
  }

  var process = global_processes[pid];
  var address = toAddr(pid, portName);

  // Locate the buffer by address label.
  var buffer = global_buffers[address];

  // If it's a regular port, return the next IP.
  var ip = (buffer && buffer.length && buffer.shift()) ||
  // If it's an IIP port, just return the IIP.
  global_iipBuffer[address] ||
  // There's nothing anywhere.
  null;

  // Make sure the port is open.
  if (isPortClosed(address)) {
    var contents = '"' + (ip && ip.contents || '') + '"';
    log('Port ' + prettifyAddr(address) + ' is closed. Dropping IP ' + contents);
    return null;
  }

  if (!! ip) {
    log('Receiving "' + ip.contents + '" from ' + prettifyAddr(address));
  }

  return ip;
}

// Given an array of addresses, return an array of current buffer size for each
// address, preserving order.
function getPortBufferSizes (ports) {
  var sizes = [];
  var buffer;
  var address;

  for (var i = 0, l = ports.length; i < l; i++) {
    address = ports[i].address;
    buffer = global_buffers[address] || [];
    sizes[i] = buffer.length;
  }

  return sizes;
}

function runLoop () {
  // Avoid unnecessary execution.
  if (global_runLoopHasRun) {
    return;
  }

  // Flag the end of run loop.
  global_runLoopHasRun = true;

  while (true) {
    // Base case is when we've finally caught up with all the activations.
    if (global_acts_last === global_acts_head) {
      return;
    }

    global_acts[global_acts_head]();

    global_acts_head++;
    if (global_acts_head >= global_acts_size) {
      global_acts_head = 0;
    }
  }
}

function defProc (process, name) {
  if (typeof process === 'function') {
    // Nothing needs to be done. We expect a function.
  } else if (typeof process === 'string') {
    process = require('./components/' + process + '.js');
  } else {
    err('Process must be either a process function or a component name.');
  }

  var processName = name || process.name;
  // We are using numeric indices here instead of the component name
  // because there could be more than one instantiated process per
  // component.
  var pid = global_processes.length;

  // Pass functions curried with process-specific information to the component
  // function.
  var context = {
    // Technically it's the component name, but, oh well.
    name: processName,
    // Always use the provided log function as you can turn off logging
    // globally.
    log: log,

    // ***
    // Ports-related

    openInputPort: function (name) {
      return openInputPort(pid, name)
    },

    openInputPortArray: function (name) {
      return openArrayPort(openInputPort, pid, name);
    },

    openOutputPort: function (name) {
      return openOutputPort(pid, name)
    },

    openOutputPortArray: function (name) {
      return openArrayPort(openOutputPort, pid, name);
    },

    // ***
    // IP-related

    createIP: createIP,
    dropIP: dropIP
  };

  // The currying. Note that by convention we name the component function's
  // parameter as `proc` but it's actually the context here. The use of `proc`
  // as the parameter name is to make it more intuitive for users.
  var proc = function () {
    return process(context);
  };

  // Remember to record the process name.
  proc._jsfbp_pname = processName;

  // Save it
  global_processes[pid] = proc;

  // We don't pass functions around, just the PID for safety.
  return pid;
}


// ******
// Expose the API

module.exports = {

  defProc: defProc,

  initialize: function (pid, portName, contents) {
    var ip = createIP(contents);
    var address = toAddr(pid, portName);
    // Store the IIP for subsequent "receives".
    global_iipBuffer[address] = ip;
    // Always send an initial packet to start things off.
    send(pid, portName, 0, ip, true);
  },

  connect: function (fromProc, fromPort, toProc, toPort, capacity) {
    var fromAddress = toAddr(fromProc, fromPort);
    var toAddress = toAddr(toProc, toPort);
    global_connections[fromAddress] = toAddress;

    // Register the sub-port, if present.
    registerSubport(fromAddress);
    registerSubport(toAddress);
  },

  run: function (config) {
    config = config || {};
    enableTrace(config.trace);
    runLoop();
  },

  enableTrace: enableTrace,
  getPortBufferSizes: getPortBufferSizes

};
