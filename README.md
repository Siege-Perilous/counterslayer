# Counter Slayer

Counter Slayer is a small Svelte / JSCad application to help you build box and tray inserts for your war games. It generates clean STLs and even references which counters go where in a PDF you can include with your game. Try it out at [counterslayer.com](https://counteslayer.com).

![Screenshot](https://github.com/Siege-Perilous/counterslayer/blob/main/screenshot.png)

## Credits

[Dave Snider](https://davesnider.com) designs and builds Counter Slayer. You might also enjoy [Table Slayer](https://tableslayer.com), a tool to create animated battle maps for in person RPG games.

## Features

- Layout individual trays with stacks of counters.
- Layout stacks as top-loading, edge-crosswise, or edge-lengthwize across a tray.
- Counters can be custom sized in hex, square, rectangle, circle and triangles.
- Add playing card trays that support custom sized cards.
- Generate boxes for groups of trays with "snap to close" lids.
- Optional honeycomb pattern for boxes to save on filament.
- Bin-packing autosorts for the counters and trays so you don't need to think too much about layouts.
- Generate a PDF reference diagram to let you know which counters go in which stack.
- Export printable STLs with built in tolerances to make sure everything fits together well.

## Development

Counter Slayer uses typical Node / Svelte tooling with `pnpm`. Run `pnpm install`, then `pnpm run dev` or `pnpm run build` to start working.

### Claude Code Integration

This project includes tooling for [Claude Code](https://github.com/anthropics/claude-code) to help with geometry debugging. See [CLAUDE.md](https://github.com/Siege-Perilous/counterslayer/blob/main/CLAUDE.md) for details.

**Auto-save**: In dev mode, clicking "Regenerate" automatically saves `project.json` with computed layout positions to `mesh-analysis/`.

**Full export**: Click "Import / Export" → "Debug for Claude" to export STLs, screenshots, and layout data.

**View capture**: Use Playwright to capture views at different angles:

```bash
npx tsx scripts/capture-view.ts --angle iso
```

The app also includes a TinkerCAD-style ViewCube for quick camera navigation.

## License & open source contributions

Counter Slayer is available under a functional source [license](LICENSE.md) that becomes Apache 2 after two years. You are free to host and modify Counter Slayer on your own as long as you don't try to monetize it. The primary intention of the source being open is so hobbyists can get familiar with a large Svelte codebase. We welcome PRs and bug reports.

Any STL models you generate with Counter Slayer are yours to do with as you wish, and can be hosted or sold without permission.

## Share your projects with others

Feel free to create a PR to contribute code changes or add a new game to the pre-built trays. You can find these in [`static/projects`](https://github.com/Siege-Perilous/counterslayer/tree/main/static/projects).
