import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterEach, describe, expect, test} from 'vitest';
import {loadRealItemsDatabase} from '../__fixtures__/realDatabases.js';
import {
    ChineseNames,
    displayChestName,
    displayItemName,
    displayMobName,
    displayResourceName,
    displayZoneName,
} from './ChineseNames.js';
import zonesDatabase from './ZonesDatabase.js';
import settingsSync from '../utils/SettingsSync.js';

const here = dirname(fileURLToPath(import.meta.url));
const dumps = join(here, '..', '..', 'ao-bin-dumps');
const official = JSON.parse(readFileSync(join(dumps, 'names.zh-CN.min.json'), 'utf8'));

function jsonResponse(body, ok = true) {
    return {ok, status: ok ? 200 : 404, json: async () => body};
}

async function loadTable(body) {
    const previous = globalThis.fetch;
    globalThis.fetch = async () => jsonResponse(body);
    try {
        const names = new ChineseNames();
        await names.load('/ao-bin-dumps/names.zh-CN.min.json');
        return names;
    } finally {
        globalThis.fetch = previous;
    }
}

function recordingContext() {
    const texts = [];
    const ctx = {
        canvas: {width: 500, height: 500},
        texts,
        measureText: () => ({width: 12}),
        createLinearGradient: () => ({addColorStop() {}}),
        fillText: text => texts.push(String(text)),
    };
    return new Proxy(ctx, {
        get(target, prop) {
            if (prop in target) return target[prop];
            return () => {};
        },
        set(target, prop, value) {
            target[prop] = value;
            return true;
        },
    });
}

describe('ChineseNames lookup', () => {
    test('returns the official Chinese string when the key is in the table', async () => {
        const names = await loadTable({
            mobs: {'@MOB_KEEPER': '卫士'},
            items: {'T4_BAG': '老手级背包', 'T4_BAG@1': '老手级背包'},
            zones: {'FishyBusiness-SOLO': '有猫腻'},
        });

        expect(names.mob('@MOB_KEEPER', 'Keeper')).toBe('卫士');
        expect(names.item('T4_BAG@1', 'T4_BAG')).toBe('老手级背包');
        expect(names.zone('FishyBusiness-SOLO', 'Fishy Business')).toBe('有猫腻');
    });

    test('returns the English fallback when the key is not in the table', async () => {
        const names = await loadTable({
            mobs: {'@MOB_KEEPER': '卫士'},
            items: {},
            zones: {},
        });

        expect(names.mob('@MOB_MISSING', 'Boaris')).toBe('Boaris');
        expect(names.item('QUESTITEM_TUTORIAL_HERETIC_PLANS', 'QUESTITEM_TUTORIAL_HERETIC_PLANS')).toBe('QUESTITEM_TUTORIAL_HERETIC_PLANS');
        expect(names.zone('0317', 'Widemoor Delta')).toBe('Widemoor Delta');
        expect(names.mob('@MOB_MISSING', '')).toBe('');
        expect(names.mob('@MOB_MISSING', '')).not.toBe('@MOB_MISSING');
    });

    test('returns the English fallback when the official string is blank', async () => {
        const names = await loadTable({
            mobs: {'@MOB_KEEPER': '   '},
            items: {'T4_BAG': ''},
            zones: {'1000': ' '},
        });

        expect(names.mob('@MOB_KEEPER', 'Keeper')).toBe('Keeper');
        expect(names.item('T4_BAG', 'T4_BAG')).toBe('T4_BAG');
        expect(names.zone('1000', 'Lymhurst')).toBe('Lymhurst');
    });

    test('returns the English fallback when the table has not been loaded', () => {
        const names = new ChineseNames();

        expect(names.isLoaded).toBe(false);
        expect(names.mob('@MOB_KEEPER', 'Keeper')).toBe('Keeper');
        expect(names.item('T4_BAG', 'T4_BAG')).toBe('T4_BAG');
        expect(names.zone('4000', 'Fort Sterling')).toBe('Fort Sterling');
        expect(displayMobName('@MOB_KEEPER', 'Keeper')).toBe('Keeper');
        expect(displayItemName('T4_BAG', 'T4_BAG')).toBe('T4_BAG');
        expect(displayZoneName('4000', 'Fort Sterling')).toBe('Fort Sterling');
        expect(displayResourceName('Fiber', 4, 0)).toBe('Fiber');
        expect(displayChestName('T4_SKILLBOOK_STANDARD')).toBeNull();
    });
});

describe('display layer official ZH-CN names', () => {
    afterEach(() => {
        delete window.chineseNames;
        delete window.localizationDatabase;
        delete window.itemsDatabase;
        delete window.settingsSync;
        settingsSync.setBool('settingDebugEnemiesName', false);
        settingsSync.setBool('settingEnemiesNormal', false);
        zonesDatabase.zones = {};
        zonesDatabase.loaded = false;
    });

    test('mobs, items, chests, resources and maps show official Chinese or the original English', async () => {
        window.logger = {debug() {}, info() {}, warn() {}, error() {}};
        window.chineseNames = await loadTable(official);
        window.itemsDatabase = loadRealItemsDatabase();
        window.settingsSync = settingsSync;
        zonesDatabase.zones = JSON.parse(readFileSync(join(dumps, 'zones.json'), 'utf8'));
        zonesDatabase.loaded = true;
        settingsSync.setBool('settingDebugEnemiesName', true);
        settingsSync.setBool('settingEnemiesNormal', true);

        const {MobsDrawing} = await import('../drawings/MobsDrawing.js');
        const {EnemyType} = await import('../handlers/MobsHandler.js');
        const {ChestsDrawing} = await import('../drawings/ChestsDrawing.js');
        const {DrawingUtils} = await import('../utils/DrawingUtils.js');
        const {RadarRenderer} = await import('../utils/RadarRenderer.js');
        const {PlayersHandler} = await import('../handlers/PlayersHandler.js');
        const playerList = await import('../core/PlayerListRenderer.js');

        const drawn = namelocatag => {
            const ctx = recordingContext();
            const drawing = new MobsDrawing();
            drawing.invalidate(ctx, [{
                id: 1,
                hX: 10,
                hY: 20,
                tier: 5,
                enchantmentLevel: 0,
                identified: true,
                type: EnemyType.Enemy,
                name: 'T5_MOB_SAMPLE',
                namelocatag,
                getCurrentHP: () => 100,
                maxHealth: 100,
            }]);
            return ctx.texts;
        };

        const mobSamples = [
            '@MOB_T7_MOB_UNDEAD_SKELETON_ELITE',
            '@MOB_HERETIC_MORTAR_STANDARD',
            '@MOB_UNDEAD_ARCHER_VETERAN',
        ];
        const mobLines = mobSamples.map(tag => {
            const texts = drawn(tag);
            expect(texts).toContain(official.mobs[tag]);
            expect(texts.some(text => text.includes(tag))).toBe(false);
            return `mob ${tag} => ${texts.find(text => text === official.mobs[tag])}`;
        });

        window.localizationDatabase = {
            getText: tag => tag === '@MOB_T4_MOB_CITY_FOREST_BOSS_DIREBOAR' ? 'Boaris' : null,
        };
        const missingMob = drawn('@MOB_T4_MOB_CITY_FOREST_BOSS_DIREBOAR');
        expect(missingMob).toContain('Boaris');
        expect(missingMob.some(text => text.includes('@MOB_'))).toBe(false);

        const handler = new PlayersHandler();
        handler.handleNewPlayerEvent(7, {
            1: 'Spot',
            8: '',
            53: 0,
            51: null,
            40: [4134, 4284, 2888, 211],
            43: [],
        });
        handler.handleNewPlayerEvent(8, {1: 'Sterling', 8: '', 53: 4, 51: null, 40: [], 43: []});
        document.body.innerHTML = '<div id="playersList">'
            + '<div id="playersPassive"><div id="passiveList"></div></div>'
            + '<div id="playersFaction"><div id="factionList"></div></div>'
            + '<div id="playersHostile"><div id="hostileList"></div></div>'
            + '</div>';
        playerList.reset();
        playerList.update(handler);
        await new Promise(resolve => requestAnimationFrame(resolve));

        const titles = [...document.querySelectorAll('#passiveList [title]')].map(el => el.title);
        const itemSamples = [
            [4134, 'T4_HEAD_LEATHER_SET2@1', 'T4_HEAD_LEATHER_SET2'],
            [4284, 'T4_HEAD_LEATHER_MORGANA@1', 'T4_HEAD_LEATHER_MORGANA'],
            [2888, 'T4_BAG', 'T4_BAG'],
        ];
        const itemLines = itemSamples.map(([id, uniqueName, iconName]) => {
            const zh = official.items[uniqueName];
            expect(titles.some(title => title.includes(zh))).toBe(true);
            expect(document.body.innerHTML).toContain(`/images/Items/${iconName}.webp`);
            expect(window.itemsDatabase.getItemById(id).name).toBe(uniqueName);
            return `item ${uniqueName} => ${zh}`;
        });
        const missingTitle = titles.find(title => title.includes('QUESTITEM_TUTORIAL_HERETIC_PLANS'));
        expect(missingTitle).toBeTruthy();
        expect(window.itemsDatabase.getItemById(211).name).toBe('QUESTITEM_TUTORIAL_HERETIC_PLANS');

        const factionText = document.querySelector('#factionList')?.textContent ?? '';
        expect(factionText).toContain(official.zones['4000']);
        expect(zonesDatabase.getZone('4000').name).toBe('Fort Sterling');

        const zoneLines = [];
        const renderer = new RadarRenderer({handlers: {}, drawings: {}, drawingUtils: new DrawingUtils()});
        for (const id of ['FishyBusiness-SOLO', '4000', '0317']) {
            const ctx = recordingContext();
            renderer.setMap({id});
            renderer.renderZoneInfo(ctx);
            const english = zonesDatabase.getZone(id).name;
            const zh = official.zones[id];
            const line = ctx.texts.find(text => text.includes(zh || english));
            expect(line).toBeTruthy();
            if (zh) {
                expect(line).toContain(zh);
                if (zh !== english) expect(line).not.toContain(english);
            } else {
                expect(line).toContain(english);
            }
            zoneLines.push(`zone ${id} => ${line}`);
        }

        const clusterCtx = recordingContext();
        new DrawingUtils().drawClusterInfoBox(clusterCtx, {
            count: 2,
            type: 'Fiber',
            tier: 4,
            x: 10,
            y: 10,
            resources: [
                {hX: 1, hY: 1, size: 2, tier: 4, charges: 1},
                {hX: 2, hY: 2, size: 2, tier: 4, charges: 1},
            ],
        });
        const resourceLine = clusterCtx.texts.find(text => text.includes(official.items['T4_FIBER_LEVEL1@1']));
        expect(resourceLine).toBeTruthy();
        expect(resourceLine).not.toContain('Fiber');

        const chestCtx = recordingContext();
        new ChestsDrawing().invalidate(chestCtx, [
            {hX: 4, hY: 5, chestName: 'T4_SKILLBOOK_STANDARD'},
            {hX: 6, hY: 7, chestName: 'TREASURE_STANDARD_01'},
        ]);
        expect(chestCtx.texts).toContain(official.items.T4_SKILLBOOK_STANDARD);
        expect(chestCtx.texts.some(text => text.includes('TREASURE_STANDARD_01'))).toBe(false);

        const report = [
            ...mobLines,
            `mob @MOB_T4_MOB_CITY_FOREST_BOSS_DIREBOAR => ${missingMob.find(text => text === 'Boaris')} (not in table, English)`,
            ...itemLines,
            `item QUESTITEM_TUTORIAL_HERETIC_PLANS => ${missingTitle} (not in table, English)`,
            `zone faction 4000 card => ${official.zones['4000']}`,
            ...zoneLines,
            `resource T4 Fiber e1 => ${resourceLine}`,
            `chest T4_SKILLBOOK_STANDARD => ${official.items.T4_SKILLBOOK_STANDARD}`,
            'chest TREASURE_STANDARD_01 => (not in table, no caption)',
        ];
        console.log(['ZH-CN display layer', ...report].join('\n'));
    });
});
