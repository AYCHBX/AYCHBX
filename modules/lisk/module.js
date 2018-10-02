// (C) 2015 Internet of Coins / Metasync / Joachim de Koning
// hybridd module - lisk/module.js
// Module to connect to CryptoNote currencies like Monero/Bytecoin or any of their derivatives

// required libraries in this context
var fs = require('fs');
var Client = require('../../lib/rest').Client;
var APIqueue = require('../../lib/APIqueue');
var scheduler = require('../../lib/scheduler');
var modules = require('../../lib/modules');
var functions = require('../../lib/functions');

var jstr = function (data) { return JSON.stringify(data); };

// exports
exports.init = init;
exports.tick = tick;
exports.exec = exec;
exports.stop = stop;
exports.link = link;
exports.post = post;

// initialization function
function init () {
  modules.initexec('lisk', ['init']);
}

// stop function
function stop () {
}

// scheduled ticker function
function tick (properties) {
}

// standard functions of an asset store results in a process superglobal -> global.hybridd.process[processID]
// child processes are waited on, and the parent process is then updated by the postprocess() function
function exec (properties) {
  // decode our serialized properties
  var processID = properties.processID;
  var target = properties.target;
  var mode = target.mode;
  var factor = (typeof target.factor !== 'undefined' ? target.factor : null);
  var fee = (typeof target.fee !== 'undefined' ? target.fee : null);
  var subprocesses = [];
  var command = [];
  var postprocessing = true;
  // set request to what command we are performing
  global.hybridd.proc[processID].request = properties.command;
  // handle standard cases here, and construct the sequential process list
  switch (properties.command[0]) {
    case 'init':
    // set up REST API connection
      if (typeof target.user !== 'undefined' && typeof target.pass !== 'undefined') {
        var options_auth = {user: target.user, password: target.pass};
        global.hybridd.asset[target.symbol].link = new Client(options_auth);
      } else { global.hybridd.asset[target.symbol].link = new Client(); }
      // set up init probe command to check if Altcoin RPC is responding and connected
      subprocesses.push('func("lisk","link",{target:' + jstr(target) + ',command:["/api/blocks/getStatus"]})');
      subprocesses.push('func("lisk","post",{target:' + jstr(target) + ',command:["init"],data:data,data})');
      subprocesses.push('pass( (data != null && typeof data.success!="undefined" && data.success ? 1 : 0) )');
      subprocesses.push('logs(1,"module lisk: "+(data?"connected":"failed connection")+" to [' + target.symbol + '] host ' + target.host + '",data)');
      break;
    case 'status':
    // set up init probe command to check if Altcoin RPC is responding and connected
      subprocesses.push('func("lisk","link",{target:' + jstr(target) + ',command:["/api/loader/status/sync"]})'); // get sync status
      subprocesses.push('poke("liskA",data)'); // store the resulting data for post-process collage
      subprocesses.push('func("lisk","link",{target:' + jstr(target) + ',command:["/api/blocks/getStatus"]})'); // get milestone / difficulty
      subprocesses.push('poke("::liskB",data)'); // store the resulting data for post-process collage
      subprocesses.push('func("lisk","link",{target:' + jstr(target) + ',command:["/api/peers/version"]})'); // get version
      subprocesses.push('func("lisk","post",{target:' + jstr(target) + ',command:["status"],data:{liskA:"$::liskA",liskB:"$::liskB",liskC:data}})'); // post process the data
      break;
    case 'factor':
    // directly relay factor, post-processing not required!
      subprocesses.push('stop(0,"' + factor + '")');
      break;
    case 'fee':
    // directly relay factor, post-processing not required!
      subprocesses.push('stop(0,"' + functions.padFloat(fee, factor) + '")');
      break;
    case 'balance':
    // define the source address/wallet
      var sourceaddr = (typeof properties.command[1] !== 'undefined' ? properties.command[1] : '');
      if (sourceaddr) {
        subprocesses.push('func("lisk","link",{target:' + jstr(target) + ',command:["/api/accounts/getBalance?address=' + sourceaddr + '"]})'); // send balance query
        subprocesses.push('stop((typeof data.balance!=="undefined"?0:1),(typeof data.balance==="undefined"?null:functions.padFloat(functions.fromInt(data.balance,' + factor + '),' + factor + ')))');
      } else {
        subprocesses.push('stop(1,"Error: missing address!")');
      }
      break;
    case 'push':
      var deterministic_script = (typeof properties.command[1] !== 'undefined' ? properties.command[1] : false);
      if (deterministic_script && typeof deterministic_script === 'string') {
        subprocesses.push('func("lisk","link",{target:' + jstr(target) + ',command:["/api/blocks/getNetHash"]})'); // get the nethash to be able to send transactions
        subprocesses.push('func("lisk","link",{target:' + jstr(target) + ',command:' + jstr(['/peer/transactions', deterministic_script]) + ',nethash:data.nethash})'); // shoot deterministic script object to peer node
        subprocesses.push('stop((typeof data.success!="undefined" && data.success?0:1),(typeof data.transactionId!=="undefined"?functions.clean(data.transactionId): (typeof data.error==="string"?data.error:(typeof data.message==="string"?data.message:data.error.message)) ))'); // shoot deterministic script object to peer node
      } else {
        subprocesses.push('func("lisk","link",{target:' + jstr(target) + ',command:["/api/blocks/getNetHash"]})'); // get the nethash to be able to send transactions
        subprocesses.push('stop(1,"Missing or badly formed deterministic transaction!")');
      }
      break;
    case 'unspent':
      subprocesses.push('stop(0,{"unspents":[],"change":"0"})');
      break;
    case 'transaction':
      // lsk api endpoints do not seem to exist
      // subprocesses.push('func("lisk","link",{target:' + jstr(target) + ',command:["/api/transaction/getTransaction?transactionId=' + properties.command[1] + '"]})');
      subprocesses.push('stop(1,"Transaction not yet supported for lisk module!")');
      break;
    case 'history':
    // if(typeof properties.command[1] != 'undefined') { if(properties.command[1] == 'pending') { var transfertype = 'unavailable' } else { var transfertype = 'available'; } } else { var transfertype = 'available'; }
    // /api/transactions?blockId=blockId&senderId=senderId&recipientId=recipientId&limit=limit&offset=offset&orderBy=field
      var sourceaddr = (typeof properties.command[1] !== 'undefined' ? properties.command[1] : 'local');
      var limit = (typeof properties.command[2] !== 'undefined' ? '&limit=' + properties.command[2] : '');
      var offset = (typeof properties.command[3] !== 'undefined' ? '&offset=' + properties.command[3] : '');
      // var startdate = (typeof properties.command[1] != 'undefined'?properties.command[1]:(Date.now()-(86400*14)));
      // var enddate = (typeof properties.command[1] != 'undefined'?properties.command[1]:Date.now());
      var params = 'recipientId=' + sourceaddr + limit + offset + '&orderBy=timestamp:desc';
      command = ['/api/transactions?' + params];
      subprocesses.push('func("lisk","link",' + jstr({target, command}) + ')');
      break;
    case 'details':
      var symbol = target.symbol;
      var name = target.name;
      var fee = fee && factor ? functions.padFloat(fee, factor) : null;
      var base = target.symbol.split('.')[0];
      // var mode; already defined
      // var factor; already defined
      var contract = null;
      subprocesses.push("stop(0,{symbol:'" + symbol + "', name:'" + name + "',mode:'" + mode + "',fee:'" + fee + "',contract:'" + contract + "',factor:'" + factor + "','keygen-base':'" + base + "','fee-symbol':'" + base + "'})");
      break;
    case 'sample':
      var address;
      var transaction;
      if (mode === 'ark') {
        address = 'AQYZJ6Mkv4DhnXhrXdxXwNKRKGvgrkhnRF'; transaction = 'f70e8f32e8a16c1dd1a0e97fa4075f96d8e8e16065d1a4406851252832d8e608';
      } else {
        switch (mode.split('.')[1]) {
          case 'lisk' : address = '4405441579391221349L'; transaction = '12391912764023208573'; break;
          case 'rise' : address = '13188395790866768123R'; transaction = '11931543500510473853'; break;
          case 'shift' : address = '16296503595969372386S'; transaction = '6908341461331361507'; break;
        }
      }
      subprocesses.push('stop(0,{address:"' + address + '",transaction:"' + transaction + '"})');
      break;
    default:
      subprocesses.push('stop(1,"Asset function not supported!")');
  }
  // fire the Qrtz-language program into the subprocess queue
  scheduler.fire(processID, subprocesses);
}

// standard function for postprocessing the data of a sequential set of instructions
function post (properties) {
  // decode our serialized properties
  var processID = properties.processID;
  var target = properties.target;
  var postdata = properties.data;
  var factor = (typeof target.factor !== 'undefined' ? target.factor : null);
  // set data to what command we are performing
  global.hybridd.proc[processID].data = properties.command;
  // handle the command
  if (postdata == null) {
    var success = false;
  } else {
    var success = true;
    switch (properties.command[0]) {
      case 'init':
      // set asset fee for Lisk transactions
        if (typeof postdata.fee !== 'undefined' && postdata.fee) {
          global.hybridd.asset[target.symbol].fee = functions.fromInt(postdata.fee, factor);
        }
        break;
      case 'status':
      // nicely cherrypick and reformat status data
        var collage = {};
        collage.module = 'lisk';
        collage.synced = null;
        collage.blocks = null;
        collage.supply = null;
        collage.difficulty = null;
        collage.testmode = 0;

        var rTrim = function (str, charlist) {
          if (charlist === undefined) { charlist = '\s'; }
          return str.replace(new RegExp('[' + charlist + ']+$'), '');
        };

        collage.version = (typeof postdata.liskC.version !== 'undefined' ? String(postdata.liskC.version + ' (build ' + (typeof postdata.liskC.build !== 'undefined' ? rTrim(postdata.liskC.build, '\n') : '?') + ')') : null);

        if (postdata.liskA != null) {
          if (typeof postdata.liskA !== 'undefined') {
            collage.synced = (typeof postdata.liskA.blocks !== 'undefined'	? (postdata.liskA.blocks ? 0 : 1) : null);
            collage.blocks = (typeof postdata.liskA.height !== 'undefined'	? postdata.liskA.height : null);
          // ADD blocktime
          }
          if (typeof postdata.liskB !== 'undefined') {
          // collage.fee = (typeof postdata.liskB.fee != 'undefined'	? postdata.liskB.fee : null);
            collage.supply = (typeof postdata.liskB.supply !== 'undefined'	? postdata.liskB.supply : null);
            collage.difficulty = (typeof postdata.liskB.milestone !== 'undefined' ? postdata.liskB.milestone : null);
          }
        }
        postdata = collage;
        break;
      default:
        success = false;
    }
  }
  // stop and send data to parent
  scheduler.stop(processID, success ? 0 : 1, postdata);
}

// data returned by this connector is stored in a process superglobal -> global.hybridd.process[processID]
function link (properties) {
  var processID = properties.processID;
  var target = properties.target;
  var mode = target.mode;
  var base = target.symbol.split('.')[0]; // in case of token fallback to base asset
  var command = properties.command;
  if (DEBUG) { console.log(' [D] module lisk: sending REST call for [' + target.symbol + '] -> ' + JSON.stringify(command)); }
  // separate path and arguments
  var upath = command.shift();
  var params = command.shift();
  var args = {};
  // do a GET or PUT/POST based on the command input
  var type;
  if (typeof params !== 'undefined') {
    if (typeof params === 'string') { try { params = JSON.parse(params); } catch (e) {} }
    var nethash = (typeof properties.nethash !== 'undefined' ? properties.nethash : '');
    var version;
    // alternative version reporting for other lisk derivatives
    switch (mode.split('.')[1]) {
      case 'rise':
        version = '0.1.2';
        break;
      case 'shift':
        version = '6.6.2';
        break;
      default: // lisk
        version = '0.9.9';
        break;
    }
    if (upath.substr(0, 5) == '/api/') {
      type = 'PUT';
      args = {
        headers: {'Content-Type': 'application/json', 'version': version, 'port': 1, 'nethash': nethash},
        data: JSON.stringify(params),
        path: upath
      };
      // var postresult = restAPI.put(queryurl,args,function(data,response){restaction({processID:processID,data:data});});
    } else {
      type = 'POST';
      args = {
        headers: {'Content-Type': 'application/json', 'version': version, 'port': 1, 'nethash': nethash},
        data: {'transaction': params},
        path: upath
      };
      // DEBUG: console.log(' ##### POST '+queryurl+' '+jstr(args)+' nh:'+nethash);
      // var postresult = restAPI.post(queryurl,args,function(data,response){restaction({processID:processID,data:data});});
    }
  } else {
    type = 'GET';
    args = { path: upath };
  }

  // construct the APIqueue object
  APIqueue.add({ 'method': type,
    'link': 'asset["' + base + '"]', // make sure APIqueue can use initialized API link
    'host': (typeof target.host !== 'undefined' ? target.host : global.hybridd.asset[base].host), // in case of token fallback to base asset hostname
    'args': args,
    'throttle': (typeof target.throttle !== 'undefined' ? target.throttle : global.hybridd.asset[base].throttle), // in case of token fallback to base asset throttle
    'pid': processID,
    'target': target.symbol });
}
