function invoke(url, method, params, func) {
  $.ajax({
    url : url,
    type : 'POST',
    contentType : 'application/json',
    processData : false,
    data : JSON.stringify({method: method, params: params}),
    success : function(json){
      func(json);
    }
  });
}

function geturl(path) {
  var hostpin = location.href.indexOf('/', 7);
  var host = location.href.substring(0, hostpin);
  
  return host + path;
}