/**
 * Centralized save manager with debouncing and batching support.
 * Replaces scattered autosave() calls throughout project.svelte.ts
 */

import type { Project } from '$lib/types/project';
import { saveProject } from '$lib/utils/storage';

// Debounce delay in milliseconds
const SAVE_DELAY_MS = 300;

let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let pendingProject: Project | null = null;
let batchMode = false;

/**
 * Schedule a debounced save. Multiple calls within SAVE_DELAY_MS
 * will be coalesced into a single save.
 */
export function scheduleSave(project: Project): void {
  pendingProject = project;

  // Don't schedule if we're in batch mode - wait for batch to complete
  if (batchMode) return;

  // Clear any pending save
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }

  // Schedule new save
  saveTimeout = setTimeout(() => {
    if (pendingProject) {
      saveProject(pendingProject);
      pendingProject = null;
    }
    saveTimeout = null;
  }, SAVE_DELAY_MS);
}

/**
 * Save immediately, bypassing debounce.
 * Use for critical operations like before page unload.
 */
export function saveNow(project: Project): void {
  // Clear any pending debounced save
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  pendingProject = null;

  saveProject(project);
}

/**
 * Execute multiple updates with a single save at the end.
 * Useful for operations that make several state changes.
 *
 * @example
 * batchUpdates(() => {
 *   updateBox(id, updates1);
 *   updateTray(id, updates2);
 * }, project);
 */
export function batchUpdates(fn: () => void, project: Project): void {
  batchMode = true;
  try {
    fn();
  } finally {
    batchMode = false;
    // Save once after all updates
    scheduleSave(project);
  }
}

/**
 * Flush any pending save immediately.
 * Call this before operations that need the latest saved state.
 */
export function flushPendingSave(): void {
  if (saveTimeout && pendingProject) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
    saveProject(pendingProject);
    pendingProject = null;
  }
}

/**
 * Check if there's a pending save waiting to be flushed.
 */
export function hasPendingSave(): boolean {
  return saveTimeout !== null || pendingProject !== null;
}
