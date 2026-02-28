# Counter Slayer

Counter Slayer is a small Svelte / JSCad application to help you build box and tray inserts for your war games. It generates clean STLs and even references which counters go where in a PDF you can include with your game. Try it out at [counterslayer.com](https://counteslayer.com).

![Screenshot](https://snid.es/2026FEB/CpdqYcJ8zulClvzL.png)

## Credits

[Dave Snider](https://davesnider.com) designs and builds Counter Slayer.

## Mesh Analysis (Development)

For debugging 3D geometry during development, you can use the "Debug for Claude" feature which analyzes mesh files and generates reports that Claude can read.

### Setup (one-time)

Requires Python 3.8+:

```bash
cd scripts
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### Usage

1. Run `npm run dev`
2. Select a tray in the UI
3. Click "Debug for Claude" in the Import/Export menu
4. Analysis files are written to `mesh-analysis/`

The generated files include:
- `context.json` - What was selected (box/tray info)
- `project.json` - Full project configuration
- `current.stl` - The geometry file
- `report.json` - Mesh analysis (vertices, faces, volume, validation)
- `view-*.png` - Rendered views (top, front, side, isometric)

## Contributing

Feel free to create a PR to contribute code changes or add a new game to the pre-built trays. You can find these in [`static/projects`](https://github.com/Siege-Perilous/counterslayer/tree/main/static/projects).
