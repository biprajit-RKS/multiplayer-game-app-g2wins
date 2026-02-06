ig.module('networking.network-overlay')
    .requires(
        'impact.entity'
    )
    .defines(function () {
        EntityNetworkOverlay = ig.Entity.extend({
            alpha: 0,
            zIndex: 3000,
            text: _TEXT.Network.Connecting,
            fontSize: 20,
            lineHeight: 30,
            padding: 20,
            width: 380,

            init: function (x, y, settings) {
                this.parent(x, y, settings);
                this.savedLayer = ig.game.currentLayer;
                ig.game.currentLayer = ig.game.layers.OVERLAY;
                this.pos.x = ig.game.screen.x;
                this.pos.y = ig.game.screen.y;
                this.size.x = ig.system.width;
                this.size.y = ig.system.height;

                this.border = {};
                this.border.r = 5;
                this.border.w = this.width;
                this.border.x = ig.game.centerX - this.border.w / 2;
                if (ig.game.isMobile) this.fontSize = 20;

                this.font = this.fontSize + "px text";
                this.texts = ig.game.wrapText2(this.text, this.border.w - 2 * this.padding, this.font);
                var len = this.texts.length;
                this.border.h = len * this.lineHeight + 2 * this.padding;
                if (this.border.h < 110) {
                    this.border.h = 110;
                }
                this.border.y = ig.game.centerY - this.border.h / 2;
                this.textY0 = this.border.y + (this.border.h - len * this.lineHeight) * 0.5 + this.lineHeight - this.fontSize / 2;

                this.textX = ig.game.centerX + 2;

                this.fadeIn();
            },

            draw: function () {
                ig.system.context.fillStyle = "rgba(0,0,0," + this.alpha + ")";
                ig.system.context.fillRect(0, 0, ig.system.width, ig.system.height);

                ig.system.context.fillStyle = "#125024";
                ig.game.setStrokeStyle('#FFF', 4);
                ig.game.roundRect(this.border.x, this.border.y, this.border.w, this.border.h, this.border.r);

                ig.game.setTextStyle(this.font, "#FFF", "center");
                ig.game.drawTextMultiLines(this.texts, this.textX, this.textY0, this.lineHeight);
            },

            fadeIn: function () {
                this.tween({
                    alpha: 0.5
                }, 0.2).start();
                var overlay = $('#overlay');
                if (overlay) overlay.fadeIn(0.2);
            },

            fadeOut: function () {
                this.stopTweens();
                this.tween({
                    alpha: 0
                }, 0.2, {
                    onComplete: function () {
                        ig.game.currentLayer = this.savedLayer;
                        this.callback();
                        this.kill();
                    }.bind(this)
                }).start();
                var overlay = $('#overlay');
                if (overlay) overlay.fadeOut(0.2);
            },

            callback: function () {},

            dispose: function () {
                ig.game.currentLayer = this.savedLayer;
                this.kill();
            }
        });

    });