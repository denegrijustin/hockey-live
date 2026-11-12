"""Builds the ice resurfacer (Zamboni-style) as an optimised GLB with Blender's Python API.
   blender -b -P tools/zamboni/build_zamboni.py -- <textures_dir> <out.glb> [--preview <png_prefix>]

Units: 1 Blender unit = 1 foot (the app's ground plane is in feet). Forward is +X, up +Z (the glTF exporter turns that into +X forward, +Y up).
The model's origin is on the ground under the centre of the resurfacing blade's trailing edge is NOT used: the origin is the vehicle centre; the
blade's centre line sits 9 ft behind it (see BLADE_BACK in src/lib/ice-plan.mjs). The KC Scouts logo and BRING HOCKEY TO KC decals exist only here.
"""
import bpy, bmesh, math, sys, os
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
TEX, OUT = argv[0], argv[1]
PREVIEW = argv[argv.index("--preview") + 1] if "--preview" in argv else None

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

def mat(name, color, metal=0.0, rough=0.5, coat=0.0, emit=None, emit_strength=0.0, alpha_tex=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Metallic"].default_value = metal
    b.inputs["Roughness"].default_value = rough
    if coat:
        b.inputs["Coat Weight"].default_value = coat
        b.inputs["Coat Roughness"].default_value = 0.08
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = emit_strength
    if alpha_tex:
        t = m.node_tree.nodes.new("ShaderNodeTexImage")
        t.image = bpy.data.images.load(alpha_tex)
        t.image.alpha_mode = "STRAIGHT"
        m.node_tree.links.new(t.outputs["Color"], b.inputs["Base Color"])
        m.node_tree.links.new(t.outputs["Alpha"], b.inputs["Alpha"])
        b.inputs["Roughness"].default_value = 0.45
        m.blend_method = "BLEND"
        m.use_backface_culling = True
    return m

def srgb(h):
    h = h.lstrip("#"); r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    f = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (f(r), f(g), f(b))

PAINT = mat("paint_kc_blue", srgb("#1c3d8f"), 0.15, 0.32, coat=0.6)
PAINT_D = mat("paint_dark", srgb("#142c68"), 0.15, 0.4, coat=0.4)
GOLD = mat("stripe_gold", srgb("#f1b82c"), 0.1, 0.35, coat=0.4)
RED = mat("stripe_red", srgb("#c8202f"), 0.1, 0.35, coat=0.4)
STEEL = mat("steel", srgb("#aeb7c0"), 0.9, 0.32)
STEEL_D = mat("steel_dark", srgb("#5d6670"), 0.85, 0.45)
RUBBER = mat("rubber", srgb("#14161a"), 0.0, 0.85)
PLASTIC = mat("plastic_black", srgb("#1b1e24"), 0.0, 0.5)
LAMP = mat("headlamp", srgb("#fff3cf"), 0.0, 0.2, emit=srgb("#fff3cf"), emit_strength=2.5)
TAIL = mat("taillamp", srgb("#e03040"), 0.0, 0.25, emit=srgb("#ff2030"), emit_strength=1.6)
AMBER = mat("beacon", srgb("#ffb11f"), 0.0, 0.2, emit=srgb("#ffa000"), emit_strength=1.2)
SKIN = mat("skin", srgb("#e0b08e"), 0.0, 0.6)
JACKET = mat("jacket", srgb("#1b2538"), 0.0, 0.8)
CAP = mat("cap", srgb("#0d1a33"), 0.0, 0.8)
SEAT = mat("seat", srgb("#23262d"), 0.0, 0.7)
HOSE = mat("hose", srgb("#b8651f"), 0.3, 0.5)
DECAL_SIDE = mat("decal_side", (1, 1, 1), alpha_tex=os.path.join(TEX, "decal_side.png"))
DECAL_REAR = mat("decal_rear", (1, 1, 1), alpha_tex=os.path.join(TEX, "decal_rear.png"))

parts = []
def finish(obj, m, bevel=0.0, seg=3, smooth=True):
    obj.data.materials.append(m)
    if bevel:
        bpy.context.view_layer.objects.active = obj
        mod = obj.modifiers.new("b", "BEVEL"); mod.width = bevel; mod.segments = seg; mod.limit_method = "ANGLE"; mod.angle_limit = math.radians(35)
        bpy.ops.object.modifier_apply(modifier="b")
    if smooth:
        for p in obj.data.polygons: p.use_smooth = True
        if hasattr(obj.data, "auto_smooth_angle"): pass
    parts.append(obj)
    return obj

def box(name, x0, x1, y0, y1, z0, z1, m, bevel=0.1):
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.active_object; o.name = name
    o.scale = (x1 - x0, y1 - y0, z1 - z0); o.location = ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
    bpy.ops.object.transform_apply(scale=True)
    return finish(o, m, bevel)

def cyl(name, x, y, z, r, depth, m, axis="Y", bevel=0.05, verts=32):
    rot = {"X": (0, math.pi / 2, 0), "Y": (math.pi / 2, 0, 0), "Z": (0, 0, 0)}[axis]
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, vertices=verts, location=(x, y, z), rotation=rot)
    o = bpy.context.active_object; o.name = name
    return finish(o, m, bevel)

def sphere(name, x, y, z, r, m, sx=1, sy=1, sz=1):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=(x, y, z), segments=24, ring_count=16)
    o = bpy.context.active_object; o.name = name; o.scale = (sx, sy, sz)
    bpy.ops.object.transform_apply(scale=True)
    return finish(o, m)

def quad(name, v, uv, m):
    me = bpy.data.meshes.new(name); me.from_pydata(v, [], [(0, 1, 2, 3)]); me.update()
    me.uv_layers.new(name="UVMap")
    for loop, c in zip(me.polygons[0].loop_indices, uv): me.uv_layers["UVMap"].data[loop].uv = c
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o); me.materials.append(m)
    for p in me.polygons: p.use_smooth = False
    parts.append(o); return o

# ---------------------------------------------------------------- chassis, wheels
box("frame", -5.4, 7.5, -2.9, 2.9, 1.15, 2.2, STEEL_D, 0.08)
for x, nm in ((-3.7, "rear"), (4.9, "front")):
    for side in (-1, 1):
        y = side * 3.5
        cyl(f"tyre_{nm}_{side}", x, y, 1.5, 1.5, 1.05, RUBBER, "Y", 0.1)
        cyl(f"rim_{nm}_{side}", x, y + side * 0.5, 1.5, 0.92, 0.12, STEEL, "Y", 0.03)
        cyl(f"hub_{nm}_{side}", x, y + side * 0.58, 1.5, 0.26, 0.14, STEEL_D, "Y", 0.03, 16)
        for k in range(8):
            a = k * math.tau / 8
            cyl(f"nut_{nm}_{side}_{k}", x + 0.54 * math.cos(a), y + side * 0.58, 1.5 + 0.54 * math.sin(a), 0.06, 0.1, STEEL, "Y", 0.0, 8)
# fenders over the wheels
for x in (-3.7, 4.9):
    for side in (-1, 1):
        box(f"fender_{x}_{side}", x - 1.9, x + 1.9, side * 3.05 + (0.15 if side > 0 else -0.15) - 0.45, side * 3.05 + (0.15 if side > 0 else -0.15) + 0.45, 3.3, 3.55, PAINT_D, 0.1)

# ---------------------------------------------------------------- body: snow tank, hood, cab
box("tank", -5.6, 0.4, -3.3, 3.3, 2.2, 6.8, PAINT, 0.16)
box("tank_lid", -5.3, 0.1, -2.9, 2.9, 6.78, 7.0, PAINT_D, 0.1)
for i, x in enumerate((-4.6, -3.4, -2.2, -1.0)):
    box(f"lid_rib_{i}", x - 0.08, x + 0.08, -2.7, 2.7, 6.98, 7.08, STEEL_D, 0.03)
box("hatch", -5.62, -5.5, -2.0, 2.0, 5.0, 6.4, PAINT_D, 0.05)
box("hood", 2.4, 7.4, -3.1, 3.1, 2.2, 4.7, PAINT, 0.24)
box("hood_top", 2.9, 7.0, -2.6, 2.6, 4.68, 4.84, PAINT_D, 0.12)
box("bumper", 7.4, 7.8, -3.2, 3.2, 1.7, 2.6, STEEL_D, 0.1)
box("grille", 7.38, 7.46, -1.9, 1.9, 2.75, 4.0, PLASTIC, 0.04)
for i in range(7): box(f"slat_{i}", 7.45, 7.5, -1.8, 1.8, 2.9 + i * 0.15, 2.98 + i * 0.15, STEEL, 0.01)
for side in (-1, 1):
    box(f"headlamp_{side}", 7.36, 7.5, side * 2.3 - 0.45, side * 2.3 + 0.45, 3.5, 4.1, LAMP, 0.06)
    box(f"taillamp_{side}", -5.66, -5.58, side * 2.8 - 0.35, side * 2.8 + 0.35, 4.1, 4.7, TAIL, 0.04)
box("cab_floor", 0.4, 2.45, -3.0, 3.0, 2.2, 2.6, PAINT_D, 0.06)
box("dash", 2.3, 2.9, -2.4, 2.4, 2.6, 4.1, PAINT_D, 0.12)
box("dash_top", 2.15, 3.0, -1.2, 1.2, 4.1, 4.3, PLASTIC, 0.06)
# stripes (gold over red) along the body sides, just proud of the panels
for side in (-1, 1):
    box(f"stripe_gold_tank_{side}", -5.55, 0.35, side * 3.3 - 0.012 if side < 0 else 3.3, side * 3.3 + 0.012 if side > 0 else -3.3, 3.62, 4.02, GOLD, 0.0)
# (the two boxes above are thin slabs; the exporter keeps them as separate meshes)
for side in (-1, 1):
    y0, y1 = (3.28, 3.32) if side > 0 else (-3.32, -3.28)
    box(f"stripe_red_tank_{side}", -5.55, 0.35, y0, y1, 3.2, 3.55, RED, 0.0)
    y0, y1 = (3.08, 3.12) if side > 0 else (-3.12, -3.08)
    box(f"stripe_gold_hood_{side}", 2.45, 7.35, y0, y1, 3.62, 4.02, GOLD, 0.0)
    box(f"stripe_red_hood_{side}", 2.45, 7.35, y0, y1, 3.2, 3.55, RED, 0.0)

# ---------------------------------------------------------------- operator
box("seat_base", 0.55, 1.85, -1.3, 1.3, 2.6, 3.0, SEAT, 0.1)
box("seat_back", 0.42, 0.85, -1.25, 1.25, 3.0, 5.0, SEAT, 0.12)
box("torso", 0.85, 1.75, -0.85, 0.85, 3.0, 5.1, JACKET, 0.22)
sphere("head", 1.2, 0, 5.75, 0.46, SKIN, 0.95, 0.9, 1.05)
sphere("cap", 1.18, 0, 6.0, 0.5, CAP, 1.0, 1.0, 0.62)
box("cap_brim", 1.5, 1.95, -0.4, 0.4, 5.95, 6.02, CAP, 0.02)
for side in (-1, 1):
    cyl(f"arm_{side}", 1.95, side * 0.62, 4.55, 0.17, 1.9, JACKET, "X", 0.05, 12)
    box(f"leg_{side}", 1.0, 2.55, side * 0.62 - 0.28, side * 0.62 + 0.28, 3.0, 3.55, JACKET, 0.1)
cyl("column", 2.55, 0, 4.2, 0.1, 0.8, STEEL_D, "Z", 0.02, 12)
bpy.ops.mesh.primitive_torus_add(location=(2.7, 0, 4.7), major_radius=0.62, minor_radius=0.07, rotation=(0, math.radians(65), 0), major_segments=40, minor_segments=10)
tw = bpy.context.active_object; tw.name = "steering_wheel"; finish(tw, PLASTIC)

# ---------------------------------------------------------------- rear conditioner (the resurfacing unit) with its blade
box("cond_housing", -8.5, -5.7, -4.0, 4.0, 0.55, 2.8, STEEL, 0.14)
box("cond_cover", -8.3, -5.9, -3.8, 3.8, 2.8, 3.0, STEEL_D, 0.06)
box("blade", -8.62, -8.45, -4.0, 4.0, 0.12, 0.95, STEEL, 0.03)
box("blade_lip", -8.7, -8.62, -4.0, 4.0, 0.12, 0.3, STEEL_D, 0.02)
cyl("auger", -7.2, 0, 1.25, 0.5, 7.6, STEEL_D, "Y", 0.03, 24)
for side in (-1, 1):
    box(f"arm_hyd_{side}", -6.4, -5.6, side * 3.4 - 0.12, side * 3.4 + 0.12, 1.8, 2.5, STEEL_D, 0.04)
    cyl(f"hose_{side}", -5.9, side * 2.4, 1.9, 0.12, 2.2, HOSE, "Y", 0.02, 10)
    box(f"cond_skid_{side}", -8.4, -5.8, side * 4.0 - (0.12 if side > 0 else 0.0), side * 4.0 + (0 if side > 0 else 0.12), 0.45, 1.2, STEEL_D, 0.03)
# wash water bar and tow hitch
cyl("water_bar", -8.0, 0, 2.9, 0.1, 7.2, STEEL, "Y", 0.02, 10)
box("hitch", -5.9, -5.62, -0.6, 0.6, 1.4, 1.9, STEEL_D, 0.04)
# beacon, mirrors, rails
cyl("beacon_base", -3.0, 0, 7.1, 0.28, 0.2, PLASTIC, "Z", 0.02, 16)
cyl("beacon", -3.0, 0, 7.4, 0.24, 0.4, AMBER, "Z", 0.02, 16)
for side in (-1, 1):
    box(f"mirror_arm_{side}", 2.3, 2.4, side * 3.1, side * 3.7, 4.6, 4.7, STEEL_D, 0.02)
    box(f"mirror_{side}", 2.2, 2.5, side * 3.7 - 0.05, side * 3.7 + 0.05, 4.4, 5.1, PLASTIC, 0.03)
    cyl(f"rail_{side}", 0.4, side * 3.0, 3.5, 0.05, 2.1, STEEL, "X", 0.0, 8)

# ---------------------------------------------------------------- decals (KC Scouts logo and BRING HOCKEY TO KC): sharp textures, this vehicle only
x0, x1, z0, z1 = -5.45, -0.25, 4.38, 6.42
e = 0.016
quad("decal_side_R", [(x0, -3.3 - e, z0), (x1, -3.3 - e, z0), (x1, -3.3 - e, z1), (x0, -3.3 - e, z1)], [(0, 0), (1, 0), (1, 1), (0, 1)], DECAL_SIDE)
quad("decal_side_L", [(x1, 3.3 + e, z0), (x0, 3.3 + e, z0), (x0, 3.3 + e, z1), (x1, 3.3 + e, z1)], [(0, 0), (1, 0), (1, 1), (0, 1)], DECAL_SIDE)
quad("decal_rear", [(-5.62 - e, 2.6, 3.0), (-5.62 - e, -2.6, 3.0), (-5.62 - e, -2.6, 5.8), (-5.62 - e, 2.6, 5.8)], [(0, 0), (1, 0), (1, 1), (0, 1)], DECAL_REAR)

# ---------------------------------------------------------------- group into a few nodes the renderer can move: body, conditioner (lifts), four wheels (front ones steer)
def group_of(o):
    n = o.name
    for pre in ("tyre_", "rim_", "hub_", "nut_"):
        if n.startswith(pre):
            parts_ = n.split("_"); kind = parts_[1]; side = int(parts_[2])
            return f"wheel_{'F' if kind == 'front' else 'R'}{'L' if side > 0 else 'R'}"
    if n.startswith(("cond_", "blade", "auger", "arm_hyd", "hose_", "water_bar")): return "conditioner"
    return "body"
groups = {}
for o in parts: groups.setdefault(group_of(o), []).append(o)
pivots = {"conditioner": (-5.7, 0, 2.6), "body": (0, 0, 0), "wheel_FL": (4.9, 3.5, 1.5), "wheel_FR": (4.9, -3.5, 1.5), "wheel_RL": (-3.7, 3.5, 1.5), "wheel_RR": (-3.7, -3.5, 1.5)}
final = []
for name, objs in groups.items():
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    j = bpy.context.active_object; j.name = name
    scene.cursor.location = pivots[name]
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    final.append(j)
bpy.ops.object.select_all(action="DESELECT")
for o in final: o.select_set(True)
bpy.context.view_layer.objects.active = final[0]
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_apply=True, export_yup=True, export_image_format="AUTO", export_materials="EXPORT", export_cameras=False, export_lights=False)
print("exported", OUT, [o.name for o in final])

if PREVIEW:
    bpy.ops.object.select_all(action="DESELECT")
    world = bpy.data.worlds.new("w"); scene.world = world; world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.78, 0.85, 0.92, 1); world.node_tree.nodes["Background"].inputs[1].default_value = 1.0
    bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, 0)); fl = bpy.context.active_object
    fl.data.materials.append(mat("floor_ice", srgb("#dcebf5"), 0.0, 0.2))
    bpy.ops.object.light_add(type="SUN", rotation=(math.radians(50), math.radians(10), math.radians(-30))); bpy.context.active_object.data.energy = 3.0
    scene.render.engine = "CYCLES"; scene.cycles.samples = 48; scene.cycles.device = "CPU"
    scene.render.resolution_x, scene.render.resolution_y = 1400, 800
    scene.cycles.use_denoising = False
    for name, loc in (("front_right", (22, -18, 11)), ("rear_left", (-24, 17, 11)), ("side", (0, -30, 7))):
        bpy.ops.object.camera_add(location=loc)
        cam = bpy.context.active_object
        d = Vector((0, 0, 3.8)) - cam.location
        cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        cam.data.lens = 50
        scene.camera = cam
        scene.render.filepath = f"{PREVIEW}_{name}.png"
        bpy.ops.render.render(write_still=True)
