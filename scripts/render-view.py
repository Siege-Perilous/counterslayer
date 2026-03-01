#!/usr/bin/env python3
"""
Scriptable 3D camera renderer for Claude navigation.

Usage:
    python scripts/render-view.py --stl mesh-analysis/box.stl --angle iso
    python scripts/render-view.py --stl mesh-analysis/box.stl --angle left --zoom 2
    python scripts/render-view.py --stl mesh-analysis/box.stl --pos "50,0,30" --look-at "5,10,20"
    python scripts/render-view.py --stl mesh-analysis/box.stl --probe
    python scripts/render-view.py --stl mesh-analysis/box.stl --markers markers.json --angle iso
"""

import argparse
import json
import numpy as np
import trimesh
from pathlib import Path
import sys

# Default output directory
MESH_ANALYSIS_DIR = Path(__file__).parent.parent / "mesh-analysis"


def parse_vector(s: str) -> np.ndarray:
    """Parse a comma-separated vector string like '50,0,30' into numpy array."""
    return np.array([float(x.strip()) for x in s.split(",")])


def get_preset_camera(angle: str, center: np.ndarray, size: float) -> tuple:
    """
    Get camera position and rotation for preset angles.
    Returns (camera_position, look_at_point)
    """
    distance = size * 2.5  # Distance from center based on mesh size

    presets = {
        "front": (center + np.array([0, -distance, size * 0.3]), center),
        "back": (center + np.array([0, distance, size * 0.3]), center),
        "left": (center + np.array([-distance, 0, size * 0.3]), center),
        "right": (center + np.array([distance, 0, size * 0.3]), center),
        "top": (center + np.array([0, 0, distance]), center),
        "bottom": (center + np.array([0, 0, -distance]), center),
        "iso": (center + np.array([distance * 0.7, -distance * 0.7, distance * 0.5]), center),
        "iso-back": (center + np.array([-distance * 0.7, distance * 0.7, distance * 0.5]), center),
        "iso-left": (center + np.array([-distance * 0.7, -distance * 0.7, distance * 0.5]), center),
        "iso-right": (center + np.array([distance * 0.7, distance * 0.7, distance * 0.5]), center),
    }

    if angle not in presets:
        available = ", ".join(presets.keys())
        raise ValueError(f"Unknown angle '{angle}'. Available: {available}")

    return presets[angle]


def create_marker_sphere(position: list, color: str, radius: float = 1.0) -> trimesh.Trimesh:
    """Create a colored sphere marker at the given position."""
    color_map = {
        "red": [255, 0, 0, 255],
        "green": [0, 255, 0, 255],
        "blue": [0, 0, 255, 255],
        "yellow": [255, 255, 0, 255],
        "cyan": [0, 255, 255, 255],
        "magenta": [255, 0, 255, 255],
        "orange": [255, 165, 0, 255],
        "white": [255, 255, 255, 255],
    }

    sphere = trimesh.creation.icosphere(subdivisions=2, radius=radius)
    sphere.apply_translation(position)
    sphere.visual.face_colors = color_map.get(color, [255, 0, 0, 255])
    return sphere


def load_markers(markers_path: Path, mesh_size: float) -> list:
    """Load markers from JSON file and create sphere meshes."""
    if not markers_path.exists():
        print(f"Warning: Markers file not found: {markers_path}")
        return []

    with open(markers_path) as f:
        markers_data = json.load(f)

    # Marker radius scales with mesh size
    radius = mesh_size * 0.02

    spheres = []
    for name, data in markers_data.items():
        pos = data.get("pos", [0, 0, 0])
        color = data.get("color", "red")
        sphere = create_marker_sphere(pos, color, radius)
        spheres.append(sphere)
        print(f"  Marker '{name}': {pos} ({color})")

    return spheres


def probe_mesh(mesh: trimesh.Trimesh) -> dict:
    """Get coordinate information about a mesh."""
    bounds = mesh.bounds
    center = mesh.centroid
    size = mesh.extents

    return {
        "bounds": {
            "min": {"x": bounds[0][0], "y": bounds[0][1], "z": bounds[0][2]},
            "max": {"x": bounds[1][0], "y": bounds[1][1], "z": bounds[1][2]},
        },
        "center": {"x": center[0], "y": center[1], "z": center[2]},
        "size": {"x": size[0], "y": size[1], "z": size[2]},
    }


def render_scene(
    mesh: trimesh.Trimesh,
    camera_pos: np.ndarray,
    look_at: np.ndarray,
    output_path: Path,
    resolution: tuple = (800, 800),
    markers: list = None,
):
    """Render the mesh from a specific camera position."""
    # Create scene
    scene = trimesh.Scene()

    # Add main mesh with a neutral color
    mesh_copy = mesh.copy()
    mesh_copy.visual.face_colors = [100, 100, 100, 255]
    scene.add_geometry(mesh_copy)

    # Add markers if provided
    if markers:
        for marker in markers:
            scene.add_geometry(marker)

    # Calculate camera transform
    # Look-at matrix: camera at camera_pos, looking at look_at, up is Z
    forward = look_at - camera_pos
    forward = forward / np.linalg.norm(forward)

    up = np.array([0, 0, 1])
    right = np.cross(forward, up)
    if np.linalg.norm(right) < 0.001:
        # Looking straight up or down, use Y as up
        up = np.array([0, 1, 0])
        right = np.cross(forward, up)
    right = right / np.linalg.norm(right)
    up = np.cross(right, forward)

    # Build rotation matrix (camera looks along -Z in its local space)
    rotation = np.eye(4)
    rotation[:3, 0] = right
    rotation[:3, 1] = up
    rotation[:3, 2] = -forward
    rotation[:3, 3] = camera_pos

    # Set camera
    scene.camera_transform = rotation

    # Render
    try:
        png = scene.save_image(resolution=resolution, visible=True)
        with open(output_path, "wb") as f:
            f.write(png)
        print(f"Rendered: {output_path}")
    except Exception as e:
        print(f"Error rendering: {e}")
        print("Trying fallback render method...")
        # Fallback: use default camera transform
        scene.set_camera()
        png = scene.save_image(resolution=resolution)
        with open(output_path, "wb") as f:
            f.write(png)
        print(f"Rendered (fallback): {output_path}")


def main():
    parser = argparse.ArgumentParser(description="Scriptable 3D camera renderer")
    parser.add_argument("--stl", type=Path, required=True, help="Path to STL file")
    parser.add_argument("--angle", type=str, help="Preset angle: front, back, left, right, top, bottom, iso, iso-back, iso-left, iso-right")
    parser.add_argument("--pos", type=str, help="Custom camera position as 'X,Y,Z'")
    parser.add_argument("--look-at", type=str, help="Point to look at as 'X,Y,Z' (default: mesh center)")
    parser.add_argument("--zoom", type=float, default=1.0, help="Zoom multiplier (default: 1.0)")
    parser.add_argument("--out", type=Path, help="Output PNG path (default: mesh-analysis/view.png)")
    parser.add_argument("--size", type=int, default=800, help="Image size in pixels (default: 800)")
    parser.add_argument("--markers", type=Path, help="JSON file with reference markers")
    parser.add_argument("--probe", action="store_true", help="Print mesh coordinate info and exit")

    args = parser.parse_args()

    # Load mesh
    if not args.stl.exists():
        print(f"Error: STL file not found: {args.stl}")
        sys.exit(1)

    print(f"Loading: {args.stl}")
    mesh = trimesh.load(args.stl)

    # Handle probe mode
    if args.probe:
        info = probe_mesh(mesh)
        print(f"\n=== Mesh Info: {args.stl.name} ===")
        print(f"Bounds X: [{info['bounds']['min']['x']:.2f}, {info['bounds']['max']['x']:.2f}]")
        print(f"Bounds Y: [{info['bounds']['min']['y']:.2f}, {info['bounds']['max']['y']:.2f}]")
        print(f"Bounds Z: [{info['bounds']['min']['z']:.2f}, {info['bounds']['max']['z']:.2f}]")
        print(f"Center: ({info['center']['x']:.2f}, {info['center']['y']:.2f}, {info['center']['z']:.2f})")
        print(f"Size: {info['size']['x']:.2f} x {info['size']['y']:.2f} x {info['size']['z']:.2f}")
        return

    # Determine camera position
    center = mesh.centroid
    size = max(mesh.extents)

    if args.pos:
        camera_pos = parse_vector(args.pos)
        look_at = parse_vector(args.look_at) if args.look_at else center
    elif args.angle:
        camera_pos, look_at = get_preset_camera(args.angle, center, size)
    else:
        # Default to iso view
        camera_pos, look_at = get_preset_camera("iso", center, size)

    # Apply zoom
    if args.zoom != 1.0:
        direction = camera_pos - look_at
        camera_pos = look_at + direction / args.zoom

    # Load markers if specified
    markers = []
    if args.markers:
        print(f"Loading markers: {args.markers}")
        markers = load_markers(args.markers, size)

    # Determine output path
    output_path = args.out if args.out else MESH_ANALYSIS_DIR / "view.png"

    # Render
    print(f"Camera position: ({camera_pos[0]:.1f}, {camera_pos[1]:.1f}, {camera_pos[2]:.1f})")
    print(f"Looking at: ({look_at[0]:.1f}, {look_at[1]:.1f}, {look_at[2]:.1f})")

    render_scene(
        mesh,
        camera_pos,
        look_at,
        output_path,
        resolution=(args.size, args.size),
        markers=markers,
    )


if __name__ == "__main__":
    main()
