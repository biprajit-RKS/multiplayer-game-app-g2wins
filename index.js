var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var httpPort = 1000, httpsPort = 1001;

var VNServer = require('./lib/networking/server.js').VNServer;
var GameHost = require('./lib/networking/gamehost.js').GameHost;

var server = new VNServer();
new GameHost(server);

//Set up server messages
var handler = function (socket) {
    server.onClientConnect(socket);
    socket.on('disconnect', function () {
        server.onClientDisconnect(socket);
    });
    socket.on(server.MESSAGE_TAG, function (data) {
        server.onClientMessage(socket, data);
    });
    socket.on(server.PING_TAG, function (data) {
        server.onClientPing(socket, data);
    });
    socket.on(server.PING_REPLY_TAG, function (data) {
        server.onClientPingReply(socket, data);
    });
};

io.on('connection', handler);

//Start listening
http.listen(httpPort, function () {
    console.log('listening http on *: ' + httpPort);
});

try {
    var sslPath = '/etc/letsencrypt/live/bestgamesfreeplay.com/';
    var fs = require('fs');
    privateKey = fs.readFileSync(sslPath + 'privkey.pem');
    certificate = fs.readFileSync(sslPath + 'fullchain.pem');
    var credentials = {
        key: privateKey,
        cert: certificate
    };
    var https = require('https').Server(credentials, app);
    var io_https = require('socket.io')(https);
    io_https.on('connection', handler);
    https.listen(httpsPort, function () {
        console.log('listening https on *: ', httpsPort);
    });
} catch (err) {
    console.log('HTTPS certificates not found');
}