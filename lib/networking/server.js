var VNServer = function(){
    var self = {
        MESSAGE_TAG: "bgfp_msg",
        PING_TAG: "bgfp_ping",
        PING_REPLY_TAG: "bgfp_ping_reply",

        userList: [],
        userHash: {},

        onClientConnectHandlers: [],
        onClientDisconnectHandlers: [],
        onClientMessageHandlers: [],
        onClientPingHandlers: [],
        onClientPingReplyHandlers: [],

        init: function(){

        },
        addUser: function(socket){
            if(!socket) return null;
            var user = new User(socket);
            self.userList.push(user);
            self.userHash[user.id] = user;
            return user;
        },
        removeUser: function(socket){
            if(!socket) return false;
            var user = self.findUserById(socket.id);
            if(!user) return false;
            var i = self.userList.indexOf(user);
            self.userList.splice(i, 1);
            delete self.userHash[user.id];
            return true;
        },
        findUserById: function(id){
            if(!isNaN(id) || id===null) return null;
            var user = self.userHash[id];
            return user;
        },
        onClientConnect: function(socket){
            if(!socket) return;
            var user = self.addUser(socket);
            for(var i=0, il=self.onClientConnectHandlers.length; i<il; i++){
                var handler = self.onClientConnectHandlers[i];
                if(typeof(handler)==='function') handler(socket);
            }
        },
        onClientDisconnect: function(socket){
            if(!socket) return;
            var user = self.findUserById(socket.id);
            for(var i=0, il=self.onClientDisconnectHandlers.length; i<il; i++){
                var handler = self.onClientDisconnectHandlers[i];
                if(typeof(handler)==='function') handler(socket);
            }
            self.removeUser(socket);
        },
        onClientMessage: function(socket, data){
            if(!socket) return;
            if(!data) return;
            var user = self.findUserById(socket.id);
            for(var i=0, il=self.onClientMessageHandlers.length; i<il; i++){
                var handler = self.onClientMessageHandlers[i];
                if(typeof(handler)==='function') handler(socket, data);
            }
        },
        //server received a ping request from client
        onClientPing: function(socket, data){
            if(!socket) return;
            var user = self.findUserById(socket.id);
            data.pongTime = Date.now();
            socket.emit(self.PING_REPLY_TAG, data);
            user.last_ping_time = Date.now();
            for(var i=0, il=self.onClientPingHandlers.length; i<il; i++){
                var handler = self.onClientPingHandlers[i];
                if(typeof(handler)==='function') handler(socket, data);
            }
        },
        //client replied to a ping request sent by server
        onClientPingReply: function(socket, data){
            if(!socket) return;
            var user = self.findUserById(socket.id);
            if(!data) return;
            if(isNaN(data.pingTime) || data.pingTime === null ||
               isNaN(data.pongTime) || data.pongTime === null){
                return;
            }
            user.round_trip_time = Date.now()-data.pingTime;
            user.last_ping_time = Date.now();
            user.time_diff = Date.now() - data.pongTime + user.round_trip_time/2;

            var latency = Math.floor(user.round_trip_time/2);
            user.recalculateTimeDiff(latency, data.pongTime);

            for(var i=0, il=self.onClientPingReplyHandlers.length; i<il; i++){
                var handler = self.onClientPingReplyHandlers[i];
                if(typeof(handler)==='function') handler(socket, data);
            }
        },
        //send a ping request to a connected client
        pingSocket: function(socket, replyCallback){
            if(!socket) return;
            var data = {};
            data.pingTime = Date.now();
            socket.emit(self.PING_TAG, data);
        },
        //send a message to a connected client
        sendMessage: function(socket, data){
            if(!socket) return;
            socket.emit(self.MESSAGE_TAG, data);
        },
    };
    self.init();
    return self;
};

var User = function(socket){
    var self = {
        round_trip_time: 0,
        time_diff: 0,
        last_ping_time: 0,
        latency_average: 0,
        latency_log: [],
        latency_log_size: 10,

        init: function(socket){
            self.socket = socket;
            self.id = socket.id;
        },
        recalculateTimeDiff: function(latency, pongTime){
            if(latency===null || isNaN(latency) ||
               pongTime===null || isNaN(pongTime)){
               return;
            }
            if(self.latency_log.length >= self.latency_log_size){
                self.latency_log.shift();
            }
            self.latency_log.push(latency);
            var sum = 0;
            for(var i=0, il=self.latency_log.length; i<il; i++){
                sum += self.latency_log[i];
            }
            self.latency_average = Math.round(sum/self.latency_log.length);
            self.time_diff = Date.now() - (pongTime + self.latency_average);
        },
    };
    self.init(socket);
    return self;
};

if(typeof module!=="undefined"){
    module.exports.VNServer = VNServer;
}
