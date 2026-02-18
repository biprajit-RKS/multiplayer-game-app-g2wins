if (typeof require !== "undefined") {
    network = require('./network.js').network;
}

var GameHost = function (server) {
    var self = {
        server: null,
        minClientVersion: 1,

        lastRoomId: -1,
        roomList: [],
        recycledRoomIds: [],
        pendingBattles: [],

        init: function (server) {
            self.server = server;
            self.server.onClientConnectHandlers.push(self.onClientConnect);
            self.server.onClientDisconnectHandlers.push(self.onClientDisconnect);
            self.server.onClientMessageHandlers.push(self.onClientMessage);
        },

        broadcast: function (msg) {
            for (var i = 0, il = self.server.userList.length; i < il; i++) {
                if (self.server.userList[i])
                    self.server.sendMessage(self.server.userList[i].socket, msg);
            }
        },

        onClientConnect: function (socket) {
            //console.log('a user connected.');
            var msg = {
                type: network.MessageType.USER_CONNECTED,
                data: self.server.userList.length
            };
            self.broadcast(msg);
        },

        onClientDisconnect: function (socket) {
            // CHECK PENDING BATTLES
            for (var i = 0; i < self.pendingBattles.length; i++) {
                var battle = self.pendingBattles[i];
                var requests = battle.pendingRequests;
                for (var n = 0; n < requests.length; n++) {
                    var request = requests[n];
                    if (request.socket == socket) {
                        requests.splice(n, 1);
                        if (requests.length === 0) {
                            self.pendingBattles.splice(i, 1);
                        }
                        break;
                    }
                }
            }
            self.leaveRoom(socket);
            //console.log('a user disconnected.');
            var msg = {
                type: network.MessageType.USER_DISCONNECTED,
                data: self.server.userList.length - 1
            };
            self.broadcast(msg);
        },

        onClientMessage: function (socket, msg) {
            if (!msg) return;
            switch (msg.type) {
                case network.MessageType.REQUEST_ROOM:
                    self.onClientRequestRoom(socket, msg.data);
                    break;
                case network.MessageType.REQUEST_PRIVATE_ROOM:
                    self.onClientRequestPrivateRoom(socket, msg.data);
                    break;
                case network.MessageType.LEAVE_ROOM:
                    self.onClientLeaveRoom(socket);
                    break;
                case network.MessageType.KICK_PLAYER:
                    self.onKickPlayer(socket, msg.data);
                    break;
                case network.MessageType.EMOJI:
                    self.onClientEmoji(socket, msg.data);
                    break;
                case network.MessageType.GAME_EVENT:
                    self.handleEven(socket, msg.data);
                    break;
                case network.MessageType.SYNC_TIME:
                    self.syncTime(socket, msg.data);
                    break;
                case network.MessageType.REQUEST_GAMESTATE:
                    self.onClientRequestGameState(socket);
                    break;
                case network.MessageType.GAMESTATE_FIXED:
                    var room = self.findRoomBySocket(socket);
                    if (!room) return;
                    var player = room.findPlayer(socket);
                    if (!player) return;
                    room.sendDiceValue(player);
                    break;
                case network.MessageType.START_TIME:
                    var room = self.findRoomBySocket(socket);
                    if (!room) return;
                    var m = {
                        type: network.MessageType.START_TIME,
                        data: room.gameStartTime
                    };
                    self.server.sendMessage(socket, m);
                    break;
            }
        },

        onClientRequestGameState: function (socket) {
            var room = self.findRoomBySocket(socket);
            if (!room) return;
            var player = room.findPlayer(socket);
            if (!player) return;
            room.clearAutoMode();
            room.checkAutoMode();
            room.inactivePlayers--;
            if (room.inactivePlayers < 0) room.inactivePlayers = 0;
            if (room.inactivePlayers >= room.playerList.length - 1) {
                room.currentPlayerID = player.id;
                room.sendGameState(socket);
                return;
            }

            // game end
            if (room.gameEnd) {
                var msg = {
                    type: network.MessageType.GAME_EVENT,
                    data: {
                        event: network.Events.GAME_END,
                        data: room.playerRanks
                    }
                };
                self.server.sendMessage(socket, msg);
                return;
            }
            // player complete
            if (player.completed) {
                var msg = {
                    type: network.MessageType.GAME_EVENT,
                    data: {
                        event: network.Events.PLAYER_COMPLETE,
                        data: room.ranking
                    }
                };
                self.server.sendMessage(socket, msg);
                return;
            }

            // process request
            player.requestTimes++;
            if (player.requestTimes > 10) {
                room.removeInactivePlayer(player);
                room.checkAutoMode();
                return;
            }
            room.clearAutoMode();
            if (room.currentPlayerID == player.id && room.lastEvent != network.Events.DICE_ROLLING) {
                room.sendGameState(socket);
                room.checkAutoMode();
            } else {
                room.processGameState(socket);
                room.checkAutoMode(2000);
            }
        },

        syncTime: function (socket, data) {
            var room = self.findRoomBySocket(socket);
            if (!room) return;
            var player = room.findPlayer(socket);
            if (!player) return;
            if (data.getTime) {
                if (player.state.pauseTime == null) player.state.pauseTime = player.joinedTime;
                var pauseDuration = Date.now() - player.state.pauseTime;
                var msg = {
                    type: network.MessageType.SYNC_TIME,
                    data: {
                        pauseDuration: pauseDuration
                    }
                };
                self.server.sendMessage(player.socket, msg);
            } else {
                if (data.playerId != null) {
                    var otherPlayer = room.findPlayerById(data.playerId);
                    if (otherPlayer) otherPlayer.state.pauseTime = Date.now();
                } else
                    player.state.pauseTime = Date.now();
            }
        },

        onKickPlayer: function (socket, data) {
            var room = self.findRoomBySocket(socket);
            if (!room) return;
            var player = room.findPlayerById(data.playerId);
            if (!player) return;
            this.leaveRoom(player.socket);
            var dt = data.isCheated ? true : false;
            var msg = {
                type: network.MessageType.KICKED,
                data: dt
            };
            self.server.sendMessage(player.socket, msg);
        },

        handleEven: function (socket, msg) {
            var room = self.findRoomBySocket(socket);
            if (!room) return;
            var player = room.findPlayer(socket);
            if (!player) return;

            room.handleEven(player, msg);
        },

        onClientRequestRoom: function (socket, data) {
            if (!socket) return;
            var rejectReason = network.Errors.INVALID_REQUEST;
            if (data) {
                rejectReason = network.Errors.VERSION_MISMATCH;
                var requestInfo = data;
                var clientVersion = requestInfo.clientVersion;
                if (!isNaN(clientVersion) && clientVersion >= self.minClientVersion) {
                    if (self.validatePlayerName(requestInfo.playerName)) {
                        self.arrangeRoom(socket, requestInfo);
                        return true;
                    } else {
                        rejectReason = network.Errors.INVALID_NAME;
                    }
                }
            }
            var msg = {
                type: network.MessageType.REQUEST_ROOM_REJECTED,
                data: rejectReason
            };
            self.server.sendMessage(socket, msg);
            return false;
        },

        onClientRequestPrivateRoom: function (socket, requestInfo) {
            if (!socket || !requestInfo) return;
            requestInfo.socket = socket;
            var check = false;
            for (var i = 0; i < self.pendingBattles.length; i++) {
                var battle = self.pendingBattles[i];
                var payAmountMatch = !requestInfo.payAmount || battle.payAmount === requestInfo.payAmount;
                
                if (battle.id == requestInfo.pw && battle.roomSize == requestInfo.roomSize && payAmountMatch) {
                    battle.pendingRequests.push(requestInfo);
                    check = true;
                    var requests = battle.pendingRequests;
                    if (requests.length == battle.roomSize) {
                        // create a room and start
                        var room = self.createRoom(battle.roomSize);
                        room.isPrivate = true;
                        if (battle.payAmount) room.payAmount = battle.payAmount;
                        var data = {};
                        data.roomId = room.id;
                        data.joinTimeServer = Date.now();
                        for (var n = 0; n < requests.length; n++) {
                            var player = room.addPlayer(requests[n].socket, requests[n]);
                            data.playerId = player.id;
                            data.latency = player.latency;
                            var msg = {
                                type: network.MessageType.REQUEST_ROOM_CONFIRMED,
                                data: data
                            };
                            self.server.sendMessage(requests[n].socket, msg);
                            var user = self.server.findUserById(requests[n].socket.id);
                            if (user) {
                                user.roomId = room.id;
                                user.playerId = player.id;
                            }
                            if (n == requests.length - 1) {
                                self.notifyRoom(room, player, network.MessageType.PLAYER_JOIN);
                            }
                        }
                        self.pendingBattles.splice(i, 1);
                        room.startGame();
                    }
                    break;
                }
            }
            if (!check) {
                var initBattle = {
                    id: requestInfo.pw,
                    roomSize: requestInfo.roomSize,
                    payAmount: requestInfo.payAmount,
                    pendingRequests: [requestInfo]
                }
                self.pendingBattles.push(initBattle);
                console.log('🔒 Created private battle:', initBattle.id, 'Amount:', initBattle.payAmount);
            }
            return false;
        },

        onClientLeaveRoom: function (socket) {
            self.leaveRoom(socket);
        },

        onClientEmoji: function (socket, data) {
            var room = self.findRoomBySocket(socket);
            if (!room) return;
            var player = room.findPlayer(socket);
            if (!player) return;
            var msg = {
                type: network.MessageType.EMOJI,
                data: {
                    playerID: player.id,
                    eID: data
                }
            };
            room.broadcast(msg);
        },

        createRoom: function (roomSize) {
            var roomId;
            if (self.recycledRoomIds.length > 0) {
                roomId = self.recycledRoomIds[0];
                self.recycledRoomIds.shift();
            } else {
                roomId = ++self.lastRoomId;
            }
            var room = new Room(self, roomId, roomSize);
            self.roomList.push(room);
            //console.log('room id: ' + room.id + ' created');
            return room;
        },

        shutdownRoom: function (roomId) {
            var room = self.findRoomById(roomId);
            if (!room) return false;
            var found_index = self.roomList.indexOf(room);
            self.roomList.splice(found_index, 1);
            self.recycledRoomIds.push(roomId);
            //console.log('room id: ' + roomId + ' shut down');
            return true;
        },

        findRoomById: function (id) {
            var foundRoom = null;
            for (var i = 0, il = self.roomList.length; i < il; i++) {
                if (self.roomList[i].id == id) {
                    foundRoom = self.roomList[i];
                    break;
                }
            }
            return foundRoom;
        },

        joinRoom: function (room, socket, requestInfo) {
            if (room.playerList.length >= room.roomSize) {
                var msg = {
                    type: network.MessageType.REQUEST_ROOM_REJECTED,
                    data: network.Errors.INVALID_REQUEST,
                };
                self.server.sendMessage(socket, msg);
                return false;
            }

            var player = room.addPlayer(socket, requestInfo);

            if (!player) { // player not existing
                var msg = {
                    type: network.MessageType.REQUEST_ROOM_REJECTED,
                    data: network.Errors.INVALID_REQUEST,
                };
                self.server.sendMessage(socket, msg);
                return false;
            }

            var data = {};
            data.roomId = room.id;
            data.playerId = player.id;
            data.latency = player.latency;
            data.joinTimeServer = Date.now();
            var msg = {
                type: network.MessageType.REQUEST_ROOM_CONFIRMED,
                data: data
            };
            self.server.sendMessage(socket, msg);
            //console.log('player: id: ' + player.id + ', latency: ' + player.latency + 'ms');

            //update user info so we know which room and player id
            //to use by default when we receive a client message
            var user = self.server.findUserById(socket.id);
            if (user) {
                user.roomId = room.id;
                user.playerId = player.id;
            }

            //console.log('joins room: roomId:' + room.id);
            //notify other players that this player has joined
            self.notifyRoom(room, player, network.MessageType.PLAYER_JOIN);

            /*CHECK ROOM FULL -> START GAME*/
            if (room.playerList.length == room.roomSize) room.startGame();
            return true;
        },

        leaveRoom: function (socket) {
            var room = self.findRoomBySocket(socket);
            if (!room) {
                var msg = {
                    type: network.MessageType.LEAVE_ROOM_COMPLETED
                }
                self.server.sendMessage(socket, msg);
                return false;
            }
            var player = room.findPlayer(socket);
            if (!player) return false;

            var player = room.removePlayer(socket);
            //console.log('leave room: roomId:' + room.id + ' playerId:' + player.id);

            //shut down room if empty
            if (room.playerList.length <= 0) {
                self.shutdownRoom(room.id);
            } else {
                //notify other players that this player has left
                self.notifyRoom(room, player, network.MessageType.PLAYER_LEFT);
            }
            var msg = {
                type: network.MessageType.LEAVE_ROOM_COMPLETED
            }
            self.server.sendMessage(socket, msg);
            return true;
        },

        findPlayerBySocket: function (socket) {
            var room = self.findRoomBySocket(socket);
            if (!room) return null;
            var player = room.findPlayer(socket);
            return player;
        },

        findRoomBySocket: function (socket) {
            if (!socket) return null;
            var user = self.server.findUserById(socket.id);
            if (!user) return null;
            var room = self.findRoomById(user.roomId);
            return room;
        },

        notifyRoom: function (room, player, msgType) {
            var data = {};
            data.roomId = room.id;
            data.playerId = player.id;
            data.gameState = room.packGameState();

            var msg = {
                type: msgType,
                data: data
            };
            room.broadcast(msg);
        },

        arrangeRoom: function (socket, requestInfo) {
            var room = self.getJoinableRoom(requestInfo);
            self.joinRoom(room, socket, requestInfo);
        },

        getJoinableRoom: function (requestInfo) {
            var found_room = null;
            for (var i = 0, il = self.roomList.length; i < il; i++) {
                var room = self.roomList[i];
                
                // Check if roomType and payAmount match
                var roomTypeMatch = !requestInfo.roomType || room.roomType === requestInfo.roomType;
                var payAmountMatch = !requestInfo.payAmount || room.payAmount === requestInfo.payAmount;
                
                if (!room.isPrivate && !room.hasStarted && 
                    room.roomSize == requestInfo.roomSize && 
                    roomTypeMatch && payAmountMatch &&
                    room.playerList.length < room.roomSize) {
                    found_room = room;
                    console.log('✅ Found matching room:', room.id, 'Type:', room.roomType, 'Amount:', room.payAmount);
                    break;
                }
            }
            if (!found_room) {
                found_room = self.createRoom(requestInfo.roomSize);
                // Store roomType and payAmount in new room
                if (requestInfo.roomType) found_room.roomType = requestInfo.roomType;
                if (requestInfo.payAmount) found_room.payAmount = requestInfo.payAmount;
                console.log('🆕 Created new room:', found_room.id, 'Type:', found_room.roomType, 'Amount:', found_room.payAmount);
            }
            return found_room;
        },

        validatePlayerName: function (name) {
            if (!name) return false;
            if (typeof (name) !== 'string') return false;
            if (name.length > 12) return false;
            return true;
        },
    };
    self.init(server);
    return self;
};

var Room = function (host, id, roomSize) {
    var self = {};
    self.lastPlayerId = -1;
    self.gamehost = null;

    self.playerList = [];
    self.requestingList = [];
    self.playerRanks = [];
    self.ranking = [];
    self.inactivePlayers = 0;

    self.hasStarted = false;
    self.gameEnd = false;
    self.isReady = false;
    self.diceValue = 0;
    self.currentPlayerID = -1;
    self.lastEvent = network.Events.NEXT_TURN;
    self.isPrivate = false;

    self.init = function (host, id, roomSize) {
        self.createdTime = Date.now();
        self.gamehost = host;
        self.id = id;
        self.roomSize = roomSize;
    };

    self.addPlayer = function (socket, playerRequestInfo) {
        //console.log('add player')
        var foundPlayer = self.findPlayer(socket);
        if (foundPlayer) {
            //console.log('user existing: id = ' + foundPlayer.id);
            return null;
        }
        var player = new Player(socket, self, ++self.lastPlayerId);
        player.state.name = playerRequestInfo.playerName;
        player.state.avatarId = playerRequestInfo.avatarId;
        self.playerList.push(player);
        return player;
    };

    self.removePlayer = function (socket) {
        var foundPlayer = self.findPlayer(socket);
        if (!foundPlayer) {
            return null;
        }

        var id = self.playerList.indexOf(foundPlayer);
        if (foundPlayer.id == self.currentPlayerID) {
            self.nextTurn();
        }
        self.playerList.splice(id, 1);
        if (self.playerList.length <= 1 && self.hasStarted) self.gameEnd = true;
        self.updateState(foundPlayer.id);
        var id2 = self.requestingList.indexOf(foundPlayer);
        if (id2 != -1) {
            self.requestingList.splice(id2, 1);
        }
        return foundPlayer;
    };

    self.findPlayer = function (socket) {
        var foundPlayer = null;
        for (var i = 0, il = self.playerList.length; i < il; i++) {
            if (self.playerList[i].socket == socket) {
                foundPlayer = self.playerList[i];
                break;
            }
        }
        return foundPlayer;
    };

    self.findPlayerById = function (playerId) {
        var foundPlayer = null;
        for (var i = 0, il = self.playerList.length; i < il; i++) {
            if (self.playerList[i].id == playerId) {
                foundPlayer = self.playerList[i];
                break;
            }
        }
        return foundPlayer;
    };

    self.startGame = function () {
        if (self.hasStarted) return;
        if (self.playerList.length < self.roomSize) return;
        self.hasStarted = true;
        self.gameStartTime = Date.now();
        var gameState = self.packGameState();
        var r = Math.floor(Math.random() * gameState.length);
        self.currentPlayerID = gameState[r].playerId;
        var colorID = Math.floor(Math.random() * gameState.length);
        var msg = {
            type: network.MessageType.GAME_EVENT,
            data: {
                "event": network.Events.GAME_START,
                "data": gameState,
                "firstPlayerId": self.currentPlayerID,
                "colorID": colorID
            }
        };
        // generate game state
        self.gameState = {};
        for (var i = 0; i < self.playerList.length; i++) {
            var pl = self.playerList[i];
            for (var j = 0; j < 4; j++) {
                self.gameState[pl.id + 'H' + j] = 0;
            }
        }
        // send message
        self.broadcast(msg);
        self.checkAutoMode();
    };

    self.checkAutoMode = function (time) {
        if (self.gameEnd && self.waitingTimer) return;
        if (!time) var time = 10000;
        self.waitingTimer = setTimeout(function () {
            self.activeAutoMode();
        }, time);
        self.startTime = Date.now();
    };

    self.clearAutoMode = function () {
        if (self.waitingTimer != null) {
            clearTimeout(self.waitingTimer);
            self.waitingTimer = null;
        }
    }

    self.activeAutoMode = function () {
        if (self.gameEnd) return;
        self.clearAutoMode();
        var currentPlayer = self.getCurrentPlayer();
        if (!currentPlayer) return;
        if (self.lastEvent == network.Events.DICE_ROLLING) {
            // SEND HORSE MOVE
            setTimeout(function (params) {
                var data = {
                    event: network.Events.RANDOM_HORSE
                };
                self.sendGameEvent(data);
                // console.log('auto move horse');
                self.clearAutoMode();
                self.checkAutoMode(3000);
            }, 1500);
        } else if (self.lastEvent == network.Events.NEXT_TURN || self.lastEvent == network.Events.CHECK_AUTO || self.lastEvent == network.Events.HORSE_MOVE || self.lastEvent == network.Events.PLAYER_COMPLETE) {
            // SEND DICE ROLLING
            var data = {
                event: network.Events.DICE_ROLLING
            };
            self.sendGameEvent(data);
            self.sendDiceValue(currentPlayer);
            // console.log('auto rolling');
            self.clearAutoMode();
            self.checkAutoMode(3000);
        }
    };

    self.getCurrentPlayer = function () {
        var currentPlayer;
        for (var i = 0; i < this.playerList.length; i++) {
            if (this.playerList[i].id == self.currentPlayerID) {
                currentPlayer = this.playerList[i];
                break;
            }
        }
        return currentPlayer;
    };

    self.processGameState = function (socket) {
        var player = self.findPlayer(socket);
        if (!player) return;

        var id = self.requestingList.indexOf(player);
        if (self.currentPlayerID != player.id) {
            if (id == -1) {
                self.requestingList.push(player);
            }
        } else {
            if (id != -1) {
                self.requestingList.splice(id, 1);
                self.sendGameState(socket);
            } else {
                self.requestingList.push(player);
            }
        }
    };

    self.sendGameState = function (socket, updateHorse, clearOverlay) {
        var msg = {
            type: network.MessageType.GAMESTATE,
            data: self.gameState,
            diceValue: self.diceValue,
            playerRanks: self.gameEnd ? self.playerRanks : self.ranking
        };
        if (self.waitingTimer != null) {
            msg.timePast = Date.now() - self.startTime;
        }
        if (updateHorse) msg.updateHorse = true;
        if (clearOverlay) msg.clearOverlay = true;
        self.gamehost.server.sendMessage(socket, msg);
    };

    self.sendDiceValue = function (player) {
        self.clearAutoMode();
        self.checkAutoMode();
        // random value
        var v = Math.floor(Math.random() * 6) + 1;
        if (v != 6) {
            if (!player.started) {
                if (Math.random() < 0.5) v = 6;
                if (v == 6) player.started = true;
            } else if (self.checkHorseReady(player.id)) {
                if (Math.random() < 0.33) v = 6;
            }
        }
        self.diceValue = v;
        self.lastEvent = network.Events.DICE_ROLLING;

        self.updateGameState();
        setTimeout(function () {
            if (player.id != self.currentPlayerID) return;
            var data = {
                event: network.Events.RANDOM_VALUE,
                data: v,
                playerID: player.id
            }
            self.sendGameEvent(data);
            self.lastEvent = network.Events.DICE_ROLLING;
            // player.state.pauseTime = Date.now();
        }, 1000);
        // }, 478);
    };

    self.updateGameState = function () {
        for (var i = 0; i < self.playerList.length; i++) {
            var player = self.playerList[i];
            if (player) self.sendGameState(player.socket, true);
        }
    };

    self.handleEven = function (player, msg) {
        // if (msg.event == network.Events.DICE_ROLLING) {
        //     console.log('**********');
        //     console.log("player.id, self.currentPlayerID");
        //     console.log(player.id, self.currentPlayerID);
        // console.log('msg.event', Object.keys(network.Events)[Object.values(network.Events).indexOf(msg.event)]);
        // }

        if (msg.event == network.Events.UPDATE_HORSE) {
            var horseId = msg.data.horseId,
                pid = msg.data.playerId,
                hid = pid + 'H' + horseId;
            if (self.gameState[hid] != 0) self.gameState[hid] = 0;
            return;
        }

        if (msg.event == network.Events.CHECK_AUTO) {
            self.clearAutoMode();
            self.checkAutoMode();
            self.lastEvent = msg.event;
            return;
        }

        if (msg.event == network.Events.INACTIVE) {
            self.inactivePlayers++;
            if (self.inactivePlayers >= self.playerList.length) {
                self.inactivePlayers == self.playerList.length;
                self.clearAutoMode();
                return;
            }
            if (self.requestingList.length > 0 && self.requestingList.length == self.playerList.length - self.inactivePlayers) {
                var currentPlayer = self.requestingList[0];
                self.currentPlayerID = currentPlayer.id;
                self.sendGameState(currentPlayer.socket);
                self.requestingList.shift();
            }
            return;
        }

        if (msg.event == network.Events.GAME_END) {
            if (self.gameEnd) return;
            self.gameEnd = true;
            self.playerRanks = msg.data;
            return;
        }

        if (msg.event == network.Events.PLAYER_COMPLETE) {
            var player = self.findPlayerById(msg.data.playerId);
            if (!player || player.completed) return;
            player.completed = true;
            self.ranking.push({
                playerName: player.state.name,
                rankNo: msg.data.rankNo,
                playerId: player.id
            });
            console.log('🏆 Player Completed - Name:', player.state.name, 'Rank:', msg.data.rankNo, 'ID:', player.id);
            // console.log('checkAutoMode: PLAYER_COMPLETE');
            self.nextTurn();
            return;
        }

        // HANDLE EVENTS (ONLY CURRENT PLAYER ALLOWED)
        if (player.id != self.currentPlayerID && msg.event != network.Events.NEXT_TURN && msg.event != network.Events.HORSE_MOVE) {
            return;
        }

        // generate replying data
        var data = {
            event: msg.event,
            playerID: player.id
        }

        if (typeof msg.data != 'undefined') {
            data.data = msg.data;
        }

        // handle events
        switch (msg.event) {
            case network.Events.DICE_ROLLING:
                self.clearAutoMode();
                // SEND DICE VALUE
                self.sendDiceValue(player);
                self.lastEvent = msg.event;
                break;
            case network.Events.HORSE_MOVE:
                if (self.lastEvent == network.Events.HORSE_MOVE) return;
                self.clearAutoMode();
                var horseId = msg.data.horseId,
                    pid = self.currentPlayerID,
                    hid = pid + 'H' + horseId;
                if (self.gameState[hid] == 0) self.gameState[hid] = 1;
                else self.gameState[hid] += self.diceValue;
                self.sendGameEvent(data);
                self.lastEvent = msg.event;
                return;

            case network.Events.NEXT_TURN:
                // console.log('***********************');
                // console.log('msg.event', Object.keys(network.Events)[Object.values(network.Events).indexOf(msg.event)]);
                // console.log('self.lastEvent', Object.keys(network.Events)[Object.values(network.Events).indexOf(self.lastEvent)]);
                // console.log('player.id', player.id);
                // console.log('********');
                if (self.lastEvent == network.Events.NEXT_TURN || self.lastEvent == network.Events.CHECK_AUTO) return;
                // if (self.lastEvent == network.Events.NEXT_TURN) return
                self.sendGameEvent(data);
                self.nextTurn();
                self.lastEvent = msg.event;
                // console.log('nextTurn: NEXT_TURN ************');
                // console.log('********');
                return;
        }

        self.sendGameEvent(data, player.id);
    };

    self.fixGameState = function (player) {
        var msg = {
            type: network.MessageType.FIX_GAMESTATE,
            data: self.gameState
        };
        self.gamehost.server.sendMessage(player.socket, msg);
    };

    self.nextTurn = function () {
        var currentPlayer = self.findPlayerById(self.currentPlayerID);
        var id = self.playerList.indexOf(currentPlayer);
        var newId = id + 1;
        if (newId == self.playerList.length) newId = 0;
        while ((self.playerList[newId] == null || self.playerList[newId].completed) && newId != id) {
            newId++;
            if (newId == self.playerList.length) newId = 0;
        }
        self.currentPlayerID = self.playerList[newId].id;

        var checkedId = -1;
        for (var i = 0; i < self.requestingList.length; i++) {
            var player = self.requestingList[i];
            if (self.currentPlayerID == player.id) {
                self.sendGameState(player.socket);
                checkedId = i;
                break;
            }
        }
        if (checkedId != -1) self.requestingList.splice(checkedId, 1);
        self.clearAutoMode();
        self.checkAutoMode();
    }

    self.sendGameEvent = function (data, exceptId) {
        var msg = {
            type: network.MessageType.GAME_EVENT,
            data: data
        }
        if (typeof exceptId != 'undefined') self.broadcastExceptId(msg, exceptId);
        else self.broadcast(msg);
    };

    self.checkHorseReady = function (playerId) {
        if (!self.gameState) return;
        var check = true; // no horse ready
        for (var i = 0; i < 4; i++) {
            var horseId = playerId + 'H' + i;
            if (self.gameState.hasOwnProperty(horseId) && self.gameState[horseId] > 0) {
                check = false;
                break;
            }
        }
        return check;
    };


    self.removeCheatedPlayer = function (player) {
        var foundPlayer = self.removePlayer(player.socket);
        if (!foundPlayer) return;
        // self.checkAutoMode();
        var msg2 = {
            type: network.MessageType.KICKED,
            data: true // cheated
        };
        self.gamehost.server.sendMessage(player.socket, msg2);
        var msg = {
            type: network.MessageType.GAME_EVENT,
            data: {
                event: network.Events.PLAYER_CHEATED,
                data: player.id
            }
        }
        self.broadcast(msg);
    };

    self.removeInactivePlayer = function (player) {
        self.removePlayer(player.socket);
        var msg2 = {
            type: network.MessageType.KICKED,
            data: false // cheated
        };
        self.gamehost.server.sendMessage(player.socket, msg2);
        var msg = {
            type: network.MessageType.PLAYER_LEFT,
            data: {
                playerId: player.id,
                gameState: self.packGameState()
            }
        }
        self.broadcastExceptId(msg, player.id);
    };

    self.broadcast = function (msg) {
        for (var i = 0; i < self.playerList.length; i++) {
            self.gamehost.server.sendMessage(self.playerList[i].socket, msg);
        }
    };

    self.broadcastExceptId = function (msg, exceptId) {
        for (var i = 0; i < self.playerList.length; i++) {
            if (self.playerList[i].id != exceptId)
                self.gamehost.server.sendMessage(self.playerList[i].socket, msg);
        }
    };

    self.updateState = function (playerId) {
        if (!self.gameState) return;
        for (var i = 0; i < 4; i++) {
            var horseId = playerId + 'H' + i;
            if (self.gameState.hasOwnProperty(horseId)) delete self.gameState[horseId];
        }
    };

    self.checkState = function (checkingState) {
        var failed = false;
        for (var horseId in self.gameState) {
            if (self.gameState.hasOwnProperty(horseId)) {
                if (!checkingState.hasOwnProperty(horseId)) {
                    failed = true;
                    break;
                }
                var usedSteps1 = self.gameState[horseId],
                    usedSteps2 = checkingState[horseId];
                if (usedSteps1 != usedSteps2) {
                    failed = true;
                    break;
                }
            }
        }
        return failed;
    };

    self.packGameState = function () {
        var data = [];
        for (var i = 0; i < self.playerList.length; i++) {
            data.push(self.playerList[i].state);
        }
        return data;
    };

    self.init(host, id, roomSize);
    return self;
};

var Player = function (socket, room, id) {
    var self = {};
    self.init = function (socket, room, id) {
        self.socket = socket;
        self.room = room;
        self.id = id;
        self.joinedTime = Date.now();
        self.latency = 0;
        self.started = false;
        self.completed = false;
        self.autoMode = false;
        self.skippedTimes = 0;
        self.requestTimes = 0;
        self.state = {
            playerId: id
        };
    };
    self.init(socket, room, id);
    return self;
};

if (typeof module !== "undefined") {
    module.exports.GameHost = GameHost;
}