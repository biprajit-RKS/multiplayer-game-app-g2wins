var network = {};

network.MessageType = {
    /*COMMON*/
    ERROR: 0,
    PLAYER_UPDATE: 51,
    GAME_EVENT: 52,
    SYNC_TIME: 53,
    START_TIME: 54,
    EMOJI: 55,
    /*SERVER*/
    USER_CONNECTED: 1,
    USER_DISCONNECTED: 2,
    PLAYER_JOIN: 3,
    PLAYER_LEFT: 4,
    REQUEST_ROOM_CONFIRMED: 5,
    REQUEST_ROOM_REJECTED: 6,
    GAMESTATE: 7,
    KICKED: 8,
    LEAVE_ROOM_COMPLETED: 9,
    FIX_GAMESTATE: 10,
    /*CLIENT*/
    REQUEST_ROOM: 20,
    REQUEST_GAMESTATE: 21,
    LEAVE_ROOM: 22,
    KICK_PLAYER: 23,
    GAMESTATE_FIXED: 24,
    REQUEST_PRIVATE_ROOM: 25
};


network.Errors = {
    UNKNOWN: 0,
    INVALID_REQUEST: 1,
    VERSION_MISMATCH: 2,
    INVALID_NAME: 3,
    KICKED_DUE_TO_INACTIVITY: 4,
};

network.Events = {
    GAME_START: 0,
    DICE_ROLLING: 1,
    RANDOM_VALUE: 2,
    NEXT_TURN: 3,
    HORSE_MOVE: 4,
    CHECK_AUTO: 5,
    INACTIVE: 6,
    ACTIVE: 7,
    PLAYER_CHEATED: 8,
    CHECK_DICE: 9,
    UPDATE_HORSE: 10,
    RANDOM_HORSE: 11,
    GAME_END: 12,
    PLAYER_COMPLETE: 13
    // ,CLEAR_LAST_EVENT: 14
};

if (typeof module !== "undefined") {
    module.exports.network = network;
}