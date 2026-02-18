ig.module("networking.client")
    .requires()
    .defines(function () {
        ig.NetworkClient = ig.Class.extend({
            //Make sure the message tags match the ones set in server.js
            MESSAGE_TAG: "bgfp_msg",
            PING_TAG: "bgfp_ping",
            PING_REPLY_TAG: "bgfp_ping_reply",

            // server_ip: "bestgamesfreeplay.com",
            // server_ip: "localhost",
            server_ip: "https://multiplayer-app.game2wins.com",
            socket: null,
            portHTTP: '1000',
            portHTTPS: '1001',

            round_trip_time: 0,
            time_diff: 0,
            last_ping_time: 0,
            latency_average: 0,
            latency_log: [],
            latency_log_size: 10,

            onServerConnectHandlers: [],
            onServerDisconnectHandlers: [],
            onServerMessageHandlers: [],
            onServerPingHandlers: [],
            onServerPingReplyHandlers: [],

            getServerTime: function () {
                var time = Date.now() - this.time_diff;
                return time;
            },

            connect: function (successFunc, failFunc) {
                var connecting = false;

                this.latency_log = [];
                this.latency_average = 0;
                this.round_trip_time = 0;
                this.time_diff = 0;
                this.last_ping_time = 0;
                this.last_pong_time = 0;

                if (!this.socket) {
                    if (typeof (this.server_ip) == 'undefined' || !this.server_ip) {
                        if (typeof (SERVER_IP) == 'undefined' || !SERVER_IP) {
                            this.server_ip = 'localhost';
                        } else {
                            this.server_ip = SERVER_IP;
                        }
                    }
                    
                    // Check if server_ip already contains full URL (http:// or https://)
                    var serverUrl = this.server_ip;
                    if (!serverUrl.includes('http://') && !serverUrl.includes('https://')) {
                        // Only append port if it's not a full URL
                        var port = this.portHTTP;
                        if (document.location.protocol &&
                            typeof (document.location.protocol.includes) == 'function' &&
                            document.location.protocol.includes("https")) {
                            port = this.portHTTPS;
                        }
                        serverUrl += ":" + port;
                    }

                    // console.log('using port ' + port);
                    // console.log('connecting to ' + serverUrl);

                    this.socket = io(serverUrl, {
                        withCredentials: false
                    });
                    if (this.socket) {
                        connecting = true;
                    }
                } else {
                    if (this.socket.disconnected) {
                        this.socket.connect();
                        connecting = true;
                    }
                }
                if (connecting) {
                    this.socket.off();
                    this.socket.on('connect', function () {
                        // console.log('connected');
                        this.onServerConnect();

                        this.socket.off('disconnect');
                        this.socket.on('disconnect', function () {
                            // console.log('disconnected');
                            this.onServerDisconnect();
                        }.bind(this));

                        this.socket.off(this.MESSAGE_TAG);
                        this.socket.on(this.MESSAGE_TAG, function (data) {
                            this.onServerMessage(data);
                        }.bind(this));

                        this.socket.off(this.PING_TAG);
                        this.socket.on(this.PING_TAG, function (data) {
                            this.onServerPing(data);
                        }.bind(this));

                        this.socket.off(this.PING_REPLY_TAG);
                        this.socket.on(this.PING_REPLY_TAG, function (data) {
                            this.onServerPingReply(data);
                        }.bind(this));

                        if (typeof (successFunc) == 'function') {
                            successFunc();
                            // console.log('connect to server successfully!');
                        }
                    }.bind(this));
                    this.socket.on('connect_error', function () {
                        if (typeof (failFunc) == 'function') failFunc();
                        // console.log("connection to server failed");
                    }.bind(this));
                }
            },

            disconnect: function (successFunc, failFunc) {
                if (this.socket) {
                    if (!this.socket.disconnected) {
                        this.socket.once('disconnect', function () {
                            if (typeof (successFunc) == 'function') successFunc();
                        }.bind(this));
                        this.socket.disconnect();
                        return true;
                    }
                }
                if (typeof (failFunc) == 'function') failFunc();
                return false;
            },

            onServerConnect: function () {
                for (var i = 0, il = this.onServerConnectHandlers.length; i < il; i++) {
                    var handler = this.onServerConnectHandlers[i];
                    if (typeof (handler) === 'function') handler();
                }
            },
            onServerDisconnect: function () {
                for (var i = 0, il = this.onServerDisconnectHandlers.length; i < il; i++) {
                    var handler = this.onServerDisconnectHandlers[i];
                    if (typeof (handler) === 'function') handler();
                }
            },
            onServerMessage: function (data) {
                if (!data) return;
                for (var i = 0, il = this.onServerMessageHandlers.length; i < il; i++) {
                    var handler = this.onServerMessageHandlers[i];
                    if (typeof (handler) === 'function') handler(data);
                }
            },
            //client received a ping request from server
            onServerPing: function (data) {
                data.pongTime = Date.now();
                this.socket.emit(this.PING_REPLY_TAG, data);
                this.last_ping_time = Date.now();
                for (var i = 0, il = this.onServerPingHandlers.length; i < il; i++) {
                    var handler = this.onServerPingHandlers[i];
                    if (typeof (handler) === 'function') handler(data);
                }
            },
            //server replied to a ping request sent by client
            onServerPingReply: function (data) {
                if (!data) return;
                if (isNaN(data.pingTime) || data.pingTime === null ||
                    isNaN(data.pongTime) || data.pongTime === null) {
                    return;
                }
                this.last_ping_time = Date.now();
                this.round_trip_time = Date.now() - data.pingTime;
                this.time_diff = Date.now() - data.pongTime + this.round_trip_time / 2;

                var latency = Math.floor(this.round_trip_time / 2);
                this.recalculateTimeDiff(latency, data.pongTime);

                for (var i = 0, il = this.onServerPingReplyHandlers.length; i < il; i++) {
                    var handler = this.onServerPingReplyHandlers[i];
                    if (typeof (handler) === 'function') handler(data);
                }
                /*
                //DISABLED
                //send an extra ping reply back to the server
                var new_reply = {};
                new_reply.pingTime = data.pongTime;
                new_reply.pongTime = Date.now();
                this.socket.emit(this.PING_REPLY_TAG, new_reply);
                */
            },
            //send a ping request to the server
            pingServer: function () {
                if (!this.socket) return;
                var data = {};
                data.pingTime = Date.now();
                this.socket.emit(this.PING_TAG, data);
            },
            //send a message to the server
            sendMessage: function (data) {
                if(this.socket) this.socket.emit(this.MESSAGE_TAG, data);
            },
            recalculateTimeDiff: function (latency, pongTime) {
                if (latency === null || isNaN(latency) ||
                    pongTime === null || isNaN(pongTime)) {
                    return;
                }
                if (this.latency_log.length >= this.latency_log_size) {
                    this.latency_log.shift();
                }
                this.latency_log.push(latency);
                var sum = 0;
                for (var i = 0, il = this.latency_log.length; i < il; i++) {
                    sum += this.latency_log[i];
                }
                this.latency_average = Math.round(sum / this.latency_log.length);
                this.time_diff = Date.now() - (pongTime + this.latency_average);
            },
        });
    });
