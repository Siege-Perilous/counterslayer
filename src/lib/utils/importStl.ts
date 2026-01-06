import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

const loader = new STLLoader();

export function importStlFromFile(file: File): Promise<THREE.BufferGeometry> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();

		reader.onload = (event) => {
			try {
				const contents = event.target?.result;
				if (contents instanceof ArrayBuffer) {
					const geometry = loader.parse(contents);
					geometry.computeVertexNormals();
					resolve(geometry);
				} else {
					reject(new Error('Failed to read file as ArrayBuffer'));
				}
			} catch (error) {
				reject(error);
			}
		};

		reader.onerror = () => reject(new Error('Failed to read file'));
		reader.readAsArrayBuffer(file);
	});
}

export function importStlFromUrl(url: string): Promise<THREE.BufferGeometry> {
	return new Promise((resolve, reject) => {
		loader.load(
			url,
			(geometry) => {
				geometry.computeVertexNormals();
				resolve(geometry);
			},
			undefined,
			(error) => reject(error)
		);
	});
}
