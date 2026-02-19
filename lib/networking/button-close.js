ig.module('networking.button-close')
    .requires(
        'game.entities.buttons.button-2-images'
    )
    .defines(function () {
        EntityButtonClose = EntityButton2Images.extend({
            image: new ig.Image('media/graphics/sprites/ui/buttons/close.png'),
            imagePressed: new ig.Image('media/graphics/sprites/ui/buttons/close-pressed.png'),

            callback: function () {
                // Close button disabled for waiting screen
                return;
            }
        });
    });