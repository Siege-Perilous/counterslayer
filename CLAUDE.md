# Claude Code Guide for Counterslayer

## Project Overview

Counterslayer is a Svelte/JSCad application for generating 3D-printable counter tray inserts for board games. It creates STL files for trays, boxes, and lids.

## Geometry Iteration Workflow

When making geometry changes, use this self-contained loop to iterate without user intervention:

### The Loop

```
1. Make code changes to geometry (lid.ts, counterTray.ts, box.ts)
2. Regenerate STLs:     npx tsx scripts/generate-geometry.ts
3. Verify with renders: python scripts/render-view.py --stl mesh-analysis/box.stl --angle iso
4. Add markers at key positions to understand coordinates
5. Check multiple angles, zoom into problem areas
6. If not correct, go back to step 1
7. When satisfied, inform the user
```

### Regenerating Geometry

```bash
# Regenerate all STLs from project.json (box, lid, and all trays)
npx tsx scripts/generate-geometry.ts

# Optionally specify a box ID
npx tsx scripts/generate-geometry.ts <boxId>
```

This reads `mesh-analysis/project.json` and regenerates STLs with the latest code changes. You can iterate on geometry code without asking the user to manually trigger exports.

### Initial Setup (User Must Do Once)

The first time, or when switching projects, the user needs to:

1. Run `npm run dev`
2. Select a box/tray in the UI
3. Click "Import / Export" → "Debug for Claude"

This creates the initial `project.json` that the CLI script reads from.

## Debug Files Reference

### Files in mesh-analysis/

| File                 | Purpose                                         |
| -------------------- | ----------------------------------------------- |
| `report.json`        | Mesh stats, validation, spatial layout analysis |
| `context.json`       | Selected box/tray info, placement data          |
| `project.json`       | Full project configuration                      |
| `app-screenshot.png` | Three.js render (authoritative app view)        |
| `view-{name}.png`    | Individual STL renders (what gets printed)      |
| `*.stl`              | Raw geometry files                              |

### Stack Reference Codes

Each counter stack has a reference code like `D3`:

- Letter = Tray letter (A, B, C, D...)
- Number = Stack index within tray (1-based)

Example: `D3` = Third stack in Tray D

**context.json includes stacks for each tray:**

```json
{
  "trays": [{
    "letter": "D",
    "name": "Goblin",
    "stacks": [
      {"ref": "D1", "shape": "Circle Small", "count": 3, "x": 10.5, "y": 15.2},
      {"ref": "D2", "shape": "Square Large", "count": 10, "x": 35.0, "y": 15.2},
      ...
    ]
  }]
}
```

### Reading the Analysis

**report.json structure:**

```json
{
  "meshes": {
    "box": { "stats": {...}, "validation": {...}, "errors": [], "warnings": [] },
    "lid": { ... },
    "tray_D_Name": { ... }
  },
  "combined_analysis": {
    "total_vertices": 22553,
    "total_faces": 42562,
    "issues": ["list of problems found"]
  },
  "spatial_layout": {
    "box_params": { "wall_thickness": 3, "floor_thickness": 2, "tolerance": 0.5 },
    "box_exterior_mm": [width, depth, height],
    "box_interior_mm": [width, depth, height],
    "trays": [
      { "name": "tray_D_Goblin", "dimensions": {...}, "position": {x, y}, "bounds": {...} }
    ],
    "fit_check": {
      "width_gap": 1.0,
      "depth_gap": 1.0,
      "height_clearance": 0.5,
      "fits_width": true,
      "fits_depth": true,
      "fits_height": true
    }
  }
}
```

### Visual Identification from Screenshot

The `app-screenshot.png` captures your current camera view. To identify stacks:

1. **Match tray colors** - Each tray has a `color` field in context.json (e.g., `#c9503c` = orange, `#3d7a6a` = teal)
2. **Use stack positions** - `x` and `y` coordinates in stacks array show placement within the tray
3. **Note tray placement** - Each tray's `placement.x` and `placement.y` show where it sits in the box

Example workflow:

- See a teal tray with small circles in the center of the screenshot
- Find tray with color `#3d7a6a` in context.json → Tray H "Monsters / Magic"
- Look at H's stacks, find ones near center based on x/y coords → H3 or H4

### Common Debugging Scenarios

**"Tray doesn't fit in box"**

1. Check `spatial_layout.fit_check` - shows gaps and whether each dimension fits
2. Compare `box_interior_mm` vs tray dimensions
3. Check `box_params.tolerance` setting

**"Cutout looks wrong"**

1. Find the tray in `project.json` → look at `topLoadedStacks` or `edgeLoadedStacks`
2. Check `customShapes` for the shape definition (width, length, baseShape)
3. View the STL render (`view-tray_X_Name.png`) to see actual geometry

**"Trays overlap or collide"**

1. Check `spatial_layout.trays` for position and bounds of each tray
2. Verify Y positions are sequential (tray 1 ends where tray 2 starts)
3. Look at `combined_analysis.issues` for collision warnings

**"Degenerate faces" errors**

- Normal for CSG operations, won't affect printing
- Only concern if count is very high (1000+)

**"Not watertight" warnings**

- Expected for trays, boxes, and lids (they have open tops/cavities)
- Not an error

### Key Dimensions to Check

```
Box interior = Box exterior - (2 × wall_thickness) for X/Y
Box interior height = Box exterior height - floor_thickness

Tray placement is relative to box interior origin
Total tray depth = last_tray.position.y + last_tray.depth
```

### Python Environment

The mesh analyzer requires Python dependencies:

```bash
cd scripts
python -m venv .venv
source .venv/bin/activate  # fish: source .venv/bin/activate.fish
pip install -r requirements.txt
```

## 3D Navigation for Claude

Claude can navigate and inspect 3D geometry using `scripts/render-view.py`.

### Basic Usage

```bash
# Activate Python environment first
source scripts/.venv/bin/activate

# View from preset angles
python scripts/render-view.py --stl mesh-analysis/box.stl --angle iso
python scripts/render-view.py --stl mesh-analysis/box.stl --angle left
python scripts/render-view.py --stl mesh-analysis/box.stl --angle front

# Zoom in (2x, 3x, etc.)
python scripts/render-view.py --stl mesh-analysis/box.stl --angle left --zoom 3

# Get coordinate bounds
python scripts/render-view.py --stl mesh-analysis/box.stl --probe

# Custom camera position
python scripts/render-view.py --stl mesh-analysis/box.stl --pos "50,0,30" --look-at "5,10,20"
```

### Preset Angles

| Angle       | View                       |
| ----------- | -------------------------- |
| `front`     | Looking from -Y toward +Y  |
| `back`      | Looking from +Y toward -Y  |
| `left`      | Looking from -X toward +X  |
| `right`     | Looking from +X toward -X  |
| `top`       | Looking from +Z down       |
| `bottom`    | Looking from -Z up         |
| `iso`       | Isometric from front-right |
| `iso-back`  | Isometric from back-left   |
| `iso-left`  | Isometric from front-left  |
| `iso-right` | Isometric from back-right  |

### Reference Markers

Create a JSON file with colored markers at key positions:

```json
{
	"groove_bottom": { "pos": [4.0, 10, 12], "color": "green" },
	"ramp_position": { "pos": [4.0, 10, 15], "color": "red" },
	"target_position": { "pos": [4.0, 10, 10], "color": "yellow" }
}
```

Then render with markers:

```bash
python scripts/render-view.py --stl mesh-analysis/box.stl --markers markers.json --angle iso
```

Available colors: `red`, `green`, `blue`, `yellow`, `cyan`, `magenta`, `orange`, `white`

### Workflow for Geometry Debugging

**Always iterate independently until the problem is solved:**

1. **Make code changes** to geometry files
2. **Regenerate**: `npx tsx scripts/generate-geometry.ts`
3. **Probe coordinates**: `python scripts/render-view.py --stl mesh-analysis/box.stl --probe`
4. **Render overview**: `python scripts/render-view.py --stl mesh-analysis/box.stl --angle iso --out mesh-analysis/view.png`
5. **Read the image**: Use Read tool on mesh-analysis/view.png
6. **Add markers** to understand positions:
   ```bash
   # Create mesh-analysis/test-markers.json with positions to check
   echo '{"current": {"pos": [5, 2, 21], "color": "red"}, "target": {"pos": [5, 3, 21], "color": "green"}}' > mesh-analysis/test-markers.json
   python scripts/render-view.py --stl mesh-analysis/box.stl --markers mesh-analysis/test-markers.json --pos "10,0,24" --look-at "5,2,21"
   ```
7. **Check multiple angles** - top, front, iso, custom positions
8. **If not correct**: Go back to step 1, make more changes
9. **When solved**: Inform the user with verification images

**Key principle**: Don't wait for the user to manually trigger exports. Iterate on your own until satisfied, then show the results.

### Coordinate System

- X: Width (left/right)
- Y: Depth (front/back)
- Z: Height (bottom/top)
- Origin (0,0,0) is at front-left-bottom corner of box

## Project Structure

- `src/lib/models/` - Geometry generation (counterTray.ts, box.ts, lid.ts)
- `src/lib/stores/project.svelte.ts` - Project state management
- `src/lib/workers/geometry.worker.ts` - Web worker for non-blocking geometry generation
- `src/lib/utils/geometryWorker.ts` - Worker manager and STL export
- `scripts/mesh-analyzer.py` - Python mesh analysis
- `scripts/render-view.py` - Scriptable 3D camera renderer
- `mesh-analysis/` - Generated debug files (gitignored)
