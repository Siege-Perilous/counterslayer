#!/usr/bin/env python3
"""
Mesh Analyzer for Counter Tray Debugging

Analyzes STL files and generates reports for Claude to read.
Processes all STLs listed in stl-manifest.json (box, lid, and all trays).
Outputs: report.json with analysis of each mesh, plus rendered views.
"""

import json
import sys
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import trimesh


def analyze_mesh(stl_path: Path) -> dict:
    """Load and analyze an STL mesh, returning stats and validation info."""
    mesh = trimesh.load(stl_path)

    # Handle scene vs single mesh
    if isinstance(mesh, trimesh.Scene):
        # Combine all geometries into one mesh
        meshes = [g for g in mesh.geometry.values() if isinstance(g, trimesh.Trimesh)]
        if not meshes:
            raise ValueError("No mesh geometries found in STL")
        mesh = trimesh.util.concatenate(meshes)

    # Basic stats
    bounds = mesh.bounds  # [[min_x, min_y, min_z], [max_x, max_y, max_z]]

    stats = {
        "vertices": int(len(mesh.vertices)),
        "faces": int(len(mesh.faces)),
        "volume_mm3": float(mesh.volume) if mesh.is_watertight else None,
        "surface_area_mm2": float(mesh.area),
        "bounding_box": {
            "min": [float(x) for x in bounds[0]],
            "max": [float(x) for x in bounds[1]],
            "dimensions": [float(bounds[1][i] - bounds[0][i]) for i in range(3)]
        }
    }

    # Validation checks
    validation = {
        "is_watertight": bool(mesh.is_watertight),
        "is_winding_consistent": bool(mesh.is_winding_consistent),
        "euler_number": int(mesh.euler_number) if hasattr(mesh, 'euler_number') else None
    }

    # Check for common issues
    errors = []
    warnings = []

    if not mesh.is_watertight:
        warnings.append("Mesh is not watertight - may have holes or gaps")

    if not mesh.is_winding_consistent:
        warnings.append("Face winding is inconsistent - some faces may be inverted")

    # Check for degenerate faces (zero area triangles)
    try:
        face_areas = mesh.area_faces
        degenerate_count = np.sum(face_areas < 1e-10)
        if degenerate_count > 0:
            errors.append(f"Found {degenerate_count} degenerate faces (zero area)")
    except Exception:
        pass  # Skip if area_faces not available

    return {
        "stats": stats,
        "validation": validation,
        "errors": errors,
        "warnings": warnings
    }, mesh


def render_mesh(mesh: trimesh.Trimesh, output_path: Path, title: str, color: str = '#4a90d9'):
    """Render isometric view of a single mesh."""
    vertices = mesh.vertices
    faces = mesh.faces

    fig = plt.figure(figsize=(8, 8), facecolor='#f0f0f0')
    ax = fig.add_subplot(111, projection='3d')

    # Plot the mesh - solid without wireframe edges for cleaner look
    ax.plot_trisurf(
        vertices[:, 0],
        vertices[:, 1],
        faces,
        vertices[:, 2],
        color=color,
        edgecolor='none',
        linewidth=0,
        alpha=0.95
    )

    # Set isometric view
    ax.view_init(elev=30, azim=45)

    # Make axes equal scale
    bounds = mesh.bounds
    max_range = max(bounds[1] - bounds[0]) / 2.0
    mid = (bounds[1] + bounds[0]) / 2.0

    ax.set_xlim(mid[0] - max_range, mid[0] + max_range)
    ax.set_ylim(mid[1] - max_range, mid[1] + max_range)
    ax.set_zlim(mid[2] - max_range, mid[2] + max_range)

    # Labels
    ax.set_xlabel('X (mm)')
    ax.set_ylabel('Y (mm)')
    ax.set_zlabel('Z (mm)')
    ax.set_title(title)

    # Set background
    ax.set_facecolor('#f0f0f0')
    ax.xaxis.pane.fill = False
    ax.yaxis.pane.fill = False
    ax.zaxis.pane.fill = False

    plt.tight_layout()
    plt.savefig(output_path, dpi=150, facecolor='#f0f0f0')
    plt.close()


def compute_spatial_analysis(meshes: dict, placements: dict, analysis_dir: Path) -> dict:
    """Compute text-based spatial layout analysis."""

    # Load project.json for box parameters
    project_path = analysis_dir / "project.json"
    context_path = analysis_dir / "context.json"

    box_params = {}
    if project_path.exists() and context_path.exists():
        with open(project_path) as f:
            project = json.load(f)
        with open(context_path) as f:
            context = json.load(f)

        # Find the selected box
        box_id = context.get("box_id")
        for box in project.get("boxes", []):
            if box.get("id") == box_id:
                box_params = {
                    "wall_thickness": box.get("wallThickness", 3),
                    "floor_thickness": box.get("floorThickness", 2),
                    "tolerance": box.get("tolerance", 0.5)
                }
                break

    wall = box_params.get("wall_thickness", 3)
    floor = box_params.get("floor_thickness", 2)

    # Get box exterior dimensions from mesh
    box_exterior = None
    if "box" in meshes and meshes["box"] is not None:
        bounds = meshes["box"].bounds
        box_exterior = [float(bounds[1][i] - bounds[0][i]) for i in range(3)]

    # Compute box interior
    box_interior = None
    if box_exterior:
        box_interior = [
            box_exterior[0] - 2 * wall,  # width minus two walls
            box_exterior[1] - 2 * wall,  # depth minus two walls
            box_exterior[2] - floor      # height minus floor
        ]

    # Analyze tray placements
    trays = []
    total_tray_depth = 0
    max_tray_width = 0
    max_tray_height = 0

    for name, mesh in meshes.items():
        if mesh is None or "tray" not in name.lower():
            continue

        bounds = mesh.bounds
        dims = [float(bounds[1][i] - bounds[0][i]) for i in range(3)]

        placement = placements.get(name, {})
        pos_x = placement.get("x", 0)
        pos_y = placement.get("y", 0)

        tray_info = {
            "name": name,
            "dimensions": {"width": dims[0], "depth": dims[1], "height": dims[2]},
            "position": {"x": pos_x, "y": pos_y},
            "bounds": {
                "x": [pos_x, pos_x + dims[0]],
                "y": [pos_y, pos_y + dims[1]]
            }
        }
        trays.append(tray_info)

        max_tray_width = max(max_tray_width, dims[0])
        max_tray_height = max(max_tray_height, dims[2])

    # Sort trays by Y position
    trays.sort(key=lambda t: t["position"]["y"])

    # Calculate total depth and gaps
    if trays:
        last_tray = trays[-1]
        total_tray_depth = last_tray["bounds"]["y"][1]

    # Fit analysis
    fit_check = {}
    if box_interior:
        fit_check = {
            "interior_width": box_interior[0],
            "interior_depth": box_interior[1],
            "interior_height": box_interior[2],
            "max_tray_width": max_tray_width,
            "total_tray_depth": total_tray_depth,
            "max_tray_height": max_tray_height,
            "width_gap": round(box_interior[0] - max_tray_width, 2),
            "depth_gap": round(box_interior[1] - total_tray_depth, 2),
            "height_clearance": round(box_interior[2] - max_tray_height, 2),
            "fits_width": box_interior[0] >= max_tray_width - 0.1,
            "fits_depth": box_interior[1] >= total_tray_depth - 0.1,
            "fits_height": box_interior[2] >= max_tray_height - 0.1
        }

    return {
        "box_params": box_params,
        "box_exterior_mm": box_exterior,
        "box_interior_mm": box_interior,
        "trays": trays,
        "fit_check": fit_check
    }


def check_intersections(meshes: dict, placements: dict) -> list:
    """Check for potential intersections between meshes using placement data."""
    issues = []
    mesh_list = [(name, mesh) for name, mesh in meshes.items() if mesh is not None]

    def get_placed_bounds(name, mesh):
        """Get bounds with placement offset applied."""
        bounds = mesh.bounds.copy()
        if name in placements:
            offset_x = placements[name].get('x', 0)
            offset_y = placements[name].get('y', 0)
            bounds[0][0] += offset_x
            bounds[1][0] += offset_x
            bounds[0][1] += offset_y
            bounds[1][1] += offset_y
        return bounds

    for i, (name1, mesh1) in enumerate(mesh_list):
        bounds1 = get_placed_bounds(name1, mesh1)

        for name2, mesh2 in mesh_list[i+1:]:
            bounds2 = get_placed_bounds(name2, mesh2)

            # Check if bounding boxes actually overlap (not just touching)
            # Use 1mm tolerance - trays touching at edges is normal
            overlap = True
            for dim in range(3):
                if bounds1[1][dim] <= bounds2[0][dim] + 0.5 or bounds2[1][dim] <= bounds1[0][dim] + 0.5:
                    overlap = False
                    break

            if overlap:
                # Bounding boxes overlap - could be an issue
                # For trays in a box, some overlap with box walls is expected
                if 'tray' in name1.lower() and name2 == 'box':
                    # Check if tray extends outside box
                    for dim, axis in enumerate(['X', 'Y', 'Z']):
                        if bounds1[0][dim] < bounds2[0][dim] - 0.5:
                            issues.append(f"{name1} extends outside box on {axis} min")
                        if bounds1[1][dim] > bounds2[1][dim] + 0.5:
                            issues.append(f"{name1} extends outside box on {axis} max")
                elif 'tray' in name1.lower() and 'tray' in name2.lower():
                    issues.append(f"Collision: {name1} and {name2} overlap")

    return issues


def main():
    # Default to mesh-analysis directory relative to this script
    script_dir = Path(__file__).parent
    analysis_dir = script_dir.parent / "mesh-analysis"

    # Allow override via command line
    if len(sys.argv) > 1:
        analysis_dir = Path(sys.argv[1])

    manifest_path = analysis_dir / "stl-manifest.json"

    # Check for manifest (new multi-file format) or single STL (legacy)
    if manifest_path.exists():
        with open(manifest_path) as f:
            stl_files = json.load(f)
    else:
        # Legacy: single current.stl file
        stl_path = analysis_dir / "current.stl"
        if stl_path.exists():
            stl_files = ["current.stl"]
        else:
            print(f"Error: No STL files found in {analysis_dir}", file=sys.stderr)
            sys.exit(1)

    print(f"Analyzing {len(stl_files)} STL files...")

    # Load placement data from context.json
    placements = {}
    context_path = analysis_dir / "context.json"
    if context_path.exists():
        with open(context_path) as f:
            context = json.load(f)
            # Build placement lookup by tray filename pattern
            for tray_info in context.get("trays", []):
                # Match filename pattern: tray_LETTER_Name
                key = f"tray_{tray_info['letter']}_{tray_info['name'].replace(' ', '_')}"
                placements[key] = tray_info.get("placement", {})

    # Analyze each mesh
    report = {
        "meshes": {},
        "combined_analysis": {
            "total_vertices": 0,
            "total_faces": 0,
            "issues": []
        }
    }

    meshes = {}

    for stl_file in stl_files:
        stl_path = analysis_dir / stl_file
        if not stl_path.exists():
            print(f"Warning: {stl_file} not found, skipping", file=sys.stderr)
            continue

        print(f"  Analyzing: {stl_file}")

        try:
            mesh_report, mesh = analyze_mesh(stl_path)

            # Determine mesh type from filename
            name = stl_file.replace('.stl', '')
            meshes[name] = mesh

            report["meshes"][name] = mesh_report
            report["combined_analysis"]["total_vertices"] += mesh_report["stats"]["vertices"]
            report["combined_analysis"]["total_faces"] += mesh_report["stats"]["faces"]

            # Aggregate errors/warnings
            for err in mesh_report["errors"]:
                report["combined_analysis"]["issues"].append(f"{name}: {err}")
            for warn in mesh_report["warnings"]:
                # Don't add watertight warnings - trays, boxes, and lids are open by design
                if "watertight" in warn.lower():
                    continue
                report["combined_analysis"]["issues"].append(f"{name}: {warn}")

        except Exception as e:
            print(f"  Error analyzing {stl_file}: {e}", file=sys.stderr)
            report["meshes"][stl_file] = {"error": str(e)}

    # Check for intersections using placement data
    print("  Checking for intersections...")
    intersection_issues = check_intersections(meshes, placements)
    report["combined_analysis"]["issues"].extend(intersection_issues)

    # Compute spatial analysis
    print("  Computing spatial layout...")
    spatial = compute_spatial_analysis(meshes, placements, analysis_dir)
    report["spatial_layout"] = spatial

    # Add fit issues to combined analysis
    fit = spatial.get("fit_check", {})
    if fit.get("fits_width") is False:
        report["combined_analysis"]["issues"].append(
            f"Trays too wide: {fit['max_tray_width']:.1f}mm > interior {fit['interior_width']:.1f}mm")
    if fit.get("fits_depth") is False:
        report["combined_analysis"]["issues"].append(
            f"Trays too deep: {fit['total_tray_depth']:.1f}mm > interior {fit['interior_depth']:.1f}mm")
    if fit.get("fits_height") is False:
        report["combined_analysis"]["issues"].append(
            f"Trays too tall: {fit['max_tray_height']:.1f}mm > interior {fit['interior_height']:.1f}mm")

    # Write report
    report_path = analysis_dir / "report.json"
    with open(report_path, 'w') as f:
        json.dump(report, f, indent=2)
    print(f"Report written to: {report_path}")

    # Render individual mesh views (not combined - app handles that)
    print("Rendering individual STL views...")
    for name, mesh in meshes.items():
        if mesh is None:
            continue
        output_path = analysis_dir / f"view-{name}.png"
        render_mesh(mesh, output_path, f"{name}")
        print(f"  Rendered: {output_path.name}")

    # Print summary
    print("\n=== Analysis Summary ===")
    print(f"Total meshes: {len(meshes)}")
    print(f"Total vertices: {report['combined_analysis']['total_vertices']}")
    print(f"Total faces: {report['combined_analysis']['total_faces']}")

    if report["combined_analysis"]["issues"]:
        print("\nIssues found:")
        for issue in report["combined_analysis"]["issues"]:
            print(f"  - {issue}")
    else:
        print("\nNo issues detected!")


if __name__ == "__main__":
    main()
