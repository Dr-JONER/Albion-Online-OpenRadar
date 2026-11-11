const BADGES = {
    wifi: '🛜', ethernet: '🔌', exitlag: '🚀', vpn: '🔒', virtual: '🧪', other: '•',
};
const BADGE_LABEL = {
    wifi: '无线', ethernet: '以太网', exitlag: 'ExitLag', vpn: 'VPN', virtual: '虚拟', other: '其他',
};

export class NetworkSettingsHandler {
    constructor(container) {
        this.container = container;
        this.interfaces = [];
        this.state = null;
        this.pendingSelection = null;
    }

    async load(preservePending = false) {
        const [ifacesRes, stateRes] = await Promise.all([
            fetch('/api/network/interfaces'),
            fetch('/api/network/state'),
        ]);
        if (!ifacesRes.ok || !stateRes.ok) {
            this.container.innerHTML = `<div class="alert alert-error">无法加载网络配置。</div>`;
            return;
        }
        this.interfaces = await ifacesRes.json();
        this.state = await stateRes.json();
        if (!preservePending) this.pendingSelection = null;
        this.render();
    }

    isLocked() {
        return this.container.hasAttribute('data-locked');
    }

    render() {
        const locked = this.isLocked();
        const activeNames = new Set((this.state?.captureInterfaces ?? []).map(c => c.name));
        const checkedNames = this.pendingSelection ?? activeNames;
        const banner = this.renderBanner();
        const rows = this.interfaces.map(i => this.renderRow(i, checkedNames.has(i.name), locked)).join('');
        const lan = (this.state?.lanAddresses ?? []).map(a => {
            const safe = escapeHTML(a);
            return `<li><a data-lan-url href="http://${safe}:5001/" target="_blank" rel="noopener noreferrer" class="link link-primary break-all">http://${safe}:5001/</a></li>`;
        }).join('');
        this.container.innerHTML = `
            ${banner}
            ${this.renderExitLagNotice()}
            <h3 class="text-base font-semibold mt-2">抓包网卡</h3>
            <p class="text-sm opacity-70 mb-2">已勾选的网卡会合并抓包。至少勾选一个才会开始抓包。</p>
            <div class="flex flex-col gap-1">${rows}</div>
            <div class="flex flex-wrap items-center gap-2 mt-3">
                <button class="btn btn-sm" data-action="refresh"${locked ? ' disabled' : ''}>刷新列表</button>
                <button class="btn btn-sm btn-primary" data-action="apply" disabled>应用更改</button>
                ${locked ? '<span class="text-xs text-base-content/50">只有运行雷达的电脑可以修改此项。</span>' : ''}
            </div>
            <h3 class="text-base font-semibold mt-6">局域网访问</h3>
            <p class="text-sm opacity-70">同一局域网内的设备可以打开。与上面的抓包网卡无关。</p>
            <ul class="list-disc pl-5">${lan || '<li class="opacity-60">未检测到局域网地址。</li>'}</ul>
        `;
        this.bindEvents();
        this.updateApplyState();
    }

    renderExitLagNotice() {
        return `
            <div class="alert alert-info mb-2" data-exitlag-notice>
                <div class="flex flex-col gap-1">
                    <div class="font-semibold">在用 ExitLag？</div>
                    <div class="text-sm">
                        打开 <strong>ExitLag &rarr; Settings &rarr; Advanced Options &rarr; Redirection method</strong>，
                        选择 <strong>NDIS (legacy)</strong>。
                    </div>
                    <div class="text-sm">
                        默认的 WFP 模式会让抓包看不到 Albion 的流量，雷达将收不到数据包。
                    </div>
                </div>
            </div>
        `;
    }

    renderBanner() {
        if (this.state?.status === 'awaiting_interfaces') {
            return `<div class="alert alert-warning mb-2">⚠ 抓包未运行。请在下面至少选择一个网卡再开始。</div>`;
        }
        const n = (this.state?.captureInterfaces ?? []).length;
        return `<div class="alert alert-success mb-2">✓ 正在 ${n} 个网卡上抓包。</div>`;
    }

    renderRow(iface, checked, locked) {
        const badge = BADGES[iface.category] ?? BADGES.other;
        const label = BADGE_LABEL[iface.category] ?? BADGE_LABEL.other;
        const unavail = iface.isAvailable ? '' : ' <span class="opacity-60">（不可用）</span>';
        return `
            <label class="flex flex-wrap items-center gap-2 p-2 rounded-lg bg-base-300 cursor-pointer group hover:bg-base-300/70 transition-colors" data-iface="${escapeHTML(iface.name)}">
                <input type="checkbox" class="checkbox checkbox-primary checkbox-xs" ${checked ? 'checked' : ''} ${iface.isAvailable && !locked ? '' : 'disabled'}>
                <span class="badge badge-outline badge-sm">${badge} ${label}</span>
                <span class="flex-1 min-w-0 text-base-content/80 text-xs group-hover:text-base-content">${escapeHTML(iface.description || iface.name)}${unavail}</span>
                <span class="opacity-60 text-xs whitespace-nowrap">${escapeHTML(iface.address || '')}</span>
            </label>
        `;
    }

    bindEvents() {
        for (const cb of this.container.querySelectorAll('[data-iface] input')) {
            cb.addEventListener('change', () => this.updateApplyState());
        }
        const applyBtn = this.container.querySelector('[data-action="apply"]');
        applyBtn?.addEventListener('click', () => this.apply());
        const refreshBtn = this.container.querySelector('[data-action="refresh"]');
        refreshBtn?.addEventListener('click', () => this.refresh());
    }

    updateApplyState() {
        const selected = [...this.selectedNames()].sort();
        const current = (this.state?.captureInterfaces ?? []).map(c => c.name).sort();
        const same = selected.length === current.length && selected.every((n, i) => n === current[i]);
        this.pendingSelection = same ? null : new Set(selected);
        const btn = this.container.querySelector('[data-action="apply"]');
        if (btn) btn.disabled = same || this.isLocked();
    }

    selectedNames() {
        return [...this.container.querySelectorAll('[data-iface] input:checked')]
            .map(cb => cb.closest('[data-iface]').dataset.iface);
    }

    async apply() {
        const btn = this.container.querySelector('[data-action="apply"]');
        if (btn?.disabled) return;
        if (btn) btn.disabled = true;
        try {
            const names = this.selectedNames();
            const res = await fetch('/api/network/interfaces', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({names}),
            });
            if (!res.ok) {
                const txt = await res.text();
                window.toast?.error?.(`应用失败：${txt}`);
                await this.load();
                return;
            }
            window.toast?.success?.('抓包网卡已更新。');
            await this.load();
        } catch (err) {
            window.toast?.error?.(`网络错误：${err.message ?? err}`);
            if (btn) btn.disabled = false;
        }
    }

    async refresh() {
        try {
            const r = await fetch('/api/network/refresh', {method: 'POST'});
            if (!r.ok) {
                window.toast?.error?.('刷新失败。');
                return;
            }
            await this.load();
        } catch (err) {
            window.toast?.error?.(`刷新出错：${err.message ?? err}`);
        }
    }
}

function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
}
