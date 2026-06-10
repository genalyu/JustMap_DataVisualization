/**
 * MC 地图数据可视化 — Leaflet 地图模块
 * 管理地图瓦片加载、热力图、实体标记、玩家位置
 */

const MapView = (() => {
    let map = null;
    let tileOverlays = [];
    let heatLayer = null;
    let entityMarkers = [];
    let playerMarker = null;

    // Toggle states
    let showHeatmap = true;
    let showEntities = true;
    let showPlayer = true;

    // Layer groups for toggling
    let heatmapGroup = null;
    let entityGroup = null;
    let playerGroup = null;

    /**
     * Initialize the Leaflet map.
     */
    function init() {
        map = L.map('map', {
            crs: L.CRS.Simple,
            minZoom: -5,
            maxZoom: 2,
            zoomControl: true,
            attributionControl: true
        });

        // Set initial view to origin
        map.setView([0, 0], -2);

        // Create layer groups
        heatmapGroup = L.layerGroup().addTo(map);
        entityGroup = L.layerGroup().addTo(map);
        playerGroup = L.layerGroup().addTo(map);

        // Add a subtle grid for reference
        _addGridOverlay();

        // Setup toggle buttons
        _setupToggleButtons();

        // Add scale indicator
        _addScaleInfo();
    }

    /**
     * Load map tiles from region data.
     * Falls back to procedural terrain generation if no tiles found.
     * @param {Array} regions - Array of RegionInfo objects
     */
    function loadTiles(regions) {
        // Remove old overlays
        tileOverlays.forEach(overlay => map.removeLayer(overlay));
        tileOverlays = [];

        // Filter to surface layer only for base map
        const surfaceRegions = regions ? regions.filter(r => r.layer === 'surface') : [];

        if (surfaceRegions && surfaceRegions.length > 0) {
            // Use real JustMap tiles
            _loadRealTiles(surfaceRegions);
        } else {
            // Fallback: generate procedural terrain for the visible area
            _loadProceduralTerrain();
        }
    }

    /**
     * Load real JustMap tile images as overlays.
     */
    function _loadRealTiles(surfaceRegions) {
        let minLat = Infinity, maxLat = -Infinity;
        let minLng = Infinity, maxLng = -Infinity;

        surfaceRegions.forEach(region => {
            const blockX = region.regionX * 512;
            const blockZ = region.regionZ * 512;
            const bounds = [
                [blockZ, blockX],
                [blockZ + 512, blockX + 512]
            ];

            const overlay = L.imageOverlay(
                `/api/tiles/${region.regionX}/${region.regionZ}.png?layer=${region.layer}&level=${region.level}`,
                bounds,
                { opacity: 0.95, interactive: true }
            );

            overlay.bindTooltip(
                `区域 (${region.regionX}, ${region.regionZ})<br>` +
                `坐标: (${blockX}, ${blockZ}) - (${blockX + 512}, ${blockZ + 512})`,
                { sticky: true }
            );

            overlay.addTo(map);
            tileOverlays.push(overlay);

            minLat = Math.min(minLat, blockZ);
            maxLat = Math.max(maxLat, blockZ + 512);
            minLng = Math.min(minLng, blockX);
            maxLng = Math.max(maxLng, blockX + 512);
        });

        if (minLat !== Infinity) {
            map.fitBounds([[minLat, minLng], [maxLat, maxLng]], { padding: [30, 30] });
        }
    }

    /**
     * Generate procedural terrain as fallback when no cached tiles exist.
     * Creates a 3x3 grid of generated tiles centered on the player.
     */
    function _loadProceduralTerrain() {
        console.log('No map tiles found, generating procedural terrain...');

        // Determine player position for center
        let cx = 0, cz = 0;
        if (lastPlayerPos) {
            cx = Math.floor(lastPlayerPos.x / 512);
            cz = Math.floor(lastPlayerPos.z / 512);
        }

        const range = 2; // 5x5 grid centered on player
        for (let rx = cx - range; rx <= cx + range; rx++) {
            for (let rz = cz - range; rz <= cz + range; rz++) {
                const blockX = rx * 512;
                const blockZ = rz * 512;
                const bounds = [
                    [blockZ, blockX],
                    [blockZ + 512, blockX + 512]
                ];

                // Generate terrain tile
                const canvas = TerrainGenerator.generateTile(rx, rz, 512);
                const dataUrl = canvas.toDataURL('image/png');

                const overlay = L.imageOverlay(dataUrl, bounds, {
                    opacity: 0.9,
                    interactive: true
                });

                overlay.bindTooltip(
                    `程序地形区域 (${rx}, ${rz})<br>` +
                    `坐标: (${blockX}, ${blockZ}) - (${blockX + 512}, ${blockZ + 512})`,
                    { sticky: true }
                );

                overlay.addTo(map);
                tileOverlays.push(overlay);
            }
        }

        // Center on player or origin
        const centerLat = lastPlayerPos ? lastPlayerPos.z : 0;
        const centerLng = lastPlayerPos ? lastPlayerPos.x : 0;
        map.setView([centerLat, centerLng], -1);
    }

    /**
     * Update heatmap layer with entity positions.
     * @param {Array} entities - Array of EntityInfo objects
     */
    function updateHeatmap(entities) {
        // Clear old heatmap
        heatmapGroup.clearLayers();

        if (!entities || entities.length === 0 || !showHeatmap) return;

        // Convert entities to heatmap points
        // leaflet-heat format: [lat, lng, intensity]
        const heatPoints = entities.map(e => {
            // Weight: hostile entities brighter, passive dimmer
            let intensity = 0.5;
            if (e.category === 'hostile') intensity = 1.0;
            else if (e.category === 'neutral') intensity = 0.7;
            else if (e.category === 'passive') intensity = 0.3;

            return [e.z, e.x, intensity];
        });

        heatLayer = L.heatLayer(heatPoints, {
            radius: 20,
            blur: 15,
            maxZoom: 2,
            max: 1.0,
            gradient: {
                0.0: '#0000ff',   // Blue - low density
                0.25: '#00ffff',  // Cyan
                0.5: '#00ff00',   // Green
                0.75: '#ffff00',  // Yellow
                1.0: '#ff0000'    // Red - high density
            }
        });

        heatmapGroup.addLayer(heatLayer);
    }

    /**
     * Update entity markers on the map.
     * Uses actual MC entity icon images (32x32 PNG).
     * @param {Array} entities - Array of EntityInfo objects
     */
    function updateEntityMarkers(entities) {
        entityGroup.clearLayers();
        entityMarkers = [];

        if (!entities || !showEntities) return;

        // Draw individual entity icons (not clustered for icon display)
        entities.forEach(e => {
            const iconUrl = _getEntityIconUrl(e);
            const iconSize = 20;

            const icon = L.icon({
                iconUrl: iconUrl,
                iconSize: [iconSize, iconSize],
                iconAnchor: [iconSize / 2, iconSize / 2],
                className: `entity-icon entity-${e.category}`
            });

            const marker = L.marker([e.z, e.x], { icon: icon });

            // Category color for tooltip border
            const catColors = {
                passive: '#5cb85c', hostile: '#e74c3c',
                neutral: '#f0a030', player: '#4aedd9', other: '#6c6c80'
            };
            const catNames = { passive: '被动', hostile: '敌对', neutral: '中立', player: '玩家', other: '其他' };
            const borderColor = catColors[e.category] || '#6c6c80';

            marker.bindTooltip(
                `<strong style="color:${borderColor}">${e.type}</strong><br>` +
                `坐标: (${Math.round(e.x)}, ${Math.round(e.y)}, ${Math.round(e.z)})<br>` +
                `类型: ${catNames[e.category] || e.category}`,
                { direction: 'top', offset: [0, -iconSize / 2] }
            );

            entityGroup.addLayer(marker);
            entityMarkers.push(marker);
        });
    }

    /**
     * Get the icon URL for an entity.
     * Tries: /entities/{name}.png → /entities/{english}.png → default
     */
    function _getEntityIconUrl(entity) {
        const name = entity.type || 'other';
        // Try original name first, then lowercase
        const candidates = [name, name.toLowerCase()];

        // Entity type to icon filename mapping (handles both CN and EN names)
        const typeMap = {
            '猪': 'pig', 'pig': 'pig',
            '牛': 'cow', 'cow': 'cow',
            '鸡': 'chicken', 'chicken': 'chicken',
            '羊': 'sheep', 'sheep': 'sheep',
            '马': 'horse', 'horse': 'horse',
            '狼': 'wolf', 'wolf': 'wolf',
            '猫': 'cat', 'cat': 'cat',
            '兔子': 'rabbit', 'rabbit': 'rabbit',
            '熊猫': 'panda', 'panda': 'panda',
            '狐狸': 'fox', 'fox': 'fox',
            '鹦鹉': 'parrot', 'parrot': 'parrot',
            '海豚': 'dolphin', 'dolphin': 'dolphin',
            '海龟': 'turtle', 'turtle': 'turtle',
            '鱼': 'cod', 'cod': 'cod',
            '鲑鱼': 'salmon', 'salmon': 'salmon',
            '僵尸': 'zombie', 'zombie': 'zombie',
            '骷髅': 'skeleton', 'skeleton': 'skeleton',
            '苦力怕': 'creeper', 'creeper': 'creeper',
            '蜘蛛': 'spider', 'spider': 'spider',
            '末影人': 'enderman', 'enderman': 'enderman',
            '女巫': 'witch', 'witch': 'witch',
            '史莱姆': 'slime', 'slime': 'slime',
            '烈焰人': 'blaze', 'blaze': 'blaze',
            '恶魂': 'ghast', 'ghast': 'ghast',
            '铁傀儡': 'iron_golem', 'iron_golem': 'iron_golem',
            '雪傀儡': 'snow_golem', 'snow_golem': 'snow_golem',
            '村民': 'villager', 'villager': 'villager',
            '流浪商人': 'wandering_trader', 'wandering_trader': 'wandering_trader',
            '掠夺者': 'pillager', 'pillager': 'pillager',
            '卫道士': 'vindicator', 'vindicator': 'vindicator',
            '唤魔者': 'evoker', 'evoker': 'evoker',
            '僵尸猪灵': 'zombified_piglin', 'zombified_piglin': 'zombified_piglin',
            '猪灵': 'piglin', 'piglin': 'piglin',
            '潜影贝': 'shulker', 'shulker': 'shulker',
            '蜜蜂': 'bee', 'bee': 'bee',
            '驴': 'donkey', 'donkey': 'donkey',
            '骡': 'mule', 'mule': 'mule',
            '北极熊': 'polar_bear', 'polar_bear': 'polar_bear',
            '蝙蝠': 'bat', 'bat': 'bat',
            '鱿鱼': 'squid', 'squid': 'squid',
            '幻翼': 'phantom', 'phantom': 'phantom',
        };

        // Check type map
        if (typeMap[name]) {
            return `/entities/${typeMap[name]}.png`;
        }

        // Try as-is with common extensions
        for (const candidate of candidates) {
            return `/entities/${candidate.toLowerCase()}.png`;
        }

        // Fallback: generic icon
        return `/entities/pig.png`;
    }

    /**
     * Update player position marker.
     * @param {Object} player - PlayerInfo object
     */
    function updatePlayerMarker(player) {
        playerGroup.clearLayers();

        if (!player || !showPlayer) return;

        const icon = L.divIcon({
            className: 'player-marker',
            html: '<div class="player-marker-inner"></div>',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });

        playerMarker = L.marker([player.z, player.x], { icon: icon, zIndexOffset: 1000 });
        playerMarker.bindTooltip(
            `<strong>⚔️ 玩家位置</strong><br>` +
            `X: ${player.x.toFixed(1)}<br>` +
            `Y: ${player.y.toFixed(1)}<br>` +
            `Z: ${player.z.toFixed(1)}<br>` +
            `维度: ${player.dimension}<br>` +
            `❤️ ${player.health} | 🍖 ${player.foodLevel}`,
            { direction: 'top', offset: [0, -16] }
        );

        playerGroup.addLayer(playerMarker);
    }

    /**
     * Center map on player position.
     */
    function centerOnPlayer() {
        if (playerMarker) {
            map.panTo(playerMarker.getLatLng());
        }
    }

    /**
     * Setup toggle button event listeners.
     */
    function _setupToggleButtons() {
        const btnHeatmap = document.getElementById('btn-toggle-heatmap');
        const btnEntities = document.getElementById('btn-toggle-entities');
        const btnPlayer = document.getElementById('btn-toggle-player');

        btnHeatmap.addEventListener('click', () => {
            showHeatmap = !showHeatmap;
            btnHeatmap.classList.toggle('active', showHeatmap);
            if (showHeatmap) {
                map.addLayer(heatmapGroup);
            } else {
                map.removeLayer(heatmapGroup);
            }
        });

        btnEntities.addEventListener('click', () => {
            showEntities = !showEntities;
            btnEntities.classList.toggle('active', showEntities);
            if (showEntities) {
                map.addLayer(entityGroup);
            } else {
                map.removeLayer(entityGroup);
            }
        });

        btnPlayer.addEventListener('click', () => {
            showPlayer = !showPlayer;
            btnPlayer.classList.toggle('active', showPlayer);
            if (showPlayer) {
                map.addLayer(playerGroup);
            } else {
                map.removeLayer(playerGroup);
            }
        });
    }

    /**
     * Add a subtle grid overlay for coordinate reference.
     */
    function _addGridOverlay() {
        // Add coordinate axes
        const axisColor = '#2a3a5e';

        // X axis (horizontal line at z=0)
        L.polyline([[-10000, 0], [10000, 0]], {
            color: axisColor, weight: 1, opacity: 0.5, dashArray: '5, 10'
        }).addTo(map);

        // Z axis (vertical line at x=0)
        L.polyline([[0, -10000], [0, 10000]], {
            color: axisColor, weight: 1, opacity: 0.5, dashArray: '5, 10'
        }).addTo(map);
    }

    /**
     * Add scale info to the map.
     */
    function _addScaleInfo() {
        // Custom control showing coordinate under cursor
        const coordControl = L.control({ position: 'bottomleft' });
        coordControl.onAdd = function () {
            const div = L.DomUtil.create('div', 'leaflet-coord-display');
            div.style.cssText = `
                background: rgba(15, 15, 35, 0.85);
                padding: 4px 10px;
                border-radius: 4px;
                font-size: 11px;
                color: #a0a0b0;
                font-family: Consolas, monospace;
                border: 1px solid #2a3a5e;
            `;
            div.innerHTML = 'X: 0, Z: 0';
            return div;
        };
        coordControl.addTo(map);

        map.on('mousemove', (e) => {
            const x = Math.round(e.latlng.lng);
            const z = Math.round(e.latlng.lat);
            coordControl.getContainer().innerHTML = `X: ${x}, Z: ${z}`;
        });
    }

    /**
     * Resize map (call after layout changes).
     */
    function resize() {
        if (map) map.invalidateSize();
    }

    return {
        init,
        loadTiles,
        updateHeatmap,
        updateEntityMarkers,
        updatePlayerMarker,
        centerOnPlayer,
        resize
    };
})();
