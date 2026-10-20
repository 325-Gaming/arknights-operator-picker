/* Register trusted stylesheets here; URL parameters select names, never arbitrary URLs. */
(function (root) {
    'use strict';
    const storageKey = 'arknights-operator-picker-theme';
    const defaultName = 'wei-matrix';
    const themes = [
        { name: defaultName, label: '卫 · Matrix', dark: true, href: 'https://yubo.run/assets/css/wei-matrix.css?v=53ecd564b0af' },
    ];
    let sequence = 0;

    function initialName() {
        const query = new URLSearchParams(location.search).get('page_style');
        if (query !== null) return query;
        try { return localStorage.getItem(storageKey) || defaultName; }
        catch { return defaultName; }
    }

    async function apply(name, persist = false) {
        const theme = themes.find(item => item.name === name);
        if (!theme) throw new Error('未注册的页面主题，已保留当前主题。');
        const request = ++sequence;
        const current = document.getElementById('page-style-stylesheet');
        if (!current || current.href !== new URL(theme.href, document.baseURI).href || !current.sheet) {
            const next = document.createElement('link');
            next.rel = 'stylesheet';
            next.href = theme.href;
            // Download without applying; keep the current theme until loading succeeds.
            next.media = 'not all';
            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => finish(false), 15000);
                function finish(success) {
                    clearTimeout(timer);
                    next.onload = next.onerror = null;
                    if (!success) {
                        next.remove();
                        reject(new Error('主题加载失败，已保留当前主题，请检查网络后重试。'));
                    } else resolve();
                }
                next.onload = () => finish(true);
                next.onerror = () => finish(false);
                document.head.appendChild(next);
            });
            if (request !== sequence) { next.remove(); return null; }
            next.media = 'all';
            next.id = 'page-style-stylesheet';
            if (current) current.replaceWith(next);
        }
        if (request !== sequence) return null;
        document.documentElement.classList.toggle('dark', theme.dark);
        document.documentElement.dataset.pageStyle = name;
        let warning = '';
        if (persist) {
            try { localStorage.setItem(storageKey, name); }
            catch { warning = '主题已应用，但浏览器无法保存主题偏好。'; }
        }
        return { name, warning };
    }

    root.PickerThemes = { themes, defaultName, initialName, apply };
})(globalThis);
