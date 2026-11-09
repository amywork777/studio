# /// script
# dependencies = ["cad[build123d]"]
# ///
"""Facts from the cut file for the SendCutSend preflight: measurements only, no pass or fail."""
import sys
import numpy as np
import ezdxf
from ezdxf import bbox
from cad.engine.export.dxf import validate_dxf_file

path = "cut/shelf_bracket_cut.dxf"
doc = ezdxf.readfile(path); msp = doc.modelspace()
print("version", doc.dxfversion, "INSUNITS", doc.header.get("$INSUNITS"))
ext = bbox.extents(msp); print("extents", ext.extmin, ext.extmax, "size", ext.size)
for l in doc.layers: print("layer", l.dxf.name, "linetype", l.dxf.linetype, "colour", l.dxf.color, "on", l.is_on(), "frozen", l.is_frozen(), "plot", l.dxf.plot)
print("linetypes", [lt.dxf.name for lt in doc.linetypes])
from collections import Counter
print(Counter((e.dxftype(), e.dxf.layer, e.dxf.linetype if e.dxf.hasattr("linetype") else "BYLAYER") for e in msp))
print("findings", [f.render() for f in validate_dxf_file(path)])

# Cut geometry as dense points; interior contours apart from the outline.
def pts(e):
    return np.array([(v.x, v.y) for v in e.flattening(0.005)]) if e.dxftype() != "LINE" else np.array(
        [(e.dxf.start.x + t * (e.dxf.end.x - e.dxf.start.x), e.dxf.start.y + t * (e.dxf.end.y - e.dxf.start.y)) for t in np.linspace(0, 1, 20000)])
outline = np.vstack([pts(e) for e in msp.query('*[layer=="CUT"]') if e.dxftype() != "CIRCLE"])
circles = [(np.array([e.dxf.center.x, e.dxf.center.y]), e.dxf.radius) for e in msp.query('CIRCLE[layer=="CUT"]')]
print("holes", [(c.round(3).tolist(), round(2 * r, 3)) for c, r in circles])
bends = [(np.array([e.dxf.start.x, e.dxf.start.y]), np.array([e.dxf.end.x, e.dxf.end.y])) for e in msp.query('LINE[layer=="BEND"]')]
for a, b in bends:
    d = b - a; L = np.linalg.norm(d); u = d / L; n = np.array([-u[1], u[0]])
    print(f"bend from {a.round(3)} to {b.round(3)}, length {L:.3f}")
    # where the bend line meets the outline
    rel = outline - a; along = rel @ u; across = rel @ n
    touch = np.abs(across) < 0.01
    print("  meets outline at along =", np.unique(along[touch].round(2))[[0, -1]] if touch.any() else None)
    # local flange depth each side, sampled every 0.1 mm: nearest outline point straight across, both sides
    mins = {}
    for side in (1, -1):
        depths = []
        for s in np.arange(0.5, L - 0.45, 0.1):
            m = (np.abs(along - s) < 0.06) & (side * across > 0.3)
            depths.append((side * across[m]).min() if m.any() else np.nan)
        depths = np.array(depths); mins[side] = (np.nanmin(depths), np.nanmax(depths), np.isnan(depths).sum())
        print(f"  side {'+' if side > 0 else '-'}: flange depth min {mins[side][0]:.3f} max {mins[side][1]:.3f} (samples with no edge: {mins[side][2]})")
        q = np.percentile(depths, [5, 50]); print("    5th/50th percentile", q.round(3))
    for c, r in circles:
        rc = c - a; print(f"  hole {c.round(2)} d{2*r:.2f}: centre {abs(rc @ n):.3f} from bend line, edge {abs(rc @ n) - r:.3f}; along {rc @ u:.2f}")
    # outline points off the bend's span (the relief) and their distance to the bend line
    off = (along < -0.01) | (along > L + 0.01)
    near = outline[off & (np.abs(across) < 8)]
    if len(near): print("  outline beyond the bend's ends, nearest to its line:", np.abs((near - a) @ n).min().round(3))
# webs: hole to outline, hole to hole
for c, r in circles:
    print("hole", c.round(2), "edge to outline", (np.linalg.norm(outline - c, axis=1).min() - r).round(3))
for i in range(len(circles)):
    for j in range(i + 1, len(circles)):
        (c1, r1), (c2, r2) = circles[i], circles[j]
        print("hole to hole", (np.linalg.norm(c1 - c2) - r1 - r2).round(3))
