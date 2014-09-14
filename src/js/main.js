exports.requireNode = require;
exports.processes = {};


/**
 * service to handle ipython server configuration and persistance
 * @return angular service
 */
function init() {

  var _ = require('underscore');

  require('shelljs/global');
  //var shell = require('shelljs');

  var path = require('path');
  var shortId = require('shortid');


  //TODO: can probably define functions as property of parent function and return "this"
  exports.servers = servers;
  exports.getServer = getServer;
  exports.newServer = newServer;
  exports.saveServer = saveServerConf;
  exports.deleteServer = deleteServer;
  exports.reset = resetDefaultConf;
  exports.defaultServerId = defaultServerId;
  exports.autoStart = false;//autoStart;

  exports.start: startServer;
  exports.stop: stopServer;
  exports.isRunning: isRunning;
  exports.cleanUp: cleanUp;
  var runningServers = {};
  exports.runningServers = runningServers;

  exports.runningServer = runningServer;
  function runningServer(id){
    return runningServers[id];
  }


  // --- Init
  var homeDir = process.env[(process.platform == 'win32') ? ' ' : 'HOME'];
  var BASE_CONF_DIR = path.join(homeDir, ".ipython-desktop");
  var SERVER_CONF_DIR = path.join(BASE_CONF_DIR, "servers");

  //create the config path
  mkdir('-p', SERVER_CONF_DIR);

  if (servers() === undefined) {
    resetDefaultConf();
  }

  //TODO - put this also in user conf dir
  if (localStorage.defaultServer === undefined) {
    resetDefaultConf();
  }

  function defaultServerId(value){ 
    if (value !== undefined) {
      localStorage.defaultServer = value;
    }
    return localStorage.defaultServer;
  }

  function autoStart(value) {
      if (value !== undefined) {
        localStorage.autoStart = value;
      } else {
        return JSON.parse(localStorage.autoStart);
      }
  }

  //TODO - use user folder to save config file instead of localstorage
  //TODO: maybe have one file per configuration
  function saveServer(config){
    if (config.ipyProfile) {
      config.ipyProfile = config.ipyProfile.trim();        
    }
    if (config.ipythonOpts) {
      config.ipythonOpts = config.ipythonOpts.trim().split(" ");        
    }
    if (config.isDefault !== undefined) {
      //don't save default server to file
      delete config.isDefault;
    }

    //set the location of the ipython profile configuration for when we want to get the server running info file.
    //avoids having to run the search when we are waiting for the server to start.
    conf.ipythonConfDir = profileConfDir(conf);

    config = _.pick(config, "id", "ipython", "type", "ipyProfile", "ipythonConfDir");
    var confFileName = path.join(SERVER_CONF_DIR, config.id + ".json");
    
    //Save conf as json file
    fs.writeFile(confFileName, JSON.stringify(config, null, 4), function(err) {
        if(err) {
          console.log(err);
        } else {
          console.log("JSON saved to " + confFileName);
        }
    }); 
  }

  //have to use async because of using exec. kinda a pain and pointless.
  function newServer(callback) {
    ipython_bin_loc = detectDefaultIpython();
    defaultConf = {
                    'id': shortId(),
                    'ipython': ipython_bin_loc,
                    'type': 'local',
                    };
    callback(defaultConf);
  }

  function getServer(id) {
    return _.find(getServerConfList(), function(cnf){return cnf.id === id;});
  }

  function deleteServer(id, cb){
    var config = getServer(id);
    var confFileName = path.join(SERVER_CONF_DIR, config.id + ".json");
    rm(confFileName);
  }


  function profileConfDir(conf){
    var cmd_profile = conf.ipython + " profile locate";
    
    if(ipyServer.conf.ipyProfile){
      cmd_profile = cmd_profile + " " + ipyServer.conf.ipyProfile;
    }
    
    result = exec(cmd_profile, {async: false});
    var profile_dir = result.output.trim().replace(/[\r\n]/g, "");
    return profile_dir;

    // child_process.exec(cmd_profile, function(err, stout, sterr) {
    //   if (err !== null) {
    //     console.log('problem locating profile: ' + error);
    //     return; // skip the rest
    //   }

    //   var profile_dir = stout.trim().replace(/[\r\n]/g, "");
    //   callback(profile_dir);
    // }
  }

  //read all server configs from the config directory
  //append them to list.
  function getServerConfList() {
    try {
      var files = fs.readdirSync(SERVER_CONF_DIR);
      var confList = [];
      
      for (var i = files.length - 1; i >= 0; i--) {
        var filename = files[i];

        if (path.extname(filename) === ".json"){
          var data = fs.readFileSync(path.join(SERVER_CONF_DIR,filename));
          var conf = JSON.parse(data);
          if (conf.id == defaultServerId()) {
            conf.isDefault = true;
          }
          confList.push(conf);
        }
      }
      return confList;

    } catch(e) {
      return undefined;
    }
  }

  //Try to figure out the default IPython using "which" - FIXME - NO WINDOWS SUPPORT
  //calls fn handleExecName(path of ipython bin) when found
  function detectDefaultIpython(callback){
    var ipython_bin = which('ipython');

    if (!ipython_bin || ipython_bin === '') {
      ipython_bin = "/usr/bin/ipython";
      console.warn("could not find default ipython");
    }

    return ipython_bin;
  }

  function resetDefaultConf(){
    var ipython_bin_loc = detectDefaultIpython();
    var defaultConf = {
                        'id': 'defaultSrv',
                        'name': 'IPython Default',
                        'ipython': ipython_bin_loc,
                        'type': 'local',
                        };
      saveServerConf(defaultConf);

      //TODO: decide where best to save these. probably together with server settings
      localStorage.defaultServer = 'defaultSrv';
      localStorage.autoStart = false;
  }

  function servers(configList) {
      if (configList !== undefined) {
        _.each(configList, saveServerConf);
      }
      return getServerConfList();
  }



  //start an ipython server with the given id
  function startServer(id, onStartCb, onStopCb) {
    if (id === undefined) {
      id = serverConfig.defaultServerId();

    }
    var cnf = serverConfig.get(id);

    global.serverStatus = "serverStarting";

    if (cnf.type == 'local') {
      //handle ipython command args
      var argList = ['notebook', '--no-browser'];
      
      if (cnf.ipyProfile && cnf.ipyProfile !== ""){
        argList.push("--profile=" + cnf.ipyProfile);
      }

      if (cnf.ipythonOpts) {
        argList = argList.concat(cnf.ipythonOpts);
      }
      var ipython = child_process.spawn(cnf.ipython, argList);
      
      //Note: upgrade this to handle multi server
      
      
      var newRemoteServer = {
        'id': cnf.id,
        'name': cnf.name,
        'process': ipython,
        'conf': cnf,
        'url': null,
        'type': 'local'
      };

      runningServers[cnf.id] = newRemoteServer;
      
      //Below is more UI/connect stuff... maybe better to just return the new process and let ui handle it
      
      //Don't wait for the server to be ready to broadcast that we triggered it to start
      // - that way we can change the UI accordingly straight away
      ipython.stdout.on('data', function (data) {
         log(data.toString());
      });

      //connect to the stderr stream. Use it to know when ipython has actually started.
      ipython.stderr.on('data', function (data) {
        //TODO: could parse some of the messages for start/stop status
        log('stderr: ' + data);

        //The first time we get something from stderror we know the server has started
        //so then try to connect to it.
        //TODO: do this properly with events, with a state tracker that knows how to trigger or not events depends on last received
        // if (global.serverStatus === "serverStarting") {
        //   connect(global.runningServer);
        // }
        onStartCb(newRemoteServer);
      });

      //Broadcast server closed on process terminate
      ipython.on('close', function (code) {
        log('child process exited with code ' + code);

        //TODO: replace with callback
        //global.serverStatus = null;
        //$rootScope.$broadcast("serverStopped", id);
        onStopCb(newRemoteServer)
      });

      return newRemoteServer;
    }
    else if (cnf.type == 'remote') {
      runningServers[cnf.id] = {
        'id': cnf.id,
        'process': null,
        'config': cnf,
        'url': cnf.ipython,
        'type': 'remote'
      };
      onStartCb(runningServers[cnf.id]);
      return runningServers[cnf.id];
    }
  }
  
  //Stop the ipython server with the given internal id.
  function stopServer(id, cb) {
    if (id === undefined) {
      id = serverConfig.defaultServerId();
    }
    global.serverStatus = 'stopping';
    if(runningServers[id] !== null) {        
      if (runningServers[id].process !== undefined && runningServers[id].process.kill !== undefined) {
        runningServers.process.kill();
      }
              
      delete runningServers[id];

      //TODO: correctly handle remote case
      //TODO handle this with callback
      //$rootScope.$broadcast("serverStopping", id);
      log(serverConfig.get(id).id + ' has been shut down');
      cb();
    }
  }

  function isRunning(id) {
    return runningServers[id] === null ? false : true;
  }

  function cleanUp(){
    //TODO: make sync
    for (var id in runningServers) {
      var srv = runningServers[id];
      stopServer(srv);
    }
    runningServers = {};

  }
}


  // function localServers() {
  //   var srv_list = getServerConf();
  //     return _.where(srv_list, {type: 'local'});
  // }

  // function remoteServers() {
  //   var srv_list = getServerConf();
  //     return _.where(srv_list, {type: 'remote'});
  // }