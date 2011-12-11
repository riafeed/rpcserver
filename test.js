var port = process.env.PORT || 3000;

var server = require('./lib/rpcserver.js').createRPCServer();

var test = {
  add : function(success, a, b) {
    success(this._private(a, b));
    //return a + b;
  },
  
  _private : function(a, b) {
    return a + b;
  },
  
  __rpcoption : {
    debug : true,
    async : true
  }
};

server.addObject('/', test);

server.listen(port);