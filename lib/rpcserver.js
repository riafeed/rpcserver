var http = require('http');
var url = require('url');
var path = require('path');
var fs = require('fs');

var defrespath = './res';

var defoption = {
  allowlist : true,
  batchlimit : 10,
  async: false,
  timeout: 10000,
  debug: false
};

var mime = {
  'html' : 'text/html',
  'js' : 'application/javascript',
  'json' : 'application/json',
  'gif' : 'image/gif',
  'png' : 'image/png',
  'jpeg' : 'image/jpeg',
  'jpg' : 'image/jpeg',
  'ogg' : 'application/ogg',
  'mp3' : 'audio/mpeg'
};

var errmsg = {
  '-32600' : 'Invalid Request',
  '-32601' : 'Method not found',
  '-32602' : 'Invalid params',
  '-32603' : 'Internal error',
  '-32700' : 'Parser error'
};

var rpcobj = {};

var cnt = 0;

exports.createRPCServer = function(respath, globaloption) {
  if(typeof respath === 'undefined') {
    respath = defrespath;
  }
  
  if(typeof globaloption === 'undefined') {
    globaloption = defoption;
  }
  
  
  var server = http.createServer(function (req, res) {
    var urlpath = url.parse(req.url).pathname;
    if (req.method === 'GET') {
      if (urlpath.indexOf('..', 0) !== -1) {
        res.writeHead(400, {'Content-Type': 'text/plain'});
        res.end('Bad Request\n');
        return;
      }
      
      if (urlpath.charAt(urlpath.length - 1) === '/') {
        urlpath = urlpath + 'index.html';
      }
      
      if (path.existsSync(respath + urlpath)) {
        fs.readFile(respath + urlpath, function (err, content) {
          var suffix;
          
          var pin = urlpath.lastIndexOf('.');
          if (pin !== -1) {
            suffix = urlpath.substring(pin + 1);
          } 

          var etype = mime[suffix];
          if(typeof etype === 'undefined') {
            etype = 'application/octet-stream';
          }
          
          res.writeHead(200, {"Content-type": etype});
          res.end(content);
        });
      } else {
        var exp = (/(.*\/)list\.json$/.exec(urlpath) || [])[1] || ''; 
        if(exp !== '') {
          if(typeof rpcobj[exp] !== 'undefined' && rpcobj[exp].__rpcoption.allowlist) {
            var funcs = [];
            var obj = rpcobj[exp];
            for(var prop in obj) {
              if(typeof obj[prop] === 'function' && prop.indexOf('_') !== 0) {
                funcs.push(prop);
              }
            }
            res.writeHead(200, {'Content-type': 'application/json'});
            //if(typeof jsonp !== 'undefined') res.write(data.query['callback'] + '(');
            res.write(JSON.stringify({jsonrpc: '2.0', result: funcs, error: null, id: null}));
            //if(typeof jsonp !== 'undefined') res.write(')');
            res.end();
            return;
          }
        }
        res.writeHead(404, {'Content-Type': 'text/plain'});
        res.end('Not Found\n');
        return;
      }
    } else {
      if(typeof rpcobj[urlpath] === 'undefined') {
        res.writeHead(404, {'Content-Type': 'text/plain'});
        res.end('Not Found\n');
        return;
      }

      var data = '';
      req.on('data', function(d) {
        data += d;
      });
      req.on('end', function() {
        var obj = rpcobj[urlpath];
        callback(data, obj, req, res, obj.__rpcoption);
      });
    }
  });


  var callback = function(data, obj, req, res, option, jsonp) {
    var rpc;
    var rpcdata;
    var timerobj = null;
    var istimeout = false;
    var batch = false;
    var pin = 0;
    
    var invoke = function() {
      if(batch) {
        rpcdata = rpc[pin];
      } else {
        rpcdata = rpc;
      }

      if(typeof rpcdata.method === 'undefined') {
        error(-32600);
        return;
      }
      if(typeof obj[rpcdata.method] !== 'function') {
        error(-32601);
        return;
      }
      if(typeof rpcdata.params === 'undefined') {
        rpcdata.params = [];
      }

      var ret;

      try {
        if(option.async) rpcdata.params.unshift(success);
        if(option.async && option.timeout > 0) timerobj = setTimeout(timeover, option.timeout);
        ret = obj[rpcdata.method].apply(obj, rpcdata.params);
        if(!option.async) success(ret);
      } catch(e) {
        error(-32603, e);
      }
    };
    
    var next = function() {
      if(batch) {  
        pin++;
        if(rpc.length == pin || istimeout) {
          terminate();
        } else {
          res.write(",");
          invoke();
        }
      } else {
        terminate();
      }
    };
    
    var terminate = function() {
      if(batch) res.write(']');
      if(typeof jsonp !== 'undefined') res.write(')');
      res.end();
    };

    var success = function(ret) {
      if(timerobj !== null) clearTimeout(timerobj);
      if(typeof rpcdata.id === 'undefined') rpcdata.id = cnt++;
      res.write(JSON.stringify({jsonrpc: '2.0', result: ret, error: null, id: rpcdata.id}));
      next();
    };
    
    var error = function(code, errobj) {
      if(option.debug && typeof errobj !== 'undefined') {
        res.write(JSON.stringify({jsonrpc: '2.0', error: {code: code, message: errmsg[String(code)], data: errobj}, id: null}));
      } else {
        res.write(JSON.stringify({jsonrpc: '2.0', error: {code: code, message: errmsg[String(code)]}, id: null}));
      }
      next();
    };
    
    var timeover = function() {
      istimeout = true;
      error(-32603, 'Request Timeout');
    };

    res.writeHead(200, {'Content-type': 'application/json'});
    if(typeof jsonp !== 'undefined') res.write(jsonp + '(');

    try {
      rpc = JSON.parse(data);
    } catch(e) {
      error(-32700);
      return;
    }

    if(rpc instanceof Array) {
      if(option.batchlimit < 2 || rpc.length > option.batchlimit) {
        error(-32600, 'Request limit was exceeded');
        return;
      }
      res.write('[');
      batch = true;
    }

    invoke();
  };

  server.rpcoption = globaloption;

  server.addObject = function(path, obj) {
    var funcs = [];

    for(var prop in obj) {
      if(typeof obj[prop] === 'function' && prop.indexOf('_') !== 0) {
        funcs.push(prop);
      }
    }
    
    if(funcs.length <= 0) return;
    
    if(typeof obj.__rpcoption !== 'undefined') {
      for(var opt in this.rpcoption) {
        if(typeof obj.__rpcoption[opt] === 'undefined') {
          obj.__rpcoption[opt] = server.rpcoption[opt];
        }
      }
    } else {
      obj.__rpcoption = server.rpcoption;
    }
    
    rpcobj[path] = obj;
  };

  return server;
};