
/**
 * Module dependencies.
 */
 
// app-specific stuff
// objects will have:
// 	a. timestamp (divide by 1e6)
//	b. quantity (divide by 1e8)
//	c. price (divide by 1e8)
//	d. exchange name
//	e. id
var mostRecentTrades = {};

var express = require('express');
var routes = require('./routes');
var http = require('http');
var path = require('path');
var util = require('util');
var io = require('socket.io-client');
var _ = require('underscore')._; // dear god

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

app.locals.convertTimestampToDate = function(timestamp) {
//http://stackoverflow.com/questions/847185/convert-a-unix-timestamp-to-time-in-javascript
	var date = new Date(parseInt(timestamp/1000));
	// hours part from the timestamp
	var hours = date.getHours();
	// minutes part from the timestamp
	var minutes = date.getMinutes();
	// seconds part from the timestamp
	var seconds = date.getSeconds();

	// will display time in 10:30:23 format
	var formattedTime = hours + ':' + minutes + ':' + seconds;
	
	return formattedTime;
};

// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

function GetMostRecentTrades(limit)
{
	return _.chain(mostRecentTrades)
	.values()
	.sortBy(function(obj) {
		return -1*obj.timestamp; //descending order of timestamp
	}).value().slice(0,limit);
}

// maybe use a js object instead
function AddTrade(timestamp, price, quantity, exchange, id)
{
	var newTrade = {};
	
	newTrade.timestamp = parseInt(timestamp, 10);
	newTrade.price = parseInt(price, 10);
	newTrade.quantity = parseInt(quantity, 10);
	newTrade.exchange = exchange;
	newTrade.id = parseInt(id, 10);
	
	mostRecentTrades[newTrade.id] = newTrade;
}

function UpdateTrades() {	
	//Bitstamp trade population
	util.log("Updating trades from Bitstamp...");
	
	 //only get the last minute worth of transactions
	var btOptions = {
		host: 'www.bitstamp.net',
		port: 80,
		path: '/api/transactions/?time=minute'
	};
	
	http.get(btOptions, function(res) {
		if(res.statusCode == 200) {
			var body = '';
			res.on('data', function(chunk) {
				body += chunk;
			});
			res.on('end', function() {			
				var trades = JSON.parse(body);
				for(var i = 0; i < trades.length; ++i) {
					// we now have the trade info in a json object, add it to the list
					var currTrade = trades[i];
					
					AddTrade(currTrade.date*1000000, currTrade.price*100000000, currTrade.amount*100000000, "Bitstamp", currTrade.tid);
				}
			});
		}
	}).on('error', function(e) {
		util.log("Got error: " + e.message);
	});
}

// periodically update the internal trade list (for Bitstamp)
setInterval(UpdateTrades, 60000);

app.get('/', function(req, res) {
  res.render('index', { title: 'Bitcoin Price Aggregator', trades: GetMostRecentTrades(10) });
});

// GET /TradeData[?RecentNum=N]
app.get('/TradeData', function(req, res){	
	var limit = req.query.RecentNum || -1;
	
	if(limit <= 0) {
		res.json(mostRecentTrades);
	}
	else {
		res.json(GetMostRecentTrades(limit));
	}
});

var server = http.createServer(app);
server.listen(app.get('port'), function(){
	util.log('Express server listening on port ' + app.get('port'));

	// MtGox trade population
	var socket = io.connect('socketio.mtgox.com/mtgox?Currency=USD');
	socket.on('connect', function() {
		util.log("Connected to MtGox websocket.");
		var msg = {};
		msg.op = "mtgox.subscribe";
		msg.type = "trades";
		socket.send(msg);
	});
	socket.on('message', function(data) {		
		if(data.op == "private" && data.private == "trade") {
			AddTrade(data.trade.tid, data.trade.price_int*1000, data.trade.amount_int, "MtGox", data.trade.tid);
		}
	});
	socket.on('disconnect', function() {
		util.log("Disconnected from MtGox websocket.");
		util.log("Attempting to reconnect to MtGox websocket...");
		socket.socket.reconnect();
	});
});
