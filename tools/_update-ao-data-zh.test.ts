import {describe, expect, test} from 'vitest';
import {
    buildItemNameMeta,
    buildZhNameTables,
    collectItemLocalizationKeys,
    collectMobLocalizationKeys,
    decodeXmlEntities,
    expeditionTitleByCluster,
    itemNameLocalizationKey,
    parseExpeditionRefs,
    parseLocalizationXml,
} from './update-ao-data';

const HIDEOUT_XML = `<?xml version="1.0"?>
<tmx version="1.4">
  <body>
    <tu tuid="@ITEMS_UNIQUE_HIDEOUT">
      <tuv xml:lang="EN-US">
        <seg>Hideout Construction Kit</seg>
      </tuv>
      <tuv xml:lang="ZH-CN">
        <seg>藏身地堡建筑工具包</seg>
      </tuv>
    </tu>
    <tu tuid="@ITEMS_T4_BAG">
      <tuv xml:lang="EN-US"><seg>Adept's Bag</seg></tuv>
      <tuv xml:lang="DE-DE"><seg>Tasche</seg></tuv>
    </tu>
    <tu tuid="@ITEMS_SHARED">
      <tuv xml:lang="EN-US"><seg>Shared &amp; Name</seg></tuv>
      <tuv xml:lang="ZH-CN"><seg>共享&#x540D;</seg></tuv>
    </tu>
    <tu tuid="@ITEMS_T4_ARTEFACT_2H_BOW_HELL">
      <tuv xml:lang="EN-US"><seg>Hellish Artifact Bow</seg></tuv>
      <tuv xml:lang="ZH-CN"><seg>地狱神器弓</seg></tuv>
    </tu>
    <tu tuid="@ITEMS_T4_2H_BOW_HELL">
      <tuv xml:lang="ZH-CN"><seg>地狱弓</seg></tuv>
    </tu>
    <tu tuid="@MOB_KEEPER">
      <tuv xml:lang="EN-US"><seg>Keeper</seg></tuv>
      <tuv xml:lang="ZH-CN"><seg>卫士</seg></tuv>
    </tu>
    <tu tuid="@MOB_NO_ZH">
      <tuv xml:lang="EN-US"><seg>Nameless</seg></tuv>
    </tu>
    <tu tuid="@GENERIC_CLUSTER_1000">
      <tuv xml:lang="EN-US"><seg>Lymhurst</seg></tuv>
      <tuv xml:lang="ZH-CN"><seg>Lymhurst</seg></tuv>
    </tu>
    <tu tuid="@EXP_TITLE_FISHY">
      <tuv xml:lang="EN-US"><seg>Fishy Business</seg></tuv>
      <tuv xml:lang="ZH-CN"><seg>有猫腻</seg></tuv>
    </tu>
    <tu tuid="@UNUSED">
      <tuv xml:lang="ZH-CN"><seg>不该收入</seg></tuv>
    </tu>
  </body>
</tmx>`;

describe('localization.xml ZH-CN names', () => {
    test('decodes XML entities without changing the official text', () => {
        expect(decodeXmlEntities('共享&#x540D; &amp; &lt;A&gt;')).toBe('共享名 & <A>');
    });

    test('reads only requested tuids and drops a row that has no ZH-CN', () => {
        const wanted = new Set(['@ITEMS_UNIQUE_HIDEOUT', '@ITEMS_T4_BAG', '@ITEMS_SHARED', '@MOB_NO_ZH']);
        const parsed = parseLocalizationXml(HIDEOUT_XML, wanted);
        expect(parsed.get('@ITEMS_UNIQUE_HIDEOUT')).toEqual({
            en: 'Hideout Construction Kit',
            zh: '藏身地堡建筑工具包',
        });
        expect(parsed.get('@ITEMS_T4_BAG')?.zh).toBeUndefined();
        expect(parsed.get('@ITEMS_SHARED')?.zh).toBe('共享名');
        expect(parsed.has('@UNUSED')).toBe(false);
    });

    test('item keys are catalog uniqueNames, resolved through the game localization tuid', () => {
        const meta = buildItemNameMeta({
            items: {
                simpleitem: [
                    {'@uniquename': 'UNIQUE_HIDEOUT'},
                    {'@uniquename': 'T4_BAG'},
                    {'@uniquename': 'QUESTITEM_TOKEN', '@descvariable0': '@ITEMS_SHARED'},
                ],
                weapon: {'@uniquename': 'T4_ARTEFACT_2H_BOW_HELL', '@descvariable0': '@ITEMS_T4_2H_BOW_HELL'},
            },
        });
        expect(itemNameLocalizationKey('UNIQUE_HIDEOUT', meta)).toBe('@ITEMS_UNIQUE_HIDEOUT');
        expect(itemNameLocalizationKey('T4_BAG@2', meta, new Set(['T4_BAG', 'T4_BAG@2']))).toBe('@ITEMS_T4_BAG');
        expect(itemNameLocalizationKey('QUESTITEM_TOKEN', meta)).toBe('@ITEMS_SHARED');
        expect(itemNameLocalizationKey('T4_ARTEFACT_2H_BOW_HELL', meta)).toBe('@ITEMS_T4_ARTEFACT_2H_BOW_HELL');

        const catalog = [
            null,
            {n: 'UNIQUE_HIDEOUT'},
            {n: 'T4_BAG'},
            {n: 'T4_BAG@2'},
            {n: 'QUESTITEM_TOKEN'},
            {n: 'T4_ARTEFACT_2H_BOW_HELL'},
        ];
        const keys = collectItemLocalizationKeys(catalog, meta);
        const tables = buildZhNameTables({
            mobTags: ['@MOB_KEEPER', '@MOB_NO_ZH', ''],
            itemKeys: keys,
            zoneIds: ['1000', 'FishyBusiness-SOLO', '0317'],
            expeditionTitleById: new Map([['FishyBusiness-SOLO', '@EXP_TITLE_FISHY']]),
            localization: parseLocalizationXml(HIDEOUT_XML, new Set([
                ...keys.values(),
                '@MOB_KEEPER',
                '@MOB_NO_ZH',
                '@GENERIC_CLUSTER_1000',
                '@GENERIC_CLUSTER_FishyBusiness-SOLO',
                '@GENERIC_CLUSTER_0317',
                '@EXP_TITLE_FISHY',
            ])),
        });

        expect(tables.items.UNIQUE_HIDEOUT).toBe('藏身地堡建筑工具包');
        expect(tables.items.T4_BAG).toBeUndefined();
        expect(tables.items['T4_BAG@2']).toBeUndefined();
        expect(tables.items.QUESTITEM_TOKEN).toBe('共享名');
        expect(tables.items.T4_ARTEFACT_2H_BOW_HELL).toBe('地狱神器弓');
        expect(tables.mobs['@MOB_KEEPER']).toBe('卫士');
        expect(tables.mobs['@MOB_NO_ZH']).toBeUndefined();
        expect(tables.zones['1000']).toBe('Lymhurst');
        expect(tables.zones['FishyBusiness-SOLO']).toBe('有猫腻');
        expect(tables.zones['0317']).toBeUndefined();
    });

    test('mob keys are the namelocatag stored on the minified mob', () => {
        expect(collectMobLocalizationKeys([
            {n: '@MOB_KEEPER'},
            {n: '@MOB_KEEPER'},
            {},
            {n: ''},
        ])).toEqual(['@MOB_KEEPER']);
    });

    test('expedition titles attach to the cluster id the radar uses', () => {
        const refs = parseExpeditionRefs({
            expeditions: {
                expedition: [
                    {'@cluster': 'FishyBusiness-SOLO_EXP_DL_T4_HER', mission: {'@title': '@EXP_TITLE_FISHY'}},
                    {'@cluster': 'Mine-SOLO_EXP_DL_T3_HER', mission: {'@title': '@EXP_A'}},
                    {'@cluster': 'Mine-SOLO_EXP_DL_T3_HER_ALT', mission: {'@title': '@EXP_B'}},
                ],
            },
        });
        const titles = expeditionTitleByCluster([
            {id: 'FishyBusiness-SOLO', file: 'FishyBusiness-SOLO_EXP_FR_GREEN_T4_HER'},
            {id: 'Mine-SOLO', file: 'Mine-SOLO_EXP_FR_GREEN_T3_HER'},
            {id: '1000', file: '1000_CTY_FR_AUTO_T1_NON'},
        ], refs);
        expect(titles.get('FishyBusiness-SOLO')).toBe('@EXP_TITLE_FISHY');
        expect(titles.has('Mine-SOLO')).toBe(false);
        expect(titles.has('1000')).toBe(false);
    });
});
