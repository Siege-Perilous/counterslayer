#!/usr/bin/env python3
"""Analyze box_example.stl to extract rail/channel geometry."""

import numpy as np
from stl import mesh
import sys

filename = sys.argv[1] if len(sys.argv) > 1 else 'box_example.stl'
print(f"Analyzing: {filename}\n")

stl_mesh = mesh.Mesh.from_file(filename)
all_points = stl_mesh.vectors.reshape(-1, 3)
unique_points = np.unique(all_points, axis=0)

x_min, y_min, z_min = unique_points.min(axis=0)
x_max, y_max, z_max = unique_points.max(axis=0)

print(f"=== OVERALL DIMENSIONS ===")
print(f"X: {x_min:.1f} to {x_max:.1f} (width: {x_max-x_min:.1f})")
print(f"Y: {y_min:.1f} to {y_max:.1f} (depth: {y_max-y_min:.1f})")
print(f"Z: {z_min:.1f} to {z_max:.1f} (height: {z_max-z_min:.1f})")

# Focus on the symmetric region around Y=0 (the lid channel area)
# The box depth is ~97mm, so Y ranges from -48.4 to +48.4 (symmetric)

print(f"\n=== CROSS-SECTION ALONG Y (at X=0, varying Z) ===")
# Get points near X=0 to see the Y-Z cross section
x_center_pts = unique_points[np.abs(unique_points[:,0]) < 2]
for z in np.linspace(z_max, z_min, 8):
    pts = x_center_pts[np.abs(x_center_pts[:,2] - z) < 0.5]
    if len(pts) > 0:
        y_vals = sorted(np.unique(np.round(pts[:,1], 0)))
        print(f"Z={z:6.1f}: Y boundaries = {y_vals[:3] if len(y_vals) > 3 else y_vals} ... {y_vals[-3:] if len(y_vals) > 3 else ''}")

print(f"\n=== WALL STRUCTURE (looking at Y boundaries at different Z) ===")
# The structure should be:
# - At bottom: outer walls at Y = ±48.4 (full width)
# - Somewhere up: walls step IN to create the channel
# - Inner rail at some Y position

for z in [z_min, z_min + 2, z_min + 4, z_min + 6, z_max - 4, z_max - 2, z_max]:
    pts = unique_points[np.abs(unique_points[:,2] - z) < 0.3]
    if len(pts) > 0:
        y_min_z = pts[:,1].min()
        y_max_z = pts[:,1].max()
        # Also find any "inner" Y boundaries
        y_unique = sorted(np.unique(np.round(pts[:,1], 0)))
        inner_y = [y for y in y_unique if abs(y) < 45 and abs(y) > 20]
        print(f"Z={z:6.1f}: outer Y=[{y_min_z:.1f}, {y_max_z:.1f}], inner Y candidates: {inner_y[:6] if len(inner_y) > 6 else inner_y}")

print(f"\n=== DETAILED Y ANALYSIS AT KEY Z LEVELS ===")

# At bottom (Z = z_min): should see floor + outer walls starting
z = z_min + 0.5
pts = unique_points[np.abs(unique_points[:,2] - z) < 0.5]
y_vals = sorted(set(round(y, 1) for y in pts[:,1]))
print(f"Z={z:.1f} (near bottom): Y values count={len(y_vals)}")
print(f"  Outer: {y_vals[:3]} ... {y_vals[-3:]}")

# Just above floor (Z = z_min + 2): should see ledge
z = z_min + 2
pts = unique_points[np.abs(unique_points[:,2] - z) < 0.5]
y_vals = sorted(set(round(y, 1) for y in pts[:,1]))
print(f"Z={z:.1f} (above floor): Y values count={len(y_vals)}")
# Find gaps in Y values that indicate wall boundaries
if len(y_vals) > 10:
    gaps = []
    for i in range(1, len(y_vals)):
        if y_vals[i] - y_vals[i-1] > 3:
            gaps.append((y_vals[i-1], y_vals[i]))
    print(f"  Gaps (wall boundaries): {gaps}")

# At top (Z = z_max): should see top of inner rails
z = z_max - 0.5
pts = unique_points[np.abs(unique_points[:,2] - z) < 0.5]
y_vals = sorted(set(round(y, 1) for y in pts[:,1]))
print(f"Z={z:.1f} (near top): Y values count={len(y_vals)}")
print(f"  Values: {y_vals[:5]} ... {y_vals[-5:]}")

print(f"\n=== EXTRACTING KEY DIMENSIONS ===")
# Based on typical box_example structure:
# - Floor thickness: distance from bottom to first interior point
# - Ledge height: height of outer wall before it steps in
# - Channel: gap between outer wall and inner rail
# - Rail width: thickness of inner rail

# Find the "step" - where outer wall ends and channel begins
# Look for the Z level where Y boundaries change significantly
prev_y_range = None
step_z = None
for z in np.linspace(z_min, z_max, 20):
    pts = unique_points[np.abs(unique_points[:,2] - z) < 0.3]
    if len(pts) > 0:
        y_range = pts[:,1].max() - pts[:,1].min()
        if prev_y_range and abs(y_range - prev_y_range) > 5:
            step_z = z
            print(f"Step detected at Z={z:.1f}: Y range changed from {prev_y_range:.1f} to {y_range:.1f}")
        prev_y_range = y_range

# Analyze the symmetric Y structure
print(f"\n=== Y STRUCTURE (assuming symmetric) ===")
mid_z = (z_min + z_max) / 2
pts = unique_points[np.abs(unique_points[:,2] - mid_z) < 1]
y_positive = sorted(set(round(y, 1) for y in pts[:,1] if y > 0))
y_negative = sorted(set(round(y, 1) for y in pts[:,1] if y < 0), reverse=True)
print(f"At Z={mid_z:.1f}:")
print(f"  +Y wall positions: {y_positive[-5:]}")
print(f"  -Y wall positions: {y_negative[-5:]}")
