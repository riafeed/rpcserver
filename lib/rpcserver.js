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
//デフォルトのドキュメントルート
var defrespath = './res';

//デフォルトのJSON-RPCオプション
var defoption = {
  allowlist  : true,   //メソッドのリストを取得できるようにするかどうか
  batchlimit : 10,     //バッチリクエスト処理数の制限
  async      : false,  //非同期モードでメソッドを呼び出すかどうか
  timeout    : 10000,  //非同期モードのタイムアウト時間
  debug      : false,  //デバックモードを有効にするかどうか
  header     : null    //RPCレスポンスに付与するヘッダ
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
  //必要モジュールのロード
  var http = require('http');
  var url = require('url');
  var path = require('path');
  var fs = require('fs');

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
        if(fs.statSync(respath + urlpath).isDirectory()) {
          var httpurl = 'http://' + req.headers.host + urlpath + '/';
          res.writeHead(301, {'Location': httpurl});
          res.end();
        } else {
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
            
            res.writeHead(200, {'Content-type': etype});
            res.end(content);
          });
        }
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
          //exports.rpccall(data, obj, res, obj.__rpcoption);
          exports.rpccall(data, obj, null, obj.__rpcoption, '', function(ret) {
            //res.writeHead(200, {'Content-type': 'application/json'});
            res.end(ret);
          });
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


/*
 * 指定したオブジェクトの関数リストをJSON(JSONP)形式で返します
 *
 * obj - 関数のリストを作成するオブジェクト
 * jsonp - JSONP形式にするためのコールバック関数名、空文字、nullや未定義の場合はJSON形式になります
 */
exports.funclist = function(obj, jsonp) {
  var funcs = [];
  var ret = "";

  //JSONP対応
  if(typeof jsonp !== 'undefined' && jsonp !== null && jsonp !== '') {
    //JSONPの検査
    if(jsonp !== jsonp.match(/[a-zA-Z0-9_]+/)[0]){
      jsonp = undefined;
    } else {
      ret = jsonp + '(';
    }
  } else {
    jsonp = undefined;
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

/*
  JSON-RPCリクエストの処理をします。
  別に作ったServerにJSON-RPC機能を追加したい場合に使います。
  このモジュールのcreateRPCServer関数で生成したServerの場合は内部で呼び出しますので
  この関数を直接呼び出す必要はありません。
  
  data - JSON-RPCリクエスト文字列(parseする前のJSON)
  obj - RPCの対象になる関数が定義されているオブジェクト
  res - HTTPResponceオブジェクトを渡すと直接この関数内で結果をブラウザに送ります
  option - 各種オプションを指定したオブジェクト、nullや未定義の場合はデフォルトのオプションが適用されます
  jsonp - JSONP形式で送るためのコールバック関数名、空文字、nullや未定義の場合はJSON形式で送ります
  callback - 処理の終了時に呼び出される関数を指定します、第一引数にブラウザに送るためのJSON(JSONP)データが格納されています
*/
exports.rpccall = function(data, obj, res, option, jsonp, callback) {
  var rpc;
  var rpcdata;
  var timerobj = null;
  var istimeout = false;
  var batch = false;
  var pin = 0;
  var addheader;
  var resmode = true;
  var retstr = "";
  
  var reswrite = function(str) {
    if(resmode) {
      res.write(str);
    }
    retstr += str;
  };
  
  var resend = function() {
    if(resmode) {
      res.end();
    }
  };
  
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
      if(option.async && option.timeout > 0 && pin === 0) timerobj = setTimeout(timeover, option.timeout);
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
        reswrite(',');
        invoke();
      }
    } else {
      terminate();
    }
  };
  
  //終了処理
  var terminate = function() {
    if(timerobj !== null) clearTimeout(timerobj);
    if(batch) reswrite(']');
    if(typeof jsonp !== 'undefined') reswrite(')');
    resend();
    if(typeof callback === 'function') callback(retstr);
  };

  //RPC成功処理
  var success = function(ret) {
    if(typeof rpcdata.id === 'undefined') rpcdata.id = cnt++;
    reswrite(JSON.stringify({jsonrpc: '2.0', result: ret, error: null, id: rpcdata.id}));
    next();
  };
  
  //エラー処理
  var error = function(code, errobj) {
    if(option.debug && typeof errobj !== 'undefined') {
      reswrite(JSON.stringify({jsonrpc: '2.0', error: {code: code, message: errmsg[String(code)], data: errobj}, id: null}));
    } else {
      reswrite(JSON.stringify({jsonrpc: '2.0', error: {code: code, message: errmsg[String(code)]}, id: null}));
    }
    next();
  };
  
  //タイムアウト処理
  var timeover = function() {
    istimeout = true;
    error(-32603, 'Request Timeout');
  };

  if(typeof option === 'undefined' || option === null) {
    option = defoption;
  }
  
  if(typeof res === 'undefined' || res === null) {
    resmode = false;
  }
  
  //レスポンスヘッダ
  if(resmode) {
    if(option.header) {
      addheader = option.header;
    } else {
      addheader = {};
    }
  
    addheader['Content-type'] = 'application/json';
  
    res.writeHead(200, addheader);
  }

  //JSONP対応
  if(typeof jsonp !== 'undefined' && jsonp !== null && jsonp !== '') {
    //JSONPの検査
    if(jsonp !== jsonp.match(/[a-zA-Z0-9_]+/)[0]){
      error(-32600);
      return;
    } else {
      reswrite(jsonp + '(');
    }
  } else {
    jsonp = undefined;
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
    reswrite('[');
    batch = true;
  }

  invoke();
};
