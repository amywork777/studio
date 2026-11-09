"""Read a strength study's result.glb: positions, displacement and von Mises per vertex; report the stress away from points."""
import json, struct, sys
import numpy as np

def load(path):
    b = open(path, "rb").read()
    _, _, length = struct.unpack_from("<III", b, 0)
    off = 12; js = None; binc = None
    while off < length:
        clen, ctype = struct.unpack_from("<II", b, off); off += 8
        chunk = b[off:off+clen]; off += clen
        if ctype == 0x4E4F534A: js = json.loads(chunk)
        else: binc = chunk
    def acc(i):
        a = js["accessors"][i]; bv = js["bufferViews"][a["bufferView"]]
        n = {"SCALAR":1,"VEC2":2,"VEC3":3,"VEC4":4}[a["type"]]
        dt = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8, 5120: np.int8, 5122: np.int16}[a["componentType"]]
        start = bv.get("byteOffset",0) + a.get("byteOffset",0)
        arr = np.frombuffer(binc, dtype=dt, count=a["count"]*n, offset=start)
        return arr.reshape(a["count"], n) if n > 1 else arr
    out = []
    for m in js["meshes"]:
        for p in m["primitives"]:
            at = p["attributes"]
            out.append({k: acc(v) for k, v in at.items()})
    return js, out

if __name__ == "__main__":
    js, prims = load(sys.argv[1])
    for p in prims: print({k: v.shape for k, v in p.items()})
    print(json.dumps(js.get("extras", {}))[:300])
