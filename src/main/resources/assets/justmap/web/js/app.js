/**
 * MC 地图数据可视化 — 主应用模块
 * 连接后端 API，协调地图和图表更新
 */

const App = (() => {
    const API_BASE = '';  // Same origin
    const POLL_INTERVAL = 5000;  // 5 seconds

    let autoRefreshEnabled = true;
    let pollTimer = null;
    let lastData = null;
    let tilesLoaded = false;
    let isDemoMode = false;

    /**
     * Demo data for standalone testing (when mod server is not available).
     */
    const DEMO_DATA = {
        blocks: {
            '草方块': 28450, '石头': 18200, '泥土': 12800, '橡木': 4500,
            '橡木树叶': 3800, '沙子': 2100, '水': 5600, '煤炭矿石': 890,
            '铁矿': 650, '金矿': 120, '钻石矿': 45, '圆石': 3200,
            '木板': 1500, '砂砾': 780, '粘土': 340
        },
        biomes: {
            '平原': 35200, '森林': 22400, '桦木森林': 8600,
            '河流': 4200, '沼泽': 2800, '沙漠': 1500
        },
        entities: [
            { type: '猪', x: 120, y: 65, z: -80, category: 'passive' },
            { type: '猪', x: 125, y: 65, z: -78, category: 'passive' },
            { type: '猪', x: 118, y: 65, z: -82, category: 'passive' },
            { type: '牛', x: 200, y: 64, z: 150, category: 'passive' },
            { type: '牛', x: 205, y: 64, z: 148, category: 'passive' },
            { type: '牛', x: 198, y: 64, z: 152, category: 'passive' },
            { type: '牛', x: 210, y: 64, z: 145, category: 'passive' },
            { type: '鸡', x: 50, y: 63, z: 30, category: 'passive' },
            { type: '鸡', x: 52, y: 63, z: 28, category: 'passive' },
            { type: '僵尸', x: -100, y: 20, z: 200, category: 'hostile' },
            { type: '骷髅', x: -95, y: 18, z: 198, category: 'hostile' },
            { type: '苦力怕', x: 300, y: 12, z: -150, category: 'hostile' },
            { type: '蜘蛛', x: 302, y: 15, z: -148, category: 'hostile' },
            { type: '末影人', x: -200, y: 40, z: -300, category: 'neutral' },
            { type: '狼', x: 180, y: 65, z: 90, category: 'neutral' },
            { type: '狼', x: 182, y: 65, z: 88, category: 'neutral' },
            { type: '羊', x: -50, y: 64, z: 100, category: 'passive' },
            { type: '羊', x: -48, y: 64, z: 102, category: 'passive' },
            { type: '羊', x: -52, y: 64, z: 98, category: 'passive' },
            { type: '羊', x: -46, y: 64, z: 104, category: 'passive' },
            { type: '马', x: 400, y: 66, z: 400, category: 'passive' },
            { type: '马', x: 402, y: 66, z: 398, category: 'passive' },
            { type: '女巫', x: -150, y: 30, z: -50, category: 'hostile' },
            { type: '史莱姆', x: 80, y: 10, z: -200, category: 'hostile' },
        ],
        entityCounts: {
            '猪': 3, '牛': 4, '鸡': 2, '僵尸': 1, '骷髅': 1,
            '苦力怕': 1, '蜘蛛': 1, '末影人': 1, '狼': 2, '羊': 4,
            '马': 2, '女巫': 1, '史莱姆': 1
        },
        player: {
            x: 0, y: 64, z: 0,
            dimension: 'overworld',
            health: 20, foodLevel: 18, yaw: 0
        },
        stats: {
            loadedChunks: 49, exploredRegions: 4, totalBlocks: 82975,
            totalEntities: 24, worldName: '演示世界', serverType: 0
        },
        regions: [],
        timestamp: Date.now()
    };

    /**
     * Initialize the application.
     */
    async function init() {
        console.log('🎮 MC 地图数据可视化 初始化中...');

        // Initialize sub-modules
        Charts.init();
        MapView.init();

        // Setup UI event handlers
        _setupUI();

        // Check API connectivity
        const isConnected = await _checkConnection();

        if (isConnected) {
            _setStatus('connected', '已连接');
            console.log('✅ 已连接到模组服务器');
            // Load initial data
            await _loadInitialData();
            // Start polling
            _startPolling();
        } else {
            _setStatus('demo', '演示模式');
            console.log('📋 模组未运行，使用演示数据');
            _showDemoBanner();
            _loadDemoData();
        }

        console.log('✅ 初始化完成');
    }

    /**
     * Setup UI event handlers.
     */
    function _setupUI() {
        // Refresh button
        document.getElementById('btn-refresh').addEventListener('click', () => {
            _refreshData();
        });

        // Auto-refresh toggle
        const autoRefreshCheckbox = document.getElementById('auto-refresh');
        autoRefreshCheckbox.addEventListener('change', (e) => {
            autoRefreshEnabled = e.target.checked;
            if (autoRefreshEnabled) {
                _startPolling();
            } else {
                _stopPolling();
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'r' && e.ctrlKey) {
                e.preventDefault();
                _refreshData();
            }
            if (e.key === 'p' || e.key === 'P') {
                MapView.centerOnPlayer();
            }
        });
    }

    /**
     * Check if the mod API is reachable.
     */
    async function _checkConnection() {
        try {
            const response = await fetch(`${API_BASE}/api/status`, {
                method: 'GET',
                signal: AbortSignal.timeout(3000)
            });
            return response.ok;
        } catch (e) {
            return false;
        }
    }

    /**
     * Load initial data (tiles + first data fetch).
     */
    async function _loadInitialData() {
        try {
            // Load regions and tiles
            const regions = await _fetchJSON('/api/regions');
            if (regions && regions.length > 0) {
                MapView.loadTiles(regions);
                tilesLoaded = true;
            }

            // Load data
            await _refreshData();
        } catch (e) {
            console.error('Failed to load initial data:', e);
        }
    }

    /**
     * Refresh data from the API.
     */
    async function _refreshData() {
        if (isDemoMode) {
            // Slightly randomize demo data for realism
            _randomizeDemoData();
            _updateView(DEMO_DATA);
            return;
        }

        try {
            const data = await _fetchJSON('/api/data');
            if (data) {
                lastData = data;
                _updateView(data);

                // Load tiles if not yet loaded and data has regions
                if (!tilesLoaded && data.regions && data.regions.length > 0) {
                    MapView.loadTiles(data.regions);
                    tilesLoaded = true;
                }
            }
        } catch (e) {
            console.warn('Failed to fetch data, switching to demo mode:', e.message);
            _setStatus('disconnected', '连接断开');
        }
    }

    /**
     * Update all views with new data.
     */
    function _updateView(data) {
        // Update charts
        Charts.updateAll(data);

        // Update map overlays
        MapView.updateHeatmap(data.entities || []);
        MapView.updateEntityMarkers(data.entities || []);
        MapView.updatePlayerMarker(data.player);

        // Update footer
        _updateFooter(data);
    }

    /**
     * Update footer status bar.
     */
    function _updateFooter(data) {
        if (data.player) {
            document.getElementById('player-pos').textContent =
                `(${Math.round(data.player.x)}, ${Math.round(data.player.y)}, ${Math.round(data.player.z)})`;
            document.getElementById('player-dim').textContent = _translateDimension(data.player.dimension);
        }

        if (data.stats) {
            document.getElementById('loaded-chunks').textContent = data.stats.loadedChunks;
            document.getElementById('explored-regions').textContent = data.stats.exploredRegions;
            document.getElementById('world-name').textContent = data.stats.worldName || '未知';
        }

        if (data.entities) {
            document.getElementById('entity-count').textContent = data.entities.length;
        }
    }

    /**
     * Translate dimension ID to display name.
     */
    function _translateDimension(dim) {
        const names = {
            'overworld': '主世界',
            'the_nether': '下界',
            'the_end': '末地'
        };
        return names[dim] || dim;
    }

    /**
     * Start polling for data updates.
     */
    function _startPolling() {
        _stopPolling();
        if (!autoRefreshEnabled) return;

        pollTimer = setInterval(() => {
            _refreshData();
        }, POLL_INTERVAL);
    }

    /**
     * Stop polling.
     */
    function _stopPolling() {
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
    }

    /**
     * Load demo data for standalone mode.
     */
    function _loadDemoData() {
        isDemoMode = true;
        _randomizeDemoData();
        _updateView(DEMO_DATA);
    }

    /**
     * Slightly randomize demo data to simulate real-time changes.
     */
    function _randomizeDemoData() {
        // Randomize player position slightly
        DEMO_DATA.player.x += (Math.random() - 0.5) * 4;
        DEMO_DATA.player.z += (Math.random() - 0.5) * 4;

        // Randomize some entity positions
        DEMO_DATA.entities.forEach(e => {
            if (e.category !== 'hostile' || Math.random() > 0.7) {
                e.x += (Math.random() - 0.5) * 6;
                e.z += (Math.random() - 0.5) * 6;
            }
        });

        DEMO_DATA.timestamp = Date.now();
    }

    /**
     * Show the demo mode banner.
     */
    function _showDemoBanner() {
        const banner = document.createElement('div');
        banner.className = 'demo-banner visible';
        banner.innerHTML = '⚠️ 演示模式 — 模组未运行。按 V 键在游戏中启动实时数据。';
        document.body.insertBefore(banner, document.body.firstChild);
    }

    /**
     * Update connection status display.
     */
    function _setStatus(status, text) {
        const badge = document.getElementById('connection-status');
        badge.className = `status-badge status-${status}`;
        badge.querySelector('.status-text').textContent = text;
    }

    /**
     * Fetch JSON from API endpoint.
     */
    async function _fetchJSON(path) {
        try {
            const response = await fetch(`${API_BASE}${path}`, {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                signal: AbortSignal.timeout(5000)
            });
            if (!response.ok) return null;
            return await response.json();
        } catch (e) {
            console.warn(`Failed to fetch ${path}:`, e.message);
            return null;
        }
    }

    // Public API
    return { init };
})();

// Start the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
