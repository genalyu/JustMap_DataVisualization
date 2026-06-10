package ru.bulldog.justmap.visualization;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Data models for the visualization system.
 * These are serialized to JSON via Gson (bundled with Minecraft).
 */
public class VisDataModels {

    /**
     * Root data object containing all visualization data.
     */
    public static class VisData {
        public Map<String, Integer> blocks = new HashMap<>();
        public Map<String, Integer> biomes = new HashMap<>();
        public List<EntityInfo> entities = new ArrayList<>();
        public Map<String, Integer> entityCounts = new HashMap<>();
        public PlayerInfo player;
        public StatsInfo stats;
        public List<RegionInfo> regions = new ArrayList<>();
        public long timestamp;

        public VisData() {
            this.timestamp = System.currentTimeMillis();
        }
    }

    /**
     * Entity position and type information.
     */
    public static class EntityInfo {
        public String type;
        public double x;
        public double y;
        public double z;
        public String category; // "passive", "hostile", "neutral", "player"

        public EntityInfo() {}

        public EntityInfo(String type, double x, double y, double z, String category) {
            this.type = type;
            this.x = x;
            this.y = y;
            this.z = z;
            this.category = category;
        }
    }

    /**
     * Player position and state information.
     */
    public static class PlayerInfo {
        public double x;
        public double y;
        public double z;
        public String dimension;
        public int health;
        public int foodLevel;
        public float yaw;

        public PlayerInfo() {}

        public PlayerInfo(double x, double y, double z, String dimension) {
            this.x = x;
            this.y = y;
            this.z = z;
            this.dimension = dimension;
        }
    }

    /**
     * General statistics about the loaded world data.
     */
    public static class StatsInfo {
        public int loadedChunks;
        public int exploredRegions;
        public int totalBlocks;
        public int totalEntities;
        public String worldName;
        public long serverType; // 0 = singleplayer, 1 = multiplayer

        public StatsInfo() {}
    }

    /**
     * Information about an explored map region (PNG tile).
     */
    public static class RegionInfo {
        public int regionX;
        public int regionZ;
        public String layer;
        public int level;

        public RegionInfo() {}

        public RegionInfo(int regionX, int regionZ, String layer, int level) {
            this.regionX = regionX;
            this.regionZ = regionZ;
            this.layer = layer;
            this.level = level;
        }

        /**
         * Returns the block coordinate of the region's origin (top-left corner).
         * Each region is 512x512 blocks.
         */
        public int getBlockX() {
            return regionX << 9;
        }

        /**
         * Returns the block coordinate of the region's origin (top-left corner).
         * Each region is 512x512 blocks.
         */
        public int getBlockZ() {
            return regionZ << 9;
        }
    }
}
