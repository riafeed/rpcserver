var port = process.env.PORT || 3000;

var server = require('./lib/rpc.js').createRPCServer();

var test = {
  add : function(a, b) {
    return a + b;
  },
  
  __rpcoption : {
    debug : true
  }
};

server.addObject('/', test);

server.listen(port);