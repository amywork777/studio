"""Facts from the bracket's exported STEP, the file SendCutSend is sent: its solid, volume, bounds and cylinders.
Run from the project root after `cad run exports.py`."""
from cad import step
p = step.read("parts/shelf_bracket.step")
solids = p.solids()
print("solids", len(solids), "valid", p.is_valid, "volume mm3", round(p.volume, 1))
bb = p.bounding_box(); print("bbox", [round(v,3) for v in (bb.min.X,bb.min.Y,bb.min.Z,bb.max.X,bb.max.Y,bb.max.Z)])
print("mass g at 7.849e-3 g/mm3", round(p.volume*7.849e-3,1))
from collections import Counter
print(Counter(f.geom_type for f in p.faces()))
for f in p.faces():
    if f.geom_type.name == "CYLINDER" if hasattr(f.geom_type,'name') else f.geom_type=="CYLINDER":
        pass
for f in p.faces():
    gt = str(f.geom_type)
    if "CYLINDER" in gt:
        r = f.radius if hasattr(f,'radius') else None
        c = f.center()
        print("cyl r=%.4f center=(%.2f,%.2f,%.2f) area=%.2f" % (r, c.X, c.Y, c.Z, f.area))
