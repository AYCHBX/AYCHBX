// proc.js -> handle proc calls
//
// (c)2016 metasync r&d / internet of coins project - Amadeus de Koning / Joachim de Koning
//

// export every function
exports.process = process;
exports.cacheAdd = cacheAdd;
exports.cacheGet = cacheGet;

// functions start here

function process(request,xpath) {
  var result = null;
  // DEBUG console.log(' [i] returning proc on request '+JSON.stringify(xpath));
  if (xpath.length === 1) {
    result = proclist(request.sessionID);
  } else if (xpath[1]==="peek" && request.sessionID===1) { // only root
    if (xpath.length===3) {
      result = procdata(xpath[2],request.sessionID,true);
    }
  } else if (xpath[1]==="queue" && request.sessionID===1) { // only root
    if (xpath.length===3) {
      if (typeof global.hybridd.procqueue[xpath[2]] !== "undefined") {
        result = {error:0, id:"proc/queue", info:"Queue item.", data:global.hybridd.procqueue[xpath[2]]};
      } else {
        result = {error:1, id:"proc/queue", info:"The queue item specified does not exist!"};
      }
    } else {
      result = queuelist();
    }
  } else if (xpath[1]==="kill") {
    result = procKill(xpath[2],request.sessionID)
  } else if (xpath[1]==="pause") {
    if(xpath.length==3){
      result = procPause(xpath[2],request.sessionID)
    }else{
      result = procListPaused(request.sessionID)
    }
  } else if (xpath[1]==="resume") {
    result = procResume(xpath[2],request.sessionID)
  } else {
    result = procdata(xpath[1],request.sessionID);
  }
  return result;
}

// proc specific functions start here
function queuelist() {
  var qcnt = 0;
  var queue = [];
  for (var key in global.hybridd.procqueue) {
    queue[qcnt] = key;
    qcnt++;
  }
  return {error:0, id:"proc/queue", info:"List of queue items.", count:qcnt, data:queue};
}

function proclist(sessionID) {
  var proccnt = 0;
  var sproccnt = 0;
  var procs = [];
  for (var key in global.hybridd.proc) {
    if(key.indexOf(".",15)===-1) {
      if(sessionID===1 || sessionID===global.hybridd.proc[key].sid) {
        procs[proccnt] = key;
        proccnt++;
      }
    } else if(sessionID===1 || sessionID===global.hybridd.proc[key.split(".")[0]].sid) {
      sproccnt++;
    }
  }
  return {error:0, id:"proc", info:"List of processes.", count:proccnt, subprocesses: sproccnt, data:procs};
}

function procdata(processID,sessionID,peek) {
  if(typeof global.hybridd.proc[processID] !== "undefined" && (sessionID===1 || sessionID===global.hybridd.proc[processID.split(".")[0]].sid)) {
    if(peek) {
      var result = global.hybridd.proc[processID];
    } else {
      var err = global.hybridd.proc[processID].err;
      var info = (typeof global.hybridd.proc[processID].info != "undefined"?global.hybridd.proc[processID].info:"Process data.");
      var result = {error:(err?err:0), info:info, id:processID, progress:global.hybridd.proc[processID].progress, started:global.hybridd.proc[processID].started, stopped:global.hybridd.proc[processID].stopped, data:global.hybridd.proc[processID].data};
    }
  } else {
    var result = {error:1, id:"proc"+(peek?"/peek":""), info:"The process specified cannot be accessed!"};
  }
  return result;
}

function procKill(processID,sessionID) {
  if(typeof global.hybridd.proc[processID] !== "undefined" && (sessionID===1 || sessionID===global.hybridd.proc[processID.split(".")[0]].sid)) {

    // Kill running processes
    for(var pid in global.hybridd.proc ){
      if(pid.startsWith(processID)){
        delete global.hybridd.proc[pid];
      }
    }
    // Kill paused processes
    for(var pid in global.hybridd.procPaused ){
      if(pid.startsWith(processID)){
        delete global.hybridd.proc[pid];
      }
    }

    return {error:0, id:"proc/kill", info:"The process and child processes have been been terminated."};
  } else {
    return {error:1, id:"proc/kill", info:"The process specified cannot be accessed."};
  }
}

function procPause(processID,sessionID) {
  if(typeof global.hybridd.proc[processID] !== "undefined" && (sessionID===1 || sessionID===global.hybridd.proc[processID.split(".")[0]].sid)) {

    for(var pid in global.hybridd.proc ){
      if(pid.startsWith(processID)){
        global.hybridd.procPaused[pid] = global.hybridd.proc[pid];
        delete global.hybridd.proc[pid];
      }
    }
    return {error:0, id:"proc/pause", info:"The process and child processes have been been paused."};
  } else {
    return {error:1, id:"proc/pause", info:"The process specified cannot be accessed."};
  }
}

function procResume(processID,sessionID) {
  if(typeof global.hybridd.procPaused[processID] !== "undefined" && (sessionID===1 || sessionID===global.hybridd.procPaused[processID.split(".")[0]].sid)) {

    for(var pid in global.hybridd.proc ){
      if(pid.startsWith(processID)){
        global.hybridd.proc[pid] = global.hybridd.procPaused[pid];
        delete global.hybridd.procPaused[pid];
      }
    }
    return {error:0, id:"proc/resume", info:"The process and child processes have been been resumed."};
  } else {
    return {error:1, id:"proc/resume", info:"The paused process specified cannot be accessed."};
  }
}

function procListPaused(sessionID) {
  var proccnt = 0;
  var sproccnt = 0;
  var procs = [];
  for (var key in global.hybridd.procPaused) {
    if(key.indexOf(".",15)===-1) {
      if(sessionID===1 || sessionID===global.hybridd.proc[key].sid) {
        procs[proccnt] = key;
        proccnt++;
      }
    } else if(sessionID===1 || sessionID===global.hybridd.proc[key.split(".")[0]].sid) {
      sproccnt++;
    }
  }
  return {error:0, id:"proc", info:"List of paused processes.", count:proccnt, subprocesses: sproccnt, data:procs};
}

function cacheAdd(index,data) {
  global.hybridd.cached[index] = [Date.now(),data];
}

function cacheDel(index,data) {
  delete global.hybridd.cached[index];
}

function cacheGet(index,millisecs) {
  if(millisecs<100) { millisecs=100; }
  if(typeof global.hybridd.cached[index]!="undefined" && typeof global.hybridd.cached[index][0]!="undefined") {
    if(global.hybridd.cached[index][0]>Date.now()-millisecs) {
      if(DEBUG) { console.log(" [D] cache hit for index: "+index); }
      return global.hybridd.cached[index][1];
    }
    delete global.hybridd.cached[index];
    return null;
  }
  return null;
}