// DXF -> PDF, done in the browser when a kit zip is uploaded, so a drawing that
// arrives as a .dxf can be viewed, zoomed and pinned in the Prints tab exactly
// like the PDF drawings. The result is a vector PDF (lines, arcs, circles,
// splines, polylines, block inserts, text) sized to the drawing's own aspect
// ratio — zooming stays sharp. Nothing is sent anywhere; it all runs here.
//
// Honest limits: hatches/fills are drawn as outlines, line weights are uniform
// thin lines, dimension/leader styles come out as plain lines and text, and
// fonts are the PDF standard Helvetica. 3D drawings are flattened to their
// top view; a spline stored only as fit points (no control points) is skipped.
// Binary DXF and DWG files aren't supported (they raise an error the
// upload dialog reports; the original file is still kept for download).

import { jsPDF } from "jspdf";

const LONG_SIDE_PT = 1224; // 17 in
const MARGIN_PT = 24;
const MAX_POLYLINES = 600000;

async function loadDxfLib() {
  const mod = await import("dxf");
  const root = mod.default && !mod.Helper ? mod.default : mod;
  const getRGB = (await import("dxf/lib/getRGBForEntity.js")).default;
  const applyTransforms = (await import("dxf/lib/applyTransforms.js")).default;
  return {
    Helper: root.Helper ?? mod.Helper,
    getRGB: getRGB?.default ?? getRGB,
    applyTransforms: applyTransforms?.default ?? applyTransforms,
  };
}

// Plain-text version of an MTEXT/TEXT string: formatting codes removed,
// AutoCAD %% symbols turned into the real characters, line breaks kept.
export function cleanDxfText(raw) {
  let s = String(raw ?? "");
  s = s.replace(/\\P/gi, "\n").replace(/\\~/g, " ").replace(/\^J/g, "\n");
  s = s.replace(/\\[fFHhCcQqWwTtAaLlOoKk][^;]*;/g, "");
  s = s.replace(/\\[LlOoKk]/g, "");
  s = s.replace(/\\S([^;^/#]*)[/^#]([^;]*);/g, "$1/$2");
  s = s.replace(/[{}]/g, "").replace(/\\\\/g, "\\");
  s = s.replace(/%%[cC]/g, "Ø").replace(/%%[dD]/g, "°").replace(/%%[pP]/g, "±").replace(/%%[uUoO]/g, "");
  // The PDF standard fonts only cover Latin-1; anything else becomes "?".
  s = s.replace(/[^\n\x20-\x7E -ÿ]/g, "?");
  return s.trim();
}

// A drawing colour that is readable on white paper: AutoCAD's "white" (colour
// 7, drawn black on a white sheet) becomes black, pale colours are darkened.
export function paperColor(rgb) {
  const [r, g, b] = rgb ?? [0, 0, 0];
  if (r > 240 && g > 240 && b > 240) return [0, 0, 0];
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (lum > 0.7) {
    const f = 0.55 / lum;
    return [Math.round(r * f), Math.round(g * f), Math.round(b * f)];
  }
  return [r, g, b];
}

function layerVisible(layer) {
  if (!layer) return true;
  if (typeof layer.colorNumber === "number" && layer.colorNumber < 0) return false; // layer turned off
  if (layer.flags && layer.flags & 1) return false; // frozen
  if (layer.plot === false) return false; // set not to plot
  return true;
}

function transformsInfo(transforms = []) {
  let rotation = 0;
  let scaleY = 1;
  transforms.forEach((t) => {
    if (t.rotation) rotation += t.rotation;
    if (t.scaleY) scaleY *= Math.abs(t.scaleY);
  });
  return { rotation, scaleY };
}

// Returns {blob, stats}. Throws an Error with a plain-language message if the
// file can't be read or has nothing drawable in it.
export async function dxfToPdf(dxfText, { title = "" } = {}) {
  if (typeof dxfText !== "string" || !/\bSECTION\b/.test(dxfText.slice(0, 4000))) {
    throw new Error("this doesn't look like a text DXF file (binary DXF and DWG aren't supported)");
  }
  const { Helper, getRGB, applyTransforms } = await loadDxfLib();

  let helper;
  try {
    helper = new Helper(dxfText);
  } catch {
    throw new Error("the DXF file couldn't be read");
  }
  const layers = helper.parsed?.tables?.layers ?? {};

  let polys;
  try {
    polys = helper.toPolylines().polylines;
  } catch {
    throw new Error("the DXF drawing couldn't be converted");
  }
  polys = polys.filter((p) => p.vertices?.length >= 2 && layerVisible(p.layer));
  if (polys.length > MAX_POLYLINES) throw new Error("the drawing is too large to convert in the browser");

  // Text, with block-insert transforms applied.
  const texts = [];
  helper.denormalised.forEach((e) => {
    if ((e.type !== "TEXT" && e.type !== "MTEXT") || !layerVisible(layers[e.layer])) return;
    const str = cleanDxfText(e.string);
    if (!str) return;
    const { rotation: tRot, scaleY } = transformsInfo(e.transforms);
    const height = (e.type === "MTEXT" ? e.nominalTextHeight : e.textHeight) || 0;
    if (!(height > 0)) return;
    const justified = e.type === "TEXT" && (e.hAlign || e.vAlign) && e.x2 !== undefined;
    const ax = justified ? e.x2 : e.x;
    const ay = justified ? e.y2 : e.y;
    const [x, y] = applyTransforms([[ax, ay]], e.transforms ?? [])[0];
    let rot = e.rotation || 0;
    if (e.type === "MTEXT" && e.xAxisX !== undefined) rot = (Math.atan2(e.xAxisY ?? 0, e.xAxisX) * 180) / Math.PI;
    let rgb = [0, 0, 0];
    try {
      rgb = paperColor(getRGB(layers, e));
    } catch {
      /* keep black */
    }
    texts.push({ str, x, y, h: height * scaleY, rot: rot + tRot, e, rgb });
  });

  // Filled solids (arrowheads, filled boxes): drawn as filled polygons.
  const solids = [];
  helper.denormalised.forEach((e) => {
    if ((e.type !== "SOLID" && e.type !== "TRACE") || !e.corners || e.corners.length < 3 || !layerVisible(layers[e.layer])) return;
    // DXF stores the 4th corner before the 3rd.
    const order = e.corners.length >= 4 ? [0, 1, 3, 2] : [0, 1, 2];
    const pts = applyTransforms(order.map((i) => [e.corners[i].x, e.corners[i].y]), e.transforms ?? []);
    let rgb = [0, 0, 0];
    try {
      rgb = paperColor(getRGB(layers, e));
    } catch {
      /* keep black */
    }
    solids.push({ pts, rgb });
  });

  if (!polys.length && !texts.length && !solids.length) throw new Error("the drawing has no visible lines or text");

  // Extents ("zoom to fit") over everything that will be drawn.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const grow = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  polys.forEach((p) => p.vertices.forEach((v) => grow(v[0], v[1])));
  solids.forEach((sd) => sd.pts.forEach((v) => grow(v[0], v[1])));
  texts.forEach((t) => {
    grow(t.x, t.y);
    const w = t.str.split("\n").reduce((m, l) => Math.max(m, l.length), 0) * t.h * 0.6;
    const rad = (t.rot * Math.PI) / 180;
    grow(t.x + w * Math.cos(rad), t.y + w * Math.sin(rad));
  });
  if (!Number.isFinite(minX)) throw new Error("the drawing has no usable coordinates");
  const w = Math.max(maxX - minX, 1e-6);
  const h = Math.max(maxY - minY, 1e-6);

  const scale = (LONG_SIDE_PT - 2 * MARGIN_PT) / Math.max(w, h);
  let pageW = w * scale + 2 * MARGIN_PT;
  let pageH = h * scale + 2 * MARGIN_PT;
  // Keep very thin drawings (a single long line) a sensible shape.
  if (pageH < 144) pageH = 144;
  if (pageW < 144) pageW = 144;
  const orientation = pageW >= pageH ? "landscape" : "portrait";
  const doc = new jsPDF({ unit: "pt", format: [pageW, pageH], orientation, compress: true });
  if (title) doc.setProperties({ title });

  const X = (x) => MARGIN_PT + (x - minX) * scale;
  const Y = (y) => pageH - MARGIN_PT - (y - minY) * scale;

  doc.setLineWidth(0.6);
  doc.setLineCap("round");
  doc.setLineJoin("round");
  // Group by colour so the PDF isn't switching colour for every segment.
  const byColor = new Map();
  polys.forEach((p) => {
    const c = paperColor(p.rgb);
    const key = c.join(",");
    if (!byColor.has(key)) byColor.set(key, { c, list: [] });
    byColor.get(key).list.push(p);
  });
  byColor.forEach(({ c, list }) => {
    doc.setDrawColor(c[0], c[1], c[2]);
    list.forEach((p) => {
      const v = p.vertices;
      const rel = [];
      for (let i = 1; i < v.length; i++) rel.push([(v[i][0] - v[i - 1][0]) * scale, -(v[i][1] - v[i - 1][1]) * scale]);
      doc.lines(rel, X(v[0][0]), Y(v[0][1]), [1, 1], "S", false);
    });
  });

  solids.forEach((sd) => {
    const v = sd.pts;
    doc.setFillColor(sd.rgb[0], sd.rgb[1], sd.rgb[2]);
    const rel = [];
    for (let i = 1; i < v.length; i++) rel.push([(v[i][0] - v[i - 1][0]) * scale, -(v[i][1] - v[i - 1][1]) * scale]);
    doc.lines(rel, X(v[0][0]), Y(v[0][1]), [1, 1], "F", true);
  });

  doc.setFont("helvetica", "normal");
  texts.forEach((t) => {
    const size = Math.max(1, t.h * scale);
    if (size < 0.8) return; // too small to ever be legible
    doc.setFontSize(size);
    doc.setTextColor(t.rgb[0], t.rgb[1], t.rgb[2]);
    let align = "left";
    let baseline = "alphabetic";
    if (t.e.type === "MTEXT") {
      const ap = t.e.attachmentPoint || 1;
      align = [2, 5, 8].includes(ap) ? "center" : [3, 6, 9].includes(ap) ? "right" : "left";
      baseline = ap <= 3 ? "top" : ap <= 6 ? "middle" : "bottom";
    } else {
      align = t.e.hAlign === 1 || t.e.hAlign === 4 ? "center" : t.e.hAlign === 2 ? "right" : "left";
      baseline = t.e.vAlign === 3 ? "top" : t.e.vAlign === 2 || t.e.hAlign === 4 ? "middle" : t.e.vAlign === 1 ? "bottom" : "alphabetic";
    }
    try {
      doc.text(t.str, X(t.x), Y(t.y), { angle: t.rot || 0, align, baseline });
    } catch {
      /* a glyph the font can't draw — skip this label, keep the rest */
    }
  });

  return {
    blob: doc.output("blob"),
    stats: { lines: polys.length, labels: texts.length, solids: solids.length, widthPt: Math.round(pageW), heightPt: Math.round(pageH) },
  };
}
