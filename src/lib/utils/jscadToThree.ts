import * as THREE from 'three';
import jscad from '@jscad/modeling';
import type { Geom3 } from '@jscad/modeling/src/geometries/types';

const { geom3 } = jscad.geometries;

export function jscadToBufferGeometry(jscadGeom: Geom3): THREE.BufferGeometry {
	const polygons = geom3.toPolygons(jscadGeom);

	const positions: number[] = [];
	const normals: number[] = [];

	for (const polygon of polygons) {
		const vertices = polygon.vertices;

		// Calculate normal for the polygon
		if (vertices.length < 3) continue;

		const v0 = vertices[0];
		const v1 = vertices[1];
		const v2 = vertices[2];

		const edge1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
		const edge2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];

		const normal = [
			edge1[1] * edge2[2] - edge1[2] * edge2[1],
			edge1[2] * edge2[0] - edge1[0] * edge2[2],
			edge1[0] * edge2[1] - edge1[1] * edge2[0]
		];

		const len = Math.sqrt(normal[0] ** 2 + normal[1] ** 2 + normal[2] ** 2);
		if (len > 0) {
			normal[0] /= len;
			normal[1] /= len;
			normal[2] /= len;
		}

		// Triangulate the polygon (fan triangulation)
		for (let i = 1; i < vertices.length - 1; i++) {
			// Triangle: v0, vi, vi+1
			positions.push(v0[0], v0[1], v0[2]);
			positions.push(vertices[i][0], vertices[i][1], vertices[i][2]);
			positions.push(vertices[i + 1][0], vertices[i + 1][1], vertices[i + 1][2]);

			normals.push(normal[0], normal[1], normal[2]);
			normals.push(normal[0], normal[1], normal[2]);
			normals.push(normal[0], normal[1], normal[2]);
		}
	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
	geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));

	return geometry;
}
