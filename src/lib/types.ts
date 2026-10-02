export type BomRow = { t: string; qty: number | null; um: string; desc: string; pn: string };
export type RevNote = { iss: string; text: string; date: string };
export type FileRef = { path: string; size?: number; mtime?: string };

export type Part = {
  key: string; number: string; title: string; customer: string; site: string; project: string;
  latestRev: string; parentKey: string;
  files: { pdf: FileRef[]; dwg: FileRef[]; dxf: FileRef[]; cad: FileRef[]; folders: string[] };
  aliases: { cal: string; ref: string; desc: string; qty: number; task?: string; job?: string; date?: string }[];
  revLog: { at: string; from: string; to: string; file: string }[];
};

/** A drawing fingerprint as the engine produces it, plus library fields. */
export type Drawing = {
  id: string; key: string; partNo: string; rev: string; fileRev: string; title: string;
  customer: string; site: string; project: string; discrete: string; date: string;
  bom: BomRow[]; dims: number[]; holes: { n: number; d: number }[]; revisions: RevNote[];
  sheets: number; textless: boolean; readBy: string; numberMismatch: string;
  file: string; paths: string[]; storagePath: string; addedAt: string;
};

export type Line = { id?: number; n: number; product: string; key: string; desc: string; rev: string; qty: number | null; rate: number | null; amount: number | null };
export type Estimate = {
  no: string; date: string; po: string; rep: string; total: number | null; tax: number | null; subtotal: number | null;
  reconciled: boolean; src: { file?: string; page?: number; path?: string }; storagePath: string;
  versions: { file?: string; page?: number; lines?: number; total?: number; replacedAt?: string }[];
  lines: Line[];
};
/** An estimate line with its estimate's header fields. */
export type PriceLine = Line & { no: string; date: string; po: string; storagePath: string; page?: number; via?: string };

export type OrderLine = {
  part: string; key: string; desc: string; qty: number | null; orderDate: string; shopDate: string; due: string;
  estimate: string; line: string; eng: string; notes: string; row: number | null; id?: number; price?: number | null;
};
export type PoPdfLine = { item: number; ref: string; due: string; qty: number | null; unit: string; price: number | null; ext: number | null; desc: string; quote: string; job: string; task: string; part: string; revNo: string; key?: string };
export type Order = {
  po: string; firstDate: string; source: string; estimates: string[];
  pdf: null | { rev: string; date: string; buyer: string; total: number | null; file: string; storagePath?: string; lines: PoPdfLine[] };
  pdfHistory: unknown[]; lines: OrderLine[];
};

export type Design = { id: string; name: string; status: 'suggested' | 'confirmed'; note: string; members: string[] };
export type Cut = { part: string; len: number; count: number; label?: string };
export type ReqItem = {
  cat: string; desc: string; pn: string; uom: string; perUnit?: number | null; qty: number | null; received?: number | null; byPart?: Record<string, number | null>; for?: string;
  // sheets: nVent's suggestion and your pick
  nvDesc?: string; nvPn?: string; nvSize?: string; sf?: number | null; spec?: string; size?: string;
  // bar stock: cut list and stick plan ('best' | '144' | '192')
  cuts?: Cut[]; plan?: string;
};
export type MatRequest = {
  id: string; title: string; job: string; date: string; neededBy: string; status: string;
  parts: { part: string; key: string; qty: number }[]; items: ReqItem[]; note: string; source: string;
};
export type Upload = { id: number; kind: string; name: string; detail: string; at: string; by: string };
export type Section = 'compartments' | 'rfqs' | 'material' | 'progress' | 'engineering' | 'packing';
export const SECTIONS: [Section, string][] = [['compartments', 'Catalog'], ['rfqs', 'RFQs'], ['material', 'Material requests'], ['progress', 'In progress'], ['engineering', 'Engineering'], ['packing', 'Packing slips']];
/** null = full access. The database enforces prices and access; sections are what shows on screen. */
export type Perms = { sections?: Section[]; prices?: boolean; access?: 'edit' | 'status' | 'view' };
export type Member = { email: string; role: 'owner' | 'member'; name: string | null; perms?: Perms | null; engineer?: boolean; manager?: boolean; username?: string; mustChange?: boolean };
