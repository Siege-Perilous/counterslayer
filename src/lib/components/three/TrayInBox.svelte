<script lang="ts">
  /**
   * TrayInBox - Renders a single tray mesh with optional counter previews.
   * Parent provides position/rotation via T.Group wrapping.
   * All internal positioning is relative to (0,0,0).
   */
  import { T } from '@threlte/core';
  import type { IntersectionEvent } from '@threlte/extras';
  import * as THREE from 'three';
  import CounterMesh from './CounterMesh.svelte';
  import { getAlternateColor, getSleeveColors } from '$lib/three/materials';
  import type { CounterStack } from '$lib/models/counterTray';

  interface TrayClickInfo {
    trayId: string;
    name: string;
    letter: string;
    width: number;
    depth: number;
    height: number;
    color: string;
  }

  interface Props {
    geometry: THREE.BufferGeometry;
    color: string;
    counterStacks?: CounterStack[];
    showCounters?: boolean;
    trayId: string;
    trayName?: string;
    trayLetter?: string;
    triangleCornerRadius?: number;
    onClick?: (info: TrayClickInfo) => void;
    onDoubleClick?: (trayId: string) => void;
    // Dimensions for click info
    width?: number;
    depth?: number;
    height?: number;
  }

  let {
    geometry,
    color,
    counterStacks = [],
    showCounters = false,
    trayId,
    trayName = '',
    trayLetter = 'A',
    triangleCornerRadius = 1.5,
    onClick,
    onDoubleClick,
    width = 0,
    depth = 0,
    height = 0
  }: Props = $props();

  // Create rounded triangle geometry for counter previews
  function createRoundedTriangleGeometry(side: number, thickness: number, cornerRadius: number): THREE.BufferGeometry {
    const r = cornerRadius;
    const triHeight = side * (Math.sqrt(3) / 2);

    // Circle centers matching JSCAD counterTray.ts createTrianglePrism
    const insetX = side / 2 - r;
    const insetYBottom = -triHeight / 2 + r;
    const insetYTop = triHeight / 2 - r * 2;

    const BL = { x: -insetX, y: insetYBottom };
    const BR = { x: insetX, y: insetYBottom };
    const T_pt = { x: 0, y: insetYTop };

    // Calculate direction vectors and perpendiculars for tangent points
    const BL_T_len = Math.sqrt((T_pt.x - BL.x) ** 2 + (T_pt.y - BL.y) ** 2);
    const BL_T_dir = { x: (T_pt.x - BL.x) / BL_T_len, y: (T_pt.y - BL.y) / BL_T_len };
    const BL_T_perp = { x: -BL_T_dir.y, y: BL_T_dir.x };

    const T_BR_len = Math.sqrt((BR.x - T_pt.x) ** 2 + (BR.y - T_pt.y) ** 2);
    const T_BR_dir = { x: (BR.x - T_pt.x) / T_BR_len, y: (BR.y - T_pt.y) / T_BR_len };
    const T_BR_perp = { x: -T_BR_dir.y, y: T_BR_dir.x };

    // Tangent points
    const BL_bottom = { x: BL.x, y: BL.y - r };
    const BL_left = { x: BL.x + r * BL_T_perp.x, y: BL.y + r * BL_T_perp.y };
    const T_left = { x: T_pt.x + r * BL_T_perp.x, y: T_pt.y + r * BL_T_perp.y };
    const T_right = { x: T_pt.x + r * T_BR_perp.x, y: T_pt.y + r * T_BR_perp.y };
    const BR_right = { x: BR.x + r * T_BR_perp.x, y: BR.y + r * T_BR_perp.y };
    const BR_bottom = { x: BR.x, y: BR.y - r };

    // Angles for arcs
    const angleBL_bottom = Math.atan2(BL_bottom.y - BL.y, BL_bottom.x - BL.x);
    const angleBL_left = Math.atan2(BL_left.y - BL.y, BL_left.x - BL.x);
    const angleT_left = Math.atan2(T_left.y - T_pt.y, T_left.x - T_pt.x);
    const angleT_right = Math.atan2(T_right.y - T_pt.y, T_right.x - T_pt.x);
    const angleBR_right = Math.atan2(BR_right.y - BR.y, BR_right.x - BR.x);
    const angleBR_bottom = Math.atan2(BR_bottom.y - BR.y, BR_bottom.x - BR.x);

    const shape = new THREE.Shape();
    shape.moveTo(BL_bottom.x, BL_bottom.y);
    shape.lineTo(BR_bottom.x, BR_bottom.y);
    shape.absarc(BR.x, BR.y, r, angleBR_bottom, angleBR_right, false);
    shape.lineTo(T_right.x, T_right.y);
    shape.absarc(T_pt.x, T_pt.y, r, angleT_right, angleT_left, false);
    shape.lineTo(BL_left.x, BL_left.y);
    shape.absarc(BL.x, BL.y, r, angleBL_left, angleBL_bottom, false);

    const extrudeSettings = { depth: thickness, bevelEnabled: false };
    const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geom.translate(0, r / 2, -thickness / 2);
    return geom;
  }

  function handleClick(e: IntersectionEvent<MouseEvent>) {
    e.stopPropagation();
    onClick?.({
      trayId,
      name: trayName,
      letter: trayLetter,
      width,
      depth,
      height,
      color
    });
  }

  function handleDoubleClick(e: IntersectionEvent<MouseEvent>) {
    e.stopPropagation();
    onDoubleClick?.(trayId);
  }
</script>

<!-- Tray mesh with -90° X rotation (JSCAD to Three.js transform) -->
<T.Mesh {geometry} rotation.x={-Math.PI / 2} onclick={handleClick} ondblclick={handleDoubleClick}>
  <T.MeshStandardMaterial {color} roughness={0.6} metalness={0.1} side={THREE.DoubleSide} />
</T.Mesh>

<!-- Counter previews in tray-local coordinates -->
{#if showCounters && counterStacks.length > 0}
  {#each counterStacks as stack, stackIdx (stackIdx)}
    {#if stack.isEdgeLoaded}
      <!-- Edge-loaded: counters standing on edge like books -->
      {#each Array(stack.count) as _, counterIdx (counterIdx)}
        {@const effectiveShape = stack.shape === 'custom' ? (stack.customBaseShape ?? 'rectangle') : stack.shape}
        {@const standingHeight =
          stack.isCardDivider && stack.cardDividerHeight
            ? stack.cardDividerHeight
            : effectiveShape === 'triangle'
              ? stack.length
              : stack.shape === 'custom'
                ? Math.min(stack.width, stack.length)
                : Math.max(stack.width, stack.length)}
        {@const counterY = stack.z + standingHeight / 2}
        {@const isAlt = counterIdx % 2 === 1}
        {@const counterColor = getAlternateColor(stackIdx, isAlt, stack.color)}
        {@const triGeom =
          effectiveShape === 'triangle'
            ? createRoundedTriangleGeometry(stack.width, stack.thickness, triangleCornerRadius)
            : null}
        {#if stack.edgeOrientation === 'lengthwise'}
          {@const counterSpacing = (stack.slotWidth ?? stack.count * stack.thickness) / stack.count}
          {@const posX = stack.x + (counterIdx + 0.5) * counterSpacing}
          {@const posZ = -stack.y - (stack.slotDepth ?? stack.length) / 2}
          <CounterMesh
            shape={effectiveShape}
            {posX}
            posY={counterY}
            {posZ}
            width={stack.width}
            length={stack.length}
            thickness={stack.thickness}
            color={counterColor}
            hexPointyTop={stack.hexPointyTop}
            triangleGeometry={triGeom}
            isEdgeLoaded={true}
            edgeOrientation="lengthwise"
            {standingHeight}
          />
        {:else}
          {@const counterSpacing = (stack.slotDepth ?? stack.count * stack.thickness) / stack.count}
          {@const posX = stack.x + (stack.slotWidth ?? stack.length) / 2}
          {@const posZ = -stack.y - (counterIdx + 0.5) * counterSpacing}
          <CounterMesh
            shape={effectiveShape}
            {posX}
            posY={counterY}
            {posZ}
            width={stack.width}
            length={stack.length}
            thickness={stack.thickness}
            color={counterColor}
            hexPointyTop={stack.hexPointyTop}
            triangleGeometry={triGeom}
            isEdgeLoaded={true}
            edgeOrientation="crosswise"
            {standingHeight}
          />
        {/if}
      {/each}
    {:else}
      <!-- Top-loaded: traditional vertical stacks -->
      {#each Array(stack.count) as _, counterIdx (counterIdx)}
        {@const counterZ = stack.z + counterIdx * stack.thickness + stack.thickness / 2}
        {@const posX = stack.x}
        {@const posY = counterZ}
        {@const posZ = -stack.y}
        {@const isAlt = counterIdx % 2 === 1}
        {@const counterColor = getAlternateColor(stackIdx, isAlt, stack.color)}
        {@const effectiveShape = stack.shape === 'custom' ? (stack.customBaseShape ?? 'rectangle') : stack.shape}
        {@const isSleevedCard = !!(stack.innerWidth && stack.innerLength)}
        {@const sleeveColors = getSleeveColors(isAlt)}
        {@const triGeom =
          effectiveShape === 'triangle'
            ? createRoundedTriangleGeometry(stack.width, stack.thickness, triangleCornerRadius)
            : null}
        <CounterMesh
          shape={effectiveShape}
          {posX}
          {posY}
          {posZ}
          width={stack.width}
          length={stack.length}
          thickness={stack.thickness}
          color={counterColor}
          hexPointyTop={stack.hexPointyTop}
          triangleGeometry={triGeom}
          isEdgeLoaded={false}
          slopeAngle={stack.slopeAngle ?? 0}
          rowAssignment={stack.rowAssignment}
          {isSleevedCard}
          innerWidth={stack.innerWidth}
          innerLength={stack.innerLength}
          sleeveColor={sleeveColors.sleeve}
          innerCardColor={sleeveColors.innerCard}
        />
      {/each}
    {/if}
  {/each}
{/if}
