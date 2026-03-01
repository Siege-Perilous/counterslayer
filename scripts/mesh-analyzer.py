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


def detect_ramps(mesh: trimesh.Trimesh, mesh_name: str) -> list:
    """
    Detect ramp-like features (small angled protrusions) on a mesh.
    Returns a list of detected ramp features with their positions and orientations.
    """
    ramps = []

    if mesh is None:
        return ramps

    bounds = mesh.bounds
    dims = bounds[1] - bounds[0]

    # For box/lid, detect features by analyzing face normals and positions
    # Ramps are small angled faces (not axis-aligned)
    face_normals = mesh.face_normals
    face_centers = mesh.triangles_center

    # Find faces with diagonal normals (not aligned to X, Y, or Z)
    # A ramp has a normal that's angled, e.g., (0.7, 0.7, 0) or similar
    diagonal_faces = []
    for i, normal in enumerate(face_normals):
        # Check if this is a "diagonal" face (significant components in 2+ axes)
        abs_normal = np.abs(normal)
        # Ramp faces have significant X or Y component AND aren't purely vertical/horizontal
        non_zero_axes = np.sum(abs_normal > 0.2)
        max_component = np.max(abs_normal)

        # A ramp face has 2 significant components and max isn't too dominant
        if non_zero_axes >= 2 and max_component < 0.95:
            diagonal_faces.append({
                'index': i,
                'center': face_centers[i],
                'normal': normal,
                'area': mesh.area_faces[i]
            })

    if not diagonal_faces:
        return ramps

    # Cluster diagonal faces by position to find ramp features
    # Group faces that are close together
    from scipy.cluster.hierarchy import fclusterdata

    if len(diagonal_faces) < 2:
        return ramps

    centers = np.array([f['center'] for f in diagonal_faces])

    # Cluster with 3mm threshold (ramps are ~5mm, so faces within 3mm are same ramp)
    try:
        clusters = fclusterdata(centers, t=3.0, criterion='distance')
    except Exception:
        return ramps

    # Analyze each cluster
    for cluster_id in np.unique(clusters):
        cluster_mask = clusters == cluster_id
        cluster_faces = [f for f, m in zip(diagonal_faces, cluster_mask) if m]

        if len(cluster_faces) < 3:  # Need at least a few faces to be a ramp
            continue

        cluster_centers = np.array([f['center'] for f in cluster_faces])
        cluster_normals = np.array([f['normal'] for f in cluster_faces])
        total_area = sum(f['area'] for f in cluster_faces)

        # Skip if total area is too small (noise) or too large (not a ramp)
        if total_area < 1.0 or total_area > 50.0:
            continue

        # Calculate bounding box of this cluster
        cluster_min = cluster_centers.min(axis=0)
        cluster_max = cluster_centers.max(axis=0)
        cluster_size = cluster_max - cluster_min

        # Determine which wall this ramp is on and its protrusion direction
        avg_normal = cluster_normals.mean(axis=0)
        avg_normal = avg_normal / np.linalg.norm(avg_normal)

        # Determine protrusion direction from average normal
        protrusion_dir = "unknown"
        abs_avg = np.abs(avg_normal)
        if abs_avg[0] > abs_avg[1] and abs_avg[0] > abs_avg[2]:
            protrusion_dir = "+X" if avg_normal[0] > 0 else "-X"
        elif abs_avg[1] > abs_avg[0] and abs_avg[1] > abs_avg[2]:
            protrusion_dir = "+Y" if avg_normal[1] > 0 else "-Y"

        # Determine position description
        center = (cluster_min + cluster_max) / 2
        position_desc = []

        # Check position relative to mesh bounds
        rel_x = (center[0] - bounds[0][0]) / dims[0]
        rel_y = (center[1] - bounds[0][1]) / dims[1]
        rel_z = (center[2] - bounds[0][2]) / dims[2]

        if rel_x < 0.2:
            position_desc.append("left (low X)")
        elif rel_x > 0.8:
            position_desc.append("right (high X)")

        if rel_y < 0.2:
            position_desc.append("front (low Y, entry)")
        elif rel_y > 0.8:
            position_desc.append("back (high Y, exit)")
        else:
            position_desc.append(f"mid Y ({rel_y:.0%})")

        if rel_z < 0.3:
            position_desc.append("bottom")
        elif rel_z > 0.7:
            position_desc.append("top")

        ramp_info = {
            "cluster_id": int(cluster_id),
            "face_count": len(cluster_faces),
            "total_area_mm2": round(total_area, 2),
            "position": {
                "center": [round(x, 2) for x in center],
                "min": [round(x, 2) for x in cluster_min],
                "max": [round(x, 2) for x in cluster_max],
                "size": [round(x, 2) for x in cluster_size]
            },
            "relative_position": {
                "x": round(rel_x, 2),
                "y": round(rel_y, 2),
                "z": round(rel_z, 2)
            },
            "position_description": ", ".join(position_desc),
            "avg_normal": [round(x, 3) for x in avg_normal],
            "protrusion_direction": protrusion_dir
        }
        ramps.append(ramp_info)

    return ramps


def analyze_expected_ramp_positions(mesh: trimesh.Trimesh, mesh_name: str, box_dims: list) -> dict:
    """
    For Y-slide boxes (depth > width), analyze geometry at expected ramp positions.
    Ramps should be on left/right walls, near the exit (high Y).

    Returns detailed analysis of what geometry exists at expected ramp locations.
    """
    if mesh is None or box_dims is None:
        return {}

    width, depth, height = box_dims
    is_y_slide = depth > width

    if not is_y_slide:
        # X-slide: ramps are on FRONT and BACK walls
        # Exit is at HIGH X
        exit_x_threshold = width * 0.85
        groove_z_min = height - 4
        groove_z_max = height - 0.5
        wall_thickness = 3.0

        results = {
            "box_type": "X-slide (width > depth)",
            "expected_ramp_positions": {
                "front_wall_y": f"Y ≈ {wall_thickness/2:.1f}mm (front wall)",
                "back_wall_y": f"Y ≈ {depth - wall_thickness/2:.1f}mm (back wall)",
                "exit_x_range": f"X > {exit_x_threshold:.1f}mm (exit region)",
                "groove_z_range": f"Z = {groove_z_min:.1f} to {groove_z_max:.1f}mm"
            },
            "front_wall_analysis": None,
            "back_wall_analysis": None
        }

        vertices = mesh.vertices
        face_centers = mesh.triangles_center
        face_normals = mesh.face_normals

        def analyze_wall_region_x(y_min, y_max, wall_name):
            matching_faces = []
            for i, center in enumerate(face_centers):
                if (y_min <= center[1] <= y_max and
                    center[0] > exit_x_threshold and
                    groove_z_min <= center[2] <= groove_z_max):
                    matching_faces.append({
                        'center': center,
                        'normal': face_normals[i],
                        'area': mesh.area_faces[i]
                    })

            if not matching_faces:
                return {
                    "faces_found": 0,
                    "status": "NO GEOMETRY AT EXPECTED RAMP LOCATION",
                    "detail": f"No faces at Y={y_min:.1f}-{y_max:.1f}, X>{exit_x_threshold:.1f}, Z={groove_z_min:.1f}-{groove_z_max:.1f}"
                }

            centers = np.array([f['center'] for f in matching_faces])
            total_area = sum(f['area'] for f in matching_faces)

            angled_faces = [f for f in matching_faces
                           if abs(f['normal'][2]) < 0.9 and
                           (abs(f['normal'][0]) > 0.3 or abs(f['normal'][1]) > 0.3)]

            x_values = [f['center'][0] for f in matching_faces]

            return {
                "faces_found": len(matching_faces),
                "total_area_mm2": round(total_area, 2),
                "x_range": [round(min(x_values), 2), round(max(x_values), 2)],
                "angled_faces": len(angled_faces),
                "status": "RAMP DETECTED" if len(angled_faces) > 5 else "Flat geometry only",
                "avg_position": [round(x, 2) for x in centers.mean(axis=0).tolist()],
            }

        results["front_wall_analysis"] = analyze_wall_region_x(0, wall_thickness + 1, "front")
        results["back_wall_analysis"] = analyze_wall_region_x(depth - wall_thickness - 1, depth, "back")

        return results

    # For Y-slide, ramps are on LEFT and RIGHT walls
    # Expected positions (approximate):
    # - X: near wall surfaces (X ≈ 1.5mm for left, X ≈ width-1.5mm for right)
    # - Y: near EXIT end (Y > depth * 0.9)
    # - Z: near groove height (Z ≈ height - 3 to height - 1 for box groove)

    wall_thickness = 3.0  # Typical wall thickness
    groove_z_min = height - 4  # Groove is near top
    groove_z_max = height - 0.5
    exit_y_threshold = depth * 0.85  # Ramps should be in the last 15% of Y

    results = {
        "box_type": "Y-slide (depth > width)",
        "expected_ramp_positions": {
            "left_wall_x": f"X ≈ {wall_thickness/2:.1f}mm (±1mm)",
            "right_wall_x": f"X ≈ {width - wall_thickness/2:.1f}mm (±1mm)",
            "exit_y_range": f"Y > {exit_y_threshold:.1f}mm (exit region)",
            "groove_z_range": f"Z = {groove_z_min:.1f} to {groove_z_max:.1f}mm"
        },
        "left_wall_analysis": None,
        "right_wall_analysis": None
    }

    # Get vertices and faces
    vertices = mesh.vertices
    face_centers = mesh.triangles_center
    face_normals = mesh.face_normals

    def analyze_wall_region(x_min, x_max, wall_name):
        """Analyze faces in a wall region at the exit end."""
        # Find faces in this X range, at exit Y, at groove Z height
        matching_faces = []
        for i, center in enumerate(face_centers):
            if (x_min <= center[0] <= x_max and
                center[1] > exit_y_threshold and
                groove_z_min <= center[2] <= groove_z_max):
                matching_faces.append({
                    'center': center,
                    'normal': face_normals[i],
                    'area': mesh.area_faces[i]
                })

        if not matching_faces:
            return {
                "faces_found": 0,
                "status": "NO GEOMETRY AT EXPECTED RAMP LOCATION",
                "detail": f"No faces found at X={x_min:.1f}-{x_max:.1f}, Y>{exit_y_threshold:.1f}, Z={groove_z_min:.1f}-{groove_z_max:.1f}"
            }

        # Analyze the faces found
        centers = np.array([f['center'] for f in matching_faces])
        normals = np.array([f['normal'] for f in matching_faces])
        total_area = sum(f['area'] for f in matching_faces)

        # Check for angled faces (ramp indicators)
        angled_faces = []
        flat_faces = []
        for f in matching_faces:
            n = f['normal']
            # Angled face: significant X or Y component AND Z component < 0.9
            if abs(n[2]) < 0.9 and (abs(n[0]) > 0.3 or abs(n[1]) > 0.3):
                angled_faces.append(f)
            else:
                flat_faces.append(f)

        y_values = [f['center'][1] for f in matching_faces]

        return {
            "faces_found": len(matching_faces),
            "total_area_mm2": round(total_area, 2),
            "y_range": [round(min(y_values), 2), round(max(y_values), 2)],
            "angled_faces": len(angled_faces),
            "flat_faces": len(flat_faces),
            "status": "RAMP DETECTED" if len(angled_faces) > 5 else "Flat geometry only",
            "avg_position": [round(x, 2) for x in centers.mean(axis=0).tolist()],
        }

    # Analyze left wall (low X)
    results["left_wall_analysis"] = analyze_wall_region(0, wall_thickness + 1, "left")

    # Analyze right wall (high X)
    results["right_wall_analysis"] = analyze_wall_region(width - wall_thickness - 1, width, "right")

    return results


def analyze_lid_ramp_positions(mesh: trimesh.Trimesh, lid_dims: list) -> dict:
    """
    For Y-slide lids, analyze geometry at expected ramp positions on rails.
    Rails are on left/right sides, ramps near the exit (high Y).

    For a lid, Z=0 is the flat top, rails hang down (toward -Z in normal orientation,
    but when printed, the lid is flipped so rails are at the build plate).
    In the STL, the rails are at the BOTTOM (low Z).
    """
    if mesh is None or lid_dims is None:
        return {}

    width, depth, height = lid_dims
    is_y_slide = depth > width

    if not is_y_slide:
        # X-slide lid: ramps are on FRONT and BACK rails
        # Exit is at HIGH X
        wall = 3.0
        exit_x_threshold = width * 0.85
        rail_z_min = height - 3
        rail_z_max = height

        results = {
            "lid_type": "X-slide (width > depth)",
            "expected_ramp_positions": {
                "front_rail_y": f"Y ≈ {wall:.1f}mm (front rail inner edge)",
                "back_rail_y": f"Y ≈ {depth - wall:.1f}mm (back rail inner edge)",
                "exit_x_range": f"X > {exit_x_threshold:.1f}mm (exit region)",
                "rail_z_range": f"Z = {rail_z_min:.1f} to {rail_z_max:.1f}mm"
            },
            "front_rail_analysis": None,
            "back_rail_analysis": None
        }

        face_centers = mesh.triangles_center
        face_normals = mesh.face_normals

        def analyze_rail_x(y_min, y_max, rail_name):
            matching_faces = []
            for i, center in enumerate(face_centers):
                if (y_min <= center[1] <= y_max and
                    center[0] > exit_x_threshold and
                    rail_z_min <= center[2] <= rail_z_max):
                    matching_faces.append({
                        'center': center,
                        'normal': face_normals[i],
                        'area': mesh.area_faces[i]
                    })

            if not matching_faces:
                return {
                    "faces_found": 0,
                    "status": "NO GEOMETRY AT EXPECTED RAMP LOCATION",
                    "detail": f"No faces at Y={y_min:.1f}-{y_max:.1f}, X>{exit_x_threshold:.1f}, Z={rail_z_min:.1f}-{rail_z_max:.1f}"
                }

            centers = np.array([f['center'] for f in matching_faces])
            total_area = sum(f['area'] for f in matching_faces)

            angled_faces = [f for f in matching_faces
                           if abs(f['normal'][2]) < 0.9 and
                           (abs(f['normal'][0]) > 0.3 or abs(f['normal'][1]) > 0.3)]

            x_values = [f['center'][0] for f in matching_faces]

            return {
                "faces_found": len(matching_faces),
                "total_area_mm2": round(total_area, 2),
                "x_range": [round(min(x_values), 2), round(max(x_values), 2)],
                "angled_faces": len(angled_faces),
                "status": "RAMP DETECTED" if len(angled_faces) > 5 else "Flat geometry only",
                "avg_position": [round(x, 2) for x in centers.mean(axis=0).tolist()],
            }

        results["front_rail_analysis"] = analyze_rail_x(0, wall + 2, "front")
        results["back_rail_analysis"] = analyze_rail_x(depth - wall - 2, depth, "back")

        return results

    # For Y-slide lid, ramps are on LEFT and RIGHT rails
    # Expected positions:
    # - X: near rail edges (X ≈ wall thickness for left, X ≈ width - wall for right)
    # - Y: near EXIT end (Y > depth * 0.85)
    # - Z: on the rail (Z = height - railHeight to height for rail surface)

    wall = 3.0  # Typical wall thickness
    rail_z_min = height - 3  # Rail hangs down from top
    rail_z_max = height
    exit_y_threshold = depth * 0.85

    results = {
        "lid_type": "Y-slide (depth > width)",
        "expected_ramp_positions": {
            "left_rail_x": f"X ≈ {wall:.1f}mm (inner edge of left rail)",
            "right_rail_x": f"X ≈ {width - wall:.1f}mm (inner edge of right rail)",
            "exit_y_range": f"Y > {exit_y_threshold:.1f}mm (exit region)",
            "rail_z_range": f"Z = {rail_z_min:.1f} to {rail_z_max:.1f}mm"
        },
        "left_rail_analysis": None,
        "right_rail_analysis": None
    }

    face_centers = mesh.triangles_center
    face_normals = mesh.face_normals

    def analyze_rail_region(x_min, x_max, rail_name):
        """Analyze faces in a rail region at the exit end."""
        matching_faces = []
        for i, center in enumerate(face_centers):
            if (x_min <= center[0] <= x_max and
                center[1] > exit_y_threshold and
                rail_z_min <= center[2] <= rail_z_max):
                matching_faces.append({
                    'center': center,
                    'normal': face_normals[i],
                    'area': mesh.area_faces[i]
                })

        if not matching_faces:
            return {
                "faces_found": 0,
                "status": "NO GEOMETRY AT EXPECTED RAMP LOCATION",
                "detail": f"No faces at X={x_min:.1f}-{x_max:.1f}, Y>{exit_y_threshold:.1f}, Z={rail_z_min:.1f}-{rail_z_max:.1f}"
            }

        centers = np.array([f['center'] for f in matching_faces])
        total_area = sum(f['area'] for f in matching_faces)

        # Check for angled faces (ramp indicators)
        angled_faces = [f for f in matching_faces
                       if abs(f['normal'][2]) < 0.9 and
                       (abs(f['normal'][0]) > 0.3 or abs(f['normal'][1]) > 0.3)]

        y_values = [f['center'][1] for f in matching_faces]

        return {
            "faces_found": len(matching_faces),
            "total_area_mm2": round(total_area, 2),
            "y_range": [round(min(y_values), 2), round(max(y_values), 2)],
            "angled_faces": len(angled_faces),
            "status": "RAMP DETECTED" if len(angled_faces) > 5 else "Flat geometry only",
            "avg_position": [round(x, 2) for x in centers.mean(axis=0).tolist()],
        }

    # Analyze left rail
    results["left_rail_analysis"] = analyze_rail_region(0, wall + 2, "left")

    # Analyze right rail
    results["right_rail_analysis"] = analyze_rail_region(width - wall - 2, width, "right")

    return results


def compare_entry_vs_exit(mesh: trimesh.Trimesh, mesh_name: str, box_dims: list) -> dict:
    """
    Compare geometry at ENTRY vs EXIT ends of grooves to identify where ramps actually are.
    This helps diagnose whether ramps are at the wrong position.
    """
    if mesh is None or box_dims is None:
        return {}

    width, depth, height = box_dims
    is_y_slide = depth > width
    wall = 3.0
    groove_z_min = height - 4
    groove_z_max = height

    results = {
        "slide_type": "Y-slide" if is_y_slide else "X-slide",
        "entry_region": {},
        "exit_region": {},
        "diagnosis": ""
    }

    face_centers = mesh.triangles_center
    face_normals = mesh.face_normals
    face_areas = mesh.area_faces

    if is_y_slide:
        # Entry at low Y, Exit at high Y
        # Check left groove (X near 0)
        entry_y_max = wall + 10  # First 10mm after entry wall
        exit_y_min = depth - wall - 10  # Last 10mm before exit

        def get_groove_faces(y_min, y_max, region_name):
            """Get faces in the left groove region within Y bounds."""
            faces = []
            for i, center in enumerate(face_centers):
                if (0 <= center[0] <= wall + 2 and  # Left wall region
                    y_min <= center[1] <= y_max and
                    groove_z_min <= center[2] <= groove_z_max):
                    # Check if face protrudes (has +X normal component)
                    if face_normals[i][0] > 0.3:  # Faces pointing toward +X
                        faces.append({
                            'center': [round(x, 2) for x in center],
                            'normal': [round(x, 3) for x in face_normals[i]],
                            'area': round(face_areas[i], 3)
                        })
            return faces

        entry_faces = get_groove_faces(0, entry_y_max, "entry")
        exit_faces = get_groove_faces(exit_y_min, depth, "exit")

        results["entry_region"] = {
            "y_range": f"Y = 0 to {entry_y_max:.1f}mm",
            "protruding_faces": len(entry_faces),
            "total_area": round(sum(f['area'] for f in entry_faces), 2),
            "sample_positions": [f['center'] for f in entry_faces[:5]]
        }

        results["exit_region"] = {
            "y_range": f"Y = {exit_y_min:.1f} to {depth:.1f}mm",
            "protruding_faces": len(exit_faces),
            "total_area": round(sum(f['area'] for f in exit_faces), 2),
            "sample_positions": [f['center'] for f in exit_faces[:5]]
        }

        # Diagnosis
        if results["entry_region"]["protruding_faces"] > results["exit_region"]["protruding_faces"]:
            results["diagnosis"] = "PROBLEM: More protruding faces at ENTRY than EXIT - ramp may be at wrong end!"
        elif results["exit_region"]["protruding_faces"] > 10:
            results["diagnosis"] = "OK: Protruding faces detected at EXIT region"
        else:
            results["diagnosis"] = "WARNING: Few protruding faces at EXIT - ramp may be missing or too small"

    else:
        # X-slide: Entry at low X, Exit at high X
        entry_x_max = wall + 10
        exit_x_min = width - wall - 10

        def get_groove_faces_x(x_min, x_max, region_name):
            """Get faces in the front groove region within X bounds."""
            faces = []
            for i, center in enumerate(face_centers):
                if (x_min <= center[0] <= x_max and
                    0 <= center[1] <= wall + 2 and  # Front wall region
                    groove_z_min <= center[2] <= groove_z_max):
                    # Check if face protrudes (has +Y normal component)
                    if face_normals[i][1] > 0.3:
                        faces.append({
                            'center': [round(x, 2) for x in center],
                            'normal': [round(x, 3) for x in face_normals[i]],
                            'area': round(face_areas[i], 3)
                        })
            return faces

        entry_faces = get_groove_faces_x(0, entry_x_max, "entry")
        exit_faces = get_groove_faces_x(exit_x_min, width, "exit")

        results["entry_region"] = {
            "x_range": f"X = 0 to {entry_x_max:.1f}mm",
            "protruding_faces": len(entry_faces),
            "total_area": round(sum(f['area'] for f in entry_faces), 2),
            "sample_positions": [f['center'] for f in entry_faces[:5]]
        }

        results["exit_region"] = {
            "x_range": f"X = {exit_x_min:.1f} to {width:.1f}mm",
            "protruding_faces": len(exit_faces),
            "total_area": round(sum(f['area'] for f in exit_faces), 2),
            "sample_positions": [f['center'] for f in exit_faces[:5]]
        }

        if results["entry_region"]["protruding_faces"] > results["exit_region"]["protruding_faces"]:
            results["diagnosis"] = "PROBLEM: More protruding faces at ENTRY than EXIT - ramp may be at wrong end!"
        elif results["exit_region"]["protruding_faces"] > 10:
            results["diagnosis"] = "OK: Protruding faces detected at EXIT region"
        else:
            results["diagnosis"] = "WARNING: Few protruding faces at EXIT - ramp may be missing or too small"

    return results


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

    # Detect ramps on box and lid
    print("  Detecting ramp features...")
    ramp_analysis = {}
    for name in ["box", "lid"]:
        if name in meshes and meshes[name] is not None:
            ramps = detect_ramps(meshes[name], name)
            if ramps:
                ramp_analysis[name] = ramps
                print(f"    {name}: found {len(ramps)} ramp-like features")
    report["ramp_analysis"] = ramp_analysis

    # Targeted ramp position analysis for box
    if "box" in meshes and meshes["box"] is not None:
        box_bounds = meshes["box"].bounds
        box_dims = [box_bounds[1][i] - box_bounds[0][i] for i in range(3)]
        print("  Analyzing expected ramp positions on box...")
        expected_ramps = analyze_expected_ramp_positions(meshes["box"], "box", box_dims)
        report["expected_ramp_analysis"] = {"box": expected_ramps}

        # Also analyze lid at expected positions
        if "lid" in meshes and meshes["lid"] is not None:
            lid_bounds = meshes["lid"].bounds
            lid_dims = [lid_bounds[1][i] - lid_bounds[0][i] for i in range(3)]
            # For lid, ramps protrude from rails at the bottom of the lid
            lid_ramps = analyze_lid_ramp_positions(meshes["lid"], lid_dims)
            report["expected_ramp_analysis"]["lid"] = lid_ramps

        # Compare entry vs exit to diagnose ramp position issues
        print("  Comparing entry vs exit regions...")
        entry_exit = compare_entry_vs_exit(meshes["box"], "box", box_dims)
        report["protrusion_analysis"] = {"box": entry_exit}
        print(f"    Diagnosis: {entry_exit.get('diagnosis', 'N/A')}")

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
