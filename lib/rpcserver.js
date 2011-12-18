/*
 * 簡易HTTPサーバー付きJSON-RPCサーバー
 *
 * 簡易HTTPサーバーを兼ねたJSON-RPCサーバーです。
 * GETリクエストではHTTPサーバーとして、
 * POSTリクエストではJSON-RPCサーバーとして機能します
 *
 * ただし、GETリクエストでlist.jsonファイルを要求した場合は
 * URLに対応するオブジェクトのメソッドリストをJSONRPC形式で返します。
 * allowlistをfalseにするか、ダミーのlist.jsonを設置することで
 * この動作を抑制することができます。
 */

//必要モジュールのロード
var http = require('http');
var url = require('url');
var path = require('path');
var fs = require('fs');

//デフォルトのドキュメントルート
var defrespath = './res';

//デフォルトのJSON-RPCオプション
var defoption = {
  allowlist  : true,
  batchlimit : 10,
  async      : false,
  timeout    : 10000,
  debug      : false
};

//MIMEタイプ
var mime = {
  'html' : 'text/html',
  'js'   : 'application/javascript',
  'json' : 'application/json',
  'gif'  : 'image/gif',
  'png'  : 'image/png',
  'jpeg' : 'image/jpeg',
  'jpg'  : 'image/jpeg',
  'ogg'  : 'application/ogg',
  'mp3'  : 'audio/mpeg'
};

//JSON-RPCエラーメッセージ
var errmsg = {
  '-32600' : 'Invalid Request',
  '-32601' : 'Method not found',
  '-32602' : 'Invalid params',
  '-32603' : 'Internal error',
  '-32700' : 'Parser error'
};

//レスポンス用カウンタ
var cnt = 0;

/*
 * サーバーオブジェクトを取得します
 *
 *  respath - HTTPサーバーのドキュメントルートを指定します。指定しない場合はカレントディレクトリ内のresディレクトリがルートになります
 *  globaloption - RPCオブジェクトでオプションを指定しなかった場合に適用されるグローバルオプションを指定します。指定しない場合はライブラリデフォルトのオプションになります
 */
exports.createRPCServer = function(respath, globaloption) {

  if(typeof respath === 'undefined') {
    respath = defrespath;
  }
  
  if(typeof globaloption === 'undefined') {
    globaloption = defoption;
  }
  
  //サーバーオブジェクトの作成
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
          if(typeof server.rpcobj[exp] !== 'undefined' && server.rpcobj[exp].__rpcoption.allowlist) {
            res.writeHead(200, {'Content-type': 'application/json'});
            res.write(server.rpcobj[exp].__funclist);
            res.end();
            return;
          }
        } else {
          res.writeHead(404, {'Content-Type': 'text/plain'});
          res.end('Not Found\n');
        }
      }
    } else {
      if(typeof server.rpcobj[urlpath] === 'undefined') {
        res.writeHead(404, {'Content-Type': 'text/plain'});
        res.end('Not Found\n');
        return;
      } else {
        var data = '';
        req.on('data', function(d) {
          data += d;
        });
        req.on('end', function() {
          var obj = server.rpcobj[urlpath];
          exports.rpccall(data, obj, req, res, obj.__rpcoption);
        });
      }
    }
  });

  server.rpcoption = globaloption;
  
  server.rpcobj = {};
  
  server.mimetype = mime;

  /*
   * RPCオブジェクトを追加します。
   *
   *  path - オブジェクトを割り当てるURLのパスを指定します。
   *  obj - RPCで呼び出すメソッドを定義したオブジェクトを指定します。
   */
  server.addObject = function(path, obj) {
    if(typeof path !== 'string' || typeof obj !== 'object') return;
    
    var funcs = exports.funclist(obj);
    
    if(funcs === "") return;
    
    obj.__funclist = funcs;
    
    if(typeof obj.__rpcoption !== 'undefined') {
      for(var opt in this.rpcoption) {
        if(typeof obj.__rpcoption[opt] === 'undefined') {
          obj.__rpcoption[opt] = server.rpcoption[opt];
        }
      }
    } else {
      obj.__rpcoption = server.rpcoption;
    }
    
    server.rpcobj[path] = obj;
  };

  return server;
};

exports.funclist = function(obj, jsonp) {
  var funcs = [];
  var ret = "";

  //JSONP対応
  if(typeof jsonp !== 'undefined') {
    //JSONPの検査
    if(jsonp !== jsonp.match(/[a-zA-Z0-9_]+/)[0]){
      jsonp = undefined;
    } else {
      ret = jsonp + '(';
    }
  }

  for(var prop in obj) {
    if(typeof obj[prop] === 'function' && prop.indexOf('_') !== 0) {
      funcs.push(prop);
    }
  }
  
   if(funcs.length <= 0) return "";

  ret += JSON.stringify({jsonrpc: '2.0', result: funcs, error: null, id: null});

  if(typeof jsonp !== 'undefined') ret += ')';

  return ret;
};

//JSON-RPCリクエストの処理
exports.rpccall = function(data, obj, req, res, option, jsonp) {
  var rpc;
  var rpcdata;
  var timerobj = null;
  var istimeout = false;
  var batch = false;
  var pin = 0;
  
  //メソッドのコール
  var invoke = function() {
    if(batch) {
      rpcdata = rpc[pin];
    } else {
      rpcdata = rpc;
    }

    if(typeof rpcdata.method === 'undefined' || rpcdata.method.indexOf('_') === 0) {
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
  
  //バッチリクエスト継続処理
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
  
  //終了処理
  var terminate = function() {
    if(batch) res.write(']');
    if(typeof jsonp !== 'undefined') res.write(')');
    res.end();
  };

  //RPC成功処理
  var success = function(ret) {
    if(timerobj !== null) clearTimeout(timerobj);
    if(typeof rpcdata.id === 'undefined') rpcdata.id = cnt++;
    res.write(JSON.stringify({jsonrpc: '2.0', result: ret, error: null, id: rpcdata.id}));
    next();
  };
  
  //エラー処理
  var error = function(code, errobj) {
    if(option.debug && typeof errobj !== 'undefined') {
      res.write(JSON.stringify({jsonrpc: '2.0', error: {code: code, message: errmsg[String(code)], data: errobj}, id: null}));
    } else {
      res.write(JSON.stringify({jsonrpc: '2.0', error: {code: code, message: errmsg[String(code)]}, id: null}));
    }
    next();
  };
  
  //タイムアウト処理
  var timeover = function() {
    istimeout = true;
    error(-32603, 'Request Timeout');
  };


  //レスポンスヘッダ
  res.writeHead(200, {'Content-type': 'application/json'});

  //JSONP対応
  if(typeof jsonp !== 'undefined') {
    //JSONPの検査
    if(jsonp !== jsonp.match(/[a-zA-Z0-9_]+/)[0]){
      error(-32600);
      return;
    } else {
      res.write(jsonp + '(');
    }
  }

  //JSONのパース
  try {
    rpc = JSON.parse(data);
  } catch(e) {
    error(-32700);
    return;
  }

  //バッチリクエストの処理
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
