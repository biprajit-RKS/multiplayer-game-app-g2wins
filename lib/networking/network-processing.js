ig.module('networking.network-processing')
    .requires(
        'networking.network-overlay', 'networking.button-close'
    )
    .defines(function () {
        EntityNetworkProcessing = EntityNetworkOverlay.extend({
            text: 'Processing...',
            controller: null,
            showPlayersNum: false,
            hasCloseBtn: true,

            init: function (x, y, settings) {
                this.parent(x, y, settings);
                if (this.hasCloseBtn) {
                    this.btClose = this.spawnEntity(EntityButtonClose, ig.game.screen.x + ig.game.centerX, this.border.y + this.border.h + 20000, {
                        alpha: 0
                    });
                    this.btClose.fadeIn();
                    

                }
                ig.game.sortEntitiesDeferred();

                var n = 4;
                var s0 = this.etc = '... ';
                this.interval = setInterval(function () {
                    this.etc = (s0.slice(0, -n));
                    --n;
                    if (n < 1) n = 4;
                }.bind(this), 350);

                ig.system.context.font = this.font;
                var w = ig.system.context.measureText(this.texts[0]).width;
                this.etcX = ig.game.centerX + w / 2;

                // this.drawCountDown = false;
                // if (this.controller != null) {
                //     this.drawCountDown = true;
                //     this.textX -= 17;
                //     this.etcX -= 17;
                //     this.countDown = new ig.Timer(20);
                //     this.enterBotMode = false;
                // }

                if (this.showPlayersNum) {
                    this.textY0 -= this.lineHeight / 2;
                    
                    // Increase box height for private games to fit room code
                    if (ig.game.privateMode && ig.game.gameInitData && ig.game.gameInitData.roomNumber) {
                        this.border.h += 40; // Add extra height for room code
                        this.border.y = ig.game.centerY - this.border.h / 2.5; // Re-center
                    }
                }
            },

            draw: function () {
                this.parent();
                ig.system.context.textAlign = 'left';
                ig.game.drawText(this.etc, this.etcX, this.textY0);
                // if (this.drawCountDown) {
                //     var countDown = -Math.floor(this.countDown.delta());
                //     if (countDown < 0) {
                //         this.drawCountDown = false;
                //         ig.game.gameClient.leaveGame();
                //     } else
                //         ig.game.drawText(countDown, this.etcX + 17, this.textY0);
                // }
                if (this.showPlayersNum) {
                    ig.system.context.textAlign = 'center';
                    ig.game.drawText('(' + ig.game.gameClient.numOfPlayers + ' / ' + ig.game.roomSize + _TEXT.Network.Players + ')', ig.game.centerX, this.textY0 + this.lineHeight + 3);
                    
                    // Show room code for private games
                    if (ig.game.privateMode && ig.game.gameInitData && ig.game.gameInitData.roomNumber) {
                        ig.system.context.font = '24px text';
                        ig.game.drawText('Room Code: ' + ig.game.gameInitData.roomNumber, ig.game.centerX, this.textY0 + this.lineHeight * 2 + 10);
                        ig.system.context.font = this.font;
                    }
                }
            },

            // update: function () {
            //     this.parent();
            //     if (this.enterBotMode && this.countDown.delta() > 0) {
            //         this.enterBotMode = false;
            //         this.controller.playWithBot();
            //     }
            // },

            // enteringBotMode: function () {
            //     this.changeText(_TEXT.Network.EnteringBotMode);
            //     this.enterBotMode = true;
            //     this.countDown.set(1.5);
            // },

            changeText: function (txt) {
                this.texts[0] = txt;
                ig.system.context.font = this.font;
                var w = ig.system.context.measureText(this.texts[0]).width;
                this.etcX = ig.game.centerX + w / 2 - 16;
            },

            kill: function () {
                clearInterval(this.interval);
                this.parent();
            }
        });

    });