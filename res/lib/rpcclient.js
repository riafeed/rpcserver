function getRPCClient() {
  var rpcclient = {
    invoke : function(url, method, callback, params) {
      if (!url.match(/^https?:\/\//i)) {
        url = this.geturl(url);
      }
      
      var retdata = null;
      var async = true;
      if(typeof callback !== 'function') async = false;
      
      jQuery.ajax({
        url : url,
        type : 'POST',
        contentType : 'application/json',
        processData : false,
        data : JSON.stringify({method: method, params: params}),
        async : async,
        success : function(data) {
          if (async) {
            callback(data);
          } else {
            retdata = data;
          }
        }
      });
    
      return retdata;
    },

    invokearg : function(url, method, args) {
      var params = [];
      var callback = null;
      params.push.apply(params, args);
      if(typeof params[0] === 'function') {
        callback = params[0];
        params.shift();
      }
      return this._invoke(url, method, callback, params);
    },

    geturl : function(path) {
      var hostpin = location.href.indexOf('/', 7);
      var host = location.href.substring(0, hostpin);
      
      return host + path;
    },

    loadObject : function(url, callback) {
      if (!url.match(/^https?:\/\//i)) {
        url = this.geturl(url);
      }
      
      var retdata = null;
      var async = true;
      var self = this;
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
              obj._invokearg = self.invokearg;
              for(var i = 0; i < json.result.length; i++) {
                obj[json.result[i]] = new Function('callback', 'return this._invokearg("' + url + '", "' + json.result[i] + '", arguments);');
              }
              retdata = obj;
            }
          }
          if(async) callback(retdata);
        }
      });
      
      return retdata;
    }
  };
  
  return rpcclient;
}