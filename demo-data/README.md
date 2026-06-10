# MC 地图数据可视化 — 演示数据

本目录包含演示用的数据和工具，用于在不运行 Minecraft 的情况下展示可视化效果。

## 快速开始

### 方式一：独立演示页面（推荐答辩展示）

直接用浏览器打开 `demo.html`，无需任何服务器：

```bash
# macOS
open demo.html

# Windows
start demo.html

# Linux
xdg-open demo.html
```

这将展示：
- 🗺️ 生成的 MC 风格地图瓦片（4 个 512×512 区域）
- 📊 方块占比饼图
- 🌍 群系占比南丁格尔玫瑰图
- 🐾 生物统计柱状图
- 🔥 生物密度热力图
- ⚔️ 玩家位置标记（模拟实时移动）

### 方式二：本地 HTTP 服务器

如果需要测试瓦片加载（`file://` 协议可能无法加载本地图片），可以启动一个本地服务器：

```bash
# Python 3
cd demo-data
python3 -m http.server 8080

# 然后访问 http://localhost:8080/demo.html
```

## 文件说明

| 文件 | 说明 |
|------|------|
| `demo.html` | 独立演示页面（内联所有代码和数据） |
| `data.json` | 演示数据 JSON（备用） |
| `tiles/r.*.*.png` | 生成的 MC 风格地图瓦片（512×512） |
| `generate_demo_tile.py` | 瓦片生成脚本（Python 3，无需额外依赖） |

## 重新生成瓦片

```bash
python3 generate_demo_tile.py
```

会生成 4 个区域瓦片（r.-1.-1.png, r.-1.0.png, r.0.-1.png, r.0.0.png），覆盖 (-512, -512) 到 (512, 512) 的区域。

## 与模组配合使用

当你运行安装了 JustMap 模组的 Minecraft 时：
1. 在游戏中按 **M** 键打开大地图
2. 点击左上角菜单 → **数据可视化**
3. 或者按 **V** 键直接打开
4. 浏览器自动打开 `http://localhost:27681`，显示实时数据
