const { createApp, ref, computed, onMounted, reactive } = Vue;

createApp({
    setup() {
        // 設定 CSV 連結
        const googleSheetUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSj5mhmCmAp62ZmWryBz4__1C7hDx3-S6jI87iPHMQKBy8PhuTMHdsb9xMZnJQhV8L9kTaiBaUQGH8B/pub?gid=1958911966&single=true&output=csv';

        const isLoading = ref(true);
        const currentStore = ref('zhubei');

        const storeData = reactive({
            zhubei: { name: '竹北店', revenue: 0, target: 2100000, foodCostRate: 0, laborCostRate: 0 },
            jingguo: { name: '經國門市', revenue: 0, target: 1500000, foodCostRate: 0, laborCostRate: 0 }
        });

        const historyData = reactive([]);
        const foodLimit = 40.0;
        const laborLimit = 28.0;

        const staffList = ref([
            { dept: '內場', title: '料理長', count: 1, weight: 3.0 },
            { dept: '內場', title: '副料理長', count: 1, weight: 2.0 },
            { dept: '內場', title: '正職人員', count: 4, weight: 1.0 },
            { dept: '外場', title: '店長', count: 1, weight: 3.0 },
            { dept: '外場', title: '副店長', count: 1, weight: 2.0 },
            { dept: '外場', title: '正職人員', count: 1, weight: 1.0 },
        ]);

        const activeData = computed(() => storeData[currentStore.value]);
        const currentStoreName = computed(() => activeData.value.name);
        const activeStaffList = computed(() => staffList.value);

        // 歷史報表邏輯
        const currentStoreHistory = computed(() => {
            let list = historyData.filter(h => h.store.includes(currentStore.value === 'zhubei' ? '竹北' : '經國'));
            list.sort((a, b) => new Date(a.month) - new Date(b.month));
            return list.map((item, index) => {
                let mom = 0;
                let foodDiff = 0;
                let laborDiff = 0;
                if (index > 0) {
                    const prev = list[index - 1];
                    if (prev.revenue > 0) mom = ((item.revenue - prev.revenue) / prev.revenue) * 100;
                    foodDiff = item.food - prev.food;
                    laborDiff = item.labor - prev.labor;
                }
                return { 
                    ...item, 
                    mom: mom.toFixed(1),
                    foodDiff, laborDiff
                };
            }).reverse();
        });

        // 資料抓取邏輯
        const fetchData = () => {
            isLoading.value = true;
            const urlWithTimestamp = googleSheetUrl + '&t=' + new Date().getTime();
            
            Papa.parse(urlWithTimestamp, {
                download: true,
                header: false,
                complete: function(results) {
                    const rows = results.data;
                    storeData.zhubei.revenue = 0;
                    storeData.jingguo.revenue = 0;
                    historyData.splice(0);

                    let historyHeaderIndex = -1;
                    let colMap = { month: -1, zb_rev: -1, zb_food: -1, zb_labor: -1, jg_rev: -1, jg_food: -1, jg_labor: -1 };

                    rows.forEach((row, rowIndex) => {
                        row.forEach((cell, colIndex) => {
                            if (!cell) return;
                            const str = cell.toString().trim();
                            
                            let val = NaN;
                            for (let offset = 1; offset <= 5; offset++) {
                                const potentialCell = row[colIndex + offset];
                                if (potentialCell) {
                                    const cleanVal = potentialCell.toString().replace(/,/g, '').replace(/%/g, '').trim();
                                    if (cleanVal !== '' && !isNaN(parseFloat(cleanVal))) {
                                        val = parseFloat(cleanVal);
                                        break;
                                    }
                                }
                            }

                            if (!isNaN(val)) {
                                if (str.includes('竹北') && (str.includes('業績') || str.includes('Revenue'))) storeData.zhubei.revenue = val;
                                if (str.includes('竹北') && str.includes('目標')) storeData.zhubei.target = val;
                                if (str.includes('竹北') && (str.includes('食材') || str.includes('Food'))) storeData.zhubei.foodCostRate = val;
                                if (str.includes('竹北') && (str.includes('人事') || str.includes('Labor'))) storeData.zhubei.laborCostRate = val;

                                if (str.includes('經國') && str.includes('業績')) storeData.jingguo.revenue = val;
                                if (str.includes('經國') && str.includes('目標')) storeData.jingguo.target = val;
                                if (str.includes('經國') && str.includes('食材')) storeData.jingguo.foodCostRate = val;
                                if (str.includes('經國') && str.includes('人事')) storeData.jingguo.laborCostRate = val;
                            }

                            if (str.includes('月份')) historyHeaderIndex = rowIndex;
                        });
                    });

                    if (historyHeaderIndex !== -1) {
                        const headerRow = rows[historyHeaderIndex];
                        headerRow.forEach((cell, idx) => {
                            if (!cell) return;
                            const h = cell.toString().trim();
                            if (h.includes('月份')) colMap.month = idx;
                            if (h.includes('竹北') && h.includes('業績')) colMap.zb_rev = idx;
                            if (h.includes('竹北') && h.includes('食材')) colMap.zb_food = idx;
                            if (h.includes('竹北') && h.includes('人事')) colMap.zb_labor = idx;
                            if (h.includes('經國') && h.includes('業績')) colMap.jg_rev = idx;
                            if (h.includes('經國') && h.includes('食材')) colMap.jg_food = idx;
                            if (h.includes('經國') && h.includes('人事')) colMap.jg_labor = idx;
                        });

                        for (let i = historyHeaderIndex + 1; i < rows.length; i++) {
                            const row = rows[i];
                            const month = row[colMap.month];
                            if (!month) continue;

                            if (colMap.zb_rev !== -1 && row[colMap.zb_rev]) {
                                historyData.push({
                                    store: '竹北',
                                    month: month,
                                    revenue: parseFloat(row[colMap.zb_rev].toString().replace(/,/g, '')),
                                    food: parseFloat(row[colMap.zb_food]),
                                    labor: parseFloat(row[colMap.zb_labor])
                                });
                            }
                            if (colMap.jg_rev !== -1 && row[colMap.jg_rev]) {
                                historyData.push({
                                    store: '經國',
                                    month: month,
                                    revenue: parseFloat(row[colMap.jg_rev].toString().replace(/,/g, '')),
                                    food: parseFloat(row[colMap.jg_food]),
                                    labor: parseFloat(row[colMap.jg_labor])
                                });
                            }
                        }
                    }
                    setTimeout(() => { isLoading.value = false; }, 600);
                },
                error: function() { isLoading.value = false; }
            });
        };

        onMounted(() => { fetchData(); });

        // 等級計算邏輯
        const currentTier = computed(() => {
            const r = activeData.value.revenue;
            const t = activeData.value.target;
            if (!t || t === 0) return 0;
            const ratio = r / t;
            if (ratio >= 1.2) return 3; 
            if (ratio >= 1.1) return 2;
            if (ratio >= 1.0) return 1;
            return 0;
        });

        const currentRate = computed(() => {
            if (currentTier.value === 3) return 0.20;
            if (currentTier.value === 2) return 0.15;
            if (currentTier.value === 1) return 0.10;
            return 0;
        });

        const tierName = computed(() => {
            if (currentTier.value === 3) return "卓越巔峰 (Level 3)";
            if (currentTier.value === 2) return "表現優異 (Level 2)";
            if (currentTier.value === 1) return "目標達成 (Level 1)";
            return "尚未達標";
        });

        const tierCardClass = computed(() => {
            if (currentTier.value === 3) return "tier-3"; 
            if (currentTier.value === 2) return "tier-2"; 
            if (currentTier.value === 1) return "tier-1"; 
            return "tier-0"; 
        });

        const revenueTextClass = computed(() => {
            if (currentTier.value === 3) return "text-gradient-gold";
            if (currentTier.value === 2) return "text-[#d97706]";
            if (currentTier.value === 1) return "text-[#B21F2C]";
            return "text-gray-400";
        });

        const revenueSubTextClass = computed(() => {
            if (currentTier.value >= 2) return "text-[#b45309]";
            if (currentTier.value === 1) return "text-[#B21F2C]";
            return "text-gray-400";
        });

        const progressBarClass = computed(() => {
            if (currentTier.value === 3) return "bg-[#b45309] progress-shimmer"; 
            if (currentTier.value === 2) return "bg-[#d97706] progress-shimmer"; 
            if (currentTier.value === 1) return "bg-[#B21F2C]"; 
            return "bg-gray-300"; 
        });

        const tierTextClass = computed(() => {
            if (currentTier.value === 3) return "text-[#b45309]";
            if (currentTier.value === 2) return "text-[#d97706]";
            if (currentTier.value === 1) return "text-[#B21F2C]";
            return "text-gray-400";
        });

        const initialPool = computed(() => {
            const excess = Math.max(0, activeData.value.revenue - activeData.value.target);
            return excess * currentRate.value;
        });

        const calculatePenalty = (rev, rate, limit) => {
            if (rate > limit) {
                return rev * ((rate - limit) / 100);
            }
            return 0;
        };

        const totalPenalty = computed(() => {
            let penalty = 0;
            const r = activeData.value.revenue;
            const f = activeData.value.foodCostRate;
            const l = activeData.value.laborCostRate;
            
            penalty += calculatePenalty(r, f, foodLimit);
            penalty += calculatePenalty(r, l, laborLimit);
            
            return penalty;
        });

        const finalPool = computed(() => {
            return Math.max(0, initialPool.value - totalPenalty.value);
        });

        const valuePerPoint = computed(() => {
            const totalPoints = activeStaffList.value.reduce((sum, staff) => sum + (staff.count * staff.weight), 0);
            if (totalPoints === 0) return 0;
            return finalPool.value / totalPoints;
        });

        const totalDistributed = computed(() => {
            const pointValue = valuePerPoint.value;
            return activeStaffList.value.reduce((sum, staff) => {
                return sum + (staff.weight * pointValue * staff.count);
            }, 0);
        });

        const formatCurrency = (val) => new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(val);
        const formatNumber = (val) => new Intl.NumberFormat('zh-TW').format(val);

        return {
            currentStore, currentStoreName, activeData, activeStaffList,
            currentRate, initialPool, totalPenalty, finalPool, 
            valuePerPoint, totalDistributed, foodLimit, laborLimit, currentStoreHistory,
            formatCurrency, formatNumber, isLoading, fetchData, calculatePenalty,
            tierCardClass, revenueTextClass, revenueSubTextClass, progressBarClass, 
            tierTextClass, storeData
        };
    }
}).mount('#app');
