// synthetic: page templates read from internal/templates and checked against the settings registry.
import {readFileSync, readdirSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, test} from 'vitest';
import {MIGRATION_ROWS, SETTINGS, registryDefault, registryEntry} from './SettingsRegistry.js';
import {mountPage} from '../__fixtures__/pageMarkup.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../');
const PAGES_DIR = join(ROOT, 'internal/templates/pages');
const LAYOUTS_DIR = join(ROOT, 'internal/templates/layouts');

const CONTROL_COUNT_EXCEPTIONS = {settingPlayersDetect: 2, settingUiSidebarCollapsed: 0};

const LABELS = {
    settingRadarZoom: '缩放',
    settingRadarSize: '最大尺寸',
    settingRadarFitToScreen: '适应屏幕',
    settingRadarIconSize: '图标大小',
    settingRadarMapBackground: '地图背景',
    settingRadarHudZoneInfo: '区域信息',
    settingRadarHudStats: '统计框',
    settingRadarPlayersBeside: '玩家列表靠右',
    settingRadarKeepAwake: '保持屏幕常亮',
    settingRadarResourceCount: '资源数量',
    settingRadarResourceDistance: '资源距离',
    settingRadarResourceTierBadges: '资源等阶色块',
    settingRadarResourceClusters: '资源聚集',
    settingRadarClusterRadius: '聚集半径（米）',
    settingRadarClusterMinSize: '每组最少点数',
    settingUiRadarSettingsOpen: '雷达设置',
    settingPlayersDetect: '检测玩家',
    settingPlayersShowGuild: '显示公会名',
    settingPlayersShowTotalIp: '显示总物品强度',
    settingPlayersShowMounted: '显示骑乘状态',
    settingPlayersShowHealthBars: '显示生命条',
    settingEnemiesShowHealthBars: '显示生命条',
    settingResourcesShowHealthBars: '显示生命条',
    settingEnemiesChampion: 'Champion',
    settingDebugEnemiesUnidentified: '显示未识别敌人',
    settingDebugPlayersIds: '显示玩家 ID',
    settingLogToServer: '保存浏览器日志',
    settingDebugBackendLogs: '保存后端日志',
    settingDebugWsCoalescing: '每帧合并实体更新',
};

const NOT_DETECTED = '目前还没有怪物被归入这一类。';
const CATEGORY_TIP = '保留该分类的 DEBUG 与 INFO。WARN 及以上不受此过滤影响。';

const TOOLTIPS = {
    settingRadarSize: '宽和高的像素。窗口较小时会缩小。开启“适应屏幕”后忽略此项。',
    settingRadarFitToScreen: '取窗口里能放下的最大正方形，上限 1200 像素；玩家列表在旁边时与它并排。会覆盖“最大尺寸”。',
    settingRadarHudZoneInfo: '左上角显示区域名称、等阶和 PvP 标记。',
    settingRadarHudStats: '右上角显示资源和怪物数量；开启玩家检测时也显示玩家数量。',
    settingRadarPlayersBeside: '窗口够宽时，把玩家列表放在雷达右侧。',
    settingRadarKeepAwake: '雷达页打开时阻止屏幕休眠。手机会更耗电。',
    settingRadarResourceCount: '按体型和等阶估算，不含加成。钓鱼显示已刷新数量和总数。',
    settingRadarResourceDistance: '单位为米：2 米内隐藏，10 米内为绿色，10 到 19 米为黄色，20 米及以上为橙色。',
    settingRadarResourceTierBadges: '按类型用色块代替图标，并标出等阶。活体生物带金色边框。',
    settingRadarClusterRadius: '把此范围内、类型和等阶相同的资源分到一组。默认 30 米。',
    settingRadarClusterMinSize: '少于此数量就不画成一组。默认 2。',
    settingRadarResourceClusters: '把附近同类资源点圈起来，并显示数量和距离。只分组当前过滤下可见的点。',
    settingPlayersDetect: '追踪范围内的玩家。关闭后没有玩家列表、人数、闪屏、边框和声音。',
    settingPlayersShowTotalIp: '玩家当前穿戴装备的平均物品强度。',
    settingPlayersHostile: '显示敌对标记的玩家；黑区里的玩家都算敌对。不影响警报。',
    settingAlertFlash: '出现威胁时闪屏：黄区或红区的敌对玩家，以及黑区中的任何人。已忽略的名字除外。',
    settingAlertSound: '在运行雷达的电脑上播放警报声，触发规则与“屏幕闪烁”相同。已忽略的名字不会触发。',
    settingAlertBorder: '范围内有威胁时，雷达周围闪红色边框。已忽略的名字不计入。',
    settingAlertSoundCooldown: '两次警报声之间的最短间隔。设为 0 则每次都播放。',
    settingEnemiesChampion: 'Champion 怪物，以及随机地下城里的单人怪物。',
    settingEnemiesMinHealthFilter: '隐藏最大生命低于该值的敌人，包括未识别的。Avalonian Drones、迷雾 Boss、活动怪和活体资源不受影响。',
    settingEnemiesEvent: NOT_DETECTED,
    settingDebugEnemiesUnidentified: '显示怪物数据里没有的敌人，通常是更新后新增的怪物。类型过滤不会作用于它们。',
    settingDebugResourcesTypeId: '在资源点和活体资源上绘制内部类型 ID（调试）。',
    settingDebugResourcesDbName: '显示由线路类型 ID 映射出的数据库名（调试，用于核对偏移）。',
    settingDebugWsCoalescing: '每个实体每帧只保留最新的移动、生命和回复更新。',
    settingDebugBackendLogs: '把每条游戏事件记一行到 logs/sessions/。只能在运行雷达的电脑上修改。',
    settingDebugPcapRecording: '把 UDP 5056 流量录到 logs/captures/，每个网卡一个文件。仅限本机。',
    settingLogToServer: '把过滤后的条目保存到雷达电脑的 logs/debug/。错误还会复制到 logs/errors/。',
    settingLogLevel: '显示的最低级别。DEBUG 和 INFO 还需要打开对应分类。OFF 关闭全部日志。',
    ...Object.fromEntries(SETTINGS.filter(entry => entry.key.startsWith('settingLogCategory')).map(entry => [entry.key, CATEGORY_TIP])),
};

const NO_TOOLTIP = ['settingPlayersShowEquipment', 'settingPlayersShowSpells', 'settingPlayersShowGuild', 'settingPlayersShowMounted',
    'settingEnemiesNormal', 'settingEnemiesMiniBoss',
    'settingEnemiesBoss', 'settingEnemiesAvalonianDrones', 'settingEnemiesMistsCrystalSpider', 'settingEnemiesMistsFairyDragon', 'settingEnemiesMistsVeilWeaver',
    'settingEnemiesMistsGriffin', 'settingResourcesFishing', 'settingChestsGreen', 'settingChestsBlue', 'settingChestsPurple',
    'settingChestsYellow', 'settingMistsSolo', 'settingMistsDuo', 'settingMistsWispCages', 'settingMistsWisps',
    'settingMistsKnightfallAbbey', 'settingDungeonsSolo', 'settingDungeonsGroup', 'settingLogToConsole', 'settingDebugPlayersIds'];

function templateOf(name) {
    return readFileSync(join(PAGES_DIR, `${name}.gohtml`), 'utf8');
}

function pageNames() {
    return readdirSync(PAGES_DIR).filter(file => file.endsWith('.gohtml')).map(file => file.replace('.gohtml', ''));
}

function scriptOf(name) {
    const lines = readFileSync(join(PAGES_DIR, `${name}.gohtml`), 'utf8').split(/\r?\n/);
    const start = lines.findIndex(line => line.trim() === `{{define "scripts/${name}"}}`);
    const end = lines.findIndex((line, index) => index > start && line.trim() === '{{end}}');
    return start < 0 ? '' : lines.slice(start + 1, end).join('\n');
}

function loadPages() {
    const pages = pageNames().map(name => ({name, root: mountPage(name).cloneNode(true)}));
    for (const file of readdirSync(LAYOUTS_DIR)) {
        const root = document.createElement('div');
        root.innerHTML = readFileSync(join(LAYOUTS_DIR, file), 'utf8');
        pages.push({name: `layouts/${file}`, root});
    }
    document.body.innerHTML = '';
    return pages;
}

const pages = loadPages();

function all(selector) {
    return pages.flatMap(page => [...page.root.querySelectorAll(selector)].map(el => ({page: page.name, el})));
}

function normalized(el) {
    return el.textContent.replace(/\s+/g, ' ').trim();
}

const controls = all('[data-setting]');

function controlCount(key) {
    return controls.filter(({el}) => el.dataset.setting === key).length;
}

describe('template settings contract', () => {
    test('every data-setting names a registry key', () => {
        const unknown = controls.filter(({el}) => !registryEntry(el.dataset.setting))
            .map(({page, el}) => `${page}: ${el.dataset.setting}`);
        expect(unknown).toEqual([]);
    });

    test('every label element shows the registry label', () => {
        const drift = all('[data-setting-label]').flatMap(({page, el}) => el.dataset.settingLabel.split(' ').flatMap(key => {
            const label = registryEntry(key)?.label;
            return label && normalized(el) === label ? [] : [`${page}: ${key} "${normalized(el)}" vs "${label}"`];
        }));
        expect(drift).toEqual([]);
    });

    test('every bound control outside a matrix has its label on the same page', () => {
        const missing = controls.filter(({page, el}) => registryEntry(el.dataset.setting)?.shape !== 'matrix'
            && !all(`[data-setting-label~="${el.dataset.setting}"]`).some(label => label.page === page))
            .map(({page, el}) => `${page}: ${el.dataset.setting}`);
        expect(missing).toEqual([]);
    });

    test('every tooltip element carries the registry tooltip', () => {
        const drift = all('[data-setting-tip]').flatMap(({page, el}) => {
            const tooltip = registryEntry(el.dataset.settingTip)?.tooltip;
            const ok = tooltip && el.classList.contains('tooltip') && el.dataset.tip === tooltip;
            return ok ? [] : [`${page}: ${el.dataset.settingTip} "${el.dataset.tip}" vs "${tooltip}"`];
        });
        expect(drift).toEqual([]);
    });

    test('every tooltip icon takes keyboard focus and is named by its tip', () => {
        const drift = all('[data-setting-tip]').flatMap(({page, el}) => {
            const focusables = el.querySelectorAll('[tabindex]');
            const target = focusables[0];
            const ok = focusables.length === 1 && target.getAttribute('tabindex') === '0'
                && target.getAttribute('role') === 'img' && target.getAttribute('aria-label') === el.dataset.tip
                && target.querySelector('i') !== null && !el.hasAttribute('tabindex');
            return ok ? [] : [`${page}: ${el.dataset.settingTip}`];
        });
        expect(drift).toEqual([]);
    });

    // @verified 2026-10-10: every tooltip holds at most 2 sentences and 30 words and takes focus, checked on data-setting-tip only.
    test('every tooltip carries data-setting-tip, so the registry and focus checks reach it', () => {
        const tooltips = all('.tooltip[data-tip]');
        expect(tooltips.length).toBeGreaterThan(30);
        expect(tooltips.filter(({el}) => !el.hasAttribute('data-setting-tip')).map(({page, el}) => `${page}: ${el.dataset.tip}`)).toEqual([]);
    });

    test('a control whose label holds a tooltip is named by its label text only', () => {
        const drift = pages.flatMap(({name, root}) => [...root.querySelectorAll('label [data-setting]')].flatMap(el => {
            const label = el.closest('label');
            if (!label.querySelector('.tooltip')) return [];
            const text = label.querySelector(`[data-setting-label="${el.dataset.setting}"]`);
            const id = el.getAttribute('aria-labelledby');
            const target = id ? root.querySelector(`[id="${id}"]`) : null;
            const ok = text !== null && (id
                ? target === text && !target.querySelector('.tooltip')
                : el.getAttribute('aria-label') === normalized(text));
            return ok ? [] : [`${name}: ${el.dataset.setting}`];
        }));
        expect(drift).toEqual([]);
    });

    test('every bound input or select is named by a label element, inside a label or not', () => {
        const drift = pages.flatMap(({name, root}) => [...root.querySelectorAll('input, select')]
            .filter(el => el.closest('[data-setting]')).flatMap(el => {
                const key = el.dataset.setting;
                const isLabel = label => label?.matches('[data-setting-label]') === true && normalized(label) !== ''
                    && (!key || label.dataset.settingLabel.split(' ').includes(key));
                const id = el.getAttribute('aria-labelledby');
                const wrapper = el.closest('label') ?? (el.id ? root.querySelector(`label[for="${el.id}"]`) : null);
                const own = key ? root.querySelector(`[data-setting-label~="${key}"]`) : null;
                const ok = id ? isLabel(root.querySelector(`[id="${id}"]`))
                    : el.hasAttribute('aria-label') ? isLabel(own) && el.getAttribute('aria-label') === normalized(own)
                        : isLabel(wrapper?.matches('[data-setting-label]') ? wrapper : wrapper?.querySelector('[data-setting-label]'));
                return ok ? [] : [`${name}: ${key ?? el.outerHTML.slice(0, 60)}`];
            }));
        expect(drift).toEqual([]);
    });

    test('every collapse title leads with an icon', () => {
        const drift = pages.flatMap(({name, root}) => [...root.querySelectorAll('.collapse > .collapse-title')]
            .filter(title => !title.firstElementChild?.matches('i[data-lucide]')).map(title => `${name}: ${normalized(title)}`));
        expect(drift).toEqual([]);
    });

    test('every collapse toggle is named by its title', () => {
        const drift = pages.flatMap(({name, root}) => [...root.querySelectorAll('.collapse > input[type="checkbox"]')].flatMap(el => {
            const title = root.querySelector(`[data-setting-label~="${el.dataset.setting}"]`);
            const id = el.getAttribute('aria-labelledby');
            const named = id ? root.querySelector(`[id="${id}"]`) === title : el.getAttribute('aria-label') === title?.textContent;
            return title && named ? [] : [`${name}: ${el.dataset.setting}`];
        }));
        expect(drift).toEqual([]);
    });

    test('ids are unique on every page', () => {
        const dupes = pages.flatMap(({name, root}) => {
            const ids = [...root.querySelectorAll('[id]')].map(el => el.id);
            return ids.filter((id, index) => ids.indexOf(id) !== index).map(id => `${name}: ${id}`);
        });
        expect(dupes).toEqual([]);
    });

    test('every bound control with a registry tooltip shows it on the same page', () => {
        const missing = controls.filter(({page, el}) => registryEntry(el.dataset.setting)?.tooltip
            && !all(`[data-setting-tip="${el.dataset.setting}"]`).some(tip => tip.page === page))
            .map(({page, el}) => `${page}: ${el.dataset.setting}`);
        expect(missing).toEqual([]);
    });

    test('number and range controls carry the registry bounds and no placeholder or value', () => {
        const drift = all('input[type="number"][data-setting], input[type="range"][data-setting]').flatMap(({page, el}) => {
            const entry = registryEntry(el.dataset.setting);
            const attrs = ['min', 'max', 'step'].map(name => el.getAttribute(name));
            const ok = attrs.join() === [entry.min, entry.max, entry.step].map(String).join()
                && !el.hasAttribute('placeholder') && !el.hasAttribute('value');
            return ok ? [] : [`${page}: ${entry.key}`];
        });
        expect(drift).toEqual([]);
    });

    test('bound controls carry no default copy', () => {
        const copies = [
            ...all('input[type="range"][data-setting][value]'),
            ...all('input[type="checkbox"][data-setting][checked]'),
            ...all('select[data-setting] option[selected]'),
            ...all('[data-value-for]').filter(({el}) => el.textContent.trim() !== ''),
        ].map(({page, el}) => `${page}: ${el.outerHTML.slice(0, 80)}`);
        expect(copies).toEqual([]);
    });

    test('each setting key has one control, with the declared exceptions', () => {
        const drift = SETTINGS.filter(entry => ['setting', 'ui', 'backend'].includes(entry.scope))
            .flatMap(({key}) => {
                const count = controlCount(key);
                const expected = CONTROL_COUNT_EXCEPTIONS[key] ?? 1;
                if (count === expected) return [];
                return [`${key}: ${count} controls, expected ${expected}`];
            });
        expect(drift).toEqual([]);
    });

    test('converted pages hold no input or select bound by id alone', () => {
        const unbound = pages.filter(({name}) => !name.startsWith('layouts/'))
            .flatMap(({name, root}) => [...root.querySelectorAll('input[id]:not([data-setting]), select[id]:not([data-setting])')]
                .filter(el => !el.closest('[data-setting]'))
                .map(el => `${name}: ${el.id}`));
        expect(unbound).toEqual([]);
    });

    test('removed keys have no control', () => {
        const left = MIGRATION_ROWS.filter(row => row.migration === 'remove')
            .flatMap(({legacyKey: key}) => pages.filter(({root}) => root.querySelector(`[data-setting="${key}"], [id="${key}"]`))
                .map(({name}) => `${name}: ${key}`));
        expect(left).toEqual([]);
    });

    test('each converted page registers through registerBoundPage', () => {
        const missing = pages.filter(({name}) => !name.startsWith('layouts/'))
            .filter(({name}) => !scriptOf(name).includes(`registerBoundPage('${name}'`))
            .map(({name}) => name);
        expect(missing).toEqual([]);
    });

    test('no template holds the RENDERING token', () => {
        const hits = [...pageNames().map(name => join(PAGES_DIR, `${name}.gohtml`)),
            ...readdirSync(LAYOUTS_DIR).map(file => join(LAYOUTS_DIR, file))]
            .filter(file => readFileSync(file, 'utf8').includes('RENDERING'));
        expect(hits).toEqual([]);
    });

    test('no script under web/scripts holds the RENDERING token', () => {
        const self = fileURLToPath(import.meta.url);
        const hits = readdirSync(join(ROOT, 'web/scripts'), {recursive: true})
            .map(file => join(ROOT, 'web/scripts', file))
            .filter(file => file.endsWith('.js') && file !== self)
            .filter(file => readFileSync(file, 'utf8').includes('RENDERING'));
        expect(hits).toEqual([]);
    });
});

describe('page removals', () => {
    test('resources page holds no radar display control and no stale logging tip', () => {
        const template = templateOf('resources');
        for (const key of ['settingRadarResourceCount', 'settingRadarResourceDistance', 'settingRadarResourceClusters',
            'settingRadarClusterRadius', 'settingRadarClusterMinSize']) {
            expect(template).not.toContain(key);
        }
        expect(template).not.toContain('ResourcesHelper');
    });
});

describe('enemies page', () => {
    const template = templateOf('enemies');
    const root = pages.find(page => page.name === 'enemies').root;

    test('offers only the All and Clear presets, through data-enemy-preset', () => {
        const presets = [...root.querySelectorAll('[data-enemy-preset]')];
        expect(presets.map(el => el.dataset.enemyPreset)).toEqual(['all', 'clear']);
        expect(presets.map(el => el.textContent.trim())).toEqual(['All', 'Clear']);
        expect(template).not.toContain('onclick="applyEnemyPreset');
        expect(template).not.toContain('Mini-Boss+');
        expect(template).not.toMatch(/>\s*Bosses\s*<\/button>/);
    });

    test('Display ends with links to the Logging and Debug sections of Settings', () => {
        const display = root.querySelector('[data-setting="settingUiEnemiesDisplayOpen"]').closest('.collapse');
        const links = [...display.querySelector('.collapse-content').lastElementChild.querySelectorAll('a')];
        expect(links.map(a => [a.getAttribute('href'), normalized(a)]))
            .toEqual([['/settings', 'Settings > Logging'], ['/settings', 'Settings > Debug']]);
    });

    test('holds no All checkbox and no Debug collapse', () => {
        expect(template).not.toContain('settingAllEnemies');
        expect(template).not.toContain('collapse-debug');
    });
});

describe('collapsible settings sections', () => {
    const ADVANCED_CLOSED = ['settingUiSettingsLoggingOpen', 'settingUiSettingsDebugOpen', 'settingUiSettingsNetworkOpen'];
    const PRE_EXISTING_CLOSED = ['settingUiEnemiesOtherOpen', 'settingUiResourcesHideOpen', 'settingUiResourcesWoodOpen',
        'settingUiResourcesOreOpen', 'settingUiResourcesRockOpen'];
    const isHeader = el => el.classList.contains('card') && el.querySelector('h1') !== null;
    const SETTINGS_PAGES = ['enemies', 'resources', 'settings', 'players', 'chests', 'ignorelist'];

    // @verified 2026-10-10: a collapse checkbox is named through aria-labelledby on its label-<key> title, per the settings DOM contract.
    test.each(SETTINGS_PAGES)('%s: every collapse toggle is named by aria-labelledby="label-<key>", never aria-label', name => {
        const toggles = [...pages.find(page => page.name === name).root.querySelectorAll('.collapse > input[type="checkbox"]')];
        expect(toggles.length).toBeGreaterThan(0);
        expect(toggles.filter(el => el.getAttribute('aria-labelledby') !== `label-${el.dataset.setting}` || el.hasAttribute('aria-label'))
            .map(el => el.dataset.setting)).toEqual([]);
    });

    // @verified 2026-10-10: sections open by default except Logging, Debug, Network and collapses that predate the rule.
    test.each(SETTINGS_PAGES)('%s: every top-level section is a collapse bound to a settingUi*Open key', name => {
        const root = pages.find(page => page.name === name).root;
        const container = root.querySelector('.space-y-6');
        const sections = [...container.children].filter(el => !isHeader(el) && !el.matches('[role="alert"]'));
        expect(sections.length).toBeGreaterThan(0);
        for (const section of sections) {
            expect(section.classList.contains('collapse'), section.outerHTML.slice(0, 80)).toBe(true);
            const checkbox = section.querySelector(':scope > input[type="checkbox"][data-setting]');
            const key = checkbox?.dataset.setting;
            expect(key, section.outerHTML.slice(0, 80)).toMatch(/^settingUi[A-Z][A-Za-z0-9]*Open$/);
            expect(registryDefault(key), key).toBe(![...ADVANCED_CLOSED, ...PRE_EXISTING_CLOSED].includes(key));
        }
    });
});

describe('stale logging links', () => {
    test.each(pageNames())('%s page links to no "Debug & Logging" section, in either spelling', name => {
        expect(templateOf(name)).not.toMatch(/Debug (&|&amp;) Logging/);
    });
});

describe('settings page', () => {
    const template = templateOf('settings');
    const root = pages.find(page => page.name === 'settings').root;
    const DEBUG_GROUPS = [
        ['怪物', 'Enemies'],
        ['资源', 'Resources'],
        ['玩家', 'Players'],
        ['迷雾', 'Mists'],
        ['网络流量', 'Network traffic'],
        ['后端日志', 'Backend logs'],
    ];

    function keysOf(group) {
        return [...group.querySelectorAll('input')].map(el => el.dataset.setting ?? el.id).sort();
    }

    test('reads as logging, debug, network and reset options', () => {
        expect(normalized(root.querySelector('h1 + p'))).toBe('日志、调试、网络和重置选项。');
    });

    test('holds no Display card, no Clear Cache, no throttle and no Rendering category', () => {
        expect(root.querySelector('[data-setting^="settingRadar"], [id^="settingRadar"]')).toBeNull();
        for (const gone of ['clearCache', 'caches.', 'bindNumber', 'Health Throttling', 'settingWsThrottling',
            'categoryRendering', 'Rendering']) {
            expect(template).not.toContain(gone);
        }
    });

    test('holds no inline backend toggle binding', () => {
        expect(template).not.toContain('bindBackendCheckbox');
        expect(template).not.toContain('setBool("settingPcapRecording"');
    });

    test('the Logging banner tells where backend and browser errors are saved', () => {
        const logging = root.querySelector('[data-setting="settingUiSettingsLoggingOpen"]').closest('.collapse');
        const banner = normalized(logging.querySelector('.collapse-content p'));
        expect(banner).toContain('后端错误始终保存到 logs/errors/。');
        expect(banner).toContain('只有本浏览器正在发送自己的日志时，才会保存浏览器错误（设置 > 日志 > “保存浏览器日志”）。');
        expect(template).not.toContain('Errors are always saved on the backend side');
    });

    test('the Logging, Debug, Network and Danger Zone collapses are bound through data-setting', () => {
        const collapses = [...root.querySelectorAll('.collapse > input[type="checkbox"]')].map(el => el.dataset.setting);
        expect(collapses).toEqual(['settingUiSettingsLoggingOpen', 'settingUiSettingsDebugOpen', 'settingUiSettingsNetworkOpen',
            'settingUiSettingsDangerZoneOpen']);
    });

    test('Debug groups Enemies, Resources, Mists, Network traffic and Backend logs, then Export', () => {
        const debug = root.querySelector('[data-setting="settingUiSettingsDebugOpen"]').closest('.collapse')
            .querySelector('.collapse-content');
        const groups = [...debug.querySelectorAll('section')];
        expect(groups.map(group => normalized(group.querySelector('h3')))).toEqual(DEBUG_GROUPS.map(([label]) => label));
        for (const [index, [, name]] of DEBUG_GROUPS.entries()) {
            const expected = SETTINGS.filter(entry => entry.page === 'Settings' && entry.section === `Debug > ${name}`)
                .map(entry => entry.key).sort();
            expect(keysOf(groups[index]), name).toEqual(expected);
        }
        expect(debug.lastElementChild.querySelector('#downloadLogsBtn')).not.toBeNull();
    });

    // @verified 2026-10-10: the Export hint lists registry settings, UI state and backend logging values, without the ignore list.
    test('the Export hint lists the registry settings, UI state and backend logging values, without the ignore list', () => {
        expect(normalized(root.querySelector('#downloadLogsBtn').nextElementSibling))
            .toBe('将注册表设置、界面状态和后端日志开关下载为 JSON。不包含忽略列表。');
    });
});

describe('registry labels and tooltips', () => {
    test.each(Object.entries(LABELS))('%s is labeled "%s"', (key, label) => {
        expect(registryEntry(key).label).toBe(label);
    });

    test.each(Object.entries(TOOLTIPS))('%s carries its tooltip verbatim', (key, tooltip) => {
        expect(registryEntry(key).tooltip).toBe(tooltip);
    });

    test.each(NO_TOOLTIP)('%s has no tooltip and no info icon', key => {
        expect(registryEntry(key).tooltip).toBe('');
        expect(all(`[data-setting-tip="${key}"]`)).toEqual([]);
    });

    test('every tooltip has at most 2 sentences and 30 words', () => {
        const long = SETTINGS.filter(entry => entry.tooltip).flatMap(({key, tooltip}) => {
            const sentences = tooltip.split(/[.!?](?:\s+|$)/).filter(part => part.trim()).length;
            const words = tooltip.trim().split(/\s+/).length;
            return sentences <= 2 && words <= 30 ? [] : [`${key}: ${sentences} sentences, ${words} words`];
        });
        expect(SETTINGS.filter(entry => entry.tooltip).length).toBeGreaterThan(30);
        expect(long).toEqual([]);
    });
});

describe('settings control tile contract', () => {
    const COLOR_CLASS = /^checkbox-(primary|secondary|accent|info|success|warning|error)$/;
    const ALLOWED_COLORS = {
        settingPlayersPassive: 'checkbox-success',
        settingPlayersFaction: 'checkbox-info',
        settingPlayersHostile: 'checkbox-error',
        settingEnemiesNormal: 'checkbox-info',
        settingEnemiesChampion: 'checkbox-secondary',
        settingEnemiesMiniBoss: 'checkbox-warning',
        settingEnemiesBoss: 'checkbox-error',
    };
    const inputCss = readFileSync(join(ROOT, 'web/styles/input.css'), 'utf8');
    const booleans = all('input[type="checkbox"][data-setting]').filter(({el}) => !el.matches('.collapse > input'));
    const ALERT_KEYS = ['settingAlertFlash', 'settingAlertBorder', 'settingAlertSound'];
    const KIND = {
        toggle: ['settingRadarFitToScreen', 'settingRadarMapBackground', 'settingRadarHudZoneInfo', 'settingRadarHudStats',
            'settingRadarPlayersBeside', 'settingRadarKeepAwake', 'settingRadarResourceCount', 'settingRadarResourceDistance',
            'settingRadarResourceTierBadges', 'settingRadarResourceClusters', 'settingPlayersDetect', 'settingPlayersShowEquipment',
            'settingPlayersShowSpells', 'settingPlayersShowGuild', 'settingPlayersShowTotalIp', 'settingPlayersShowMounted',
            'settingPlayersShowHealthBars', 'settingAlertFlash', 'settingAlertBorder', 'settingAlertSound',
            'settingEnemiesMinHealthFilter', 'settingEnemiesShowHealthBars', 'settingResourcesFishing', 'settingResourcesShowHealthBars',
            'settingMistsWispCages', 'settingMistsWisps', 'settingMistsKnightfallAbbey', 'settingLogToConsole', 'settingLogToServer',
            'settingDebugEnemiesUnidentified', 'settingDebugEnemiesTypeId', 'settingDebugEnemiesTier', 'settingDebugEnemiesName',
            'settingDebugEnemiesCategoryBadge', 'settingDebugResourcesTypeId', 'settingDebugResourcesDbName', 'settingDebugPlayersIds',
            'settingDebugMistsWispIds', 'settingDebugWsCoalescing', 'settingDebugPcapRecording', 'settingDebugBackendLogs'],
        checkbox: ['settingPlayersPassive', 'settingPlayersFaction', 'settingPlayersHostile', 'settingEnemiesNormal',
            'settingEnemiesChampion', 'settingEnemiesMiniBoss', 'settingEnemiesBoss', 'settingEnemiesMistsCrystalSpider',
            'settingEnemiesMistsFairyDragon', 'settingEnemiesMistsVeilWeaver', 'settingEnemiesMistsGriffin',
            'settingEnemiesAvalonianDrones', 'settingEnemiesEvent', 'settingChestsGreen', 'settingChestsBlue', 'settingChestsPurple',
            'settingChestsYellow', 'settingMistsSolo', 'settingMistsDuo', 'settingDungeonsSolo', 'settingDungeonsGroup',
            'settingDungeonsCorrupted', 'settingDungeonsHellgate',
            ...[0, 1, 2, 3, 4].flatMap(level => [`settingMistsEnchant${level}`, `settingDungeonsEnchant${level}`]),
            ...SETTINGS.filter(entry => entry.key.startsWith('settingLogCategory')).map(entry => entry.key)],
    };

    function booleanClassIssue(el) {
        const classes = [...el.classList];
        if (classes.includes('toggle')) {
            return classes.length === 3 && classes.includes('toggle-primary') && classes.includes('toggle-sm')
                ? null : `toggle classes "${classes.join(' ')}"`;
        }
        if (classes.includes('checkbox')) {
            if (!classes.includes('checkbox-xs')) return `missing checkbox-xs in "${classes.join(' ')}"`;
            const colors = classes.filter(name => COLOR_CLASS.test(name));
            if (colors.length !== 1) return `expected one color class, got "${colors.join(',')}"`;
            const expected = ALLOWED_COLORS[el.dataset.setting] ?? 'checkbox-primary';
            return colors[0] === expected ? null : `color "${colors[0]}" expected "${expected}"`;
        }
        return `neither toggle nor checkbox: "${classes.join(' ')}"`;
    }

    function rowShapeIssue(el) {
        const label = el.parentElement;
        if (!label || label.tagName !== 'LABEL') return 'is not a direct child of a label';
        const c = label.classList;
        const neutral = c.contains('rounded-lg') && c.contains('bg-base-300') && c.contains('cursor-pointer') && c.contains('group');
        const alert = ALERT_KEYS.includes(el.dataset.setting) && (c.contains('bg-error/10') || c.contains('bg-warning/10'))
            && c.contains('border') && c.contains('cursor-pointer') && c.contains('group');
        return neutral || alert ? null : `label classes "${label.className}" are not the neutral tile or the card of an alert key`;
    }

    test('every boolean control is toggle-primary toggle-sm or checkbox checkbox-xs with one color class', () => {
        const drift = booleans.flatMap(({page, el}) => {
            const issue = booleanClassIssue(el);
            return issue ? [`${page}: ${el.dataset.setting} - ${issue}`] : [];
        });
        expect(drift).toEqual([]);
    });

    test('every boolean control sits inside the neutral tile or the alert card', () => {
        const drift = booleans.flatMap(({page, el}) => {
            const issue = rowShapeIssue(el);
            return issue ? [`${page}: ${el.dataset.setting} - ${issue}`] : [];
        });
        expect(drift).toEqual([]);
    });

    // @verified 2026-10-10: a toggle switches a feature on or off, a checkbox selects items in a list.
    test('every boolean control keeps the kind its key has: a toggle for a feature, a checkbox for a list item', () => {
        const kindOf = el => ['toggle', 'checkbox'].find(kind => el.classList.contains(kind)) ?? 'neither';
        const expected = key => Object.keys(KIND).find(kind => KIND[kind].includes(key));
        const drift = booleans.filter(({el}) => kindOf(el) !== expected(el.dataset.setting))
            .map(({page, el}) => `${page}: ${el.dataset.setting} is ${kindOf(el)}, expected ${expected(el.dataset.setting)}`);
        const unused = Object.values(KIND).flat().filter(key => !booleans.some(({el}) => el.dataset.setting === key));
        expect(drift).toEqual([]);
        expect(unused).toEqual([]);
    });

    // @verified 2026-10-10: a boolean row is a tile with the control first, and density is text-xs.
    test('every boolean tile leads with its control, and every tile label is text-xs', () => {
        const late = booleans.filter(({el}) => el.parentElement.firstElementChild !== el).map(({page, el}) => `${page}: ${el.dataset.setting}`);
        const rows = [...tiles, ...booleans.map(({page, el}) => ({page, el: el.parentElement}))];
        const loose = rows.flatMap(({page, el}) => [...el.querySelectorAll('[data-setting-label]')]
            .filter(label => !label.classList.contains('text-xs')).map(label => `${page}: ${label.dataset.settingLabel}`));
        expect(late).toEqual([]);
        expect([...new Set(loose)]).toEqual([]);
    });

    test('every data-setting-tip is a div.tooltip with a w-3 h-3 opacity-50 icon', () => {
        const drift = all('[data-setting-tip]').flatMap(({page, el}) => {
            const issues = [];
            if (el.tagName !== 'DIV' || !el.classList.contains('tooltip')) issues.push('is not a div.tooltip');
            const icon = el.querySelector('i');
            if (!icon) issues.push('has no icon');
            else if (!icon.classList.contains('w-3') || !icon.classList.contains('h-3') || !icon.classList.contains('opacity-50')) {
                issues.push(`icon classes "${icon.className}"`);
            }
            return issues.map(issue => `${page}: ${el.dataset.settingTip} - ${issue}`);
        });
        expect(drift).toEqual([]);
    });

    test('every range is range-primary range-xs with a tabular-nums whitespace-nowrap readout', () => {
        const ranges = all('input[type="range"][data-setting]');
        const readouts = all('[data-value-for]');
        const drift = ranges.flatMap(({page, el}) => {
            const issues = [];
            if (!el.classList.contains('range-primary')) issues.push('missing range-primary');
            if (!el.classList.contains('range-xs')) issues.push('missing range-xs');
            const readout = readouts.find(r => r.page === page && r.el.dataset.valueFor === el.dataset.setting);
            if (!readout) {
                issues.push('has no readout');
            } else {
                if (!readout.el.classList.contains('tabular-nums')) issues.push('readout missing tabular-nums');
                if (!readout.el.classList.contains('whitespace-nowrap')) issues.push('readout missing whitespace-nowrap');
            }
            return issues.map(issue => `${page}: ${el.dataset.setting} - ${issue}`);
        });
        expect(drift).toEqual([]);
    });

    test('every range has one minus, one plus and one reset button on its key, named after its label', () => {
        const SHAPES = [['nudge', '-1', 'minus', '减小'], ['nudge', '1', 'plus', '增大'], ['reset', null, 'rotate-ccw', '重置']];
        const drift = pages.flatMap(({name, root}) => [...root.querySelectorAll('input[type="range"][data-setting]')].flatMap(el => {
            const key = el.dataset.setting;
            const noun = registryEntry(key).label.toLowerCase();
            return SHAPES.flatMap(([kind, dir, icon, verb]) => {
                const selector = dir === null ? `[data-reset="${key}"]` : `[data-nudge="${key}"][data-dir="${dir}"]`;
                const found = [...root.querySelectorAll(selector)];
                if (found.length !== 1) return [`${name}: ${key} has ${found.length} ${icon} buttons`];
                const [button] = found;
                const glyph = button.querySelector('i[data-lucide]');
                const ok = button.tagName === 'BUTTON' && button.type === 'button'
                    && ['btn', 'btn-ghost', 'btn-xs', 'btn-square'].every(c => button.classList.contains(c))
                    && button.getAttribute('aria-label') === `${verb}${noun}` && button.title === `${verb}${noun}`
                    && glyph?.dataset.lucide === icon && glyph.classList.contains('w-3') && glyph.classList.contains('h-3')
                    && !button.closest('label') && !button.hasAttribute('tabindex')
                    && button.parentElement === el.parentElement;
                return ok ? [] : [`${name}: ${key} ${kind} ${icon} button shape`];
            });
        }));
        expect(drift).toEqual([]);
    });

    test('nudge and reset buttons only point at a bound range on their page', () => {
        const drift = pages.flatMap(({name, root}) => [...root.querySelectorAll('[data-nudge], [data-reset]')].flatMap(button => {
            const key = button.dataset.nudge ?? button.dataset.reset;
            return root.querySelector(`input[type="range"][data-setting="${key}"]`) ? [] : [`${name}: ${key}`];
        }));
        expect(drift).toEqual([]);
    });

    test('every range sits in a slider row named by its label: icon, label, tip, minus, range, plus, readout, reset', () => {
        const drift = pages.flatMap(({name, root}) => [...root.querySelectorAll('input[type="range"][data-setting]')].flatMap(el => {
            const key = el.dataset.setting;
            const row = el.parentElement;
            const order = [...row.children].map(child => {
                if (child.matches('i[data-lucide]')) return 'icon';
                if (child.matches(`[data-setting-label="${key}"]`)) return 'label';
                if (child.matches(`[data-setting-tip="${key}"]`) || child.matches('span.w-3[aria-hidden="true"]')) return 'tip';
                if (child.matches(`[data-nudge="${key}"][data-dir="-1"]`)) return 'minus';
                if (child === el) return 'range';
                if (child.matches(`[data-nudge="${key}"][data-dir="1"]`)) return 'plus';
                if (child.matches(`[data-value-for="${key}"]`)) return 'readout';
                if (child.matches(`[data-reset="${key}"]`)) return 'reset';
                return child.tagName;
            }).filter(part => part !== 'tip').join(' ');
            const c = row.classList;
            const tile = row.tagName === 'DIV' && ['flex', 'items-center', 'p-2', 'rounded-lg', 'bg-base-300'].every(name => c.contains(name));
            const named = el.getAttribute('aria-labelledby') === `label-${key}` && !el.hasAttribute('aria-label');
            const iconKept = row.firstElementChild.classList.contains('shrink-0');
            return tile && named && iconKept && order === 'icon label minus range plus readout reset' ? [] : [`${name}: ${key} "${order}"`];
        }));
        expect(drift).toEqual([]);
    });

    const LIST_TYPES = {
        items: ['grid', 'grid-cols-1', 'sm:grid-cols-2', 'xl:grid-cols-3', 'gap-2'],
        pair: ['grid', 'grid-cols-1', 'sm:grid-cols-2', 'gap-2'],
        panel: ['grid', 'grid-cols-1', '@sm:grid-cols-2', '@xl:grid-cols-3', 'gap-2'],
        panelPair: ['grid', 'grid-cols-1', '@sm:grid-cols-2', 'gap-2'],
        stack: ['grid', 'grid-cols-1', 'gap-2', 'max-w-xl'],
        sliders: ['grid', 'grid-cols-1', 'gap-2', 'max-w-2xl'],
    };
    const LAYOUT_CLASS = /^(grid|gap-.*|max-w-.*|(@?\w+:)?grid-cols-.*)$/;
    const tiles = pages.flatMap(({name, root}) => [...root.querySelectorAll('.flex.items-center.p-2.rounded-lg')]
        .filter(el => el.querySelector('[data-setting]') && !el.closest('h1, h2, h3'))
        .map(el => ({page: name, el})));
    const lists = pages.flatMap(({name, root}) => [...new Set(tiles.filter(tile => tile.page === name).map(tile => tile.el.parentElement))]
        .map(list => ({page: name, list, first: list.querySelector('[data-setting]').dataset.setting, root})));

    function typeOf(list) {
        const layout = [...list.classList].filter(name => LAYOUT_CLASS.test(name)).sort().join(' ');
        return Object.keys(LIST_TYPES).find(type => [...LIST_TYPES[type]].sort().join(' ') === layout) ?? `"${layout}"`;
    }

    function sameNatureCount(list) {
        const kinds = [...list.children].filter(child => tiles.some(tile => tile.el === child))
            .map(tile => tile.querySelector('[data-setting]'))
            .map(el => el.type === 'checkbox' ? el.classList.contains('toggle') ? 'toggle' : 'checkbox' : el.type);
        return Math.max(0, ...kinds.map(kind => kinds.filter(other => other === kind).length));
    }

    function expectedTypes(list) {
        if (list.querySelector('input[type="range"]')) return ['sliders'];
        const count = sameNatureCount(list);
        if (count < 2) return ['stack'];
        return count === 2 ? ['pair', 'panelPair'] : ['items', 'panel'];
    }

    test('a list of 2 or more same-nature tiles is an item grid capped at its count, a single tile is a stack', () => {
        const drift = lists.flatMap(({page, list, first}) => {
            const type = typeOf(list);
            const expected = expectedTypes(list);
            if (!expected.includes(type)) return [`${page}: ${first} is ${type}, expected ${expected.join(' or ')}`];
            if (type.startsWith('panel') && !list.parentElement.closest('.\\@container')) return [`${page}: ${first} has no @container`];
            return [];
        });
        expect(tiles.length).toBeGreaterThan(80);
        expect(drift).toEqual([]);
    });

    test('a list holding a slider row is the slider column, a gated sub-row spans the full list', () => {
        const drift = lists.flatMap(({page, list, first}) => {
            const type = typeOf(list);
            if (list.querySelector('input[type="range"]') && type !== 'sliders') return [`${page}: ${first} is ${type}`];
            const subRows = [...list.children].filter(child => child.querySelector('[data-enabled-by]'));
            if (type !== 'stack' && subRows.some(row => !row.classList.contains('col-span-full'))) return [`${page}: ${first} is ${type}`];
            return [];
        });
        expect(drift).toEqual([]);
    });

    test('only the keep awake tile hides by device, on a fine pointer', () => {
        const drift = tiles.filter(({el}) => [...el.classList].some(name => name.startsWith('pointer-')))
            .map(({page, el}) => `${page}: ${el.querySelector('[data-setting]').dataset.setting} ${el.className}`);
        expect(drift).toEqual([expect.stringMatching(/^radar: settingRadarKeepAwake .*\bpointer-fine:hidden\b/)]);
    });

    test('an item grid never has more columns than the tiles every device shows', () => {
        const MAX_COLUMNS = {items: 3, pair: 2, panel: 3, panelPair: 2};
        const drift = lists.flatMap(({page, list, first}) => {
            const columns = MAX_COLUMNS[typeOf(list)];
            const count = [...list.children].filter(child => tiles.some(tile => tile.el === child))
                .filter(child => !child.classList.contains('pointer-fine:hidden')).length;
            return columns && count < columns ? [`${page}: ${first} has ${count} tiles in ${columns} columns`] : [];
        });
        expect(drift).toEqual([]);
    });

    test('every div row of a slider list keeps the slider row gap and a fixed leading icon', () => {
        const drift = lists.filter(({list}) => typeOf(list) === 'sliders').flatMap(({page, list}) =>
            [...list.children].filter(row => row.tagName === 'DIV').flatMap(row => {
                const ok = ['gap-1.5', 'sm:gap-2'].every(name => row.classList.contains(name)) && !row.classList.contains('gap-2')
                    && row.firstElementChild.matches('i[data-lucide].shrink-0');
                return ok ? [] : [`${page}: ${row.querySelector('[data-setting]').dataset.setting}`];
            }));
        expect(drift).toEqual([]);
    });

    test('no tile spans columns', () => {
        const drift = tiles.filter(({el}) => [...el.classList].some(name => name.startsWith('col-span')))
            .map(({page, el}) => `${page}: ${el.querySelector('[data-setting]').dataset.setting}`);
        expect(drift).toEqual([]);
    });

    test('inside one tile list, every tile has a leading icon or none has', () => {
        const drift = lists.flatMap(({page, list, first}) => {
            const rows = [...list.children].filter(child => tiles.some(tile => tile.el === child));
            const withIcon = rows.filter(row => row.querySelector(':scope > i[data-lucide]')).length;
            return withIcon === 0 || withIcon === rows.length ? [] : [`${page}: ${first} ${withIcon}/${rows.length}`];
        });
        expect(drift).toEqual([]);
    });

    test('a number input tile keeps its label on one line', () => {
        const drift = tiles.filter(({el}) => el.querySelector('input[type="number"]')).flatMap(({page, el}) => {
            const key = el.querySelector('input[type="number"]').dataset.setting;
            return el.querySelector(`[data-setting-label="${key}"]`)?.classList.contains('whitespace-nowrap') ? [] : [`${page}: ${key}`];
        });
        expect(drift).toEqual([]);
    });

    test('every gated sub-row is the min HP row: indented, input first, then its text-xs label', () => {
        const drift = all('[data-enabled-by]').flatMap(({page, el}) => {
            const row = el.parentElement;
            const ok = row.tagName === 'LABEL' && row.firstElementChild === el && row.parentElement.classList.contains('ml-8')
                && ['input', 'input-bordered', 'input-sm', 'w-32'].every(name => el.classList.contains(name))
                && el.nextElementSibling?.matches(`[data-setting-label="${el.dataset.setting}"].text-xs`);
            return ok ? [] : [`${page}: ${el.dataset.setting}`];
        });
        expect(drift).toEqual([]);
    });

    test('no slider row sits in a column split by viewport width', () => {
        const drift = tiles.filter(({el}) => el.querySelector('input[type="range"]')).flatMap(({page, el}) => {
            const split = [];
            for (let node = el.parentElement; node; node = node.parentElement) {
                split.push(...[...node.classList].filter(name => /^(sm|md|lg|xl|2xl):grid-cols-/.test(name)));
            }
            return split.length ? [`${page}: ${el.querySelector('[data-setting]').dataset.setting} under ${split.join(' ')}`] : [];
        });
        expect(drift).toEqual([]);
    });

    test('every slider row has a fixed label column and a tip slot, so the ranges of a column line up', () => {
        const drift = all('input[type="range"][data-setting]').flatMap(({page, el}) => {
            const label = el.parentElement.querySelector(`[data-setting-label="${el.dataset.setting}"]`);
            const slot = label?.nextElementSibling;
            const readout = el.parentElement.querySelector(`[data-value-for="${el.dataset.setting}"]`);
            const ok = ['w-16', 'shrink-0'].every(name => label.classList.contains(name))
                && ['w-14', 'shrink-0'].every(name => readout?.classList.contains(name))
                && (slot?.matches(`[data-setting-tip="${el.dataset.setting}"].shrink-0`)
                    || (slot?.matches('span.w-3.shrink-0[aria-hidden="true"]') && slot.childElementCount === 0));
            return ok ? [] : [`${page}: ${el.dataset.setting}`];
        });
        expect(drift).toEqual([]);
    });

    test('a gated sub-row sits in the single column of its toggle, right under it', () => {
        const drift = all('[data-enabled-by]').flatMap(({page, el}) => {
            const toggle = tiles.find(tile => tile.page === page
                && tile.el.querySelector(`input[type="checkbox"][data-setting="${el.dataset.enabledBy}"]`))?.el;
            let row = el;
            while (row && row.parentElement !== toggle?.parentElement) row = row.parentElement;
            const spans = [...row?.classList ?? []].filter(name => name.startsWith('col-span'));
            const ok = toggle && row && row.previousElementSibling === toggle
                && (typeOf(row.parentElement) === 'stack' ? spans.length === 0 : spans.join() === 'col-span-full');
            return ok ? [] : [`${page}: ${el.dataset.setting}`];
        });
        expect(drift).toEqual([]);
    });

    test('every number input is input-bordered input-sm', () => {
        const drift = all('input[type="number"][data-setting]').flatMap(({page, el}) => {
            const issues = [];
            if (!el.classList.contains('input-bordered')) issues.push('missing input-bordered');
            if (!el.classList.contains('input-sm')) issues.push('missing input-sm');
            return issues.map(issue => `${page}: ${el.dataset.setting} - ${issue}`);
        });
        expect(drift).toEqual([]);
    });

    test('the tooltip bubble caps its width to the viewport minus a gutter', () => {
        expect(inputCss).toMatch(/\.tooltip\[data-tip]::before\s*\{\s*max-width:\s*min\(16rem, calc\(100vw - 2rem\)\);[^}]*}/);
        expect(inputCss.match(/\.tooltip\[data-tip]/g)).toHaveLength(1);
    });

    test('a hidden tooltip bubble and tail take no layout space', () => {
        const hidden = String.raw`\.tooltip:not\(:hover\):not\(:has\(:focus-visible\)\):not\(\.tooltip-open\)`;
        expect(inputCss).toMatch(new RegExp(String.raw`${hidden}::before,\s*${hidden}::after\s*\{\s*display: none;\s*}`));
    });
});

describe('radar settings panel sections', () => {
    const NAV_ICONS = Object.fromEntries([...readFileSync(join(ROOT, 'internal/templates/data.go'), 'utf8')
        .matchAll(/Label: "([^"]+)", Icon: "([^"]+)"/g)].map(([, label, icon]) => [label, icon]));
    const panel = pages.find(page => page.name === 'radar').root.querySelector('#radarSettingsPanel');

    test('a section named like a sidebar entry uses its sidebar icon', () => {
        const drift = [...panel.querySelectorAll('section > h3')].flatMap(h3 => {
            const name = normalized(h3);
            const icon = h3.querySelector('i[data-lucide]').dataset.lucide;
            return NAV_ICONS[name] && NAV_ICONS[name] !== icon ? [`${name}: ${icon} vs ${NAV_ICONS[name]}`] : [];
        });
        expect(Object.keys(NAV_ICONS)).toContain('资源');
        expect(drift).toEqual([]);
    });
});

describe('settings debug sections', () => {
    const NAV_ICONS = Object.fromEntries([...readFileSync(join(ROOT, 'internal/templates/data.go'), 'utf8')
        .matchAll(/Label: "([^"]+)", Icon: "([^"]+)"/g)].map(([, label, icon]) => [label, icon]));
    const debug = pages.find(page => page.name === 'settings').root
        .querySelector('[data-setting="settingUiSettingsDebugOpen"]').closest('.collapse');

    test('a debug section named like a sidebar entry uses its sidebar icon', () => {
        const named = [...debug.querySelectorAll('section > h3')].filter(h3 => NAV_ICONS[normalized(h3)]);
        const drift = named.flatMap(h3 => {
            const icon = h3.querySelector('i[data-lucide]').dataset.lucide;
            return icon === NAV_ICONS[normalized(h3)] ? [] : [`${normalized(h3)}: ${icon} vs ${NAV_ICONS[normalized(h3)]}`];
        });
        expect(named.map(normalized)).toEqual(['怪物', '资源', '玩家']);
        expect(drift).toEqual([]);
    });

    test('debug tiles carry no leading icon', () => {
        const drift = [...debug.querySelectorAll('section label')].filter(label => label.querySelector(':scope > i[data-lucide]'))
            .map(label => label.querySelector('[data-setting]').dataset.setting);
        expect(drift).toEqual([]);
    });

    test('Enemies spans the card and the other groups sit two per row on wide screens', () => {
        const sections = [...debug.querySelectorAll('section')];
        const grid = sections[1].parentElement;
        expect(sections[0].parentElement.classList.contains('collapse-content')).toBe(true);
        expect(sections.slice(1).every(section => section.parentElement === grid)).toBe(true);
        expect([...grid.classList].sort()).toEqual(['2xl:grid-cols-2', 'gap-6', 'grid', 'grid-cols-1']);
    });
});

describe('collapse title icons', () => {
    const NAV_ICONS = Object.fromEntries([...readFileSync(join(ROOT, 'internal/templates/data.go'), 'utf8')
        .matchAll(/Label: "([^"]+)", Icon: "([^"]+)"/g)].map(([, label, icon]) => [label, icon]));

    // @verified 2026-10-10: a section icon matches the sidebar icon of the same domain.
    test('a collapse titled like a sidebar entry uses its sidebar icon', () => {
        const named = pages.flatMap(({name, root}) => [...root.querySelectorAll('.collapse > .collapse-title')]
            .map(title => ({name, title, label: normalized(title.querySelector('[data-setting-label]'))}))
            .filter(({label}) => NAV_ICONS[label]));
        const drift = named.filter(({title, label}) => title.firstElementChild?.dataset.lucide !== NAV_ICONS[label])
            .map(({name, label}) => `${name}: ${label}`);
        expect(named.map(({name, label}) => `${name}: ${label}`)).toEqual(['chests: 宝箱']);
        expect(drift).toEqual([]);
    });
});

describe('card sub-groups', () => {
    const SUBGROUP_GRIDS = [
        ['grid', 'grid-cols-1', '2xl:grid-cols-2', 'gap-6'],
        ['grid', 'grid-cols-1', 'md:grid-cols-2', 'gap-6'],
        ['grid', 'grid-cols-[repeat(auto-fit,minmax(min(24rem,100%),1fr))]', 'gap-4'],
        ['grid', 'grid-cols-1', '@2xl:grid-cols-2', 'gap-x-8', 'gap-y-6'],
    ].map(classes => classes.sort().join(' '));
    const layoutOf = el => [...el.classList].filter(name => /^(grid|gap-.*|(@?\w+:)?grid-cols-.*)$/.test(name)).sort().join(' ');
    const cards = pages.flatMap(({name, root}) => [...root.querySelectorAll('.collapse > .collapse-content')]
        .map(content => ({name, content, headings: [...content.querySelectorAll('h3')]}))
        .filter(({headings}) => headings.length >= 2)
        .map(card => ({...card, title: `${name}: ${normalized(card.content.parentElement.querySelector(':scope > .collapse-title [data-setting-label]'))}`})));

    // @verified 2026-10-10: sub-groups of one card sit side by side on wide screens, reusing a pattern in use.
    test('a card with two or more sub-groups puts them side by side on wide screens, through a sub-group grid in use', () => {
        const drift = cards.filter(({content, headings}) => ![...content.querySelectorAll('.grid')]
            .filter(grid => SUBGROUP_GRIDS.includes(layoutOf(grid)))
            .some(grid => [...grid.children].filter(child => headings.some(h3 => child.contains(h3))).length >= 2))
            .map(({title}) => title);
        expect(cards.map(({title}) => title)).toEqual(['chests: 迷雾', 'chests: 地下城', 'players: 警报', 'radar: 雷达设置',
            'settings: 日志', 'settings: 调试']);
        expect(drift).toEqual([]);
    });
});

describe('keyboard focus ring', () => {
    const appCss = readFileSync(join(ROOT, 'web/styles/app.css'), 'utf8');

    test('the global focus-visible outline uses a color token the daisyUI 5 theme defines', () => {
        const rule = appCss.match(/^:focus-visible\s*\{([^}]*)}/m)?.[1] ?? '';
        expect(rule).toMatch(/outline:\s*2px solid var\(--color-primary\);/);
        expect(appCss).not.toMatch(/var\(--p\)/);
    });
});
