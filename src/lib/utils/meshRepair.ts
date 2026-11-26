import jscad from '@jscad/modeling';
import type { Geom3 } from '@jscad/modeling/src/geometries/types';

const { geom3, poly3 } = jscad.geometries;

type Vec3 = [number, number, number];

// Vertices closer than this (mm) are the same vertex. Booleans on curved outlines leave pairs of
// vertices well under a micron apart; 2 microns merges those and is far below print resolution.
const WELD = 2e-3;
// A vertex this close (mm) to an edge, and between its ends, is a T-junction on that edge
const ON_EDGE = 2e-3;

/**
 * Close T-junctions so the mesh is watertight (no "non-manifold edges" in a slicer).
 *
 * JSCAD booleans leave edges where one face has a single long edge and its neighbour has the same
 * stretch split by extra vertices: embossed text does it hundreds of times. The surfaces meet, but
 * the edges do not pair up, which slicers report as non-manifold. JSCAD's own generalize() does not
 * repair these reliably. This triangulates the mesh, then splits every unpaired edge at each vertex
 * that lies on it, so both sides share the same vertices. The shape is unchanged.
 */
export function repairTJunctions(geom: Geom3): Geom3 {
  // Weld vertices: a new vertex within WELD of an existing one takes its id. Vertices are bucketed
  // on a WELD-sized grid and the neighbouring cells are searched too, so a close pair that
  // straddles a cell boundary still merges.
  const cells = new Map<string, number[]>();
  const points: Vec3[] = [];
  const idOf = (v: ArrayLike<number>): number => {
    const [cx, cy, cz] = [Math.floor(v[0] / WELD), Math.floor(v[1] / WELD), Math.floor(v[2] / WELD)];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          for (const id of cells.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? []) {
            const [px, py, pz] = points[id];
            if ((px - v[0]) ** 2 + (py - v[1]) ** 2 + (pz - v[2]) ** 2 <= WELD * WELD) return id;
          }
        }
      }
    }
    const id = points.length;
    points.push([v[0], v[1], v[2]]);
    const key = `${cx},${cy},${cz}`;
    const cell = cells.get(key);
    if (cell) cell.push(id);
    else cells.set(key, [id]);
    return id;
  };

  // Fan-triangulate (JSCAD polygons are convex), dropping triangles that collapse when welded
  let triangles: [number, number, number][] = [];
  for (const polygon of geom3.toPolygons(geom)) {
    const vs = polygon.vertices.map(idOf);
    for (let i = 1; i < vs.length - 1; i++) {
      const [a, b, c] = [vs[0], vs[i], vs[i + 1]];
      if (a !== b && b !== c && a !== c) triangles.push([a, b, c]);
    }
  }

  const edgeKey = (a: number, b: number) => a * points.length + b;

  // Each pass splits at most one edge per triangle, so a triangle with several needs a few passes
  for (let pass = 0; pass < 8; pass++) {
    const edgeCount = new Map<number, number>();
    for (const [a, b, c] of triangles) {
      for (const [p, q] of [
        [a, b],
        [b, c],
        [c, a]
      ]) {
        edgeCount.set(edgeKey(p, q), (edgeCount.get(edgeKey(p, q)) ?? 0) + 1);
      }
    }
    const unpaired = (p: number, q: number) =>
      (edgeCount.get(edgeKey(p, q)) ?? 0) !== (edgeCount.get(edgeKey(q, p)) ?? 0);

    // Only the ends of unpaired edges can be the vertex another unpaired edge is missing
    const candidates = new Set<number>();
    for (const [a, b, c] of triangles) {
      if (unpaired(a, b)) candidates.add(a).add(b);
      if (unpaired(b, c)) candidates.add(b).add(c);
      if (unpaired(c, a)) candidates.add(c).add(a);
    }
    if (candidates.size === 0) break;
    const candidateList = [...candidates];

    // Candidates lying strictly inside edge p→q, ordered from p to q
    const pointsOnEdge = (p: number, q: number): number[] => {
      const [px, py, pz] = points[p];
      const [dx, dy, dz] = [points[q][0] - px, points[q][1] - py, points[q][2] - pz];
      const lengthSq = dx * dx + dy * dy + dz * dz;
      const margin = ON_EDGE / Math.sqrt(lengthSq);
      const found: { id: number; t: number }[] = [];
      for (const id of candidateList) {
        if (id === p || id === q) continue;
        const [vx, vy, vz] = [points[id][0] - px, points[id][1] - py, points[id][2] - pz];
        const t = (vx * dx + vy * dy + vz * dz) / lengthSq;
        if (t <= margin || t >= 1 - margin) continue;
        const [ex, ey, ez] = [vx - t * dx, vy - t * dy, vz - t * dz];
        if (ex * ex + ey * ey + ez * ez < ON_EDGE * ON_EDGE) found.push({ id, t });
      }
      return found.sort((m, n) => m.t - n.t).map((f) => f.id);
    };

    let changed = false;
    const next: [number, number, number][] = [];
    for (const tri of triangles) {
      let split = false;
      for (let e = 0; e < 3 && !split; e++) {
        const [p, q, r] = [tri[e], tri[(e + 1) % 3], tri[(e + 2) % 3]];
        if (!unpaired(p, q)) continue;
        const mids = pointsOnEdge(p, q);
        if (mids.length === 0) continue;
        const chain = [p, ...mids, q];
        for (let i = 0; i < chain.length - 1; i++) next.push([chain[i], chain[i + 1], r]);
        split = true;
        changed = true;
      }
      if (!split) next.push(tri);
    }
    triangles = next;
    if (!changed) break;
  }

  return geom3.create(triangles.map(([a, b, c]) => poly3.create([points[a], points[b], points[c]])));
}
