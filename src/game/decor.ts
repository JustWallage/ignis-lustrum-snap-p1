import type { JuryDecor } from "@shared/juries";
import { MAP_H, MAP_W, type Point } from "@shared/map";
import type { Ramp } from "@/game/palette";
import { blit, type Rows } from "@/game/pixels";
import { TILE, TREE_ROWS } from "@/game/tiles";

export interface DecorPiece {
  rows: Rows;
  /** Frame 1's drawing, for the few things that move. */
  alt?: Rows;
  ramp: Ramp;
  at: readonly Point[];
  dx: number;
  dy: number;
}

/** Every theme dresses these three trees — one on each edge a walker sees — so the town
 * always reads as decorated and never as half-finished on a quiet jury. */
const CANOPY: readonly Point[] = [
  { x: 9, y: 4 },
  { x: 0, y: 6 },
  { x: 5, y: 8 },
];

const TREES_TOP: readonly Point[] = [
  { x: 6, y: 0 },
  { x: 8, y: 0 },
];

const TREES_SIDE: readonly Point[] = [
  { x: 9, y: 1 },
  { x: 0, y: 4 },
  { x: 9, y: 6 },
];

const TREES_FOOT: readonly Point[] = [
  { x: 2, y: 8 },
  { x: 8, y: 8 },
];

const ROOF: readonly Point[] = [
  { x: 1, y: 0 },
  { x: 3, y: 0 },
];

const ROOFLINE: readonly Point[] = [
  { x: 0, y: 0 },
  { x: 2, y: 0 },
  { x: 4, y: 0 },
];

const WALLS: readonly Point[] = [
  { x: 0, y: 3 },
  { x: 4, y: 3 },
];

const DOOR: readonly Point[] = [{ x: 2, y: 3 }];

const POND: readonly Point[] = [
  { x: 7, y: 5 },
  { x: 8, y: 6 },
];

const SAIL: Ramp = {
  lightest: "#f8f8f8",
  light: "#5890d8",
  dark: "#8c5c2c",
  darkest: "#301c14",
};

const LOVE: Ramp = {
  lightest: "#ff90b8",
  light: "#f8d860",
  dark: "#e0407c",
  darkest: "#a02060",
};

const FILM: Ramp = {
  lightest: "#f8f8f8",
  light: "#f8d860",
  dark: "#58a0e0",
  darkest: "#303840",
};

const STEEL: Ramp = {
  lightest: "#f8f8f8",
  light: "#c8d0d8",
  dark: "#8898b0",
  darkest: "#303840",
};

const FIRE: Ramp = {
  lightest: "#fff0a0",
  light: "#f8b030",
  dark: "#e04018",
  darkest: "#a01810",
};

const TIN: Ramp = {
  lightest: "#e8ecf0",
  light: "#b8c4d0",
  dark: "#d84038",
  darkest: "#303840",
};

const STONE: Ramp = {
  lightest: "#c8c8c0",
  light: "#989890",
  dark: "#686860",
  darkest: "#303028",
};

const PINK: Ramp = {
  lightest: "#ffc0e0",
  light: "#ff70b0",
  dark: "#e0407c",
  darkest: "#a02060",
};

const TIMBER: Ramp = {
  lightest: "#e0b878",
  light: "#c08850",
  dark: "#8c5c2c",
  darkest: "#402818",
};

const DELFT: Ramp = {
  lightest: "#f0f4ff",
  light: "#4878c8",
  dark: "#2858a8",
  darkest: "#18305c",
};

const CANVAS: Ramp = {
  lightest: "#f8f4e8",
  light: "#58a0e0",
  dark: "#e05038",
  darkest: "#402818",
};

const ORANJE: Ramp = {
  lightest: "#ffb040",
  light: "#f8d860",
  dark: "#e05020",
  darkest: "#402818",
};

const SEASIDE: Ramp = {
  lightest: "#f8f8f8",
  light: "#f85868",
  dark: "#38a0c8",
  darkest: "#402818",
};

const SNOWFALL: Ramp = {
  lightest: "#ffffff",
  light: "#dce8f4",
  dark: "#b8c8dc",
  darkest: "#8898b0",
};

/** Two baubles in one drawing: `.`/`l` is the red one, `d`/`k` the gold. */
const BAUBLE: Ramp = {
  lightest: "#f88088",
  light: "#e04038",
  dark: "#f8e090",
  darkest: "#d0a020",
};

const GOLD: Ramp = {
  lightest: "#fff8c0",
  light: "#f8d860",
  dark: "#e0a020",
  darkest: "#8c5c14",
};

const HOLLY: Ramp = {
  lightest: "#68b048",
  light: "#2c7838",
  dark: "#e04038",
  darkest: "#0c3018",
};

/** `.` is the GRASS a repainted tree stands on, so a themed silhouette covers the round
 * canopy underneath instead of leaving a green halo around it. */
const GRASS_UNDER = "#b8e090";

const PINE: Ramp = {
  lightest: GRASS_UNDER,
  light: "#58a848",
  dark: "#1c6830",
  darkest: "#2c1c10",
};

const BLOSSOM_TREE: Ramp = {
  lightest: GRASS_UNDER,
  light: "#ffb0d8",
  dark: "#f06ca8",
  darkest: "#a03060",
};

const CHARRED: Ramp = {
  lightest: GRASS_UNDER,
  light: "#e05828",
  dark: "#583838",
  darkest: "#241818",
};

const TOY_BLUE: Ramp = {
  lightest: "#78d0f8",
  light: "#3890d8",
  dark: "#2860a8",
  darkest: "#402818",
};

const FLAG: Rows = [
  "--k----",
  "--k....",
  "--k.ll.",
  "--k....",
  "--k----",
  "--k----",
  "--k----",
  "--k----",
];

const BOAT: Rows = [
  "----k-------",
  "----k.------",
  "----k..-----",
  "----k...----",
  "----k....---",
  "----k....---",
  "-dddddddddd-",
  "--dddddddd--",
];

const BUNTING: Rows = [
  "kkkkkkkkkkkkkkkk",
  "-...--lll--...--",
  "--.----l----.---",
];

const HEART: Rows = [
  "-dd-dd-",
  "d.....d",
  "d.....d",
  "-d...d-",
  "--d.d--",
  "---d---",
];

const POLAROID: Rows = [
  "kkkkkkkkkkk",
  "k.........k",
  "k.ddddddd.k",
  "k.dlllldd.k",
  "k.dlllldd.k",
  "k.ddddddd.k",
  "k.........k",
  "k.........k",
  "kkkkkkkkkkk",
];

const PAN: Rows = [
  "--kkkkkk----",
  "-kllllllk---",
  "kllllllllk--",
  "kllllllllkkk",
  "kllllllllkkk",
  "kllllllllk--",
  "-kllllllk---",
  "--kkkkkk----",
];

const PLATE: Rows = ["-kkkkk-", "k.....k", "-k...k-", "--kkk--"];

const FLAME: Rows = [
  "---k---",
  "--kdk--",
  "--kdk--",
  "-kdldk-",
  "-kdldk-",
  "kdl.ldk",
  "kdl.ldk",
  "-kdldk-",
  "--kkk--",
];

const FLAME_ALT: Rows = [
  "-------",
  "---k---",
  "--kdk--",
  "--kdk--",
  "-kdldk-",
  "kdl.ldk",
  "kdl.ldk",
  "-kdldk-",
  "--kkk--",
];

const EMBER: Rows = ["-d-", "d.d", "-d-"];

const CAN: Rows = [
  "-kkkkkk-",
  "k......k",
  "k......k",
  "kddddddk",
  "kddddddk",
  "kd.dd.dk",
  "kddddddk",
  "k......k",
  "k.llll.k",
  "k......k",
  "-kkkkkk-",
];

const BOULDER: Rows = [
  "---kkkkk----",
  "--k.....k---",
  "-k...l...k--",
  "k....l....k-",
  "k...ll....k-",
  "k.........k-",
  "-kkkkkkkkk--",
];

const BLOSSOM: Rows = [
  "----------------",
  "--.-------.-----",
  "-.d.-----.d.----",
  "--.-------.-----",
  "----------------",
  "-------.--------",
  "------.d.-------",
  "-------.--------",
  "----.-------.---",
  "---.d.-----.d.--",
  "----.-------.---",
  "----------------",
  "--------.-------",
  "-------.d.------",
  "--------.-------",
  "----------------",
];

const PLANK: Rows = [
  "kkkkkkkkkkkkkk",
  "k.l..l...l...k",
  "k...l...l....k",
  "k.l....l...l.k",
  "kkkkkkkkkkkkkk",
];

const SAW: Rows = ["--kkkkkk", "-k......", "kkkkkkkk", "k-k-k-k-"];

const DELFT_TILE: Rows = [
  "kkkkkkkkkk",
  "k........k",
  "k...d....k",
  "k..ddd...k",
  "k.d.d.d..k",
  "k...d....k",
  "k..l.l...k",
  "k........k",
  "kkkkkkkkkk",
];

const HANGING_PLATE: Rows = [
  "-kkkkk-",
  "k.....k",
  "k..d..k",
  "k.ddd.k",
  "k..d..k",
  "k.....k",
  "-kkkkk-",
];

const EASEL: Rows = [
  "-kkkkkkkkk-",
  "-k.......k-",
  "-k.dd.ll.k-",
  "-k.dd.ll.k-",
  "-k.......k-",
  "-k..dddd.k-",
  "-k.......k-",
  "-kkkkkkkkk-",
  "----k-k----",
  "---k---k---",
  "--k-----k--",
  "-k-------k-",
];

const CONFETTI: Rows = [
  "----------------",
  "--..---ll---dd--",
  "--..---ll---dd--",
  "----------------",
  "------kk---..---",
  "------kk---..---",
  "----------------",
  "--ll---dd---kk--",
  "--ll---dd---kk--",
  "----------------",
  "-----..---ll----",
  "-----..---ll----",
  "----------------",
  "--dd---kk---..--",
  "--dd---kk---..--",
  "----------------",
];

const CROWN: Rows = [
  "k---k---k",
  "k...k...k",
  "k.......k",
  "k...l...k",
  "k.......k",
  "kkkkkkkkk",
];

const GLASS: Rows = [
  "-kkkkk-",
  "k.....k",
  "k.....k",
  "k.lll.k",
  "k.lll.k",
  "k.lll.k",
  "k.lll.k",
  "-kkkkk-",
];

const PARASOL: Rows = [
  "-----k-----",
  "---kk.kk---",
  "-kk..l..kk-",
  "k.l..l..l.k",
  "kkkkkkkkkkk",
  "-----k-----",
  "-----k-----",
  "-----k-----",
  "-----k-----",
];

const BALL: Rows = ["-kkkk-", "k.ll.k", "k.ll.k", "k.ll.k", "k.ll.k", "-kkkk-"];

const STAR: Rows = ["---d---", "---.---", "d..l..d", "---.---", "---d---"];

const STAR_ALT: Rows = ["-------", "---d---", "-d.l.d-", "---d---", "-------"];

const BAUBLES: Rows = [
  "----------------",
  "---.------d-----",
  "---ll----kk-----",
  "----------------",
  "--------.-------",
  "--------ll------",
  "----------------",
  "--d-------.-----",
  "--kk------ll----",
  "----------------",
  "------.---------",
  "------ll--------",
  "----------------",
  "----d-------.---",
  "----kk------ll--",
  "----------------",
];

const SNOW: Rows = [
  "................",
  "................",
  "................",
  "...l..........l.",
  ".l....l...l.....",
  "-ll-ll--l-l--ll-",
  "----l-------l---",
];

/**
 * A whole tree, not a trinket hung on one: the tile is repainted from its grass up, so
 * the round canopy underneath cannot show around the edges of a narrower silhouette.
 * `.` is therefore the GRASS the tree stands on, which leaves three slots for the tree.
 */
const CONIFER: Rows = [
  "................",
  ".......k........",
  "......kdk.......",
  "......kdk.......",
  ".....kdldk......",
  "....kdldldk.....",
  ".....kdldk......",
  "....kdldldk.....",
  "...kdldldldk....",
  "....kdldldk.....",
  "...kdldldldk....",
  "..kdldldldldk...",
  "...kkkkkkkkk....",
  ".......kk.......",
  "......kkkk......",
  "................",
];

/** Placed to land on the conifer's tiers rather than on the grass beside them. */
const TRIMMING: Rows = [
  "----------------",
  "----------------",
  "----------------",
  "----------------",
  "----------------",
  "-------l--------",
  "----------------",
  "-----l----k-----",
  "----------------",
  "-----k-----l----",
  "----------------",
  "----l------k----",
  "----------------",
  "----------------",
  "----------------",
  "----------------",
];

const WREATH: Rows = [
  "---kkk---",
  "--k...k--",
  "-k.-.-.k-",
  "k..---..k",
  "k.-----.k",
  "k..---..k",
  "-k.-.-.k-",
  "--k.d.k--",
  "---ddd---",
];

const BALLOON: Rows = [
  "--kkk--",
  "-k...k-",
  "k.....k",
  "k.....k",
  "k.....k",
  "-k...k-",
  "--k.k--",
  "---k---",
  "---k---",
  "--k----",
  "---k---",
  "----k--",
];

const BLOCKS: Rows = [
  "kkkkk----",
  "k...k----",
  "k.l.k----",
  "kkkkkkkkk",
  "k...k...k",
  "k.l.k.l.k",
  "kkkkkkkkk",
];

/**
 * What each jury hangs on the town.
 *
 * A total `Record`, so a jury cannot exist without somebody deciding what its day looks
 * like. Every spot is a tile that is already SOLID — the tree ring, the roof, the front
 * wall, the pond — which is why none of this needs a walkability decision or a footstep
 * sound: `shared/map.ts` is untouched and nobody can stand where a prop does.
 */
export const DECOR: Record<JuryDecor, readonly DecorPiece[]> = {
  voyage: [
    { rows: FLAG, ramp: SAIL, at: [...CANOPY, ...TREES_TOP], dx: 5, dy: 0 },
    { rows: BOAT, ramp: SAIL, at: POND, dx: 2, dy: 6 },
    { rows: BUNTING, ramp: SAIL, at: [...ROOF, ...ROOFLINE], dx: 0, dy: 1 },
  ],
  hearts: [
    { rows: HEART, ramp: LOVE, at: [...CANOPY, ...TREES_TOP], dx: 4, dy: 1 },
    { rows: HEART, ramp: LOVE, at: [...CANOPY, ...TREES_SIDE], dx: 9, dy: 8 },
    { rows: POLAROID, ramp: FILM, at: WALLS, dx: 2, dy: 3 },
  ],
  kitchen: [
    { rows: PAN, ramp: STEEL, at: [...CANOPY, ...TREES_SIDE], dx: 3, dy: 4 },
    { rows: PLATE, ramp: STEEL, at: WALLS, dx: 5, dy: 6 },
    { rows: PLATE, ramp: STEEL, at: TREES_FOOT, dx: 2, dy: 10 },
  ],
  flames: [
    {
      rows: TREE_ROWS,
      ramp: CHARRED,
      at: [...CANOPY, ...TREES_TOP, ...TREES_SIDE],
      dx: 0,
      dy: 0,
    },
    {
      rows: FLAME,
      alt: FLAME_ALT,
      ramp: FIRE,
      at: [...CANOPY, ...TREES_TOP],
      dx: 5,
      dy: 0,
    },
    {
      rows: FLAME,
      alt: FLAME_ALT,
      ramp: FIRE,
      at: [...TREES_SIDE, ...TREES_FOOT],
      dx: 1,
      dy: 5,
    },
    { rows: EMBER, ramp: FIRE, at: ROOFLINE, dx: 6, dy: 6 },
  ],
  cans: [
    { rows: CAN, ramp: TIN, at: CANOPY, dx: 4, dy: 4 },
    { rows: CAN, ramp: TIN, at: [...TREES_FOOT, ...TREES_SIDE], dx: 2, dy: 5 },
    { rows: CAN, ramp: TIN, at: POND, dx: 5, dy: 6 },
  ],
  boulders: [
    { rows: BOULDER, ramp: STONE, at: CANOPY, dx: 2, dy: 8 },
    {
      rows: BOULDER,
      ramp: STONE,
      at: [...TREES_SIDE, ...TREES_FOOT],
      dx: 0,
      dy: 9,
    },
    { rows: BOULDER, ramp: STONE, at: POND, dx: 3, dy: 5 },
  ],
  pink: [
    {
      rows: TREE_ROWS,
      ramp: BLOSSOM_TREE,
      at: [...CANOPY, ...TREES_TOP, ...TREES_SIDE],
      dx: 0,
      dy: 0,
    },
    { rows: BLOSSOM, ramp: PINK, at: TREES_FOOT, dx: 0, dy: 0 },
    { rows: BUNTING, ramp: PINK, at: [...ROOF, ...ROOFLINE], dx: 0, dy: 1 },
    { rows: HEART, ramp: PINK, at: WALLS, dx: 5, dy: 5 },
  ],
  workshop: [
    { rows: PLANK, ramp: TIMBER, at: CANOPY, dx: 1, dy: 9 },
    {
      rows: PLANK,
      ramp: TIMBER,
      at: [...TREES_FOOT, ...TREES_SIDE],
      dx: 1,
      dy: 4,
    },
    { rows: SAW, ramp: STEEL, at: WALLS, dx: 4, dy: 5 },
  ],
  delft: [
    {
      rows: HANGING_PLATE,
      ramp: DELFT,
      at: [...CANOPY, ...TREES_TOP, ...TREES_SIDE],
      dx: 5,
      dy: 4,
    },
    { rows: DELFT_TILE, ramp: DELFT, at: [...WALLS, ...DOOR], dx: 3, dy: 3 },
  ],
  gallery: [
    {
      rows: CONFETTI,
      ramp: CANVAS,
      at: [...CANOPY, ...TREES_TOP, ...TREES_FOOT],
      dx: 0,
      dy: 0,
    },
    { rows: EASEL, ramp: CANVAS, at: WALLS, dx: 2, dy: 3 },
  ],
  oranje: [
    { rows: CROWN, ramp: ORANJE, at: [...CANOPY, ...TREES_TOP], dx: 4, dy: 2 },
    { rows: BUNTING, ramp: ORANJE, at: [...ROOF, ...ROOFLINE], dx: 0, dy: 1 },
    { rows: GLASS, ramp: ORANJE, at: WALLS, dx: 5, dy: 5 },
  ],
  beach: [
    { rows: BALL, ramp: SEASIDE, at: [...CANOPY, ...TREES_FOOT], dx: 5, dy: 9 },
    { rows: PARASOL, ramp: SEASIDE, at: POND, dx: 2, dy: 3 },
    { rows: BALL, ramp: SEASIDE, at: TREES_SIDE, dx: 2, dy: 4 },
  ],
  christmas: [
    {
      rows: CONIFER,
      ramp: PINE,
      at: [...CANOPY, ...TREES_TOP, ...TREES_SIDE],
      dx: 0,
      dy: 0,
    },
    {
      rows: TRIMMING,
      ramp: BAUBLE,
      at: [...CANOPY, ...TREES_TOP, ...TREES_SIDE],
      dx: 0,
      dy: 0,
    },
    {
      rows: STAR,
      alt: STAR_ALT,
      ramp: GOLD,
      at: [...CANOPY, ...TREES_TOP, ...TREES_SIDE],
      dx: 4,
      dy: 0,
    },
    { rows: BAUBLES, ramp: BAUBLE, at: TREES_FOOT, dx: 0, dy: 0 },
    { rows: SNOW, ramp: SNOWFALL, at: [...ROOF, ...ROOFLINE], dx: 0, dy: 0 },
    { rows: WREATH, ramp: HOLLY, at: DOOR, dx: 3, dy: 4 },
  ],
  toys: [
    { rows: BALLOON, ramp: LOVE, at: CANOPY, dx: 4, dy: 1 },
    {
      rows: BALLOON,
      ramp: TOY_BLUE,
      at: [...TREES_TOP, ...TREES_SIDE],
      dx: 8,
      dy: 3,
    },
    {
      rows: BLOCKS,
      ramp: TOY_BLUE,
      at: [...CANOPY, ...TREES_FOOT],
      dx: 3,
      dy: 9,
    },
  ],
};

const layers = new Map<string, HTMLCanvasElement>();

function buildLayer(decor: JuryDecor, frame: 0 | 1): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = MAP_W * TILE;
  canvas.height = MAP_H * TILE;
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("Canvas is not supported");
  for (const piece of DECOR[decor]) {
    const rows =
      frame === 1 && piece.alt !== undefined ? piece.alt : piece.rows;
    for (const spot of piece.at) {
      blit(
        ctx,
        rows,
        piece.ramp,
        spot.x * TILE + piece.dx,
        spot.y * TILE + piece.dy,
      );
    }
  }
  return canvas;
}

/** One transparent overlay for the whole map, memoised per theme AND per animation
 * frame: fifty-odd props at a `fillRect` a pixel is a frame's budget spent on
 * decoration, and keyed by the frame alone the town would keep whichever jury was up
 * when the tab opened for the rest of the session. */
export function decorLayer(decor: JuryDecor, frame: 0 | 1): HTMLCanvasElement {
  const key = `${decor}:${frame}`;
  const cached = layers.get(key);
  if (cached !== undefined) return cached;
  const built = buildLayer(decor, frame);
  layers.set(key, built);
  return built;
}
