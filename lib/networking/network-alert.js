ig.module('networking.network-alert')
    .requires(
        'networking.network-overlay', 'game.entities.buttons.button-home'
    )
    .defines(function () {
        EntityNetworkAlert = EntityNetworkOverlay.extend({
            text: 'Alert',

            init: function (x, y, settings) {
                this.parent(x, y, settings);
                this.btClose = this.spawnEntity(EntityButtonClose, ig.game.screen.x + ig.game.centerX, this.border.y + this.border.h + 20, {
                    alpha: 0
                });
                this.btClose.fadeIn();
                ig.game.sortEntitiesDeferred();

                this.homeController = ig.game.getEntityByName('HomeController');
                if (this.homeController != null) {
                    ig.game.nameInput.hide();
                    if (this.homeController.btMoregames) this.homeController.btMoregames.hide();
                }
            },

            kill: function () {
                if (this.homeController != null) {
                    ig.game.nameInput.show();
                    if (this.homeController.btMoregames) this.homeController.btMoregames.show();
                }
                this.parent();
            }
        });

    });