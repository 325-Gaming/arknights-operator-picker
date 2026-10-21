(function () {
    'use strict';
    const STORAGE_KEY = 'arknights-operator-picker-v1';
    const DATA_URL = 'https://yubo.run/arknights/arknights-dictionary/operator.json';
    const freshState = () => ({ version: 2, seed: '', seedSuffix: '', filters: {}, manualMode: 'exclude', manualIds: [], count: 1, history: [], dataSignature: '' });

    Vue.createApp({
        setup() {
            const { computed, onMounted, reactive, ref } = Vue;
            const state = reactive(freshState());
            const settingsExpanded = ref(true);
            const historyExpanded = ref(true);
            const operatorDialogVisible = ref(false);
            const operatorDialogKind = ref('drawn');
            const operators = ref([]);
            const loading = ref(true);
            const error = ref('');
            const notice = ref('');
            const themeName = ref(PickerThemes.defaultName);
            const themeLoading = ref(false);
            const themeNotice = ref('');
            async function changeTheme(name, persist = true) {
                themeLoading.value = true;
                themeNotice.value = '';
                try {
                    const result = await PickerThemes.apply(name, persist);
                    if (result) {
                        themeName.value = result.name;
                        themeNotice.value = result.warning;
                    }
                } catch (reason) {
                    themeNotice.value = reason.message;
                } finally {
                    themeLoading.value = false;
                }
            }
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (raw) {
                    const saved = JSON.parse(raw);
                    if (saved.seedSuffix !== undefined && typeof saved.seedSuffix !== 'string') throw new Error('种子后半部分格式异常');
                    if (![1, 2].includes(saved.version) || typeof saved.seed !== 'string' || !saved.filters || Array.isArray(saved.filters) || !Object.values(saved.filters).every(Array.isArray) || !Array.isArray(saved.manualIds) || !saved.manualIds.every(id => typeof id === 'string') || !['include', 'exclude'].includes(saved.manualMode) || !Number.isInteger(saved.count) || saved.count < 1 || !Array.isArray(saved.history) || !saved.history.every((batch, i) => batch.sequence === i && (saved.version === 1 || ['draw', 'return'].includes(batch.type)) && typeof batch.time === 'string' && Array.isArray(batch.candidateIds) && Array.isArray(batch.operators) && batch.operators.every(operator => typeof operator.id === 'string' && typeof operator.name === 'string'))) {
                        throw new Error('记录格式不兼容');
                    }
                    if (saved.version === 1) saved.history = saved.history.map(batch => ({ ...batch, type: 'draw' }));
                    Object.assign(state, saved, { version: 2 });
                }
            } catch {
                notice.value = '本地记录无法读取，已使用默认设置。原记录在下一次保存前保留。';
            }
            const seedInput = ref(state.seed);
            const effectiveSeed = computed(() => state.seedSuffix ? `${seedInput.value}-${state.seedSuffix}` : seedInput.value);
            function useTodaySeedSuffix() {
                if (state.history.length) return;
                const parts = new Intl.DateTimeFormat('en-US', {
                    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
                }).formatToParts(new Date());
                state.seedSuffix = ['year', 'month', 'day'].map(type => parts.find(part => part.type === type).value).join('');
                save();
            }
            function generateSeedSuffix() {
                if (state.history.length) return;
                try {
                    const bytes = crypto.getRandomValues(new Uint8Array(12));
                    state.seedSuffix = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
                    save();
                } catch {
                    ElementPlus.ElMessage.warning('无法生成随机字符串，请手动填写后半部分。');
                }
            }
            const drawnIds = computed(() => {
                const ids = new Set();
                for (const batch of state.history) {
                    for (const operator of batch.operators) {
                        if (batch.type === 'return') ids.delete(operator.id);
                        else ids.add(operator.id);
                    }
                }
                return ids;
            });
            const currentDrawn = computed(() => {
                const held = new Map();
                for (const batch of state.history) {
                    for (const operator of batch.operators) {
                        if (batch.type === 'return') held.delete(operator.id);
                        else held.set(operator.id, operator);
                    }
                }
                return [...held.values()];
            });
            const drawCount = computed(() => state.history.filter(batch => batch.type === 'draw').length);
            const eligible = computed(() => operators.value.filter(operator => {
                const selected = state.manualIds.includes(operator.id);
                return Picker.matches(operator, state.filters) && (state.manualMode === 'include' ? selected : !selected);
            }));
            const remaining = computed(() => eligible.value.filter(operator => !drawnIds.value.has(operator.id)));
            const dialogOperators = computed(() => operatorDialogKind.value === 'drawn' ? currentDrawn.value : remaining.value);
            function showOperators(kind) {
                operatorDialogKind.value = kind;
                operatorDialogVisible.value = true;
            }
            const latest = computed(() => state.history.filter(batch => batch.type === 'draw').at(-1));
            const reversedHistory = computed(() => [...state.history].reverse());
            function save() {
                state.seed = seedInput.value;
                try {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
                } catch {
                    notice.value = '浏览器无法保存记录，刷新或关闭页面后本次进度可能丢失。';
                }
            }
            function optionsFor(definition) {
                return [...new Set(operators.value.flatMap(operator => {
                    const value = definition.getValue ? definition.getValue(operator) : operator[definition.key];
                    return Array.isArray(value) ? value : [value];
                }).filter(value => value !== undefined && value !== null))].sort((a, b) => {
                    const order = definition.order || [];
                    const rank = value => order.includes(value) ? order.indexOf(value) : order.length;
                    return rank(a) - rank(b) || (typeof a === 'number' ? a - b : String(a).localeCompare(String(b), 'zh-CN'));
                });
            }
            async function loadData() {
                loading.value = true;
                error.value = '';
                try {
                    const response = await fetch(DATA_URL, { cache: 'no-cache' });
                    if (!response.ok) throw new Error('HTTP ' + response.status);
                    const data = await response.json();
                    const normalized = Object.entries(data).map(([name, value]) => ({ ...value, name }));
                    if (!normalized.length || normalized.some(operator => typeof operator.id !== 'string' || !Number.isInteger(operator.rarity) || typeof operator.job !== 'string') || new Set(normalized.map(operator => operator.id)).size !== normalized.length) throw new Error('干员数据格式异常');
                    operators.value = normalized.sort((a, b) => {
                        const pinyin = operator => Array.isArray(operator.pinyin) ? operator.pinyin.join(' ') : '';
                        const left = pinyin(a);
                        const right = pinyin(b);
                        return Number(!left) - Number(!right)
                            || left.localeCompare(right, 'en')
                            || a.name.localeCompare(b.name, 'zh-CN');
                    });
                    const signature = String(Picker.hash(JSON.stringify(normalized.slice().sort((a, b) => a.id < b.id ? -1 : 1))));
                    if (state.dataSignature && state.dataSignature !== signature) notice.value = '干员数据已更新：历史记录保留，后续抽取使用当前数据和筛选条件。';
                    state.dataSignature = signature;
                } catch (reason) {
                    error.value = '干员数据加载失败：' + reason.message + '。请检查网络或数据源的跨域访问设置。';
                } finally {
                    loading.value = false;
                }
            }
            function draw() {
                if (loading.value || error.value || !seedInput.value.trim()) return;
                try {
                    const picked = Picker.pick(effectiveSeed.value, drawCount.value, remaining.value, state.count);
                    state.history.push({ type: 'draw', sequence: state.history.length, time: new Date().toISOString(), dataSignature: state.dataSignature, filters: JSON.parse(JSON.stringify(state.filters)), manualMode: state.manualMode, manualIds: [...state.manualIds], candidateIds: remaining.value.map(operator => operator.id).sort(), operators: picked.map(({ id, name, rarity, job }) => ({ id, name, rarity, job })) });
                    save();
                } catch (reason) {
                    ElementPlus.ElMessage.warning(reason.message);
                }
            }
            function returnOperator(operator) {
                const held = currentDrawn.value.find(item => item.id === operator.id);
                if (!held) return;
                operator = held;
                const last = state.history.at(-1);
                if (last && last.type === 'return') {
                    last.operators.push({ ...operator });
                    last.operators.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
                    last.time = new Date().toISOString();
                } else {
                    state.history.push({ type: 'return', sequence: state.history.length, time: new Date().toISOString(), candidateIds: [], operators: [{ ...operator }] });
                }
                save();
            }
            async function undo() {
                try {
                    await ElementPlus.ElMessageBox.confirm('撤销最近一条操作记录？若为合并的放回记录，将整条撤销。', '撤销操作', { confirmButtonText: '撤销', cancelButtonText: '取消', type: 'warning' });
                    state.history.pop();
                    save();
                } catch {}
            }
            async function restart() {
                try {
                    await ElementPlus.ElMessageBox.confirm('清空本轮全部操作记录？筛选设置和当前种子会保留，随后可修改种子。', '重新开始', { confirmButtonText: '清空并开始', cancelButtonText: '取消', type: 'warning' });
                    state.history = [];
                    save();
                } catch {}
            }
            onMounted(loadData);
            onMounted(() => changeTheme(PickerThemes.initialName(), false));
            return { state, settingsExpanded, historyExpanded, operatorDialogVisible, operatorDialogKind, dialogOperators, showOperators, seedInput, effectiveSeed, useTodaySeedSuffix, generateSeedSuffix, operators, loading, error, notice, themes: PickerThemes.themes, themeName, themeLoading, themeNotice, changeTheme, filterDefinitions: Picker.filterDefinitions, eligible, remaining, drawnIds, returnOperator, latest, reversedHistory, optionsFor, save, loadData, draw, undo, restart, formatTime: value => new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) };
        },
    }).use(ElementPlus).mount('#app');
    document.getElementById('startup').remove();
})();
