"""Stress and movement read off the strength study's GLB: near the wall holes, at the corner relief, along the brace, at the tip.
Run from the project root: cad run checks/shelf_bracket_fea_probe.py studies/shelf_bracket/result.glb studies/shelf_bracket/result.json "[[14,-25],[14,-125]]"."""
import sys, json
import numpy as np
sys.path.insert(0, __import__("os").path.dirname(__file__))
from fea_glb import load
glb, sidecar = sys.argv[1], sys.argv[2]
js, prims = load(glb)
sc = json.load(open(sidecar))
scale = sc["measurements"]["deformation_scale"]
p = prims[0]
g = p["POSITION"].astype(float) - scale * p["_DISPLACEMENT"].astype(float)
pos = np.c_[g[:, 0], -g[:, 2], g[:, 1]] * 1000.0
gd = p["_DISPLACEMENT"].astype(float)
disp = np.c_[gd[:, 0], -gd[:, 2], gd[:, 1]] * 1000.0
vm = p["_VON_MISES"].astype(float)
print("nodes", js.get("nodes"))
print("max vm", vm.max(), "at", pos[vm.argmax()].round(2))
holes = [np.array(h) for h in json.loads(sys.argv[3])]  # hole centres on the wall face plane: (x, z)
def dist_to_holes(q):
    return np.min([np.hypot(q[:, 0] - h[0], q[:, 2] - h[1]) for h in holes], axis=0)
d = dist_to_holes(pos)
onflange = pos[:, 1] < 2.0  # back flange: y in [0, T]
for lo, hi in [(2.7, 3.5), (3.5, 4.5), (4.5, 6), (6, 8), (8, 12)]:
    m = onflange & (d >= lo) & (d < hi)
    if m.any():
        i = np.argmax(np.where(m, vm, -1)); print(f"wall flange, {lo}-{hi} mm from a hole axis: max {vm[i]:.1f} MPa at {pos[i].round(2)}")
far = d > 12
i = np.argmax(np.where(far, vm, -1)); print(f"more than 12 mm from both wall holes: max {vm[i]:.1f} MPa at {pos[i].round(2)}")
tip = pos[:, 1] > 179.9
print("tip face max |disp|", np.linalg.norm(disp[tip], axis=1).max().round(4), "Z at tip min", disp[tip][:, 2].min().round(4))
# the brace (inclined free edge of the web) and the shelf bend
br = np.abs((pos[:, 1] - 180) * (-120) - (pos[:, 2] + 30) * (-150)) / np.hypot(150, 120) < 1.0
br &= (pos[:, 1] > 40) & (pos[:, 1] < 170)
i = np.argmax(np.where(br, vm, -1)); print(f"along the brace edge: max {vm[i]:.1f} MPa at {pos[i].round(2)}")
sb = (pos[:, 2] > -4) & (pos[:, 1] > 8) & (pos[:, 0] < 4)
i = np.argmax(np.where(sb, vm, -1)); print(f"shelf bend, past the relief: max {vm[i]:.1f} MPa at {pos[i].round(2)}")
rel = (np.abs(pos[:, 1] - 6) < 2.5) & (np.abs(pos[:, 2] + 6) < 2.5)  # the corner relief round, centred (Y 6, Z -6)
i = np.argmax(np.where(rel, vm, -1)); print(f"corner relief: max {vm[i]:.1f} MPa at {pos[i].round(2)}")
tip = pos[:, 1] > 179.9
print("tip: max |disp|", np.linalg.norm(disp[tip], axis=1).max().round(3), "max down", (-disp[tip][:, 2]).max().round(3), "max sideways X", np.abs(disp[tip][:, 0]).max().round(3))
