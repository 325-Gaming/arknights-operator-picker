/* Independent deterministic picking and extensible filter rules. */
(function (root) {
    'use strict';
    const filterDefinitions = [
        { key: 'rarity', label: '星级', order: [6, 5, 4, 3, 2, 1] },
        { key: 'job', label: '职业', order: ['先锋', '近卫', '重装', '狙击', '术师', '医疗', '辅助', '特种'] },
    ];

    function hash(text) {
        let value = 2166136261;
        for (let i = 0; i < text.length; i++) {
            value = Math.imul(value ^ text.charCodeAt(i), 16777619);
        }
        return value >>> 0;
    }

    function pick(seed, sequence, candidates, count) {
        if (!Number.isInteger(count) || count < 1 || count > candidates.length) {
            throw new Error('抽取人数必须为正整数，且不能超过剩余人数。');
        }
        const pool = [...candidates].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
        let value = hash(JSON.stringify(['picker-v1', seed, sequence, pool.map(item => item.id)]));
        function random() {
            value = (value + 0x6D2B79F5) >>> 0;
            let n = Math.imul(value ^ (value >>> 15), 1 | value);
            n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
            return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
        }
        const result = [];
        for (let i = 0; i < count; i++) result.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
        return result;
    }

    function matches(operator, filters) {
        return filterDefinitions.every(definition => {
            const selected = filters[definition.key] || [];
            if (!selected.length) return true;
            const raw = definition.getValue ? definition.getValue(operator) : operator[definition.key];
            const values = Array.isArray(raw) ? raw : [raw];
            return selected.some(value => values.includes(value));
        });
    }

    root.Picker = { filterDefinitions, hash, matches, pick };
})(globalThis);
