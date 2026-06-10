package ru.bulldog.justmap.visualization;

import java.io.File;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import net.minecraft.block.Block;
import net.minecraft.block.BlockState;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.network.ClientPlayerEntity;
import net.minecraft.client.world.ClientWorld;
import net.minecraft.entity.Entity;
import net.minecraft.entity.mob.MobEntity;
import net.minecraft.entity.passive.PassiveEntity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.util.Identifier;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.registry.Registry;
import net.minecraft.world.World;
import net.minecraft.world.biome.Biome;
import net.minecraft.world.chunk.WorldChunk;

import ru.bulldog.justmap.JustMap;
import ru.bulldog.justmap.map.data.classic.ChunkData;
import ru.bulldog.justmap.map.data.classic.ChunkLevel;
import ru.bulldog.justmap.map.data.classic.WorldData;
import ru.bulldog.justmap.map.data.classic.WorldManager;
import ru.bulldog.justmap.map.data.Layer;
import ru.bulldog.justmap.util.CurrentWorldPos;
import ru.bulldog.justmap.util.colors.BiomeColors;
import ru.bulldog.justmap.util.storage.StorageUtil;
import ru.bulldog.justmap.visualization.VisDataModels.*;

/**
 * Collects block, biome, entity, and region data from the Minecraft world
 * for the visualization system.
 */
public class DataCollector {

    private static final MinecraftClient MC = MinecraftClient.getInstance();

    /**
     * Collect all visualization data from the current world state.
     */
    public static VisData collectAll() {
        VisData data = new VisData();

        try {
            data.blocks = collectBlockStats();
            data.biomes = collectBiomeStats();
            collectEntityData(data);
            data.player = collectPlayerInfo();
            data.regions = collectRegions();
            data.stats = collectStats(data);
        } catch (Exception e) {
            JustMap.LOGGER.error("Error collecting visualization data: " + e.getMessage());
        }

        return data;
    }

    /**
     * Collect block type statistics from loaded chunks.
     * Counts the surface block type at each (x, z) position.
     */
    public static Map<String, Integer> collectBlockStats() {
        Map<String, Integer> blockCounts = new HashMap<>();
        WorldData worldData = WorldManager.WORLD_MANAGER.getWorldData();
        if (worldData == null) return blockCounts;

        World world = CurrentWorldPos.getWorld();
        if (world == null) return blockCounts;

        // Iterate through loaded chunks via the client world
        ClientWorld clientWorld = MC.world;
        if (clientWorld == null) return blockCounts;

        // Iterate chunks in a grid around the player
        BlockPos playerPos = CurrentWorldPos.currentPos();
        if (playerPos == null) return blockCounts;

        int centerChunkX = playerPos.getX() >> 4;
        int centerChunkZ = playerPos.getZ() >> 4;
        int renderDistance = MC.options.viewDistance;

        for (int cx = centerChunkX - renderDistance; cx <= centerChunkX + renderDistance; cx++) {
            for (int cz = centerChunkZ - renderDistance; cz <= centerChunkZ + renderDistance; cz++) {
                if (!clientWorld.isChunkLoaded(cx, cz)) continue;

                WorldChunk chunk = clientWorld.getChunk(cx, cz);
                if (chunk == null || chunk.isEmpty()) continue;

                // Also check if JustMap has data for this chunk
                ChunkData mapChunk = worldData.getChunk(cx, cz);
                ChunkLevel chunkLevel = mapChunk.getChunkLevel(Layer.SURFACE, 0);

                for (int lx = 0; lx < 16; lx++) {
                    for (int lz = 0; lz < 16; lz++) {
                        int height = chunkLevel.sampleHeightmap(lx, lz);
                        if (height < 0) {
                            // Fallback: use world heightmap
                            BlockPos pos = new BlockPos(
                                (cx << 4) + lx, 0, (cz << 4) + lz
                            );
                            height = world.getTopY(net.minecraft.world.Heightmap.Type.WORLD_SURFACE,
                                pos.getX(), pos.getZ()) - 1;
                        }
                        if (height < 0) continue;

                        BlockPos blockPos = new BlockPos((cx << 4) + lx, height, (cz << 4) + lz);
                        BlockState state = chunk.getBlockState(blockPos);
                        Block block = state.getBlock();

                        String blockName = getBlockDisplayName(block);
                        blockCounts.merge(blockName, 1, Integer::sum);
                    }
                }
            }
        }

        return blockCounts;
    }

    /**
     * Collect biome distribution statistics.
     * Samples biomes at regular intervals across loaded chunks.
     */
    public static Map<String, Integer> collectBiomeStats() {
        Map<String, Integer> biomeCounts = new HashMap<>();
        ClientWorld clientWorld = MC.world;
        if (clientWorld == null) return biomeCounts;

        BlockPos playerPos = CurrentWorldPos.currentPos();
        if (playerPos == null) return biomeCounts;

        int centerChunkX = playerPos.getX() >> 4;
        int centerChunkZ = playerPos.getZ() >> 4;
        int renderDistance = MC.options.viewDistance;

        // Sample every 4 blocks for performance
        int sampleStep = 4;

        for (int cx = centerChunkX - renderDistance; cx <= centerChunkX + renderDistance; cx++) {
            for (int cz = centerChunkZ - renderDistance; cz <= centerChunkZ + renderDistance; cz++) {
                if (!clientWorld.isChunkLoaded(cx, cz)) continue;

                for (int lx = 0; lx < 16; lx += sampleStep) {
                    for (int lz = 0; lz < 16; lz += sampleStep) {
                        int worldX = (cx << 4) + lx;
                        int worldZ = (cz << 4) + lz;
                        int worldY = clientWorld.getTopY(net.minecraft.world.Heightmap.Type.WORLD_SURFACE, worldX, worldZ);

                        BlockPos biomePos = new BlockPos(worldX, worldY - 1, worldZ);
                        Biome biome = clientWorld.getBiome(biomePos);

                        String biomeName = getBiomeDisplayName(clientWorld, biome);
                        // Each sample represents sampleStep*sampleStep blocks
                        biomeCounts.merge(biomeName, sampleStep * sampleStep, Integer::sum);
                    }
                }
            }
        }

        return biomeCounts;
    }

    /**
     * Collect entity data including positions and counts by type.
     */
    public static void collectEntityData(VisData data) {
        ClientWorld clientWorld = MC.world;
        if (clientWorld == null) return;

        List<Entity> entities = new ArrayList<>();
        for (Entity entity : clientWorld.getEntities()) {
            entities.add(entity);
        }
        if (entities.isEmpty()) return;

        Map<String, Integer> entityCounts = new HashMap<>();

        for (Entity entity : entities) {
            // Skip the player themselves
            if (entity == MC.player) continue;
            // Skip invisible/removed entities
            if (entity.isRemoved()) continue;

            String entityType = getEntityDisplayName(entity);
            String category = categorizeEntity(entity);

            EntityInfo info = new EntityInfo(
                entityType,
                entity.getX(),
                entity.getY(),
                entity.getZ(),
                category
            );
            data.entities.add(info);
            entityCounts.merge(entityType, 1, Integer::sum);
        }

        data.entityCounts = entityCounts;
    }

    /**
     * Collect player information.
     */
    public static PlayerInfo collectPlayerInfo() {
        ClientPlayerEntity player = MC.player;
        if (player == null) return null;

        World world = CurrentWorldPos.getWorld();
        String dimension = "overworld";
        if (world != null) {
            Identifier dimId = world.getRegistryKey().getValue();
            dimension = dimId.getPath();
        }

        PlayerInfo info = new PlayerInfo(
            player.getX(),
            player.getY(),
            player.getZ(),
            dimension
        );
        info.health = (int) player.getHealth();
        info.foodLevel = player.getHungerManager().getFoodLevel();
        info.yaw = player.getYaw();

        return info;
    }

    /**
     * Scan JustMap's cache directory for explored region PNG tiles.
     */
    public static List<RegionInfo> collectRegions() {
        List<RegionInfo> regions = new ArrayList<>();

        try {
            File cacheDir = StorageUtil.cacheDir();
            if (cacheDir == null || !cacheDir.exists()) return regions;

            // Scan for surface layer regions
            File surfaceDir = new File(cacheDir, "surface");
            if (surfaceDir.exists() && surfaceDir.isDirectory()) {
                scanRegionDir(surfaceDir, "surface", 0, regions);
            }

            // Scan for caves layer regions
            File cavesDir = new File(cacheDir, "caves");
            if (cavesDir.exists() && cavesDir.isDirectory()) {
                File[] levelDirs = cavesDir.listFiles(File::isDirectory);
                if (levelDirs != null) {
                    for (File levelDir : levelDirs) {
                        try {
                            int level = Integer.parseInt(levelDir.getName());
                            scanRegionDir(levelDir, "caves", level, regions);
                        } catch (NumberFormatException ignored) {}
                    }
                }
            }

            // Scan for nether layer regions
            File netherDir = new File(cacheDir, "nether");
            if (netherDir.exists() && netherDir.isDirectory()) {
                File[] levelDirs = netherDir.listFiles(File::isDirectory);
                if (levelDirs != null) {
                    for (File levelDir : levelDirs) {
                        try {
                            int level = Integer.parseInt(levelDir.getName());
                            scanRegionDir(levelDir, "nether", level, regions);
                        } catch (NumberFormatException ignored) {}
                    }
                }
            }
        } catch (Exception e) {
            JustMap.LOGGER.error("Error scanning region files: " + e.getMessage());
        }

        return regions;
    }

    /**
     * Scan a directory for region PNG files matching pattern r.X.Z.png.
     */
    private static void scanRegionDir(File dir, String layer, int level, List<RegionInfo> regions) {
        File[] files = dir.listFiles((d, name) -> name.startsWith("r.") && name.endsWith(".png"));
        if (files == null) return;

        for (File file : files) {
            try {
                String name = file.getName();
                // Parse r.X.Z.png
                String[] parts = name.substring(2, name.length() - 4).split("\\.");
                if (parts.length == 2) {
                    int regionX = Integer.parseInt(parts[0]);
                    int regionZ = Integer.parseInt(parts[1]);
                    RegionInfo info = new RegionInfo(regionX, regionZ, layer, level);
                    regions.add(info);
                }
            } catch (Exception ignored) {}
        }
    }

    /**
     * Collect general statistics.
     */
    public static StatsInfo collectStats(VisData data) {
        StatsInfo stats = new StatsInfo();

        ClientWorld clientWorld = MC.world;
        if (clientWorld != null) {
            BlockPos playerPos = CurrentWorldPos.currentPos();
            if (playerPos != null) {
                int centerChunkX = playerPos.getX() >> 4;
                int centerChunkZ = playerPos.getZ() >> 4;
                int renderDistance = MC.options.viewDistance;

                int loadedCount = 0;
                for (int cx = centerChunkX - renderDistance; cx <= centerChunkX + renderDistance; cx++) {
                    for (int cz = centerChunkZ - renderDistance; cz <= centerChunkZ + renderDistance; cz++) {
                        if (clientWorld.isChunkLoaded(cx, cz)) loadedCount++;
                    }
                }
                stats.loadedChunks = loadedCount;
            }
        }

        stats.exploredRegions = data.regions.size();
        stats.totalBlocks = data.blocks.values().stream().mapToInt(Integer::intValue).sum();
        stats.totalEntities = data.entities.size();

        if (MC.isIntegratedServerRunning()) {
            stats.serverType = 0;
            if (MC.getServer() != null) {
                stats.worldName = MC.getServer().getSaveProperties().getLevelName();
            }
        } else {
            stats.serverType = 1;
            if (MC.getCurrentServerEntry() != null) {
                stats.worldName = MC.getCurrentServerEntry().name;
            }
        }

        return stats;
    }

    // ─── Name resolution helpers ─────────────────────────────────────

    /**
     * Get a human-readable name for a block type.
     * Uses the block's translation key, simplified.
     */
    private static String getBlockDisplayName(Block block) {
        Identifier id = Registry.BLOCK.getId(block);
        if (id == null) return "unknown";
        // Convert "minecraft:stone" to "Stone", "minecraft:oak_planks" to "Oak Planks"
        String path = id.getPath();
        return formatName(path);
    }

    /**
     * Get a human-readable name for a biome.
     */
    private static String getBiomeDisplayName(World world, Biome biome) {
        Identifier biomeId = BiomeColors.getBiomeId(world, biome);
        if (biomeId == null) return "Unknown Biome";
        // Convert "minecraft:plains" to "Plains", "minecraft:dark_forest" to "Dark Forest"
        String path = biomeId.getPath();
        return formatName(path);
    }

    /**
     * Get a human-readable name for an entity type.
     */
    private static String getEntityDisplayName(Entity entity) {
        Identifier id = Registry.ENTITY_TYPE.getId(entity.getType());
        if (id == null) return "Unknown Entity";
        String path = id.getPath();
        return formatName(path);
    }

    /**
     * Format a Minecraft registry path into a human-readable name.
     * "dark_forest" → "Dark Forest"
     * "oak_planks" → "Oak Planks"
     */
    private static String formatName(String path) {
        String[] words = path.split("_");
        StringBuilder sb = new StringBuilder();
        for (String word : words) {
            if (word.isEmpty()) continue;
            if (sb.length() > 0) sb.append(' ');
            sb.append(Character.toUpperCase(word.charAt(0)));
            if (word.length() > 1) sb.append(word.substring(1));
        }
        return sb.toString();
    }

    /**
     * Categorize an entity as passive, hostile, neutral, or player.
     */
    private static String categorizeEntity(Entity entity) {
        if (entity instanceof PlayerEntity) return "player";
        if (entity instanceof PassiveEntity) return "passive";
        if (entity instanceof net.minecraft.entity.mob.HostileEntity) return "hostile";
        if (entity instanceof MobEntity) return "neutral";
        return "other";
    }

    /**
     * Get the file path for a region tile PNG.
     */
    public static File getRegionFile(int regionX, int regionZ, String layer, int level) {
        File cacheDir = StorageUtil.cacheDir();
        if (cacheDir == null) return null;

        String dirName;
        if ("surface".equals(layer)) {
            dirName = "surface";
        } else if ("caves".equals(layer)) {
            dirName = "caves/" + level;
        } else if ("nether".equals(layer)) {
            dirName = "nether/" + level;
        } else {
            dirName = "surface";
        }

        return new File(cacheDir, dirName + "/r." + regionX + "." + regionZ + ".png");
    }
}
