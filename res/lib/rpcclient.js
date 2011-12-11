function invoke(url, method, params, func) {
  if (!url.match(/^https?:\/\//i)) {
    url = geturl(url);
  }

  jQuery.ajax({
    url : url,
    type : 'POST',
    contentType : 'application/json',
    processData : false,
    data : JSON.stringify({method: method, params: params}),
    success : function(json) {
      func(json);
    }
  });
}

function geturl(path) {
  var hostpin = location.href.indexOf('/', 7);
  var host = location.href.substring(0, hostpin);
  
  return host + path;
}

function loadObject(url, callback) {
  if (!url.match(/^https?:\/\//i)) {
    url = geturl(url);
  }

  jQuery.getJSON(
    url + 'list.json',
    function(json) {
      if (json.error) {
        callback(null);
      } else {
        var obj = {};
        if (typeof json.result === 'undefined') {
          callback(null);
        } else {
          for(var i = 0; i < json.result.length; i++) {
            obj[json.result[i]] = new Function('params, callback', 'invoke(\'' + url + '\', \'' + json.result[i] + '\', params, callback)');
          }
          callback(obj);
        }
      }
    }
  );
}