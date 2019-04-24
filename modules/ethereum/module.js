// (C) 2015 Internet of Coins / Metasync / Joachim de Koning
// hybrixd module - ethereum/module.js
// Module to connect to ethereum or any of its derivatives

// required libraries in this context
let fs = require('fs');
let Client = require('../../lib/util/rest').Client;
let APIqueue = require('../../lib/APIqueue');
let scheduler = require('../../lib/scheduler/scheduler');
let modules = require('../../lib/modules');
let LZString = require('../../common/crypto/lz-string');
let hex2dec = require('../../common/crypto/hex2dec'); // convert long HEX to decimal still being used by ethereum quartz code

let Decimal = require('../../common/crypto/decimal-light.js');
Decimal.set({precision: 64}); // cryptocurrencies (like for example Ethereum) require extremely high precision!

function fromInt (input, factor) {
  let f = Number(factor);
  let x = new Decimal(String(input));
  return x.times((f > 1 ? '0.' + new Array(f).join('0') : '') + '1');
}

function isToken (symbol) {
  return (symbol.indexOf('.') !== -1 ? 1 : 0);
}

let jstr = function (target) { return JSON.stringify({symbol: target.symbol}); };

// exports
exports.init = init;
exports.exec = exec;
exports.link = link;
exports.post = post;

// Checks if the given string is a plausible ETH address
function isEthAddress (address) {
  return (/^(0x){1}[0-9a-fA-F]{40}$/i.test(address));
}

// activate (deterministic) code from a string
function activate (code) {
  if (typeof code === 'string') {
    // interpret deterministic library in a virtual DOM environment
    //    const {JSDOM} = jsdom;
  //  var dom = (new JSDOM('', {runScripts: 'outside-only'})).window;
    //    dom.window.nacl = nacl; // inject NACL into virtual DOM
  //  dom.window.crypto = crypto; // inject nodeJS crypto to supersede crypto-browserify
    //    dom.window.logger = logger; // inject the logger function into virtual DOM
    // var window = dom.window;
    eval('window.deterministic = (function(){})(); ' + code); // init deterministic code
    return window.deterministic;
  }
  console.log(' [!] error: cannot activate deterministic code!');
  return function () {};
}

// initialization function
function init () {
  modules.initexec('ethereum', ['init']);
}

let ethDeterministic;
// standard functions of an asset store results in a process superglobal -> global.hybrixd.process[processID]
// child processes are waited on, and the parent process is then updated by the postprocess() function
// http://docs.ethereum.org/en/latest/protocol.html
function exec (properties) {
  // decode our serialized properties
  let processID = properties.processID;
  let target = properties.target;
  let base = target.symbol.split('.')[0]; // in case of token fallback to base asset
  let subprocesses = [];
  // set request to what command we are performing
  global.hybrixd.proc[processID].request = properties.command;
  // define the source address/wallet
  let sourceaddr = (typeof properties.command[1] !== 'undefined' ? properties.command[1] : false);
  // handle standard cases here, and construct the sequential process list
  subprocesses.push('time(45000)');
  switch (properties.command[0]) {
    case 'init':
      if (typeof ethDeterministic === 'undefined') {
      // set up REST API connection
        if (typeof target.user !== 'undefined' && typeof target.pass !== 'undefined') {
          let options_auth = {user: target.user, password: target.pass};
          global.hybrixd.asset[target.symbol].link = new Client(options_auth);
        } else { global.hybrixd.asset[target.symbol].link = new Client(); }
        // initialize deterministic code for smart contract calls
        let dcode = String(fs.readFileSync('../modules/deterministic/ethereum/deterministic.js.lzma'));
        ethDeterministic = activate(LZString.decompressFromEncodedURIComponent(dcode));

        // set up init probe command to check if RPC and block explorer are responding and connected
        subprocesses.push('func("link",{target:' + jstr(target) + ',command:["eth_gasPrice"]})');
        subprocesses.push('func("post",{target:' + jstr(target) + ',command:["init"],data:$})');
        subprocesses.push('done');
      }
      break;
    case 'cron':
      subprocesses.push('data $symbol');
      subprocesses.push("flow 'eth' 2 1");
      subprocesses.push('done');
      subprocesses.push('logs(1,"module ethereum: updating fee")');

      subprocesses.push('rand 10000');
      subprocesses.push("data {jsonrpc: '2.0', method: 'eth_gasPrice', params: [], id: $}");
      subprocesses.push("curl asset://$symbol '' POST {'Content-Type': 'application/json'}");
      subprocesses.push('func("post",{target:' + jstr(target) + ',command:["updateFee"],data:$})');
      break;
    case 'fee':
    // directly return fee, post-processing not required!
      let fee;
      if (!isToken(target.symbol)) {
        fee = (typeof target.fee !== 'undefined' ? target.fee : null);
      } else {
        fee = (typeof global.hybrixd.asset[base].fee !== 'undefined' ? global.hybrixd.asset[base].fee * 2.465 : null);
      }
      subprocesses.push("data '" + fee + "'");
      subprocesses.push('form');
      subprocesses.push('done');
      break;
    case 'balance':
      if (sourceaddr) {
        subprocesses.push('@retryLoop');
        if (!isToken(target.symbol)) {
          subprocesses.push('func("link",{target:' + jstr(target) + ',command:["eth_getBalance",["' + sourceaddr + '","latest"]]})'); // send balance query
        } else {
          let encoded = ethDeterministic.encode({'func': 'balanceOf(address):(uint256)', 'vars': ['address'], 'address': sourceaddr}); // returns the encoded binary (as a Buffer) data to be sent
          subprocesses.push('func("link",{target:' + jstr(target) + ',command:["eth_call",[{"to":"' + target.contract + '","data":"' + encoded + '"},"pending"]]})'); // send token balance ABI query
        }
        // when bad result returned: {"status":"0","message":"NOTOK","result":"Error! Missing Or invalid Module name"
        // UBQ {"jsonrpc":"2.0","id":8123,"address":"0xa8201e4dacbe1f098791a0f11ab6271570277bb8","result":"0"}
        if (base === 'ubq') {
          subprocesses.push('tran(".result",1,@failure)');
          subprocesses.push("regx('^\\d',1,@failure)");
          subprocesses.push('atom');
          subprocesses.push('form');
          subprocesses.push('done');
          subprocesses.push('@failure');
          subprocesses.push('fail("Error: Ethereum network not responding. Cannot get balance!")');
        } else {
          subprocesses.push('tran(".result",1,@failure)');
          subprocesses.push("regx('^0x',1,@failure)");
          subprocesses.push("code 'hex' 'dec'");
          subprocesses.push('atom');
          subprocesses.push('form');
          subprocesses.push('done');
          subprocesses.push('@failure');
          subprocesses.push('logs(2,"module ethereum: bad RPC response, retrying request...")');
          subprocesses.push('wait(1500)');
          subprocesses.push('loop(@retryLoop,"retries","<9","1")');
          subprocesses.push('fail("Error: Ethereum network not responding. Cannot get balance!")');
        }
      } else {
        subprocesses.push('stop(1,"Error: missing address!")');
      }
      break;

    default:
      subprocesses.push('stop(1,"Asset function not supported!' + properties.command[0] + '")');
  }
  // fire the Qrtz-language program into the subprocess queue
  scheduler.fire(processID, subprocesses);
}

// standard function for postprocessing the data of a sequential set of instructions
function post (properties) {
  // decode our serialized properties
  let processID = properties.processID;
  let target = properties.target;
  let postdata = properties.data;
  let base = target.symbol.split('.')[0]; // in case of token fallback to base asset
  let feefactor = (typeof global.hybrixd.asset[base].factor !== 'undefined' ? global.hybrixd.asset[base].factor : 18);
  // set data to what command we are performing
  global.hybrixd.proc[processID].data = properties.command;
  // handle the command
  let success;
  if (postdata == null) {
    success = false;
  } else {
    success = true;
    switch (properties.command[0]) {
      case 'init':
        if (typeof postdata.result !== 'undefined' && postdata.result > 0) {
          global.hybrixd.asset[target.symbol].fee = fromInt(hex2dec.toDec(String(postdata.result)).times((21000 * 2)), feefactor);
        } else {
          global.hybrixd.asset[target.symbol].fee = global.hybrixd.asset[base].fee;
        }
        break;
      case 'updateFee':
        if (typeof postdata.result !== 'undefined' && postdata.result > 0) {
          global.hybrixd.asset[target.symbol].fee = fromInt(hex2dec.toDec(String(postdata.result)).times((21000 * 2)), feefactor);
        }
        break;
      default:
        success = false;
    }
  }
  // stop and send data to parent
  scheduler.stop(processID, success ? 0 : 1, postdata);
}

// data returned by this connector is stored in a process superglobal -> global.hybrixd.process[processID]
function link (properties) {
  let target = global.hybrixd.asset[properties.target.symbol];
  let base = target.symbol.split('.')[0]; // in case of token fallback to base asset
  // decode our serialized properties
  let processID = properties.processID;
  let command = properties.command;
  if (DEBUG) { console.log(' [D] module ethereum: sending REST call for [' + target.symbol + '] -> ' + JSON.stringify(command)); }
  // separate method and arguments
  let method = command.shift();
  let params = command.shift();
  // launch the asynchronous rest functions and store result in global.hybrixd.proc[processID]
  // do a GET or PUT/POST based on the command input
  if (typeof params === 'string') { try { params = JSON.parse(params); } catch (e) {} }
  let args = {
    headers: {'Content-Type': 'application/json'},
    data: {'jsonrpc': '2.0', 'method': method, 'params': params, 'id': Math.floor(Math.random() * 10000)}
  };
  // construct the APIqueue object
  APIqueue.add({ 'method': 'POST',
    'link': 'asset["' + base + '"]', // make sure APIqueue can use initialized API link
    'host': (typeof target.host !== 'undefined' ? target.host : global.hybrixd.asset[base].host), // in case of token fallback to base asset hostname
    'args': args,
    'timeout': (typeof target.timeout !== 'undefined' ? target.timeout : global.hybrixd.asset[base].timeout), // in case of token fallback to base asset throttle
    'throttle': (typeof target.throttle !== 'undefined' ? target.throttle : global.hybrixd.asset[base].throttle), // in case of token fallback to base asset throttle
    'pid': processID,
    'target': target.symbol});
}
