ig.module('networking.network-error')
    .requires(
        'networking.network-overlay', 'game.entities.buttons.button-home', 'networking.button-close'
    )
    .defines(function () {
        EntityNetworkError = EntityNetworkOverlay.extend({
            text: 'ERROR',

            init: function (x, y, settings) {
                this.parent(x, y, settings);
                var bt;
                this.homeController = ig.game.getEntityByName('HomeController');
                if (this.homeController != null) {
                    ig.game.nameInput.hide();
                    if(this.homeController.btMoregames) this.homeController.btMoregames.hide();
                    bt = this.spawnEntity(EntityButtonClose, ig.game.screen.x + ig.game.centerX, this.border.y + this.border.h + 20, {
                        alpha: 0
                    });
                } else if(ig.game.botMode){
                    bt = this.spawnEntity(EntityButtonClose, ig.game.screen.x + ig.game.centerX, this.border.y + this.border.h + 20, {
                        alpha: 0
                    });
                } else {
                    bt = this.spawnEntity(EntityButtonHome, ig.game.screen.x + ig.game.centerX, this.border.y + this.border.h + 20, {
                        alpha: 0
                    });
                }
                ig.game.sortEntitiesDeferred();
                bt.fadeIn();
            },

            callback: function () {
                if (this.homeController != null) {
                    ig.game.nameInput.show();
                    if(this.homeController.btMoregames) this.homeController.btMoregames.show();
                }
            }
        });

    });