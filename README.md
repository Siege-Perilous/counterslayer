# Counter Slayer

Counter Slayer is a small Svelte / JSCad application to help you build box and tray inserts for your war games. It generates clean STLs and even references which counters go where in a PDF you can include with your game. Try it out at [counterslayer.com](https://counteslayer.com).

![Screenshot](https://github.com/Siege-Perilous/counterslayer/blob/main/screenshot.png)

## Credits

[Dave Snider](https://davesnider.com) designs and builds Counter Slayer. You might also enjoy [Table Slayer](https://tableslayer.com), a tool to create animated battle maps for in person RPG games.

## Features

- Layout individual trays with stacks of counters.
- Layout stacks as top-loading, edge-crosswise, or edge-lengthwize across a tray.
- Counters can be custom sized in hex, square, rectangle, circle and triangles.
- Generate boxes for groups of trays with "snap to close" lids.
- Bin-packing autosorts for the counters and trays so you don't need to think too much about layouts.
- Generate a PDF reference diagram to let you know which counters go in which stack.
- Export printable STLs with built in tolerances to make sure everything fits together well.

## Development

Counter Slayer uses typically Node / Svelte tooling with `pnpm`. Run `pnpm install`, then `pnpm run dev` or `pnpm run build` to start working.

### Optional Claude helper

I use Claude to help build this project. Outside of the typical [Claude.md](https://github.com/Siege-Perilous/counterslayer/blob/main/CLAUDE.md) file, there's also some Python scripts to help generate feedback loops and programmatic debug information which Claude can read. This helps Claude understand what you (as a developer) are looking at on the screen, and helps better it better converse with context about the models being generated.

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

You then can ask Claude questions, rerunning the debug whenever you make changes.

## Contributing

Feel free to create a PR to contribute code changes or add a new game to the pre-built trays. You can find these in [`static/projects`](https://github.com/Siege-Perilous/counterslayer/tree/main/static/projects).
