ig.module('networking.button-chat')
    .requires(
        'game.entities.buttons.button-2-images'
    )
    .defines(function () {
        EntityButtonChat = EntityButton2Images.extend({
            image: new ig.Image('media/graphics/sprites/ui/buttons/chat.png'),
            imagePressed: new ig.Image('media/graphics/sprites/ui/buttons/chat-pressed.png'),
            newMsg: new ig.Image('media/graphics/sprites/ui/new-chat.png'),

            init: function (x, y, settings) {
                this.parent(x, y, settings);
                ig.global.btChat = this;
                this.msgX = this.pos.x + this.size.x - this.newMsg.width + 4;
                this.msgY = this.pos.y - 4;
                this.msgCountX = this.msgX + this.newMsg.width / 2;
                this.msgCountY = this.msgY + this.newMsg.height / 2 + 5;
            },

            callback: function () {
                var chatContent = $('ul#chatContent');
                chatContent.scrollTop(chatContent[0].scrollHeight);
                $("#chatContainer").fadeIn();
                this.fadeOut();
                ig.game.gameClient.newMessage = 0;
                $("#inputMessage").focus();
            },

            draw: function () {
                if (this.isShown) {
                    var ctx = ig.system.context;
                    ctx.save();
                    ctx.globalAlpha = this.alpha;
                    this.currentAnim.draw(ig.system.getDrawPos(this.pos.x.round() - ig.game.screen.x), ig.system.getDrawPos(this.pos.y.round() - ig.game.screen.y + this.dy));
                    if (ig.game.gameClient.newMessage > 0) {
                        this.newMsg.draw(this.msgX, this.msgY);
                        ig.game.setTextStyle('14px text', '#FFF', 'center');
                        ig.game.drawText(ig.game.gameClient.newMessage, this.msgCountX, this.msgCountY);
                    }
                    ctx.restore();
                }
            }
        });
    });