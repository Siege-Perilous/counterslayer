import * as THREE from 'three';
import type { WebGLRenderer, Scene, Camera, PerspectiveCamera } from 'three';

export interface CaptureOptions {
	width: number;
	height: number;
	backgroundColor?: string;
	bounds?: {
		width: number;
		depth: number;
		height: number;
	};
}

export interface TrayBounds {
	width: number;
	depth: number;
	height: number;
	x: number;
	y: number;
}

/**
 * Capture the current scene to a data URL
 */
export function captureSceneToDataUrl(
	renderer: WebGLRenderer,
	scene: Scene,
	camera: Camera,
	options: CaptureOptions
): string {
	// Store original state
	const originalSize = renderer.getSize(new THREE.Vector2());
	const originalClearColor = renderer.getClearColor(new THREE.Color());
	const originalClearAlpha = renderer.getClearAlpha();
	const originalPixelRatio = renderer.getPixelRatio();

	// Configure for capture
	renderer.setPixelRatio(1);
	renderer.setSize(options.width, options.height);

	if (options.backgroundColor) {
		renderer.setClearColor(new THREE.Color(options.backgroundColor), 1);
	} else {
		renderer.setClearColor(new THREE.Color('#ffffff'), 1);
	}

	// Update camera aspect if perspective
	let originalAspect: number | undefined;
	if ((camera as PerspectiveCamera).isPerspectiveCamera) {
		const perspCam = camera as PerspectiveCamera;
		originalAspect = perspCam.aspect;
		perspCam.aspect = options.width / options.height;
		perspCam.updateProjectionMatrix();
	}

	// Render and capture
	renderer.render(scene, camera);
	const dataUrl = renderer.domElement.toDataURL('image/png');

	// Restore original state
	renderer.setPixelRatio(originalPixelRatio);
	renderer.setSize(originalSize.x, originalSize.y);
	renderer.setClearColor(originalClearColor, originalClearAlpha);

	if (originalAspect !== undefined && (camera as PerspectiveCamera).isPerspectiveCamera) {
		const perspCam = camera as PerspectiveCamera;
		perspCam.aspect = originalAspect;
		perspCam.updateProjectionMatrix();
	}

	return dataUrl;
}

/**
 * Calculate isometric camera position for a given bounding box
 */
export function calculateIsometricCameraPosition(
	bounds: TrayBounds,
	offset: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 }
): { position: [number, number, number]; target: [number, number, number] } {
	const maxDim = Math.max(bounds.width, bounds.depth, bounds.height);
	const distance = maxDim * 1.8;

	// Isometric-style angle: equal x and z, elevated y
	return {
		position: [
			offset.x + distance * 0.7,
			offset.y + distance * 0.5,
			offset.z + distance * 0.7
		],
		target: [offset.x, offset.y + bounds.height / 2, offset.z]
	};
}

/**
 * Create a temporary camera configured for isometric capture
 */
export function createCaptureCamera(
	bounds: TrayBounds,
	centerOffset: { x: number; z: number },
	aspectRatio: number
): PerspectiveCamera {
	const camera = new THREE.PerspectiveCamera(50, aspectRatio, 0.1, 10000);

	const maxDim = Math.max(bounds.width, bounds.depth, bounds.height);
	const distance = maxDim * 1.8;

	// Position camera at isometric angle
	camera.position.set(
		centerOffset.x + distance * 0.7,
		bounds.height / 2 + distance * 0.5,
		centerOffset.z + distance * 0.7
	);

	// Look at center of tray
	camera.lookAt(centerOffset.x, bounds.height / 2, centerOffset.z);

	return camera;
}
