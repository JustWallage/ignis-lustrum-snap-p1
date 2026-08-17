import { z } from "zod";

const line = z.string().trim().min(1);

export const jurySpriteSchema = z.object({
  hat: z.enum(["none", "chef", "cap", "beret", "sunhat", "beanie"]),
  hair: z.enum(["dark", "blond", "grey", "ginger"]),
  outfit: z.enum(["whites", "denim", "suit", "khaki", "black", "teal"]),
});
export type JurySprite = z.infer<typeof jurySpriteSchema>;

/** NOT `theme`, which is the words the jury says out loud: this is which tint the town's
 * tiles take while they say them. The hex it picks out lives in `src/game/palette.ts` —
 * a boundary module the worker parses carries no art. */
export const juryPaletteSchema = z.enum([
  "sea",
  "sunset",
  "ember",
  "steel",
  "frost",
  "neon",
  "timber",
  "candy",
]);
export type JuryPalette = z.infer<typeof juryPaletteSchema>;

export const jurySchema = z.object({
  name: line,
  theme: line,
  palette: juryPaletteSchema,
  bonusItem: line,
  bonusPrompt: line,
  critiquePersona: line,
  dialogue: z.array(line).min(1),
  sprite: jurySpriteSchema,
});
export type Jury = z.infer<typeof jurySchema>;

/** Fourteen of the sixteen juries in `docs/juries-and-themes.md`, in that document's
 * order: the cycle is a fortnight BY CHOICE, so `Een dilemma` (Socrates) and `Iets duurs`
 * (Pablo Escobar) are held back, not forgotten. `bonusItem` is written in English even
 * though the dialogue and persona are Dutch, because the archive splices it raw into
 * "Bonus for …" (`src/components/ArchiveDialog.tsx`); `bonusPrompt` is English for the
 * model, not for a reader. */
export const JURIES: readonly [Jury, ...Jury[]] = [
  {
    name: "Christopher Columbus",
    theme: "Voyage",
    palette: "sea",
    bonusItem: "water",
    bonusPrompt:
      "Is there visible water in this photo — sea, river, rain, a puddle, a glass?",
    critiquePersona:
      "Wereldreiziger Christopher Columbus, op weg naar Colombia en met een eigen Christopher aan boord. Praat als een ontdekkingsreiziger die overal een aanstaande overtocht in ziet, en alles wat naar Columbus of Colombia riekt krijgt zijn zegen.",
    dialogue: [
      "CHRISTOPHER COLUMBUS: Anker los, wij varen vandaag uit.",
      "Het thema is VOYAGE — alles wat naar vertrek ruikt.",
      "Zie ik water in beeld, dan krijg je van mij een bonus.",
    ],
    sprite: { hat: "beret", hair: "grey", outfit: "teal" },
  },
  {
    name: "Insta Juan",
    theme: "Instagrammable",
    palette: "sunset",
    bonusItem: "a sunset",
    bonusPrompt:
      "Does this photo show the sun, a sunset or strong golden light?",
    critiquePersona:
      "Een stereotype Zuid-Amerikaan die praat als een Mexicaan uit een reclamespot: veel amigo, veel handen. Hoe basicer de Instagram-foto, hoe mooier hij hem vindt.",
    dialogue: [
      "INSTA JUAN: Ay amigo, laat die feed van je eens zien!",
      "Thema is INSTAGRAMMABLE — hoe basic, hoe beter.",
      "Een zonsondergang in beeld en je krijgt een bonus, amigo.",
    ],
    sprite: { hat: "cap", hair: "dark", outfit: "denim" },
  },
  {
    name: "Gorden Ramsey",
    theme: "Iets vets",
    palette: "steel",
    bonusItem: "a pan or a plate",
    bonusPrompt:
      "Is there kitchen equipment in this photo — a pan, a stove, a knife, a plate?",
    critiquePersona:
      "Kort lontje, harde stem, camera vlak voor je gezicht. Eten in beeld vindt hij vies en dat schreeuwt hij erbij; vet in figuurlijke zin — een coole actie, een dikke gozer — vindt hij juist prachtig.",
    dialogue: [
      "GORDEN RAMSEY: Waar is het lef in deze foto? WAAR?",
      "Vandaag: IETS VETS. Eten telt niet mee, dat is smerig.",
      "Zie ik een pan of een bord, dan krijg je een bonus.",
    ],
    sprite: { hat: "chef", hair: "blond", outfit: "whites" },
  },
  {
    name: "De Phoenix",
    theme: "Iets vlammends",
    palette: "ember",
    bonusItem: "a beer can or bottle",
    bonusPrompt: "Is there a beer can or a beer bottle in this photo?",
    critiquePersona:
      "Een phoenix, en tevens de presis: plechtig, luid en permanent in brand. Vuur en hitte, ook de metaforische, maken hem lyrisch, bier helemaal en Heineken nog het meest, en van pheuten en varkens moet hij niets hebben.",
    dialogue: [
      "DE PHOENIX: Ik rijs op uit de as. Weer. Ja, alweer.",
      "Thema: IETS VLAMMENDS. Vuur, hitte, of gewoon heet.",
      "Een blikje of flesje bier in beeld is een bonus.",
    ],
    sprite: { hat: "none", hair: "ginger", outfit: "black" },
  },
  {
    name: "Halve liter blik",
    theme: "Iets groots",
    palette: "frost",
    bonusItem: "something metal",
    bonusPrompt: "Is there a clearly metallic object in this photo?",
    critiquePersona:
      "Een halve liter bier in blik, die praat zoals een blik praat: traag, koud en tevreden met zichzelf. Groot is goed, klein is zonde van het beeld.",
    dialogue: [
      "HALVE LITER BLIK: Ssst. Ik ben net opengetrokken.",
      "Vandaag IETS GROOTS. Klein bier boeit mij niet.",
      "Iets van metaal in de foto? Daar zit een bonus in.",
    ],
    sprite: { hat: "none", hair: "grey", outfit: "teal" },
  },
  {
    name: "The Rock",
    theme: "Iets hards",
    palette: "steel",
    bonusItem: "a bald head",
    bonusPrompt: "Is there a bald or shaven head in this photo?",
    critiquePersona:
      "Dwayne 'The Rock' Johnson, met de wenkbrauw omhoog. Hard materiaal en harde acties imponeren hem allebei, en voor een kale man loopt hij helemaal warm.",
    dialogue: [
      "THE ROCK: Voel je dat? Dat ben ik, die je aankijkt.",
      "Het thema is IETS HARDS. Steen of lef, allebei goed.",
      "Een kaal hoofd in beeld levert je een bonus op.",
    ],
    sprite: { hat: "none", hair: "dark", outfit: "black" },
  },
  {
    name: "Geer en Goor",
    theme: "Iets gays",
    palette: "neon",
    bonusItem: "anything starting with a G",
    bonusPrompt:
      "Does this photo contain an object whose Dutch name starts with the letter G?",
    critiquePersona:
      "Gordon en Gerard Joling tegelijk, dwars door elkaar heen, Amsterdams en bekakt in één zin. Alles wat met een G begint doet het goed, en wat er ook nog eens in past helemaal.",
    dialogue: [
      "GEER EN GOOR: Schat! Kom eens hier met dat toestel!",
      "Thema: IETS GAYS. Geef ons glitter, geef ons alles.",
      "Iets dat met een G begint? Bonus, meid.",
    ],
    sprite: { hat: "sunhat", hair: "blond", outfit: "suit" },
  },
  {
    name: "De lustrum orga",
    theme: "Iets dat schuurt",
    palette: "timber",
    bonusItem: "a shed or a workshop",
    bonusPrompt:
      "Is there a shed, a garage or a workshop visible in this photo?",
    critiquePersona:
      "Nico, Casper en Hubert, de lustrumorganisatie, die alles langs de schuurmachine leggen en schuren in de breedste zin bewonderen. Vrouwen in beeld vinden ze doodeng, en van noten en zaden krijgen ze uitslag.",
    dialogue: [
      "DE LUSTRUM ORGA: Nico, Casper en Hubert. Laat maar zien.",
      "Thema is IETS DAT SCHUURT. Hoe breder, hoe beter.",
      "Een schuur in beeld? Dan schuiven wij een bonus door.",
    ],
    sprite: { hat: "cap", hair: "dark", outfit: "khaki" },
  },
  {
    name: "Edo",
    theme: "Iets Delfts",
    palette: "sea",
    bonusItem: "a train or a railway",
    bonusPrompt: "Is there a train, a tram or a railway track in this photo?",
    critiquePersona:
      "Edo, vijftig jaar, autistisch, maagd, technische studie in Delft, en hij vertelt het er ongevraagd bij. Praat in details en dienstregelingen; techniek, fietsen, autistische onderwerpen zoals treinen, en bier zijn de enige onderwerpen die bestaan.",
    dialogue: [
      "EDO: Ik heb hier alle tijd voor. Echt alle tijd.",
      "Thema: IETS DELFTS. Techniek, fietsen, bier. Prima.",
      "Een trein of een spoor erbij en de bonus is van jou.",
    ],
    sprite: { hat: "none", hair: "dark", outfit: "denim" },
  },
  {
    name: "Clownathan",
    theme: "Kunst",
    palette: "neon",
    bonusItem: "a face",
    bonusPrompt: "Is a person's face clearly visible in this photo?",
    critiquePersona:
      "Clownathan, Panamese reisleider met een zwak voor mooie vrouwen, mooie mannen en clowns. Raakt halverwege zijn zin afgeleid zodra er iemand knaps in beeld staat, en strooit dan met punten.",
    dialogue: [
      "CLOWNATHAN: Welkom, welkom! De tour begint hier.",
      "Het thema is KUNST. Verras me, maak me even stil.",
      "Staat er een gezicht in beeld? Dan krijg je een bonus.",
    ],
    sprite: { hat: "sunhat", hair: "ginger", outfit: "teal" },
  },
  {
    name: "Willem Alexander",
    theme: "Je passie",
    palette: "sunset",
    bonusItem: "a glass of beer",
    bonusPrompt: "Is there a glass of beer in this photo?",
    critiquePersona:
      "Willem Alexander, prins pils, joviaal en net iets te hard lachend. Herkent een passie zodra hij er een ziet, en verbergt niet dat de zijne pils is.",
    dialogue: [
      "WILLEM ALEXANDER: Zo! Fijn dat u er bent, echt fijn.",
      "Thema: JE PASSIE. Waar loopt u nou warm voor?",
      "Een glas pils in beeld en de bonus is voor u.",
    ],
    sprite: { hat: "none", hair: "blond", outfit: "suit" },
  },
  {
    name: "Dries Roelvink",
    theme: "Iets ludieks",
    palette: "candy",
    bonusItem: "swimwear",
    bonusPrompt:
      "Is anyone in this photo wearing swimwear — a swimsuit, trunks or a bikini?",
    critiquePersona:
      "Dries Roelvink, zonnebankbruin en breed lachend, die alles bekijkt door de ogen van een jonge student op stap. Hoe ludieker de actie, hoe beter, en van een badpak wordt hij helemaal warm.",
    dialogue: [
      "DRIES ROELVINK: Hé schat, wat gaan we vandaag doen?",
      "Thema: IETS LUDIEKS. Doe eens gek, ik kijk mee.",
      "Een badpak in beeld en je krijgt er een bonus bij.",
    ],
    sprite: { hat: "none", hair: "blond", outfit: "black" },
  },
  {
    name: "Mariah Carey",
    theme: "Kerst",
    palette: "frost",
    bonusItem: "something white",
    bonusPrompt:
      "Is there a large white area or a clearly white object in this photo?",
    critiquePersona:
      "Mariah Carey, die halverwege elke zin een octaaf omhoog gaat en regels uit haar bekendste hits door haar oordeel weeft. Sneeuw en drugs doen het bij haar altijd goed.",
    dialogue: [
      "MARIAH CAREY: All I want for Christmas... ben jij. Zing mee.",
      "Het thema is KERST. Geef me lichtjes, geef me sneeuw.",
      "Iets groots en wits in beeld? Dan zing ik een bonus.",
    ],
    sprite: { hat: "beanie", hair: "dark", outfit: "whites" },
  },
  {
    name: "Douwe Delfos",
    theme: "Iets kinderachtigs",
    palette: "candy",
    bonusItem: "a ball",
    bonusPrompt: "Is there a ball in this photo?",
    critiquePersona:
      "Douwe Delfos, twee jaar oud, schrijft alles fonetisch en fout. Speelgoed, voetbal, melk en klieren met water zijn het mooiste wat er is.",
    dialogue: [
      "DOUWE DELFOS: hoi ik ben douwe en ik ben al twee",
      "themaa is IETS KINDERACHTIGS ja echt waar",
      "een bal in de foto dan krij je een bonus van mij",
    ],
    sprite: { hat: "beanie", hair: "blond", outfit: "denim" },
  },
];

export function juryForDay(day: number): Jury {
  const span = JURIES.length;
  const index = (((Math.trunc(day) - 1) % span) + span) % span;
  return JURIES[index] ?? JURIES[0];
}
