/**
 * Manager for the geometry generation Web Worker
 * Provides a promise-based API for communicating with the worker
 */

import type { TrayPlacement } from '$lib/models/box';
import type { CounterStack } from '$lib/models/counterTray';
import type { Project } from '$lib/types/project';
import * as THREE from 'three';

// Geometry data received from worker
interface GeometryData {
  positions: Float32Array;
  normals: Float32Array;
}

interface TrayGeometryResult {
  trayId: string;
  name: string;
  color: string;
  geometry: GeometryData;
  placement: TrayPlacement;
  counterStacks: CounterStack[];
  trayLetter: string;
}

interface BoxGeometryResult {
  boxId: string;
  boxName: string;
  boxGeometry: GeometryData | null;
  lidGeometry: GeometryData | null;
  trayGeometries: TrayGeometryResult[];
  boxDimensions: { width: number; depth: number; height: number };
}

interface LooseTrayGeometryResult {
  trayId: string;
  layerId: string;
  name: string;
  color: string;
  geometry: GeometryData;
  dimensions: { width: number; depth: number; height: number };
  counterStacks: CounterStack[];
  trayLetter: string;
}

interface GenerateResult {
  type: 'generate-result';
  id: number;
  selectedTrayGeometry: GeometryData;
  selectedTrayCounters: CounterStack[];
  allTrayGeometries: TrayGeometryResult[];
  boxGeometry: GeometryData | null;
  lidGeometry: GeometryData | null;
  allBoxGeometries: BoxGeometryResult[];
  allLooseTrayGeometries: LooseTrayGeometryResult[];
  error?: string;
}

interface ExportStlResult {
  type: 'export-stl-result';
  id: number;
  data: ArrayBuffer;
  filename: string;
  error?: string;
}

export interface StlFile {
  filename: string;
  data: ArrayBuffer;
}

interface ExportAllStlsResult {
  type: 'export-all-stls-result';
  id: number;
  files: StlFile[];
  error?: string;
}

interface Export3mfResult {
  type: 'export-3mf-result';
  id: number;
  data: ArrayBuffer;
  filename: string;
  error?: string;
}

// Result interfaces with BufferGeometry
export interface TrayGeometryData {
  trayId: string;
  name: string;
  color: string;
  geometry: THREE.BufferGeometry;
  placement: TrayPlacement;
  counterStacks: CounterStack[];
  trayLetter: string;
}

export interface BoxGeometryData {
  boxId: string;
  boxName: string;
  boxGeometry: THREE.BufferGeometry | null;
  lidGeometry: THREE.BufferGeometry | null;
  trayGeometries: TrayGeometryData[];
  boxDimensions: { width: number; depth: number; height: number };
}

export interface LooseTrayGeometryData {
  trayId: string;
  layerId: string;
  name: string;
  color: string;
  geometry: THREE.BufferGeometry;
  dimensions: { width: number; depth: number; height: number };
  counterStacks: CounterStack[];
  trayLetter: string;
}

export interface GenerationResult {
  selectedTrayGeometry: THREE.BufferGeometry;
  selectedTrayCounters: CounterStack[];
  allTrayGeometries: TrayGeometryData[];
  boxGeometry: THREE.BufferGeometry | null;
  lidGeometry: THREE.BufferGeometry | null;
  allBoxGeometries: BoxGeometryData[];
  allLooseTrayGeometries: LooseTrayGeometryData[];
}

type WorkerResult = GenerateResult | ExportStlResult | ExportAllStlsResult | Export3mfResult;

/**
 * Convert raw geometry data to Three.js BufferGeometry
 */
function arrayToBufferGeometry(data: GeometryData): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3));
  return geometry;
}

/**
 * Geometry Worker Manager
 * Handles all communication with the Web Worker
 */
export class GeometryWorkerManager {
  private worker: Worker | null = null;
  private messageId = 0;
  private latestGenerateId = 0; // Track the most recent generate request
  private pendingRequests = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (reason: unknown) => void;
      isGenerateRequest?: boolean;
    }
  >();

  /**
   * Initialize the worker
   */
  async init(): Promise<void> {
    if (this.worker) return;

    // Dynamic import for the worker
    // Using Vite's worker import syntax
    const WorkerModule = await import('$lib/workers/geometry.worker?worker');
    this.worker = new WorkerModule.default();

    this.worker.onmessage = (event: MessageEvent<WorkerResult>) => {
      const result = event.data;
      const pending = this.pendingRequests.get(result.id);

      if (pending) {
        this.pendingRequests.delete(result.id);

        // Check if this is a stale generate request (a newer one was made)
        if (pending.isGenerateRequest && result.id < this.latestGenerateId) {
          // Reject stale requests so the caller's finally block runs
          pending.reject(new Error('Superseded by newer request'));
          return;
        }

        if ('error' in result && result.error) {
          pending.reject(new Error(result.error));
        } else {
          pending.resolve(result);
        }
      }
    };

    this.worker.onerror = (error) => {
      console.error('Worker error:', error);
      // Reject all pending requests
      for (const [id, pending] of this.pendingRequests) {
        pending.reject(new Error('Worker error'));
        this.pendingRequests.delete(id);
      }
    };
  }

  /**
   * Generate all geometries for a project
   */
  async generate(project: Project, selectedBoxId: string, selectedTrayId: string): Promise<GenerationResult> {
    if (!this.worker) {
      await this.init();
    }

    const id = ++this.messageId;
    this.latestGenerateId = id; // Mark this as the latest generate request

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, {
        isGenerateRequest: true,
        resolve: (result) => {
          const r = result as GenerateResult;

          // Convert all geometry data to BufferGeometry
          const selectedTrayGeometry = arrayToBufferGeometry(r.selectedTrayGeometry);

          const allTrayGeometries: TrayGeometryData[] = r.allTrayGeometries.map((t) => ({
            ...t,
            geometry: arrayToBufferGeometry(t.geometry)
          }));

          const boxGeometry = r.boxGeometry ? arrayToBufferGeometry(r.boxGeometry) : null;

          const lidGeometry = r.lidGeometry ? arrayToBufferGeometry(r.lidGeometry) : null;

          const allBoxGeometries: BoxGeometryData[] = r.allBoxGeometries.map((b) => ({
            ...b,
            boxGeometry: b.boxGeometry ? arrayToBufferGeometry(b.boxGeometry) : null,
            lidGeometry: b.lidGeometry ? arrayToBufferGeometry(b.lidGeometry) : null,
            trayGeometries: b.trayGeometries.map((t) => ({
              ...t,
              geometry: arrayToBufferGeometry(t.geometry)
            }))
          }));

          const allLooseTrayGeometries: LooseTrayGeometryData[] = (r.allLooseTrayGeometries || []).map((lt) => ({
            ...lt,
            geometry: arrayToBufferGeometry(lt.geometry)
          }));

          resolve({
            selectedTrayGeometry,
            selectedTrayCounters: r.selectedTrayCounters,
            allTrayGeometries,
            boxGeometry,
            lidGeometry,
            allBoxGeometries,
            allLooseTrayGeometries
          });
        },
        reject
      });

      // Deep clone to strip Svelte 5 Proxy wrappers (can't be cloned for postMessage)
      const plainProject = JSON.parse(
        JSON.stringify({
          layers: project.layers,
          cardSizes: project.cardSizes,
          counterShapes: project.counterShapes
        })
      );

      this.worker!.postMessage({
        type: 'generate',
        id,
        project: plainProject,
        selectedBoxId,
        selectedTrayId
      });
    });
  }

  /**
   * Export the selected tray to STL
   */
  async exportTrayStl(): Promise<{ data: ArrayBuffer; filename: string }> {
    return this.exportStl('tray');
  }

  /**
   * Export the box to STL
   */
  async exportBoxStl(): Promise<{ data: ArrayBuffer; filename: string }> {
    return this.exportStl('box');
  }

  /**
   * Export the lid to STL
   */
  async exportLidStl(): Promise<{ data: ArrayBuffer; filename: string }> {
    return this.exportStl('lid');
  }

  /**
   * Export a specific tray by index to STL
   */
  async exportTrayByIndexStl(index: number): Promise<{ data: ArrayBuffer; filename: string }> {
    return this.exportStl('all-tray', index);
  }

  private async exportStl(
    target: 'tray' | 'box' | 'lid' | 'all-tray',
    trayIndex?: number
  ): Promise<{ data: ArrayBuffer; filename: string }> {
    if (!this.worker) {
      await this.init();
    }

    const id = ++this.messageId;

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: (result) => {
          const r = result as ExportStlResult;
          resolve({ data: r.data, filename: r.filename });
        },
        reject
      });

      this.worker!.postMessage({
        type: 'export-stl',
        id,
        target,
        trayIndex
      });
    });
  }

  /**
   * Export all STLs for all boxes
   */
  async exportAllStls(): Promise<StlFile[]> {
    if (!this.worker) {
      await this.init();
    }

    const id = ++this.messageId;

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: (result) => {
          const r = result as ExportAllStlsResult;
          resolve(r.files);
        },
        reject
      });

      this.worker!.postMessage({
        type: 'export-all-stls',
        id
      });
    });
  }

  /**
   * Export all geometries to a single 3MF file
   */
  async export3mf(): Promise<{ data: ArrayBuffer; filename: string }> {
    if (!this.worker) {
      await this.init();
    }

    const id = ++this.messageId;

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: (result) => {
          const r = result as Export3mfResult;
          resolve({ data: r.data, filename: r.filename });
        },
        reject
      });

      this.worker!.postMessage({
        type: 'export-3mf',
        id
      });
    });
  }

  /**
   * Terminate the worker
   */
  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pendingRequests.clear();
  }
}

// Singleton instance
let instance: GeometryWorkerManager | null = null;

/**
 * Get the geometry worker manager instance
 */
export function getGeometryWorker(): GeometryWorkerManager {
  if (!instance) {
    instance = new GeometryWorkerManager();
  }
  return instance;
}
