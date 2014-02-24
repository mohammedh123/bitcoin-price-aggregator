
/**
 * Module dependencies.
 */
 
// app-specific stuff
// objects will have:
// 	a. timestamp
//	b. quantity (divide by 1e8)
//	c. price (divide by 1e8)
//	d. exchange name
//	e. id
var mostRecentTrades = [];

var express = require('express');
var routes = require('./routes');
var user = require('./routes/user');
var http = require('http');
var path = require('path');
var io = require('socket.io-client');

var app = express();

// all environments
app.set('port', process.env.PORT || 3000);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.json());
app.use(express.urlencoded());
app.use(express.methodOverride());
app.use(express.cookieParser('your secret here'));
app.use(express.session());
app.use(app.router);
app.use(require('stylus').middleware(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'public')));

// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

app.get('/', routes.index);
app.get('/TradeData', function(req, res){
	var tradeData = {};
	res.json(tradeData);
app.get('/TradeData', function(req, res){	
	res.json(mostRecentTrades);
});

var server = http.createServer(app);
server.listen(app.get('port'), function(){
	console.log('Express server listening on port ' + app.get('port'));

	// MtGox trade population
	var socket = io.connect('socketio.mtgox.com/mtgox?Currency=USD');
	socket.on('connect', function() {
		console.log("Connected to MtGox websocket.");
		var msg = {};
		msg.op = "mtgox.subscribe";
		msg.type = "trades";
		socket.send(msg);
	});
	socket.on('message', function(data) {		
		if(data.op == "private" && data.private == "trade") {
			var newTrade = {};
			
			newTrade.timestamp = data.trade.tid;
			newTrade.price_int = data.trade.price_int;
			newTrade.quantity_int = data.trade.amount_int;
			newTrade.exchange = "mtgox";
			
			mostRecentTrades.push(newTrade);
		}
	});
	socket.on('disconnect', function() {
		console.log("Disconnected from MtGox websocket.");
	});
});
