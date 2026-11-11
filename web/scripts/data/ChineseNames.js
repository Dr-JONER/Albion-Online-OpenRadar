/**
 * Official ZH-CN names from names.zh-CN.min.json.
 * A missing row, a blank row, or a table that never loaded returns the English
 * string the caller already displayed. This module does not translate anything.
 */

import {CATEGORIES} from '../constants/LoggerConstants.js';

// Radar family words already used as cluster labels, mapped to the catalog
// uniqueName suffix stored in the items table. The Chinese text still comes
// from that table.
const RESOURCE_ITEM_SUFFIX = {
    Fiber: 'FIBER',
    Hide: 'HIDE',
    Wood: 'WOOD',
    Log: 'WOOD',
    Logs: 'WOOD',
    Ore: 'ORE',
    Rock: 'ROCK',
};

const FACTION_ZONE_IDS = [null, '3004', '1000', '2000', '4000', '0000', '3003'];

function dictionary(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value;
}

function fallbackText(english) {
    return typeof english === 'string' ? english : '';
}

function activeNames() {
    const names = window.chineseNames;
    return names?.isLoaded ? names : null;
}

export class ChineseNames {
    constructor() {
        this.mobs = null;
        this.items = null;
        this.zones = null;
        this.isLoaded = false;
    }

    /**
     * @param {string} jsonPath
     */
    async load(jsonPath) {
        window.logger?.info(CATEGORIES.SYSTEM, 'ChineseNamesLoading', {path: jsonPath});

        const response = await fetch(jsonPath, {cache: 'no-cache'});
        if (!response.ok) {
            throw new Error(`Failed to fetch names.zh-CN.min.json: ${response.status}`);
        }

        const data = await response.json();
        const mobs = dictionary(data?.mobs);
        const items = dictionary(data?.items);
        const zones = dictionary(data?.zones);
        if (!mobs || !items || !zones) {
            throw new Error('Invalid names.zh-CN.min.json structure');
        }

        this.mobs = mobs;
        this.items = items;
        this.zones = zones;
        this.isLoaded = true;

        window.logger?.info(CATEGORIES.SYSTEM, 'ChineseNamesLoaded', {
            mobs: Object.keys(mobs).length,
            items: Object.keys(items).length,
            zones: Object.keys(zones).length,
        });
    }

    /**
     * Official ZH-CN for a key, or null when the table has no usable string.
     * @param {Record<string, string>|null} table
     * @param {string|number|null|undefined} key
     * @returns {string|null}
     */
    find(table, key) {
        if (!this.isLoaded || key === null || key === undefined || key === '') return null;
        const value = table?.[String(key)];
        if (typeof value !== 'string' || value.trim() === '') return null;
        return value;
    }

    mob(key, english) {
        return this.find(this.mobs, key) ?? fallbackText(english);
    }

    item(key, english) {
        return this.find(this.items, key) ?? fallbackText(english);
    }

    zone(key, english) {
        if (key === null || key === undefined || key === '' || key === -1) return fallbackText(english);
        return this.find(this.zones, String(key)) ?? fallbackText(english);
    }
}

export function displayMobName(namelocatag, englishName) {
    const names = activeNames();
    if (!names) return fallbackText(englishName);
    return names.mob(namelocatag, englishName);
}

export function displayItemName(uniqueName, englishName) {
    const names = activeNames();
    const english = fallbackText(englishName);
    if (!names) return english || fallbackText(uniqueName);

    const full = names.find(names.items, uniqueName);
    if (full) return full;

    if (typeof uniqueName === 'string') {
        const at = uniqueName.lastIndexOf('@');
        if (at > 0) {
            const base = names.find(names.items, uniqueName.slice(0, at));
            if (base) return base;
        }
    }

    return english || fallbackText(uniqueName);
}

export function displayZoneName(zoneId, englishName) {
    const names = activeNames();
    if (!names) return fallbackText(englishName);
    return names.zone(zoneId, englishName);
}

export function displayFactionCityName(faction, englishName) {
    const zoneId = FACTION_ZONE_IDS[faction];
    if (!zoneId) return fallbackText(englishName);
    return displayZoneName(zoneId, englishName);
}

/**
 * Resource cluster label. The family word stays the English fallback when the
 * catalog uniqueName for that tier (and enchant, when every node shares one)
 * has no ZH-CN row.
 */
export function displayResourceName(typeName, tier, enchant = 0) {
    const english = fallbackText(typeName);
    const names = activeNames();
    const suffix = RESOURCE_ITEM_SUFFIX[english];
    const tierNum = Number(tier);
    if (!names || !suffix || !Number.isInteger(tierNum) || tierNum <= 0) return english;

    const enchantNum = Number(enchant);
    if (Number.isInteger(enchantNum) && enchantNum > 0) {
        const enchanted = names.find(names.items, `T${tierNum}_${suffix}_LEVEL${enchantNum}@${enchantNum}`);
        if (enchanted) return enchanted;
    }
    return names.find(names.items, `T${tierNum}_${suffix}`) ?? english;
}

/**
 * Official item name for a chest id. Null means the table has no ZH-CN row,
 * so the caller keeps the original icon-only display instead of painting the
 * technical id.
 * @param {string} chestName
 * @returns {string|null}
 */
export function displayChestName(chestName) {
    const names = activeNames();
    if (!names || typeof chestName !== 'string' || chestName === '') return null;
    return names.find(names.items, chestName);
}
