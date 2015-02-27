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
//   * Synchronous coding style -> global error handling?
//   * Port opening/closing
//   * Nuances between array ports and regular ports -> Synchronous style of
//     `while`?
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
//
// Note that "acts" used in variable names throughout the runtime is simply a
// contraction of "activations".

// Simply an array of process functions that be activated
var global_acts = [];
// Maximum queue size. A new connection increases this number. It starts at 1
// because the queue is implemented as a proper list, so one space is reserved
// for `nil`.
var global_acts_size = 1;
// Pointer to the "current" activation
var global_acts_head = 0;
// Pointer to the "last" activation. Note that the activation queue is
// conceptually a proper list (just in the body of a fixed-sized array). The
// "last" queue element is always assumed "nil" and ready to be allocated. When
// this intersects with the head pointer, packets will be rejected, just like
// when port fails to accept more IPs because it has reached capacity at the
// component-level.
var global_acts_last = 0;

// Depending on the platform, we have different ways of inserting ourselves
// into the event loop.
var scheduleRun =
  (typeof window === 'object') && window.requestAnimationFrame ||
  (typeof global === 'object') && global.setImmediate;

if (typeof scheduleRun !== 'function') {
  err('The platform on which this program is run provides no event loop.');
}

// We need some trackers to make sure only one loop is running as well as when
// to terminate the infinite loop.
var global_loopRunning = false;
var global_lastHead = -1;

// The design of the run-loop is specifically to avoid excessive interaction
// with the browser, because it's generally expensive to do so. The run-loop is
// executed at the *beginning* of the event loop, versus the end, in which case
// all activations would have been settled before each event loop ends, but at
// the expense of an engine-level call for each activation.
function runLoop () {
  // Guard against double running loops.
  if (global_loopRunning) {
    return;
  }
  global_loopRunning = true;

  while (true) {
    // The base case is when we've finally caught up with all the pending
    // activations.
    if (global_acts_last === global_acts_head) {
      // We'll start the cycle anew on next event loop, but only when there has
      // been activities.
      if (global_lastHead !== global_acts_head) {
        global_lastHead = global_acts_head;
        scheduleRun(runLoop);
      }
      global_loopRunning = false;
      return;
    }

    var pid = global_acts[global_acts_head];
    // Activate the process, but only if it's running.
    if (global_process_statuses[pid] === global_process_RUNNING) {
      global_processes[pid]();
    }

    global_acts_head++;
    if (global_acts_head >= global_acts_size) {
      global_acts_head = 0;
    }
  }
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

// Process-related global variables
var global_process_RUNNING  = 0;
var global_process_PAUSED   = 1;
var global_process_contexts = [];
var global_process_statuses = [];


// ******
// Convenience functions. These must be pure functions (using global variables
// is ok) and are perfect candidates for inlining during compilation.

function log () {
  if (global_toTrace) {
    console.log.apply(console, arguments);
  }
}

function triLog (a, b, c, al, bl) {
  if (global_toTrace) {
    var i, l;
    // Output string
    var ao = '';
    var bo = '';
    // Default pad lengths
    var al = al || 20;
    var bl = bl || 3;

    // Right-padded
    l = al - a.length;
    for (i = 0; i < l; i++) {
      ao += ' ';
    }
    ao += a;

    // Left-padded
    l = bl - b.length;
    bo += b;
    for (i = 0; i < l; i++) {
      bo += ' ';
    }

    log(ao, bo, c);
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
  var pname = global_process_contexts[pid].name;
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

// This deep-copy assumes a JSONifiable object, meaning that it must be a
// primitive or an acyclic object, without any references such as file handles
// and functions.
function deepCopy (data) {
  try {
    return JSON.parse(JSON.stringify(data));
  } catch (e) {
    err('Deep copying fails. The passed object must be acyclic and do not contain function and file handle references.');
  }
}


// ******
// IP abstraction

// Who owns the IP? Indexed by IPID
var global_ip_owners   = [];
// We need to keep IPs because we're simply passing IPIDs around to satisfy
// FBP's ownership requirements.
var global_ips = [];
// This is NOT the count of existing IPs, just a cumulative count of all IPs
// that have been created since the system started.
var global_ip_counter = 0;

function createIP (pid, content) {
  var ipid = global_ip_counter++;

  // IP is frozen to prevent ID tempering.
  var ip = Object.freeze({
    id: ipid,
    // Creating a new IP always deep-copies.
    content: deepCopy(content)
  });

  // Book-keeping
  global_ip_owners[ipid]   = pid;

  return ip;
}

function dropIP (pid, ipid) {
  global_ip_owners[ipid] = null;
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
// Looper pattern

// Take a process ID and an iterator function and make sure it's "blocking",
// making the process "sleep" until the `await` function is invoked.
function looper (pid, iterator) {
  // The iterator is passed the await function.
  function iterate () {
    iterator(
      // The callback from the awaiting function
      function await (awaitor) {
        // When the await is called, we simply continue the loop.
        awaitor(function () {
          // We want to prevent accidental stack overflow if the user code is
          // actually synchronous.
          scheduleRun(iterate);
        });
      },
      // End the looper by releasing the process for future activations.
      function done () {
        global_process_statuses[pid] = global_process_RUNNING;
        // There may be something that happened that would trigger activations.
        runLoop();
      }
    );
  }

  // Pause the process!
  global_process_statuses[pid] = global_process_PAUSED;
  // Start iteration.
  iterate();
}


// ******
// The Core

function send (pid, portName, ip, isIIP) {
  if (typeof pid !== 'number' && typeof portName === 'string') {
    err('Invalid process with PID of ' + pid + ' and port of ' + portName);
  }

  var ipOwner = global_ip_owners[ip.id];

  if (ipOwner !== pid) {
    if (! ipOwner) {
      err('The IP has been dropped and cannot be sent.');
    } else {
      err('The IP is owned by another process and cannot be sent.');
    }
  }

  // We need to check the next one is not the head because the queue must be a
  // proper list, so the next one needs to be "nil". This should theoretically
  // never happen because IP sending is guarded at the port level.
  if (global_acts_last + 1 === global_acts_head) {
    err('Reached system capacity');
  }

  // If it's an IIP, just send directly to the specified port, but by default
  // we're dealing with normal IPs.
  isIIP = isIIP || false;
  var senderAddress = toAddr(pid, portName);
  // Default to sender's own address
  var address = senderAddress;

  // Get the destination address to send to.
  if (! isIIP) {
    address = mapAddr(pid, portName);
    // Activate the destination process.
    pid = getPID(address);
  }

  triLog(prettifyAddr(senderAddress), ' --> ', ip.contents);

  // Push IP to the destination buffer and an activation to the queue.
  (global_buffers[address] = global_buffers[address] || []).push(ip);
  global_acts[global_acts_last] = pid;

  // For the next IP
  global_acts_last++;
  if (global_acts_last >= global_acts_size) {
    global_acts_last = 0;
  }

  // Sending a message triggers the run-loop as it may process an event from
  // the outside world.
  if (! isIIP) {
    runLoop();
  }
}

function receive (pid, portName) {
  if (typeof pid !== 'number' && typeof portName === 'string') {
    err('Invalid process with PID of ' + pid + ' and port of ' + portName);
  }

  var process = global_processes[pid];
  var address = toAddr(pid, portName);

  // Locate the buffer by address label.
  var buffer = global_buffers[address];

  var ip =
    // If it's a regular port, return the next IP.
    (buffer && buffer.length && buffer.shift()) ||
    // If it's an IIP port, just return the IIP.
    global_iipBuffer[address] ||
    // There's nothing anywhere.
    null;

  if (! ip) {
    return ip;
  }

  var ipid = ip.id;

  // Receiving an IP transfers ownership.
  global_ip_owners[ipid] = pid;

  if (!! ipid) {
    triLog(prettifyAddr(address), ' <-- ', global_ips[ipid]);
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

    createIP: function (content) {
      return createIP(pid, content);
    },

    getIP: function (ipid) {
      return getIP(pid, ipid);
    },

    dropIP: function (ipid) {
      dropIP(pid, ipid);
    },

    // ***
    // Loopers, ES5-style

    looper: function (iterator) {
      looper(pid, iterator);
    }
  };

  // The currying. Note that by convention we name the component function's
  // parameter as `proc` but it's actually the context here. The use of `proc`
  // as the parameter name is to make it more intuitive for users.
  var proc = function () {
    // Pass the process context along with logging function
    return process(context, log);
  };

  // Processes self-identify.
  proc.id   = pid;
  proc.name = processName;
  // Do not allow modifications.
  Object.freeze(proc);
  // Save the process.
  global_processes[pid] = proc;
  // Save the contexts.
  global_process_contexts[pid] = context;
  // It's running now!
  global_process_statuses[pid] = global_process_RUNNING;

  // We don't pass functions around, just the PID for safety.
  return pid;
}


// ******
// Expose the API

module.exports = {

  defProc: defProc,

  initialize: function (pid, portName, content) {
    var ip      = createIP(pid, content);
    var address = toAddr(pid, portName);
    // Store the IIP for subsequent "receives".
    global_iipBuffer[address] = ip;
    // Always send an initial packet to start things off, BUT these need to be
    // sent after the graph has been kickstarted.
    scheduleRun(send, pid, portName, ip, true);
  },

  connect: function (fromProc, fromPort, toProc, toPort, capacity) {
    var fromAddress = toAddr(fromProc, fromPort);
    var toAddress = toAddr(toProc, toPort);
    global_connections[fromAddress] = toAddress;

    // Register the sub-port, if present.
    registerSubport(fromAddress);
    registerSubport(toAddress);

    // Connecting adds to the global capacity.
    global_acts_size += capacity;
  },

  // `trace`: prints logs to stdout
  run: function (config) {
    config = config || {};
    enableTrace(config.trace);
    // Run immediately.
    runLoop();
  },

  enableTrace: enableTrace,
  getPortBufferSizes: getPortBufferSizes

};
