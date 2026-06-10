/**
 * MC 地图数据可视化 — ECharts 图表模块
 * 管理方块占比、群系占比、生物统计图表
 */

const Charts = (() => {
    // Chart instances
    let blockChart = null;
    let biomeChart = null;
    let entityChart = null;

    // MC-themed color palettes
    const BLOCK_COLORS = [
        '#5d9b3a', // Grass - green
        '#7f7f7f', // Stone - gray
        '#8b6914', // Dirt - brown
        '#3c64b6', // Water - blue
        '#c4b37d', // Sand - tan
        '#6b4c2a', // Oak Wood - dark brown
        '#3b6e29', // Oak Leaves - dark green
        '#a8a8a8', // Cobblestone - light gray
        '#cf4a1e', // Lava - red-orange
        '#fcdb05', // Gold - yellow
        '#4aedd9', // Diamond - cyan
        '#e74c3c', // Redstone - red
        '#2c2c2c', // Obsidian - near black
        '#f5e6a3', // Birch Wood - light tan
        '#5e3a1a', // Dark Oak - very brown
    ];

    const BIOME_COLORS = [
        '#4a9eff', // Ocean - blue
        '#5cb85c', // Plains - light green
        '#2d7d2d', // Forest - dark green
        '#c4b37d', // Desert - sand
        '#f0f0f0', // Snow - white
        '#8b4513', // Mountains - brown
        '#1a5c1a', // Jungle - very dark green
        '#6b8e23', // Swamp - olive
        '#87ceeb', // Beach - sky blue
        '#4169e1', // River - royal blue
        '#ff6347', // Nether - red
        '#800080', // End - purple
        '#98fb98', // Birch Forest - pale green
        '#2e8b57', // Taiga - sea green
        '#daa520', // Savanna - goldenrod
    ];

    const ENTITY_COLORS = {
        passive: '#5cb85c',
        hostile: '#e74c3c',
        neutral: '#f0a030',
        player: '#4aedd9',
        other: '#6c6c80'
    };

    /**
     * Initialize all chart instances.
     */
    function init() {
        blockChart = echarts.init(document.getElementById('block-chart'));
        biomeChart = echarts.init(document.getElementById('biome-chart'));
        entityChart = echarts.init(document.getElementById('entity-chart'));

        // Responsive resize
        window.addEventListener('resize', () => {
            blockChart && blockChart.resize();
            biomeChart && biomeChart.resize();
            entityChart && entityChart.resize();
        });

        // Set initial empty state
        setEmptyState();
    }

    /**
     * Show empty state with placeholder messages.
     */
    function setEmptyState() {
        const emptyOption = {
            title: {
                text: '暂无数据',
                left: 'center',
                top: 'center',
                textStyle: { color: '#6c6c80', fontSize: 13 }
            }
        };
        blockChart.setOption(emptyOption);
        biomeChart.setOption(emptyOption);
        entityChart.setOption(emptyOption);
    }

    /**
     * Update all charts with new data.
     * @param {Object} data - VisData from API
     */
    function updateAll(data) {
        if (!data) return;
        updateBlockChart(data.blocks || {});
        updateBiomeChart(data.biomes || {});
        updateEntityChart(data.entityCounts || {}, data.entities || []);
    }

    /**
     * Update block distribution pie chart.
     */
    function updateBlockChart(blocks) {
        if (!blocks || Object.keys(blocks).length === 0) return;

        // Sort by count descending, take top 10 + "Other"
        const sorted = Object.entries(blocks)
            .sort((a, b) => b[1] - a[1]);

        const total = sorted.reduce((s, [, v]) => s + v, 0);
        const topN = 10;
        let chartData;

        if (sorted.length > topN) {
            const top = sorted.slice(0, topN);
            const otherCount = sorted.slice(topN).reduce((s, [, v]) => s + v, 0);
            chartData = [
                ...top.map(([name, value], i) => ({
                    name,
                    value,
                    itemStyle: { color: BLOCK_COLORS[i % BLOCK_COLORS.length] }
                })),
                {
                    name: '其他',
                    value: otherCount,
                    itemStyle: { color: '#444466' }
                }
            ];
        } else {
            chartData = sorted.map(([name, value], i) => ({
                name,
                value,
                itemStyle: { color: BLOCK_COLORS[i % BLOCK_COLORS.length] }
            }));
        }

        blockChart.setOption({
            title: null,
            tooltip: {
                trigger: 'item',
                backgroundColor: 'rgba(30, 42, 69, 0.95)',
                borderColor: '#2a3a5e',
                textStyle: { color: '#e0e0e0', fontSize: 12 },
                formatter: (params) => {
                    const pct = ((params.value / total) * 100).toFixed(1);
                    return `<strong>${params.name}</strong><br/>` +
                           `数量: ${params.value.toLocaleString()}<br/>` +
                           `占比: ${pct}%`;
                }
            },
            legend: {
                type: 'scroll',
                orient: 'vertical',
                right: 5,
                top: 10,
                bottom: 10,
                textStyle: { color: '#a0a0b0', fontSize: 11 },
                pageTextStyle: { color: '#a0a0b0' },
                pageIconColor: '#4a9eff',
                pageIconInactiveColor: '#444466'
            },
            series: [{
                type: 'pie',
                radius: ['35%', '65%'],
                center: ['35%', '50%'],
                avoidLabelOverlap: true,
                itemStyle: {
                    borderRadius: 4,
                    borderColor: '#1e2a45',
                    borderWidth: 2
                },
                label: { show: false },
                emphasis: {
                    label: {
                        show: true,
                        fontSize: 13,
                        fontWeight: 'bold',
                        color: '#e0e0e0',
                        formatter: '{b}\n{d}%'
                    },
                    itemStyle: {
                        shadowBlur: 10,
                        shadowOffsetX: 0,
                        shadowColor: 'rgba(0, 0, 0, 0.5)'
                    }
                },
                data: chartData
            }]
        }, true);
    }

    /**
     * Update biome distribution pie chart.
     */
    function updateBiomeChart(biomes) {
        if (!biomes || Object.keys(biomes).length === 0) return;

        const sorted = Object.entries(biomes)
            .sort((a, b) => b[1] - a[1]);

        const total = sorted.reduce((s, [, v]) => s + v, 0);

        const chartData = sorted.map(([name, value], i) => ({
            name,
            value,
            itemStyle: { color: BIOME_COLORS[i % BIOME_COLORS.length] }
        }));

        biomeChart.setOption({
            title: null,
            tooltip: {
                trigger: 'item',
                backgroundColor: 'rgba(30, 42, 69, 0.95)',
                borderColor: '#2a3a5e',
                textStyle: { color: '#e0e0e0', fontSize: 12 },
                formatter: (params) => {
                    const pct = ((params.value / total) * 100).toFixed(1);
                    return `<strong>${params.name}</strong><br/>` +
                           `采样数: ${params.value.toLocaleString()}<br/>` +
                           `占比: ${pct}%`;
                }
            },
            legend: {
                type: 'scroll',
                orient: 'vertical',
                right: 5,
                top: 10,
                bottom: 10,
                textStyle: { color: '#a0a0b0', fontSize: 11 },
                pageTextStyle: { color: '#a0a0b0' },
                pageIconColor: '#4a9eff',
                pageIconInactiveColor: '#444466'
            },
            series: [{
                type: 'pie',
                radius: ['0%', '65%'],
                center: ['35%', '50%'],
                roseType: 'area',
                itemStyle: {
                    borderRadius: 4,
                    borderColor: '#1e2a45',
                    borderWidth: 2
                },
                label: { show: false },
                emphasis: {
                    label: {
                        show: true,
                        fontSize: 13,
                        fontWeight: 'bold',
                        color: '#e0e0e0',
                        formatter: '{b}\n{d}%'
                    },
                    itemStyle: {
                        shadowBlur: 10,
                        shadowOffsetX: 0,
                        shadowColor: 'rgba(0, 0, 0, 0.5)'
                    }
                },
                data: chartData
            }]
        }, true);
    }

    /**
     * Update entity statistics bar chart.
     */
    function updateEntityChart(entityCounts, entityList) {
        // Aggregate by category
        const categories = { passive: 0, hostile: 0, neutral: 0, player: 0, other: 0 };
        if (entityList && entityList.length > 0) {
            entityList.forEach(e => {
                if (categories[e.category] !== undefined) {
                    categories[e.category]++;
                } else {
                    categories.other++;
                }
            });
        }

        const categoryNames = {
            passive: '被动生物',
            hostile: '敌对生物',
            neutral: '中立生物',
            player: '玩家',
            other: '其他'
        };

        const cats = Object.keys(categories).filter(k => categories[k] > 0);
        const catNames = cats.map(k => categoryNames[k]);
        const catValues = cats.map(k => categories[k]);
        const catColors = cats.map(k => ENTITY_COLORS[k]);

        // Top entity types (top 8)
        const topEntities = entityCounts ?
            Object.entries(entityCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 8) : [];

        entityChart.setOption({
            title: null,
            tooltip: {
                trigger: 'axis',
                backgroundColor: 'rgba(30, 42, 69, 0.95)',
                borderColor: '#2a3a5e',
                textStyle: { color: '#e0e0e0', fontSize: 12 },
                axisPointer: { type: 'shadow' }
            },
            grid: {
                left: 10,
                right: 10,
                top: 10,
                bottom: 30,
                containLabel: true
            },
            xAxis: {
                type: 'category',
                data: topEntities.length > 0 ?
                    topEntities.map(([name]) => name) :
                    catNames,
                axisLabel: {
                    color: '#a0a0b0',
                    fontSize: 10,
                    rotate: topEntities.length > 5 ? 30 : 0,
                    interval: 0
                },
                axisLine: { lineStyle: { color: '#2a3a5e' } },
                axisTick: { show: false }
            },
            yAxis: {
                type: 'value',
                axisLabel: { color: '#6c6c80', fontSize: 10 },
                axisLine: { show: false },
                splitLine: { lineStyle: { color: '#1a2a45' } }
            },
            series: [{
                type: 'bar',
                data: topEntities.length > 0 ?
                    topEntities.map(([, count], i) => ({
                        value: count,
                        itemStyle: {
                            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                                { offset: 0, color: BLOCK_COLORS[i % BLOCK_COLORS.length] },
                                { offset: 1, color: 'rgba(30, 42, 69, 0.8)' }
                            ]),
                            borderRadius: [4, 4, 0, 0]
                        }
                    })) :
                    cats.map((k, i) => ({
                        value: categories[k],
                        itemStyle: {
                            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                                { offset: 0, color: ENTITY_COLORS[k] },
                                { offset: 1, color: 'rgba(30, 42, 69, 0.8)' }
                            ]),
                            borderRadius: [4, 4, 0, 0]
                        }
                    })),
                barMaxWidth: 40,
                label: {
                    show: true,
                    position: 'top',
                    color: '#a0a0b0',
                    fontSize: 11
                }
            }]
        }, true);
    }

    /**
     * Dispose all chart instances (cleanup).
     */
    function dispose() {
        blockChart && blockChart.dispose();
        biomeChart && biomeChart.dispose();
        entityChart && entityChart.dispose();
        blockChart = biomeChart = entityChart = null;
    }

    return { init, updateAll, setEmptyState, dispose };
})();
