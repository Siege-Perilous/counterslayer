# Claude Code Guide for Counterslayer

## Project Overview

Counterslayer is a Svelte/JSCad application for generating 3D-printable counter tray inserts for board games. It creates STL files for trays, boxes, and lids.

## Geometry Iteration Workflow

When making geometry changes, use this self-contained loop to iterate without user intervention:

### The Loop

```
1. Make code changes to geometry (lid.ts, counterTray.ts, box.ts)
2. Regenerate STLs:     npx tsx scripts/generate-geometry.ts
3. Verify with renders: npx tsx scripts/capture-view.ts --angle iso
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

| File                 | Purpose                                    |
| -------------------- | ------------------------------------------ |
| `context.json`       | Selected box/tray info, placement data     |
| `project.json`       | Full project configuration                 |
| `app-screenshot.png` | Three.js render (authoritative app view)   |
| `view.png`           | Captured view from capture-view.ts         |
| `*.stl`              | Raw geometry files                         |

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
      {"ref": "D2", "shape": "Square Large", "count": 10, "x": 35.0, "y": 15.2}
    ]
  }]
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

1. Check tray placement in `context.json` for position and dimensions
2. Compare box dimensions vs tray dimensions in `project.json`
3. Check tolerance setting in the box config

**"Cutout looks wrong"**

1. Find the tray in `project.json` → look at `topLoadedStacks` or `edgeLoadedStacks`
2. Check `customShapes` for the shape definition (width, length, baseShape)
3. Use `capture-view.ts` to render different angles

**"Trays overlap or collide"**

1. Check tray placements in `context.json` for position and bounds
2. Verify Y positions are sequential (tray 1 ends where tray 2 starts)
3. Use the app's layout editor to visualize positioning

### Key Dimensions to Check

```
Box interior = Box exterior - (2 × wall_thickness) for X/Y
Box interior height = Box exterior height - floor_thickness

Tray placement is relative to box interior origin
Total tray depth = last_tray.position.y + last_tray.depth
```

## 3D Navigation for Claude

Claude can navigate and inspect 3D geometry using `scripts/capture-view.ts`, which uses Playwright to render the actual app with the same materials, lighting, and counters.

### Basic Usage

```bash
# Ensure dev server is running first (npm run dev)

# View from preset angles
npx tsx scripts/capture-view.ts --angle iso
npx tsx scripts/capture-view.ts --angle left
npx tsx scripts/capture-view.ts --angle front

# Zoom in (2x, 3x, etc.)
npx tsx scripts/capture-view.ts --angle left --zoom 3

# Custom camera position (Three.js Y-up coordinates)
npx tsx scripts/capture-view.ts --pos "100,80,150" --look-at "0,25,50"

# Output to specific file
npx tsx scripts/capture-view.ts --angle top --out mesh-analysis/view-top.png
```

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

### Reference Markers

Create a JSON file with colored markers at key positions:

```json
{
  "groove_bottom": { "pos": [4.0, 12, 10], "color": "green" },
  "ramp_position": { "pos": [4.0, 15, 10], "color": "red" },
  "target_position": { "pos": [4.0, 10, 10], "color": "yellow" }
}
```

Then render with markers:

```bash
npx tsx scripts/capture-view.ts --markers mesh-analysis/markers.json --angle iso
```

Available colors: `red`, `green`, `blue`, `yellow`, `cyan`, `magenta`, `orange`, `white`

### Workflow for Geometry Debugging

**Always iterate independently until the problem is solved:**

1. **Make code changes** to geometry files
2. **Regenerate**: `npx tsx scripts/generate-geometry.ts`
3. **Render overview**: `npx tsx scripts/capture-view.ts --angle iso --out mesh-analysis/view.png`
4. **Read the image**: Use Read tool on mesh-analysis/view.png
5. **Add markers** to understand positions:
   ```bash
   # Create mesh-analysis/markers.json with positions to check
   echo '{"current": {"pos": [5, 21, 2], "color": "red"}, "target": {"pos": [5, 21, 3], "color": "green"}}' > mesh-analysis/markers.json
   npx tsx scripts/capture-view.ts --markers mesh-analysis/markers.json --pos "10,24,0" --look-at "5,21,2"
   ```
6. **Check multiple angles** - top, front, iso, custom positions
7. **If not correct**: Go back to step 1, make more changes
8. **When solved**: Inform the user with verification images

**Key principle**: Don't wait for the user to manually trigger exports. Iterate on your own until satisfied, then show the results.

### Coordinate System (Three.js)

- X: Width (left/right)
- Y: Height (up/down) - **Note: Y is up in Three.js**
- Z: Depth (front/back)
- Origin (0,0,0) is at front-left-bottom corner of box

**Important**: The browser-based capture uses Three.js conventions (Y-up), which differs from some 3D modeling tools that use Z-up.

## App Screenshot & Console Capture

Use Playwright to capture screenshots and console output from the running app:

```bash
# Ensure dev server is running first (npm run dev)
npx tsx scripts/capture-screenshot.ts
```

This script:

- Opens the app at http://localhost:5175 in a headless browser
- Captures console logs (filtered for specific debug keywords)
- Takes screenshots: `mesh-analysis/view-current.png`, `mesh-analysis/view-dimensions.png`

**For more control over camera angles and markers**, use `capture-view.ts` instead:

```bash
npx tsx scripts/capture-view.ts --angle iso --out mesh-analysis/view.png
```

## ViewCube Navigation

The app includes a TinkerCAD-style ViewCube in the top-right corner of the 3D view:

- **Click faces** (FRONT, TOP, etc.) to snap to orthographic views
- **Click corners** to snap to isometric views
- **Cube rotates** to match your current camera orientation

The ViewCube is hidden in debug/capture mode for clean screenshots.

## Project Structure

- `src/lib/models/` - Geometry generation (counterTray.ts, box.ts, lid.ts)
- `src/lib/stores/project.svelte.ts` - Project state management
- `src/lib/workers/geometry.worker.ts` - Web worker for non-blocking geometry generation
- `src/lib/utils/geometryWorker.ts` - Worker manager and STL export
- `src/lib/components/ViewCube.svelte` - TinkerCAD-style camera navigation cube
- `scripts/capture-view.ts` - Playwright-based camera capture with debug markers
- `scripts/capture-screenshot.ts` - Playwright script for app screenshots and console capture
- `scripts/generate-geometry.ts` - CLI for regenerating STLs from project.json
- `mesh-analysis/` - Generated debug files (gitignored)

## CSS Naming Convention

Use BEM with camelCase for all CSS class names:

```
.componentName__elementName--modifier
```

Examples:

- `.cupCell` - Block (component root)
- `.cupCell__label` - Element (child of component)
- `.cupCell--selected` - Modifier (state/variant)
- `.splitDivider--vertical` - Modifier
- `.splitDivider__handle` - Element
- `.cupLayoutEditor__toolbar` - Element
- `.cupLayoutEditor__toolbarButtons` - Element (camelCase for multi-word)
