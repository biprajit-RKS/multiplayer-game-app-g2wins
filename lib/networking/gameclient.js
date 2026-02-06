ig.module('networking.gameclient')
    .requires(
        'networking.network-error',
        'networking.network-processing',
        'networking.network-alert'
    )
    .defines(function () {
        GameClient = ig.Class.extend({
            network_client: null,
            clientVersion: 1,

            clientRequestGameTime: 0,
            gameJoinedServerTime: 0,
            gameJoinedLocalTime: 0,
            initialGameState: null,

            roomId: null,
            playerId: null,

            newMessage: 0,
            numOfPlayers: 1,

            init: function (network_client) {
                this.userCountText = _TEXT.Network.Offline;
                if (!network_client) return;
                this.network_client = network_client;
                this.network_client.onServerConnectHandlers.push(this.onServerConnect.bind(this));
                this.network_client.onServerDisconnectHandlers.push(this.onServerDisconnect.bind(this));
                this.network_client.onServerMessageHandlers.push(this.onServerMessage.bind(this));
            },

            getServerTime: function () {
                if (!this.network_client || !this.network_client.socket) return 0;
                return this.network_client.getServerTime();
            },

            getStartTime: function () {
                if (!this.network_client || !this.network_client.socket) return 0;
                this.sendMessage(network.MessageType.START_TIME);
            },

            sendMessage: function (eventType, data) {
                var msg = {
                    type: eventType
                }
                if (typeof data != 'undefined') msg.data = data;
                this.network_client.sendMessage(msg);
            },

            /*HANDLERS*/

            onServerConnect: function () {
                var overlays = ig.game.getEntitiesByType(EntityNetworkOverlay);
                var control = ig.game.getEntitiesByType(EntityGameController)[0];
                for (var i = 0; i < overlays.length; i++) {
                    if (!control)
                        overlays[i].fadeOut();
                }
                var btReconnect = ig.game.getEntitiesByType(EntityButtonReconnect)[0];
                if (btReconnect) btReconnect.fadeOut();

                if (ig.game.connectInterval) {
                    clearInterval(ig.game.connectInterval);
                    ig.game.connectInterval = null;
                }
            },

            onServerDisconnect: function () {
                this.userCountText = _TEXT.Network.Offline;
                ig.game.shouldConnect = false;
                var control = ig.game.getEntityByName('HomeController');
                if (control) {
                    control.spawnButtonReconnect();
                } else {
                    control = ig.game.getEntityByName('GameController');
                    if (control && control.loadingOverlay) control.loadingOverlay.kill();
                }
                this.showNetworkError(_TEXT.Network.ServerDisconnected);
            },

            onServerMessage: function (msg) {
                if (!msg) return;
                if (!network) return;
                switch (msg.type) {
                    case network.MessageType.ERROR:
                        this.onError(msg.data);
                        break;
                    case network.MessageType.USER_CONNECTED:
                        this.onUserConnected(msg.data);
                        break;
                    case network.MessageType.USER_DISCONNECTED:
                        this.onUserDisconnected(msg.data);
                        break;
                    case network.MessageType.REQUEST_ROOM_CONFIRMED:
                        this.onRequestRoomConfirmed(msg.data);
                        break;
                    case network.MessageType.REQUEST_ROOM_REJECTED:
                        this.onRequestRoomRejected(msg.data);
                        break;
                    case network.MessageType.GAMESTATE:
                        this.onGameStateReply(msg);
                        break;
                    case network.MessageType.PLAYER_JOIN:
                        this.onPlayerJoin(msg.data);
                        break;
                    case network.MessageType.PLAYER_LEFT:
                        this.onPlayerLeft(msg.data);
                        break;
                    case network.MessageType.EMOJI:
                        this.onEmoji(msg.data);
                        break;
                    case network.MessageType.GAME_EVENT:
                        this.handleEvent(msg.data);
                        break;
                    case network.MessageType.KICKED:
                        this.handleKicked(msg.data);
                        break;
                    case network.MessageType.LEAVE_ROOM_COMPLETED:
                        this.handleLeaveRoom();
                        break;
                    case network.MessageType.SYNC_TIME:
                        this.syncTime(msg.data.pauseDuration);
                        break;
                    case network.MessageType.START_TIME:
                        var control = ig.game.getEntityByName('GameController');
                        if (control) {
                            var dt = Date.now() - msg.data;
                            control.syncTime(dt);
                        }
                        break;
                    case network.MessageType.FIX_GAMESTATE:
                        ig.global.stateUpdate = msg.data;
                        var control = ig.game.getEntityByName('GameController');
                        if (control) {
                            control.updateHorses();
                            this.sendMessage(network.MessageType.GAMESTATE_FIXED);
                        }
                        break;
                };
            },

            pingTimeForOther: function (playerId) {
                if (ig.game.botMode) return;
                this.sendMessage(network.MessageType.SYNC_TIME, {
                    playerId: playerId,
                    getTime: false
                });
            },

            pingTime: function () {
                if (ig.game.botMode) return;
                this.sendMessage(network.MessageType.SYNC_TIME, {
                    getTime: false
                });
            },

            getTime: function () {
                if (ig.game.botMode) return;
                this.sendMessage(network.MessageType.SYNC_TIME, {
                    getTime: true
                });
            },

            syncTime: function (pauseDuration) {
                var control = ig.game.getEntityByName("GameController");
                if (!control) return;
                control.syncTime(pauseDuration);
            },

            handleLeaveRoom: function () {
                var control = ig.game.getEntityByName("HomeController");
                if (!control) return;
                control.leaveRoomCompleted();
            },

            handleKicked: function (isCheated) {
                var control = ig.game.getEntityByName("GameController");
                if (!control) return;
                control.kickedOut(isCheated);
            },

            handleEvent: function (msg) {
                var control;
                if (msg.event == network.Events.GAME_START) {
                    ig.global.gameState = msg.data;
                    ig.global.firstPlayerId = msg.firstPlayerId;
                    ig.global.colorID = msg.colorID;
                    ig.global.gameStarted = true;
                    control = ig.game.getEntityByName("HomeController");
                    if (control) control.startGame();
                    return;
                }

                if (ig.game.isHidden || (ig.game.requestingState && msg.event != network.Events.GAME_END && msg.event != network.Events.PLAYER_COMPLETE)) return;

                control = ig.game.getEntityByName("GameController");
                if (!control || control.stopUpdating) return;

                switch (msg.event) {
                    case network.Events.DICE_ROLLING:
                        control.diceRolling();
                        break;
                    case network.Events.NEXT_TURN:
                        control.nextPlayer(msg.data);
                        break;
                    case network.Events.HORSE_MOVE:
                        control.horseMove(msg.data.horseId);
                        break;
                    case network.Events.RANDOM_VALUE:
                        control.dice.setValue(msg.data);
                        break;
                    case network.Events.PLAYER_CHEATED:
                        control.kickCheatedPlayer(msg.data);
                        break;
                    case network.Events.RANDOM_HORSE:
                        control.randomMove();
                        break;
                    case network.Events.GAME_END:
                        control.handleGameEnd(msg.data);
                        break;
                    case network.Events.PLAYER_COMPLETE:
                        control.handleGameEnd(msg.data);
                        break;
                }
            },

            emitEvent: function (event, data) {
                if (ig.game.botMode) {
                    return;
                }
                var dt = {
                    "event": event
                }
                if (event == network.Events.DICE_ROLLING) {
                    dt.isBot = ig.game.botMode;
                }

                if (typeof data != 'undefined') {
                    dt.data = data;
                }
                this.sendMessage(network.MessageType.GAME_EVENT, dt);
            },

            onError: function (data) {
                var error = '';
                switch (data) {
                    case network.Errors.UNKNOWN:
                        error = 'Server Error: UNKNOWN';
                        break;
                    case network.Errors.INVALID_REQUEST:
                        error = 'Server Error: INVALID_REQUEST';
                        break;
                    case network.Errors.VERSION_MISMATCH:
                        error = 'Server Error: VERSION_MISMATCH';
                        break;
                    case network.Errors.INVALID_NAME:
                        error = 'Server Error: INVALID_NAME';
                        break;
                    case network.Errors.KICKED_DUE_TO_INACTIVITY:
                        error = 'Server Error: KICKED_DUE_TO_INACTIVITY';
                        break;
                }
                this.showNetworkError(error);
            },

            onUserConnected: function (data) {
                var endPart = (data < 2) ? _TEXT.Network.UserOnline : _TEXT.Network.UsersOnline;
                this.userCountText = data + endPart;
                // console.log('user connected');
            },

            onUserDisconnected: function (data) {
                var endPart = (data < 2) ? _TEXT.Network.UserOnline : _TEXT.Network.UsersOnline;
                this.userCountText = data + endPart;
                // console.log('user disconnected');
            },

            onRequestRoomConfirmed: function (data) {
                this.roomId = data.roomId;
                this.playerId = data.playerId;

                var latency = Math.floor(data.latency / 2);
                this.network_client.recalculateTimeDiff(latency, data.joinTimeServer);

                var control = ig.game.getEntityByName("HomeController");
                if (control) control.requestRoomConfirmed(data);
            },

            onRequestRoomRejected: function (data) {
                // console.log('request room rejected');
                this.roomId = null;
                this.playerId = null;

                var control = ig.game.getEntityByName("HomeController");
                if (control) control.requestRoomRejected();
                this.onError(data);
            },

            onGameStateReply: function (msg) {
                ig.global.stateUpdate = msg.data;
                // handle in-game update gamestate
                var control = ig.game.getEntityByName("GameController");
                if (control) {
                    if (msg.updateHorse) {
                        control.updateHorses();
                        if (msg.clearOverlay) {
                            if (control.loadingOverlay != null) {
                                control.loadingOverlay.fadeOut();
                            }
                        }
                    } else control.updateGameState(msg);
                }
            },

            onPlayerJoin: function (data) {
                // console.log('a player joins, total players: ' + data.gameState.length);
                this.numOfPlayers = data.gameState.length;
            },

            onPlayerLeft: function (data) {
                // console.log('a player left');
                this.numOfPlayers = data.gameState.length;
                var control = ig.game.getEntityByName("GameController");
                if (!control) return;
                var playerId = data.playerId,
                    players = ig.global.gameState,
                    playerName;
                for (var i = 0; i < players.length; i++) {
                    if (players[i].playerId == playerId) {
                        playerName = players[i].name;
                        break;
                    }
                }
                control.removePlayer(playerId);

                var msg = playerName + _TEXT.Network.Left;
                ig.global.gameState = data.gameState;
                if (data.gameState.length > 1) {
                    // this.showNetworkAlert(msg);
                    // control.updateGameState(data.gameState);
                } else {
                    this.showNetworkError(msg);
                    control.gameEnd = true;
                }
            },

            onEmoji: function (data) {
                // console.log(data);
                if(ig.game.control) {
                    ig.game.control.handleEmoji(data);
                }
            },

            /*FUNCTIONS*/
            requestGameState: function () {
                if (!this.network_client || !this.network_client.socket) {
                    return false;
                }

                this.sendMessage(network.MessageType.REQUEST_GAMESTATE);
                return true;
            },

            leaveGame: function () {
                if (!this.network_client || !this.network_client.socket || this.roomId == null) {
                    return false;
                }

                this.sendMessage(network.MessageType.LEAVE_ROOM);
                // console.log('leave room')

                this.roomId = null;
                this.playerId = null;
                this.queuedEvents = [];
                return true;
            },

            requestGame: function (requestInfo) {
                if (!this.network_client || !this.network_client.socket) {
                    return false;
                }
                this.clientRequestGameTime = Date.now();
                this.queuedEvents = [];
                ig.global.gameStarted = false;
                ig.global.gameState = null;
                ig.global.stateUpdate = null;
                requestInfo.clientVersion = this.clientVersion;

                var msg = network.MessageType.REQUEST_ROOM;
                if(ig.game.privateMode) {
                    msg = network.MessageType.REQUEST_PRIVATE_ROOM;
                    requestInfo.pw = ig.game.pwInput.val().trim();
                    requestInfo.pw = requestInfo.pw.toLowerCase();
                }
                this.sendMessage(msg, requestInfo);
                return true;
            },

            cancelRequestGame: function () {
                if (!this.network_client || !this.network_client.socket) return false;
                this.sendMessage(network.MessageType.LEAVE_ROOM);
                return true;
            },

            /*HELPERS*/
            showNetworkError: function (error) {
                // close other overlays
                var overlays = ig.game.getEntitiesByType(EntityNetworkOverlay);
                for (var i = 0; i < overlays.length; i++) {
                    overlays[i].dispose();
                }
                // spawn error overlay
                ig.game.spawnEntity(EntityNetworkError, 0, 0, {
                    text: error
                });
            },
            showNetworkAlert: function (msg, width) {
                if (ig.game.requestingState) return;
                // close other overlays
                var overlays = ig.game.getEntitiesByType(EntityNetworkOverlay);
                for (var i = 0; i < overlays.length; i++) {
                    overlays[i].dispose();
                }
                var settings = {
                    text: msg
                }
                if (width) settings.width = width;
                ig.game.spawnEntity(EntityNetworkAlert, 0, 0, settings);
            },

            kickPlayer: function (serverId) {
                this.sendMessage(network.MessageType.KICK_PLAYER, {
                    playerId: serverId
                });
            }
        });
    });