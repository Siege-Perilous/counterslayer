# Claude Code Guide for Counterslayer

## Project Overview

Counterslayer is a Svelte/JSCad application for generating 3D-printable counter tray inserts for board games. It creates STL files for trays, boxes, and lids organized into stackable layers.

## Geometry Iteration Workflow

When making geometry changes, use this self-contained loop to iterate without user intervention:

### The Loop

```
1. Make code changes to geometry (lid.ts, counterTray.ts, box.ts)
2. Regenerate STLs:     npx tsx scripts/generate-geometry.ts
3. Verify with renders: npx tsx scripts/capture-view.ts --angle iso
4. Read project.json for positions and layout data
5. Check multiple angles, zoom into problem areas
6. If not correct, go back to step 1
7. When satisfied, inform the user
```

### Auto-Save in Dev Mode

In dev mode, `project.json` is automatically saved to `mesh-analysis/` whenever the user clicks "Regenerate". This includes computed layout data with global positions for all items.

For full debug export (including STLs and screenshot), the user can click "Import / Export" → "Debug for Claude".

### Regenerating Geometry

```bash
# Regenerate all STLs from project.json (box, lid, and all trays)
npx tsx scripts/generate-geometry.ts

# Optionally specify a box ID
npx tsx scripts/generate-geometry.ts <boxId>
```

This reads `mesh-analysis/project.json` and regenerates STLs with the latest code changes.

## Debug Files Reference

### Files in mesh-analysis/

| File                 | Purpose                                              |
| -------------------- | ---------------------------------------------------- |
| `project.json`       | Full project config + computed layout with positions |
| `app-screenshot.png` | Three.js render (from Debug for Claude)              |
| `view.png`           | Captured view from capture-view.ts                   |
| `*.stl`              | Raw geometry files (from Debug for Claude)           |

### project.json Structure

The file contains the full project configuration plus a `computedLayout` section with global positions:

```json
{
  "version": 2,
  "layers": [...],
  "counterShapes": [...],
  "cardSizes": [...],
  "computedLayout": {
    "timestamp": "2026-03-12T...",
    "gameContainer": { "width": 150, "depth": 200 },
    "layers": [
      {
        "layerId": "abc123",
        "layerName": "Bottom layer",
        "layerHeight": 28.4,
        "boxes": [
          {
            "boxId": "box1",
            "boxName": "Counter box",
            "x": 0,
            "y": 100,
            "width": 150,
            "depth": 90,
            "trays": [
              { "trayId": "t1", "name": "Tokens", "letter": "A", "x": 0, "y": 0, "width": 143, "depth": 45 }
            ]
          }
        ],
        "looseTrays": [
          { "trayId": "t2", "name": "Cup tray", "letter": "C", "x": 0, "y": 0, "width": 150, "depth": 100 }
        ]
      }
    ]
  }
}
```

### Understanding Positions

**Game container**: The bounding area (e.g., 150mm × 200mm) that all layers fit within.

**Global positions** (x, y): Where items sit within the game container.

- `y = 0` → front edge of container
- `y = depth` → back edge of container
- `x = 0` → left edge
- `x = width` → right edge

**Box-relative positions** (xInBox, yInBox): Where trays sit within their parent box.

### Quick Position Queries

```bash
# Which items touch the front (y=0)?
cat mesh-analysis/project.json | jq '.computedLayout.layers[] | {layer: .layerName, front: [.looseTrays[] | select(.y == 0) | .name]}'

# Get all loose tray positions
cat mesh-analysis/project.json | jq '.computedLayout.layers[].looseTrays[] | {name, x, y}'
```

## 3D Navigation for Claude

Use `scripts/capture-view.ts` (Playwright-based) to render views of the app:

```bash
# Ensure dev server is running (npm run dev)

# View from preset angles
npx tsx scripts/capture-view.ts --angle iso
npx tsx scripts/capture-view.ts --angle top
npx tsx scripts/capture-view.ts --angle front

# Zoom in
npx tsx scripts/capture-view.ts --angle left --zoom 3

# Custom camera position (Three.js Y-up coordinates)
npx tsx scripts/capture-view.ts --pos "100,80,150" --look-at "0,25,50"

# Output to specific file
npx tsx scripts/capture-view.ts --angle top --out mesh-analysis/view-top.png

# View specific items by ID (selects item and sets appropriate view mode)
npx tsx scripts/capture-view.ts --trayId nrme206 --angle bottom --zoom 2
```

### Viewing Specific Items by ID

Use `--trayId` to view a specific tray in isolation (sets view mode to "tray"):

```bash
# View a specific tray's bottom (useful for checking text emboss)
npx tsx scripts/capture-view.ts --trayId <id> --angle bottom --zoom 2

# Get tray IDs from project.json
cat mesh-analysis/project.json | jq '.layers[].looseTrays[] | {id, name}'
cat mesh-analysis/project.json | jq '.layers[].boxes[].trays[] | {id, name}'
```

The app also supports these URL parameters directly:

- `?trayId=<id>` - Select tray and switch to tray view
- `?boxId=<id>` - Select box and switch to exploded view
- `?layerId=<id>` - Select layer and switch to layer view
- `?view=<mode>` - Set view mode (tray, layer, exploded, all, all-no-lid)

### Preset Angles

| Angle       | View                       |
| ----------- | -------------------------- |
| `front`     | Looking from +Z toward -Z  |
| `back`      | Looking from -Z toward +Z  |
| `left`      | Looking from -X toward +X  |
| `right`     | Looking from +X toward -X  |
| `top`       | Looking from +Y down       |
| `bottom`    | Looking from -Y up         |
| `iso`       | Isometric from front-right |
| `iso-back`  | Isometric from back-left   |
| `iso-left`  | Isometric from front-left  |
| `iso-right` | Isometric from back-right  |

### Coordinate System (Three.js)

- X: Width (left/right)
- Y: Height (up/down) - **Y is up in Three.js**
- Z: Depth (front/back)
- Origin (0,0,0) is at front-left-bottom corner

## ViewCube Navigation

The app includes a TinkerCAD-style ViewCube in the top-right corner:

- **Click faces** (FRONT, TOP, etc.) to snap to orthographic views
- **Click corners** to snap to isometric views
- **Cube rotates** to match current camera orientation
- Hidden on mobile and in debug/capture mode

## Project Structure

- `src/lib/models/` - Geometry generation (counterTray.ts, box.ts, lid.ts, layer.ts)
- `src/lib/stores/project.svelte.ts` - Project state management
- `src/lib/workers/geometry.worker.ts` - Web worker for non-blocking geometry generation
- `src/lib/components/ViewCube.svelte` - Camera navigation cube
- `scripts/capture-view.ts` - Playwright-based view capture
- `scripts/generate-geometry.ts` - CLI for regenerating STLs
- `mesh-analysis/` - Generated debug files (gitignored)

## CSS Naming Convention

Use BEM with camelCase:

```
.componentName__elementName--modifier
```

Examples: `.cupCell`, `.cupCell__label`, `.cupCell--selected`
