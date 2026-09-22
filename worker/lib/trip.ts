/**
 * The reisbrochure, cut down to what a guide is asked at the side of the road: the
 * schedule, the times, and the things that go wrong without them. Written in Dutch
 * because Nico answers in Dutch, and a briefing translated at the model is a briefing
 * that drifts. Nothing here is a boundary type — it never leaves the prompt.
 */

interface TripDay {
  date: string;
  place: string;
  plan: string;
}

/** Indexed from 1: `ITINERARY[day - 1]` is that day. */
const ITINERARY: readonly TripDay[] = [
  {
    date: "zaterdag 19-09-2026",
    place: "Medellín",
    plan: "Aankomst in Colombia. Vlucht KL8885 landt om 20:10 op Jose Maria Cordova International Airport. Een chauffeur staat klaar met een bordje 'Lustrumfiesta' of de groepsnaam; onderweg krijg je bier en de lokale simkaart. Transfer vertrekt 20:10, duurt 1 uur, naar Masaya Medellin. Lukt het niet de chauffeur te vinden, bel Lustrumfiesta. Geen maaltijden inbegrepen. Slapen: Masaya Medellin.",
  },
  {
    date: "zondag 20-09-2026",
    place: "Medellín",
    plan: "Tour door Comuna 13 met lokale gids, daarna een voetbalwedstrijd tegen een lokaal team: Ignis vs. Locals. Vertrek 12:00 vanaf Masaya Medellin, duurt 6 uur, lunch inbegrepen. Neem een heuptasje mee, let op zakkenrollers in de metro. Belangrijk: bestel vandaag bij de receptie een ontbijt-to-go voor het vroege vertrek morgen. Haal vandaag contant geld: Cocorná is vrijwel alleen cash, er is één pinautomaat op 30 minuten rijden. Reken op 300.000 tot 400.000 COP per persoon. Ontbijt en lunch inbegrepen. Slapen: Masaya Medellin.",
  },
  {
    date: "maandag 21-09-2026",
    place: "Santo Domingo (Cocorná)",
    plan: "Transfer Medellín → Cocorná vertrekt 7:30 vanaf Masaya Medellin, duurt 2 uur. Eerste drop-off El Llanerito La Piñuela voor 11 personen, tweede drop-off Entre Bosques voor 3 personen. Die 3 lopen de hike niet mee en doen onderweg de boodschappen voor de finca. De 11 anderen stappen over op een chiva en beginnen om 9:30 aan de 2-daagse hike door de Valle de las Cascadas langs Rio Santo Domingo, met zwemstops, watervallen en lunch bij waterval La Esmeralda. Overnachten bij Don Giovani's hut aan de rivier, met avondeten en aguardiente of bier. Meenemen: sportkleding, zwemkleding, schoenen die nat mogen, dagrugzak, zonnebrand, muggenspray, handdoek, droge kleren en 1 liter water. Bagage gaat rechtstreeks naar de finca. Ontbijt, lunch en diner inbegrepen. Slapen: Finca Don Giovani (11 personen) en Entre Bosques (3 personen).",
  },
  {
    date: "dinsdag 22-09-2026",
    place: "Cocorná",
    plan: "Na het ontbijt rijden de 11 hikers te paard het dal uit, daarna brengt een chiva ze naar Entre Bosques. Halve dag. 's Avonds om 19:00 komt een chef naar de finca voor een driegangen-BBQ, 2 uur, vlees en vegetarisch. In de finca kookt een lokale kookdame: houd de boodschappen simpel en lokaal. Kraanwater in de finca is niet drinkbaar, er staat een waterdispenser. Ontbijt en lunch inbegrepen. Slapen: Entre Bosques.",
  },
  {
    date: "woensdag 23-09-2026",
    place: "Buritaca",
    plan: "Transfer Cocorná → luchthaven Medellín vertrekt 10:30 vanaf Entre Bosques, duurt 2 uur. Binnenlandse vlucht AV8436 Medellín → Santa Marta vertrekt 14:30 en landt 15:45; Lustrumfiesta checkt in en mailt de boarding passes naar de hoofdcontactpersoon. Transfer Santa Marta → Buritaca vertrekt 15:45, duurt 1,5 uur, naar Rio Hostel Buritaca. Het laatste stuk gaat mogelijk achterop een motor, want de weg is onverhard. Pin genoeg geld vóór Buritaca, daar zijn nauwelijks automaten. Geen maaltijden inbegrepen. Slapen: El Rio Hostal.",
  },
  {
    date: "donderdag 24-09-2026",
    place: "Buritaca",
    plan: "Vrije dag. Tubing is optioneel bij te boeken, vraag het in de WhatsApp-groep. 's Avonds is er meestal een feest in het hostel met techno. Geen maaltijden inbegrepen. Slapen: El Rio Hostal.",
  },
  {
    date: "vrijdag 25-09-2026",
    place: "Punta Gallinas (La Guajira)",
    plan: "Transfer Buritaca → Riohacha vertrekt 6:00, duurt 2 uur, naar het kantoor van History Travelers SAS; ontbijt daar op eigen kosten. De 3-daagse 4x4-tour door La Guajira start tussen 8:30 en 9:00. Eerst de Taroa-duinen met een uur sandboarden, dan lokale lunch, daarna uitzichtpunt Casares en de vuurtoren van Punta Gallinas, het noordelijkste punt van Zuid-Amerika, bij zonsondergang. Soms is er een schildpadrelease. 's Avonds diner bij een kampvuur met verhalen over de Wayúu-cultuur. Hoofdbagage blijft achter bij de lokale partner, neem alleen een kleine rugzak voor 3 dagen en 2 nachten. Twee mensen uit de groep rijden zelf: rijbewijs meenemen. Meenemen: 2 tot 3 sets lichte kleding, zwemkleding, wandelschoenen of sandalen, slippers, handdoek, zonnebrand, zonnebril en pet, muggenspray, toiletspullen en medicijnen, een jasje voor 's avonds, powerbank en contant geld. Lunch en diner inbegrepen. Slapen: hostel.",
  },
  {
    date: "zaterdag 26-09-2026",
    place: "Cabo de la Vela",
    plan: "Dag 2 van de 4x4-tour, hele dag. Playa Arcoíris en Pilón de Azúcar, daarna Cabo de la Vela met strand en zwemmen. Kitesurfles is optioneel tegen bijbetaling. Aan het eind van de dag bierproeverij bij Hernando, een lokale brouwer. Ontbijt, lunch en diner inbegrepen. Slapen: hostel.",
  },
  {
    date: "zondag 27-09-2026",
    place: "Palomino",
    plan: "Dag 3 van de 4x4-tour, vertrek na het ontbijt. Via Camarones naar het flamingoreservaat, daarna lokale lunch. De tour eindigt bij Restaurante Los Cocos. Transfer Camarones → Palomino vertrekt 15:30, duurt 1,5 uur, naar Dreamer Palomino. Het laatste stuk is ongeveer 700 meter lopen vanwege wegwerkzaamheden; de chauffeur loopt mee. Ontbijt en lunch inbegrepen. Slapen: Dreamer Palomino.",
  },
  {
    date: "maandag 28-09-2026",
    place: "Palomino",
    plan: "Vrije dag in Palomino. Massages en andere opties via de receptie. Belangrijk: het ontbijt staat morgen om 7:00 klaar vanwege het vroege vertrek, geef vandaag bij het restaurant je voorkeur door. Ontbijt inbegrepen. Slapen: Dreamer Palomino.",
  },
  {
    date: "dinsdag 29-09-2026",
    place: "Tayrona",
    plan: "Transfer Palomino → Tayrona vertrekt 7:30, duurt 1 uur, naar ingang El Zaino. De zelfstandige 2-daagse hike start om 8:30. Verplichte lokale gidsen lopen het eerste stuk mee. Ongeveer 13 km, 4,5 tot 5 uur lopen, 350 tot 450 meter stijging, matig zwaar. Via Cabo San Juan, zwemstop bij La Piscina rond lunchtijd, daarna op eigen gelegenheid naar Playa Brava. 28 tot 34 graden, hoge luchtvochtigheid, weinig bereik onderweg; minstens 2 liter water per persoon, stevige schoenen, zonnebrand, muggenspray en een pet. Diner op Playa Brava tussen 18:00 en 19:00; wees voor zonsondergang binnen, na donker lopen mag niet. Check vandaag uit, de hoofdbagage wordt opgeslagen, maximaal twee tassen per persoon. Ontbijt inbegrepen. Slapen: Hotel Playa Brava Teyumakke, in hangmatten.",
  },
  {
    date: "woensdag 30-09-2026",
    place: "Cartagena",
    plan: "Dag 2 van de Tayrona-hike, vertrek na het ontbijt. Playa Brava → uitgang Calabazo, ongeveer 8 km, 3,5 tot 4 uur, 550 tot 650 meter stijging, matig tot zwaar met steile stukken en boomwortels. Een motortaxi voor een deel van de route kan via de receptie van Playa Brava, niet inbegrepen en ter plekke contant te betalen. Transfer Tayrona → Cartagena vertrekt 11:00 bij Calabazo en duurt 6 uur, met onderweg een korte lunchstop, naar Los Patios Hostel Cartagena. Gemiddeld 33 graden in Cartagena; gouden uur is het mooist vanaf Café del Mar. Geen maaltijden inbegrepen. Slapen: Los Patios Cartagena.",
  },
  {
    date: "donderdag 01-10-2026",
    place: "Cartagena",
    plan: "Privé-catamaran in de baai van Cartagena. Vertrek 14:00 vanaf Sibarita del Mar, duurt 6 uur. De boot heet 'Isabella'. Inbegrepen: een sixpack bier per persoon, water en frisdrank, en later op de middag een BBQ aan boord. Sla zelf extra drank en snacks in. Diner inbegrepen. Slapen: Los Patios Cartagena.",
  },
  {
    date: "vrijdag 02-10-2026",
    place: "Cartagena",
    plan: "Vrije dag in Cartagena: de ommuurde stad, de pleinen, de balkons en Getsemani, dat ook het veiligst is. Let op je spullen. 's Avonds om 19:00 afsluitend diner bij Club de Pesca in Restaurante Fuerte del Pastelillo; alleen de reservering is geregeld, eten en vervoer zijn voor eigen rekening. Check vandaag in voor de vlucht van morgen. Geen maaltijden inbegrepen. Slapen: Los Patios Cartagena.",
  },
  {
    date: "zaterdag 03-10-2026",
    place: "naar huis",
    plan: "Transfer Los Patios → luchthaven Cartagena vertrekt 11:32 en duurt een half uur, naar Rafael Núñez International Airport. Vlucht KL8878 vertrekt om 15:02. De straten van Cartagena zijn smal, de chauffeur staat er 15 minuten van tevoren; vindt hij geen plek, dan kan het nog 10 minuten duren. Bel Lustrumfiesta als je hem niet ziet. Geen maaltijden inbegrepen.",
  },
];

const PRACTICAL: readonly string[] = [
  "De reis is een lustrumreis door Colombia van 19-09-2026 tot en met 03-10-2026, georganiseerd door Lustrumfiesta, met veertien reizigers.",
  "Contact: Katlyn (+57 321 6328156) is de 'Woman on the Ground' en het eerste aanspreekpunt, Silvia (+57 301 1179632) is het tweede. Alles loopt via de WhatsApp-groep, bereikbaar maandag tot en met vrijdag ongeveer 09:00 tot 17:00 lokale tijd, 's avonds en in het weekend stand-by voor spoed. Bij een bus die meer dan 15 minuten te laat is of een reservering die niet klopt: direct bellen via WhatsApp, niet appen.",
  "Simkaart: één per vier personen, met 4,5 GB, onbeperkt bellen en sms'en naar Colombiaanse nummers en onbeperkt WhatsApp. Opwaarderen doe je zelf. Je Nederlandse WhatsApp-nummer blijft werken.",
  "Geld: de peso (COP). In grote steden kun je met creditcard betalen, maar in Cocorná, de koffiestreek, het Tayrona-gebied en op de Caribische eilanden is het contant. Neem Mastercard of Visa, Maestro werkt slecht. Pinlimiet meestal 400.000 COP, bij Banco de Bogotá tot 2.000.000 COP. Wise of Revolut werkt goed.",
  "Fooien: dagguide 3.000 tot 9.000 COP per persoon in de groep, overnight guide 9.000 tot 15.000, villapersoneel 9.000 tot 15.000, chauffeur 3.000 tot 9.000. In restaurants en bars ongeveer 10 procent propina, soms staat die al op de rekening.",
  "Documenten: paspoort minstens zes maanden geldig na terugkomst en met een lege pagina, plus een aantoonbaar vertrekticket. Het Check-Mig formulier moet tussen 72 en 24 uur voor vertrek naar en uit Colombia ingevuld worden, anders mag je niet aan boord. Overstap in de VS vraagt een ESTA, in Canada een eTA.",
  "Gezondheid: gelekoortsvaccinatie wordt sterk aangeraden en is verplicht in de beschermde gebieden, waaronder Tayrona, Los Nevados en de Amazone. Kraanwater is niet drinkbaar, poetsen met kraanwater kan wel. Wc-papier gaat in de prullenbak, niet in de pot. Aai geen straathonden.",
  "Veiligheid: 'no des papaya', maak het niemand makkelijk. Geen opvallende sieraden, waardevolle spullen in een kluisje, 's nachts een Uber in plaats van lopen, en let op je drankje en je spullen in het uitgaansleven.",
  "Bagage op de binnenlandse vlucht: een persoonlijk item, 10 kg handbagage en 23 kg ruimbagage. Powerbanks en batterijen moeten in de handbagage.",
  "Paklijst naast gewone strandvakantiespullen: rugzak en dagrugzak, paspoort, pinpas en creditcard, geel vaccinatieboekje, zorgpas, wereldstekker, opladers, powerbank, speaker, boek of e-reader, camera of GoPro, zaklamp, handdoek, zonnebrand, paracetamol, imodium, ORS, hangslot, EHBO-setje, oordoppen, nekkussen, regenjas of poncho, lange broek en trui, pet of hoed, waterfles en wandelschoenen of stevige sneakers plus slippers.",
  "Kamerverdeling: Masaya Medellin 1x8 en 1x6, Entre Bosques het hele huis met 1x5 en 4x3, El Rio Hostal 1x12 en 1x2, Dreamer Palomino 2x8, Playa Brava Teyumakke 14 hangmatten, Los Patios Cartagena 2x4 en 1x6.",
  "Het programma ligt vast. Tijden kunnen schuiven door weer, verkeer of lokale regels; Lustrumfiesta laat dat via de WhatsApp-groep weten.",
];

function dayLine(day: number, entry: TripDay): string {
  return `Dag ${String(day)} — ${entry.date} — ${entry.place}: ${entry.plan}`;
}

function todayLines(day: number): string[] {
  const entry = ITINERARY[day - 1];
  if (entry === undefined) {
    return [
      `Vandaag is dag ${String(day)}. De reis telt ${String(ITINERARY.length)} dagen en zit er dus op — zeg dat eerlijk en praat verder over wat er geweest is.`,
    ];
  }
  return [
    `VANDAAG is dag ${String(day)} van de reis: ${entry.date}, ${entry.place}.`,
    `Het programma van vandaag: ${entry.plan}`,
  ];
}

export function tripBriefing(day: number): string {
  return [
    ...PRACTICAL,
    ...todayLines(day),
    "Het volledige programma, dag voor dag:",
    ...ITINERARY.map((entry, index) => dayLine(index + 1, entry)),
  ].join("\n");
}
