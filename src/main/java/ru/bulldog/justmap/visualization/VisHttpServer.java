package ru.bulldog.justmap.visualization;

import java.io.*;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.file.Files;
import java.util.concurrent.Executors;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import net.minecraft.client.MinecraftClient;
import net.minecraft.util.Util;

import ru.bulldog.justmap.JustMap;
import ru.bulldog.justmap.visualization.VisDataModels.*;

/**
 * Embedded HTTP server for the visualization web frontend.
 * Uses JDK's built-in HttpServer (zero external dependencies).
 * Serves the web UI and provides API endpoints for live data.
 */
public class VisHttpServer {

    private static VisHttpServer instance;
    private static final int PORT = 27681;
    private static final Gson GSON = new GsonBuilder().serializeSpecialFloatingPointValues().create();

    private HttpServer server;
    private volatile boolean running = false;

    public static synchronized VisHttpServer getInstance() {
        if (instance == null) {
            instance = new VisHttpServer();
        }
        return instance;
    }

    private VisHttpServer() {}

    /**
     * Toggle the server on/off.
     * Starts the server and opens browser if stopped; stops if running.
     */
    public void toggle() {
        if (running) {
            stop();
        } else {
            start();
        }
    }

    /**
     * Start the HTTP server and open the browser.
     */
    public void start() {
        if (running) return;

        try {
            server = HttpServer.create(new InetSocketAddress(PORT), 0);

            // API endpoints
            server.createContext("/api/data", new DataHandler());
            server.createContext("/api/regions", new RegionsHandler());
            server.createContext("/api/tiles/", new TileHandler());
            server.createContext("/api/status", new StatusHandler());

            // Static file server (web frontend)
            server.createContext("/", new StaticFileHandler());

            server.setExecutor(Executors.newFixedThreadPool(4));
            server.start();
            running = true;

            JustMap.LOGGER.info("Visualization server started at http://localhost:" + PORT);

            // Open browser
            Util.getOperatingSystem().open(URI.create("http://localhost:" + PORT));

        } catch (Exception e) {
            JustMap.LOGGER.error("Failed to start visualization server: " + e.getMessage());
            running = false;
        }
    }

    /**
     * Stop the HTTP server.
     */
    public void stop() {
        if (!running || server == null) return;

        try {
            server.stop(0);
            running = false;
            JustMap.LOGGER.info("Visualization server stopped.");
        } catch (Exception e) {
            JustMap.LOGGER.error("Error stopping visualization server: " + e.getMessage());
        }
    }

    public boolean isRunning() {
        return running;
    }

    // ─── HTTP Handlers ───────────────────────────────────────────────

    /**
     * Serves the main visualization data as JSON.
     */
    private static class DataHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            try {
                addCorsHeaders(exchange);
                if ("OPTIONS".equals(exchange.getRequestMethod())) {
                    exchange.sendResponseHeaders(204, -1);
                    return;
                }

                VisData data = DataCollector.collectAll();
                String json = GSON.toJson(data);
                byte[] bytes = json.getBytes("UTF-8");

                exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
                exchange.sendResponseHeaders(200, bytes.length);
                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(bytes);
                }
            } catch (Exception e) {
                sendError(exchange, 500, "Internal error: " + e.getMessage());
            }
        }
    }

    /**
     * Serves the list of explored regions.
     */
    private static class RegionsHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            try {
                addCorsHeaders(exchange);
                if ("OPTIONS".equals(exchange.getRequestMethod())) {
                    exchange.sendResponseHeaders(204, -1);
                    return;
                }

                java.util.List<RegionInfo> regions = DataCollector.collectRegions();
                String json = GSON.toJson(regions);
                byte[] bytes = json.getBytes("UTF-8");

                exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
                exchange.sendResponseHeaders(200, bytes.length);
                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(bytes);
                }
            } catch (Exception e) {
                sendError(exchange, 500, "Internal error: " + e.getMessage());
            }
        }
    }

    /**
     * Serves map tile PNG images from JustMap's cache.
     * URL format: /api/tiles/{regionX}/{regionZ}.png
     * Optional query params: ?layer=surface&level=0
     */
    private static class TileHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            try {
                addCorsHeaders(exchange);
                if ("OPTIONS".equals(exchange.getRequestMethod())) {
                    exchange.sendResponseHeaders(204, -1);
                    return;
                }

                String path = exchange.getRequestURI().getPath();
                // Parse /api/tiles/{regionX}/{regionZ}.png
                String tilePath = path.substring("/api/tiles/".length());
                String[] parts = tilePath.split("/");
                if (parts.length != 2) {
                    sendError(exchange, 400, "Invalid tile path");
                    return;
                }

                int regionX;
                int regionZ;
                try {
                    regionX = Integer.parseInt(parts[0]);
                    String zPart = parts[1];
                    if (zPart.endsWith(".png")) {
                        zPart = zPart.substring(0, zPart.length() - 4);
                    }
                    regionZ = Integer.parseInt(zPart);
                } catch (NumberFormatException e) {
                    sendError(exchange, 400, "Invalid coordinates");
                    return;
                }

                // Parse layer and level from query params
                String query = exchange.getRequestURI().getQuery();
                String layer = "surface";
                int level = 0;
                if (query != null) {
                    for (String param : query.split("&")) {
                        String[] kv = param.split("=");
                        if (kv.length == 2) {
                            if ("layer".equals(kv[0])) layer = kv[1];
                            if ("level".equals(kv[0])) level = Integer.parseInt(kv[1]);
                        }
                    }
                }

                java.io.File tileFile = DataCollector.getRegionFile(regionX, regionZ, layer, level);
                byte[] imageBytes = null;

                if (tileFile != null && tileFile.exists()) {
                    // Serve from disk cache
                    imageBytes = Files.readAllBytes(tileFile.toPath());
                } else if ("surface".equals(layer) && level == 0) {
                    // Generate on-the-fly from in-memory chunk data
                    imageBytes = DataCollector.generateRegionPng(regionX, regionZ);
                }

                if (imageBytes == null) {
                    sendError(exchange, 404, "Tile not found");
                    return;
                }

                exchange.getResponseHeaders().set("Content-Type", "image/png");
                exchange.getResponseHeaders().set("Cache-Control", "no-cache");
                exchange.sendResponseHeaders(200, imageBytes.length);
                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(imageBytes);
                }
            } catch (Exception e) {
                sendError(exchange, 500, "Error serving tile: " + e.getMessage());
            }
        }
    }

    /**
     * Simple status endpoint for connectivity check.
     */
    private static class StatusHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            addCorsHeaders(exchange);
            if ("OPTIONS".equals(exchange.getRequestMethod())) {
                exchange.sendResponseHeaders(204, -1);
                return;
            }

            String json = "{\"status\":\"ok\",\"timestamp\":" + System.currentTimeMillis() + "}";
            byte[] bytes = json.getBytes("UTF-8");

            exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
            exchange.sendResponseHeaders(200, bytes.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(bytes);
            }
        }
    }

    /**
     * Serves static files (HTML, CSS, JS) from the mod's resources.
     * Looks in: assets/justmap/web/
     */
    private static class StaticFileHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            try {
                String path = exchange.getRequestURI().getPath();
                if (path.equals("/")) path = "/index.html";

                // Security: prevent path traversal
                if (path.contains("..")) {
                    sendError(exchange, 403, "Forbidden");
                    return;
                }

                String resourcePath = "/assets/justmap/web" + path;
                InputStream is = getClass().getResourceAsStream(resourcePath);

                if (is == null) {
                    // Try demo data as fallback for /api/* paths
                    sendError(exchange, 404, "Not found: " + path);
                    return;
                }

                byte[] content = readAllBytes(is);
                is.close();

                String contentType = getContentType(path);
                exchange.getResponseHeaders().set("Content-Type", contentType);
                exchange.getResponseHeaders().set("Cache-Control", "no-cache");
                exchange.sendResponseHeaders(200, content.length);
                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(content);
                }
            } catch (Exception e) {
                sendError(exchange, 500, "Error: " + e.getMessage());
            }
        }

        private String getContentType(String path) {
            if (path.endsWith(".html")) return "text/html; charset=utf-8";
            if (path.endsWith(".css")) return "text/css; charset=utf-8";
            if (path.endsWith(".js")) return "application/javascript; charset=utf-8";
            if (path.endsWith(".json")) return "application/json; charset=utf-8";
            if (path.endsWith(".png")) return "image/png";
            if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
            if (path.endsWith(".svg")) return "image/svg+xml";
            if (path.endsWith(".ico")) return "image/x-icon";
            return "text/plain; charset=utf-8";
        }

        private byte[] readAllBytes(InputStream is) throws IOException {
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] data = new byte[4096];
            int bytesRead;
            while ((bytesRead = is.read(data, 0, data.length)) != -1) {
                buffer.write(data, 0, bytesRead);
            }
            return buffer.toByteArray();
        }
    }

    // ─── Utility ─────────────────────────────────────────────────────

    private static void addCorsHeaders(HttpExchange exchange) {
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, OPTIONS");
        exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type");
    }

    private static void sendError(HttpExchange exchange, int code, String message) throws IOException {
        String json = "{\"error\":\"" + message.replace("\"", "'") + "\"}";
        byte[] bytes = json.getBytes("UTF-8");
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(code, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }
}
