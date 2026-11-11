import {DrawingUtils} from "../utils/DrawingUtils.js";
import settingsSync from "../utils/SettingsSync.js";
import {displayChestName} from "../data/ChineseNames.js";

export class ChestsDrawing extends DrawingUtils {
    interpolate(chests, lpX, lpY, t) {
        for (const chestOne of chests) {
            this.interpolateEntity(chestOne, lpX, lpY, t);
        }
    }

    invalidate(ctx, chests) {
        for (const chestOne of chests) {
            const point = this.transformPoint(chestOne.hX, chestOne.hY);

            let drewIcon = false;
            if (settingsSync.getBool("settingChestsGreen") && ["standard", "green"].some(sub => chestOne.chestName.toLowerCase().includes(sub))) {
                this.DrawCustomImage(ctx, point.x, point.y, "green", "Resources", 35);
                drewIcon = true;
            } else if (settingsSync.getBool("settingChestsBlue") && ["uncommon", "blue"].some(sub => chestOne.chestName.toLowerCase().includes(sub))) {
                this.DrawCustomImage(ctx, point.x, point.y, "blue", "Resources", 35);
                drewIcon = true;
            } else if (settingsSync.getBool("settingChestsPurple") && ["rare", "purple"].some(sub => chestOne.chestName.toLowerCase().includes(sub))) {
                this.DrawCustomImage(ctx, point.x, point.y, "rare", "Resources", 35);
                drewIcon = true;
            } else if (settingsSync.getBool("settingChestsYellow") && ["legendary", "yellow"].some(sub => chestOne.chestName.toLowerCase().includes(sub))) {
                this.DrawCustomImage(ctx, point.x, point.y, "legendary", "Resources", 35);
                drewIcon = true;
            }

            // Rarity matching still uses the original chest id. A caption is the
            // official Chinese item name only, never the technical id.
            if (drewIcon) {
                const label = displayChestName(chestOne.chestName);
                if (label) this.drawText(point.x, point.y + this.getMarkerSize(24), label, ctx);
            }
        }
    }
}