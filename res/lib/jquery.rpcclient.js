/*
 * JSON-RPCを処理するプロキシオブジェクトを作成するjQueryプラグイン
 */
(function($) {
  var errdata = {jsonrpc:'2.0', error:{code:-32600, errmsg:'Invalid Request'}, id:null};
  
  /*
   * JSON-RPCクライアントオブジェクト
   */
  var rpcclient = {
    //JSON-RPCをコールします
    invoke : function(url, method, callback, params) {
      var retdata = null;
      var async = true;
      
      if (!url.match(/^https?:\/\//i)) {
        url = rpcclient.getURL(url);
      }
      
      if(typeof callback !== 'function') async = false;
      
      jQuery.ajax({
        url : url,
        type : 'POST',
        contentType : 'application/json',
        processData : false,
        data : JSON.stringify({method: method, params: params}),
        async : async,
        success : function(data) {
          if(typeof data === 'string') {
            try {
              data = JSON.parse(data);
            } catch(e) {
              data = errdata;
            }
          }
          if (async) {
            callback(data);
          } else {
            retdata = data;
          }
        },
        error : function() {
          if (async) {
            callback(errdata);
          } else {
            retdata = errdata;
          }
        }
      });
    
      return retdata;
    },

    //argumentオブジェクトを使ってJSON-RPCをコールします
    invokeArg : function(url, method, args) {
      var params = [];
      var callback = null;
      params.push.apply(params, args);
      if(typeof params[0] === 'function') {
        callback = params[0];
        params.shift();
      }
      return rpcclient.invoke(url, method, callback, params);
    },

    //現在のホストからフルURLを生成します
    getURL : function(path) {
      var hostpin = location.href.indexOf('/', 7);
      var host = location.href.substring(0, hostpin);
      
      return host + path;
    },

    //サーバーから取得した関数リストを基にプロキシオブジェクトを生成します
    loadObject : function(url, callback) {
      var retdata = null;
      var async = true;
      var self = this;

      if (!url.match(/^https?:\/\//i)) {
        url = rpcclient.getURL(url);
      }
      
      if(typeof callback !== 'function') async = false;
    
      jQuery.ajax({
        url : url + 'list.json',
        type : 'GET',
        contentType : 'application/json',
        async : async,
        success : function(json) {
          if (json.error) {
            retdata = null;
          } else {
            var obj = {};
            if (typeof json.result === 'undefined') {
              retdata = null;
            } else {
              obj._invoke = self.invoke;
              obj._invokeArg = self.invokeArg;
              for(var i = 0; i < json.result.length; i++) {
                obj[json.result[i]] = new Function('callback', 'return this._invokeArg("' + url + '", "' + json.result[i] + '", arguments);');
              }
              retdata = obj;
            }
          }
          if(async) callback(retdata);
        },
        error : function() {
          retdata = null;
          if(async) callback(null);
        }
      });
      
      return retdata;
    }
  };
  
  //JSON-RPCクライアントオブジェクトを取得します
  $.getRPCClient = function() {
    return rpcclient;
  };
})(jQuery);