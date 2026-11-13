/**
 * Shapes are SolidCraft's own (`inspect_design {"sketches": true}`): a dimension names its
 * parameter (`d1`) and what it measures by index, a curve (`l`, `c`), two points (`p`, `q`) or two
 * lines (`a`, `b`). Output is in world coordinates, offset off the sketch as a drawing places them.
 */

export type Vec2 = readonly [number, number];
export type Vec3 = readonly [number, number, number];

export interface SketchPlane {
  readonly origin: Vec3;
  readonly x_dir: Vec3;
  readonly y_dir: Vec3;
}

export interface SketchPoint {
  readonly id: string;
  readonly at: Vec2;
  readonly world?: Vec3;
}

export interface SketchCurve {
  readonly id: string;
  readonly type: string;
  readonly construction?: boolean;
  readonly start_at?: Vec2;
  readonly end_at?: Vec2;
  readonly center_at?: Vec2;
  readonly radius?: number;
}

export interface SketchConstraint {
  readonly id: string;
  readonly type: string;
  readonly param?: string;
  readonly expression?: string;
  readonly value?: number;
  readonly l?: number;
  readonly c?: number;
  readonly p?: number;
  readonly q?: number;
  readonly a?: number;
  readonly b?: number;
}

export interface Sketch {
  readonly id: number;
  readonly name: string;
  readonly plane: SketchPlane;
  readonly points: ReadonlyArray<SketchPoint>;
  readonly curves: ReadonlyArray<SketchCurve>;
  readonly constraints: ReadonlyArray<SketchConstraint>;
}

export interface ModelDimension {
  /** The parameter it drives: `parameters.change {name}` changes it. */
  readonly param: string;
  readonly expression: string;
  /** The value in mm, or in degrees for an angle. */
  readonly value: number;
  readonly kind: string;
  readonly sketch: string;
  /** What the label says: "75", "Ø10", "R4", "45°". */
  readonly label: string;
  readonly anchor: Vec3;
  readonly lines: ReadonlyArray<readonly [Vec3, Vec3]>;
}

const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const scale = (a: Vec2, s: number): Vec2 => [a[0] * s, a[1] * s];
const dot = (a: Vec2, b: Vec2) => a[0] * b[0] + a[1] * b[1];
const length = (a: Vec2) => Math.hypot(a[0], a[1]);
const unit = (a: Vec2): Vec2 => {
  const l = length(a);
  return l === 0 ? [1, 0] : [a[0] / l, a[1] / l];
};
const mid = (a: Vec2, b: Vec2): Vec2 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

/** A sketch point in the world: the plane's origin plus its axes. */
export function toWorld(plane: SketchPlane, at: Vec2): Vec3 {
  const { origin: o, x_dir: x, y_dir: y } = plane;
  return [
    o[0] + at[0] * x[0] + at[1] * y[0],
    o[1] + at[0] * x[1] + at[1] * y[1],
    o[2] + at[0] * x[2] + at[1] * y[2],
  ];
}

/** A length as a drawing writes it: whole millimetres plainly, else to two places. */
export function formatLength(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0$/, "");
}

/** The sketch's own geometry, for its size and middle: every point and curve end. */
function extent(sketch: Sketch): { readonly centre: Vec2; readonly size: number } {
  const xs: number[] = [];
  const ys: number[] = [];
  const take = (at: Vec2 | undefined) => {
    if (at === undefined) return;
    xs.push(at[0]);
    ys.push(at[1]);
  };
  for (const point of sketch.points) if (point.id !== "origin") take(point.at);
  for (const curve of sketch.curves) {
    take(curve.start_at);
    take(curve.end_at);
    if (curve.center_at !== undefined && curve.radius !== undefined) {
      take([curve.center_at[0] - curve.radius, curve.center_at[1] - curve.radius]);
      take([curve.center_at[0] + curve.radius, curve.center_at[1] + curve.radius]);
    }
  }
  if (xs.length === 0) return { centre: [0, 0], size: 10 };
  const [minX, maxX, minY, maxY] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  return {
    centre: [(minX + maxX) / 2, (minY + maxY) / 2],
    size: Math.max(maxX - minX, maxY - minY, 1),
  };
}

/** The side of a segment facing away from the sketch's middle, so a dimension sits outside it. */
function outward(a: Vec2, b: Vec2, centre: Vec2): Vec2 {
  const along = unit(sub(b, a));
  const normal: Vec2 = [-along[1], along[0]];
  return dot(normal, sub(mid(a, b), centre)) < 0 ? scale(normal, -1) : normal;
}

/** A dimension between two points along a direction (`along` null: the points' own line). */
function linear(
  a: Vec2,
  b: Vec2,
  along: Vec2 | null,
  centre: Vec2,
  offset: number,
): { readonly anchor: Vec2; readonly lines: Array<readonly [Vec2, Vec2]> } {
  if (along === null) {
    const n = outward(a, b, centre);
    const [da, db] = [add(a, scale(n, offset)), add(b, scale(n, offset))];
    return {
      anchor: mid(da, db),
      lines: [
        [a, add(a, scale(n, offset * 1.15))],
        [b, add(b, scale(n, offset * 1.15))],
        [da, db],
      ],
    };
  }
  // Measured along an axis: the dimension line runs along it, beyond both points.
  const n: Vec2 = [-along[1], along[0]];
  const level = Math.max(dot(a, n), dot(b, n), dot(centre, n)) + offset;
  const place = (p: Vec2): Vec2 => add(p, scale(n, level - dot(p, n)));
  const [da, db] = [place(a), place(b)];
  return {
    anchor: mid(da, db),
    lines: [
      [a, da],
      [b, db],
      [da, db],
    ],
  };
}

/** Where two lines meet, or the first line's start when they are parallel. */
function meet(a0: Vec2, a1: Vec2, b0: Vec2, b1: Vec2): Vec2 {
  const r = sub(a1, a0);
  const s = sub(b1, b0);
  const denominator = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(denominator) < 1e-9) return a0;
  const t = ((b0[0] - a0[0]) * s[1] - (b0[1] - a0[1]) * s[0]) / denominator;
  return add(a0, scale(r, t));
}

/** The sketch's driving dimensions, ready to draw. Construction-only helpers and reference values are left out. */
export function sketchDimensions(sketch: Sketch): ModelDimension[] {
  const { centre, size } = extent(sketch);
  const offset = Math.max(size * 0.12, 3);
  const point = (index: number | undefined) =>
    index === undefined ? undefined : sketch.points[index]?.at;
  const curve = (index: number | undefined) =>
    index === undefined ? undefined : sketch.curves[index];
  const dimensions: ModelDimension[] = [];

  for (const constraint of sketch.constraints) {
    if (constraint.param === undefined || constraint.value === undefined) continue;
    const base = {
      param: constraint.param,
      expression: constraint.expression ?? formatLength(constraint.value),
      kind: constraint.type,
      sketch: sketch.name,
    };
    let placed: {
      anchor: Vec2;
      lines: ReadonlyArray<readonly [Vec2, Vec2]>;
      label: string;
      value: number;
    } | null = null;
    const value = constraint.value;

    if (constraint.type === "length") {
      const line = curve(constraint.l);
      if (line?.start_at !== undefined && line.end_at !== undefined) {
        placed = {
          ...linear(line.start_at, line.end_at, null, centre, offset),
          label: formatLength(value),
          value,
        };
      }
    } else if (
      constraint.type === "distance" ||
      constraint.type === "distance_x" ||
      constraint.type === "distance_y"
    ) {
      const [a, b] = [point(constraint.p), point(constraint.q)];
      if (a !== undefined && b !== undefined) {
        const along: Vec2 | null =
          constraint.type === "distance_x"
            ? [1, 0]
            : constraint.type === "distance_y"
              ? [0, 1]
              : null;
        placed = { ...linear(a, b, along, centre, offset), label: formatLength(value), value };
      }
    } else if (constraint.type === "diameter" || constraint.type === "radius") {
      const circle = curve(constraint.c);
      if (circle?.center_at !== undefined && circle.radius !== undefined) {
        const c = circle.center_at;
        const u = unit(outward(c, add(c, [1, -1]), centre));
        const rim = add(c, scale(u, circle.radius));
        const beyond = add(c, scale(u, circle.radius + offset));
        const diameter = constraint.type === "diameter";
        placed = {
          anchor: beyond,
          lines: [
            [diameter ? sub(c, scale(u, circle.radius)) : c, rim],
            [rim, beyond],
          ],
          label: `${diameter ? "Ø" : "R"}${formatLength(value)}`,
          value,
        };
      }
    } else if (constraint.type === "angle") {
      const [la, lb] = [curve(constraint.a), curve(constraint.b)];
      if (
        la?.start_at !== undefined &&
        la.end_at !== undefined &&
        lb?.start_at !== undefined &&
        lb.end_at !== undefined
      ) {
        const vertex = meet(la.start_at, la.end_at, lb.start_at, lb.end_at);
        const far = (line: SketchCurve): Vec2 =>
          length(sub(line.end_at!, vertex)) >= length(sub(line.start_at!, vertex))
            ? unit(sub(line.end_at!, vertex))
            : unit(sub(line.start_at!, vertex));
        const [ua, ub] = [far(la), far(lb)];
        const radius = offset * 1.6;
        const start = Math.atan2(ua[1], ua[0]);
        let sweep = Math.atan2(ub[1], ub[0]) - start;
        if (sweep > Math.PI) sweep -= 2 * Math.PI;
        if (sweep < -Math.PI) sweep += 2 * Math.PI;
        const arc: Array<readonly [Vec2, Vec2]> = [];
        const steps = 12;
        for (let i = 0; i < steps; i += 1) {
          const at = (k: number) =>
            add(vertex, [
              Math.cos(start + (sweep * k) / steps) * radius,
              Math.sin(start + (sweep * k) / steps) * radius,
            ] as Vec2);
          arc.push([at(i), at(i + 1)]);
        }
        const bisector = start + sweep / 2;
        const degrees = (value * 180) / Math.PI;
        placed = {
          anchor: add(vertex, [
            Math.cos(bisector) * radius * 1.35,
            Math.sin(bisector) * radius * 1.35,
          ] as Vec2),
          lines: arc,
          label: `${formatLength(degrees)}°`,
          value: degrees,
        };
      }
    }

    // A dimension of a kind not drawn here still shows, at the sketch's middle, so it can be changed.
    const shown = placed ?? {
      anchor: centre,
      lines: [],
      label: formatLength(value),
      value,
    };
    dimensions.push({
      ...base,
      value: shown.value,
      label: shown.label,
      anchor: toWorld(sketch.plane, shown.anchor),
      lines: shown.lines.map(
        ([a, b]) => [toWorld(sketch.plane, a), toWorld(sketch.plane, b)] as const,
      ),
    });
  }
  return dimensions;
}
