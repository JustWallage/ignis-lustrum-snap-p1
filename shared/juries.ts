import { z } from "zod";

const line = z.string().trim().min(1);

export const jurySpriteSchema = z.object({
  hat: z.enum(["none", "chef", "cap", "beret", "sunhat", "beanie"]),
  hair: z.enum(["dark", "blond", "grey", "ginger"]),
  outfit: z.enum(["whites", "denim", "suit", "khaki", "black", "teal"]),
});
export type JurySprite = z.infer<typeof jurySpriteSchema>;

export const jurySchema = z.object({
  name: line,
  theme: line,
  bonusItem: line,
  bonusPrompt: line,
  critiquePersona: line,
  dialogue: z.array(line).min(1),
  sprite: jurySpriteSchema,
});
export type Jury = z.infer<typeof jurySchema>;

export const JURIES: readonly [Jury, ...Jury[]] = [
  {
    name: "Gordon Ramsay",
    theme: "Street food",
    bonusItem: "food",
    bonusPrompt:
      "Does this photo clearly show something edible — a dish, a snack, a drink?",
    critiquePersona:
      "A furious Michelin chef. Blunt, theatrical, obsessed with freshness and plating. Savage about the photo, never about the person.",
    dialogue: [
      "GORDON RAMSAY: Right. You. Camera. Now.",
      "Today's theme is STREET FOOD, and it had better look ALIVE.",
      "Get something edible in the frame and I'll bump your score. Well?",
    ],
    sprite: { hat: "chef", hair: "blond", outfit: "whites" },
  },
  {
    name: "David Attenborough",
    theme: "Wildlife",
    bonusItem: "an animal",
    bonusPrompt:
      "Is there a living animal in this photo — a bird, an insect, a pet, anything?",
    critiquePersona:
      "A hushed, reverent nature documentarian. Long vowels, wonder at the smallest detail, everything is a rare and precious moment.",
    dialogue: [
      "DAVID ATTENBOROUGH: Here... in the long grass... a photographer.",
      "Today we seek WILDLIFE. A pigeon will do. A cat will do nicely.",
      "Bring me a creature and I shall reward you handsomely.",
    ],
    sprite: { hat: "none", hair: "grey", outfit: "khaki" },
  },
  {
    name: "Anna Wintour",
    theme: "Street style",
    bonusItem: "sunglasses",
    bonusPrompt: "Is anyone in this photo wearing sunglasses?",
    critiquePersona:
      "An ice-cold fashion editor. Clipped, devastating, one word of praise is a standing ovation.",
    dialogue: [
      "ANNA WINTOUR: I have four seconds. Impress me.",
      "STREET STYLE. Someone, somewhere, dressed with intent.",
      "Sunglasses in the shot? Then we can talk. Shall we?",
    ],
    sprite: { hat: "beret", hair: "blond", outfit: "black" },
  },
  {
    name: "Bob Ross",
    theme: "Happy little trees",
    bonusItem: "a tree",
    bonusPrompt: "Is there a tree, a bush or a large plant in this photo?",
    critiquePersona:
      "The gentlest painting teacher alive. There are no mistakes, only happy accidents. Encouraging to a fault.",
    dialogue: [
      "BOB ROSS: Well hello there, friend. Beautiful day for it.",
      "Let's find some HAPPY LITTLE TREES today. No mistakes out here.",
      "Pop a tree in the corner and everybody wins. Ready when you are.",
    ],
    sprite: { hat: "none", hair: "ginger", outfit: "denim" },
  },
  {
    name: "Ansel Adams",
    theme: "Light and shadow",
    bonusItem: "a hard shadow",
    bonusPrompt:
      "Does this photo contain a strong, clearly defined shadow or a bright highlight?",
    critiquePersona:
      "A meticulous large-format landscape photographer. Talks in zones, exposure and tonal range. Deeply unimpressed by luck.",
    dialogue: [
      "ANSEL ADAMS: You do not take a photograph. You make it.",
      "Today: LIGHT AND SHADOW. Find an edge where they meet.",
      "A hard shadow scores. Now — visualise it first, then shoot.",
    ],
    sprite: { hat: "sunhat", hair: "grey", outfit: "denim" },
  },
  {
    name: "Steve Irwin",
    theme: "Something wild",
    bonusItem: "something green",
    bonusPrompt:
      "Is there a prominently green thing in this photo — foliage, paint, clothing?",
    critiquePersona:
      "A fearless, shouting wildlife wrangler. CRIKEY. Boundless enthusiasm, everything is a beauty and everything could bite you.",
    dialogue: [
      "STEVE IRWIN: CRIKEY! Look at the size of that lens!",
      "SOMETHING WILD today, mate. Danger optional, courage mandatory.",
      "Anything green in frame and she's a ripper. Let's have a look!",
    ],
    sprite: { hat: "cap", hair: "blond", outfit: "khaki" },
  },
  {
    name: "Mary Berry",
    theme: "Homemade",
    bonusItem: "something baked",
    bonusPrompt:
      "Does this photo show baked goods — bread, cake, pastry, biscuits?",
    critiquePersona:
      "A warm, precise baking judge. Kind but exacting; a soggy bottom is a moral failing.",
    dialogue: [
      "MARY BERRY: Ooh, lovely. Let's see what you've made.",
      "Today is HOMEMADE. Something with your hands all over it.",
      "A bake in the picture and I'll be very generous indeed.",
    ],
    sprite: { hat: "none", hair: "blond", outfit: "teal" },
  },
  {
    name: "Sherlock Holmes",
    theme: "A clue",
    bonusItem: "a door or window",
    bonusPrompt: "Is there a door, a gate or a window visible in this photo?",
    critiquePersona:
      "An insufferably brilliant consulting detective. Deduces far too much from far too little and announces it as fact.",
    dialogue: [
      "SHERLOCK HOLMES: You walked here. Left shoe. Don't argue.",
      "Today's theme is A CLUE. Photograph something that gives you away.",
      "A door or a window, ideally. Every door is a confession. Proceed.",
    ],
    sprite: { hat: "cap", hair: "dark", outfit: "suit" },
  },
  {
    name: "Jacques Cousteau",
    theme: "Water",
    bonusItem: "water",
    bonusPrompt:
      "Is there visible water in this photo — sea, river, rain, a puddle, a glass?",
    critiquePersona:
      "A romantic French oceanographer. Speaks of the sea as an old friend; mildly disappointed by anything dry.",
    dialogue: [
      "JACQUES COUSTEAU: Ah. Another explorer of the surface world.",
      "Today, WATER. The sea, the rain, a puddle — all are the ocean.",
      "Show me water and le bonus is yours. Shall we dive?",
    ],
    sprite: { hat: "beanie", hair: "grey", outfit: "teal" },
  },
  {
    name: "Wednesday Addams",
    theme: "Something gloomy",
    bonusItem: "something black",
    bonusPrompt:
      "Is there a large, clearly black object or area in this photo?",
    critiquePersona:
      "A deadpan gothic teenager. Flat, morbid, faintly disappointed that anything is cheerful.",
    dialogue: [
      "WEDNESDAY ADDAMS: You smiled at me. Don't do that again.",
      "The theme is SOMETHING GLOOMY. Overcast. Empty. Ideally damp.",
      "Black objects score. Colour is a cry for help. Begin.",
    ],
    sprite: { hat: "none", hair: "dark", outfit: "black" },
  },
  {
    name: "Marie Kondo",
    theme: "Tidy lines",
    bonusItem: "a straight edge",
    bonusPrompt:
      "Does this photo contain strong straight lines or a neatly ordered arrangement?",
    critiquePersona:
      "A serene tidying consultant. Delighted by order, gently devastating about clutter, thanks every object aloud.",
    dialogue: [
      "MARIE KONDO: Hello. First, we thank the camera.",
      "Today: TIDY LINES. Does this composition spark joy?",
      "Straight edges are rewarded. Chaos is... acknowledged. Ready?",
    ],
    sprite: { hat: "none", hair: "dark", outfit: "whites" },
  },
  {
    name: "Freddie Mercury",
    theme: "Pure drama",
    bonusItem: "a raised arm",
    bonusPrompt:
      "Is anyone in this photo raising an arm, pointing up, or striking a pose?",
    critiquePersona:
      "A magnificent rock frontman. Extravagant, generous, allergic to the understated. Darling this, darling that.",
    dialogue: [
      "FREDDIE MERCURY: Darling! You brought a camera to a stadium!",
      "PURE DRAMA today. Bigger. Louder. No half measures.",
      "An arm in the air doubles the applause. Give me everything!",
    ],
    sprite: { hat: "none", hair: "dark", outfit: "suit" },
  },
  {
    name: "Vincent van Gogh",
    theme: "Yellow",
    bonusItem: "flowers",
    bonusPrompt: "Are there flowers or blossom in this photo?",
    critiquePersona:
      "A feverish post-impressionist painter. Talks about colour as feeling, writes as if to his brother, aches a little.",
    dialogue: [
      "VINCENT VAN GOGH: I have been waiting all morning for the light.",
      "Today the theme is YELLOW. Chrome, lemon, the colour of noon.",
      "Flowers in the frame and my heart is yours. Will you paint it?",
    ],
    sprite: { hat: "beret", hair: "ginger", outfit: "khaki" },
  },
  {
    name: "Neil Armstrong",
    theme: "The sky",
    bonusItem: "clouds",
    bonusPrompt: "Is sky visible in this photo, with clouds in it?",
    critiquePersona:
      "A laconic test pilot turned astronaut. Understated, technical, allergic to hyperbole. High praise is 'that'll do'.",
    dialogue: [
      "NEIL ARMSTRONG: Weather's clear. Good day to look up.",
      "Theme is THE SKY. Point the camera away from the ground.",
      "Clouds in frame earn the bonus. You are go for launch.",
    ],
    sprite: { hat: "none", hair: "blond", outfit: "whites" },
  },
];

export function juryForDay(day: number): Jury {
  const span = JURIES.length;
  const index = (((Math.trunc(day) - 1) % span) + span) % span;
  return JURIES[index] ?? JURIES[0];
}
