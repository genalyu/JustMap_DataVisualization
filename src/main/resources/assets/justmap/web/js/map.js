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
     * @param {Array} regions - Array of RegionInfo objects
     */
    function loadTiles(regions) {
        if (!regions || regions.length === 0) {
            console.log('No map tiles to load');
            return;
        }

        // Remove old overlays
        tileOverlays.forEach(overlay => map.removeLayer(overlay));
        tileOverlays = [];

        // Filter to surface layer only for base map
        const surfaceRegions = regions.filter(r => r.layer === 'surface');

        if (surfaceRegions.length === 0) {
            console.log('No surface regions found');
            return;
        }

        // Calculate bounds to fit all regions
        let minLat = Infinity, maxLat = -Infinity;
        let minLng = Infinity, maxLng = -Infinity;

        surfaceRegions.forEach(region => {
            // Each region is 512x512 blocks
            // MC coordinates: X = lng, Z = lat (inverted for Leaflet)
            const blockX = region.regionX * 512;
            const blockZ = region.regionZ * 512;

            // Leaflet Simple CRS: [lat, lng] = [z, x]
            const bounds = [
                [blockZ, blockX],
                [blockZ + 512, blockX + 512]
            ];

            const overlay = L.imageOverlay(
                `/api/tiles/${region.regionX}/${region.regionZ}.png?layer=${region.layer}&level=${region.level}`,
                bounds,
                {
                    opacity: 0.95,
                    interactive: true
                }
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

        // Fit map to tile bounds
        if (minLat !== Infinity) {
            map.fitBounds([[minLat, minLng], [maxLat, maxLng]], {
                padding: [30, 30]
            });
        }
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
     * @param {Array} entities - Array of EntityInfo objects
     */
    function updateEntityMarkers(entities) {
        entityGroup.clearLayers();
        entityMarkers = [];

        if (!entities || !showEntities) return;

        // Group entities by position to avoid overlap (grid-based clustering)
        const gridSize = 8; // blocks
        const clusters = {};

        entities.forEach(e => {
            const gridX = Math.floor(e.x / gridSize);
            const gridZ = Math.floor(e.z / gridSize);
            const key = `${gridX},${gridZ}`;

            if (!clusters[key]) {
                clusters[key] = {
                    x: e.x,
                    z: e.z,
                    entities: [],
                    categories: {}
                };
            }
            clusters[key].entities.push(e);
            clusters[key].categories[e.category] = (clusters[key].categories[e.category] || 0) + 1;
        });

        // Create markers for each cluster
        Object.values(clusters).forEach(cluster => {
            const dominantCategory = Object.entries(cluster.categories)
                .sort((a, b) => b[1] - a[1])[0][0];

            const count = cluster.entities.length;
            const size = Math.min(6 + count * 2, 16);

            const icon = L.divIcon({
                className: `entity-marker ${dominantCategory}`,
                iconSize: [size, size],
                iconAnchor: [size / 2, size / 2]
            });

            const marker = L.marker([cluster.z, cluster.x], { icon: icon });

            // Tooltip with entity details
            const entityNames = [...new Set(cluster.entities.map(e => e.type))].join(', ');
            const categoryNames = { passive: '被动', hostile: '敌对', neutral: '中立', player: '玩家', other: '其他' };
            const catBreakdown = Object.entries(cluster.categories)
                .map(([k, v]) => `${categoryNames[k] || k}: ${v}`)
                .join('<br>');

            marker.bindTooltip(
                `<strong>实体 (×${count})</strong><br>` +
                `坐标: (${Math.round(cluster.x)}, ${Math.round(cluster.z)})<br>` +
                `${catBreakdown}<br>` +
                `<em style="color:#888">${entityNames}</em>`,
                { direction: 'top', offset: [0, -size / 2] }
            );

            entityGroup.addLayer(marker);
            entityMarkers.push(marker);
        });
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
