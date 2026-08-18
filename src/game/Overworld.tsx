import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AvatarState, DayResult } from "@shared/api";
import { eventStageKey, isBeastOn, isEventRunning } from "@shared/events";
import { SILENT, type JukeboxState } from "@shared/jukebox";
import { juryForDay, type Jury } from "@shared/juries";
import { NO_VOTE_MULTIPLIER } from "@shared/scoring";
import {
  ARTIST,
  JUKEBOX,
  JURY,
  MAP_H,
  MAP_W,
  NEIGHBOUR,
  SHELF,
  SPAWN,
  stepsThroughDoor,
  stepTarget,
  tileAt,
  TROPHY,
  VOTING,
  type Direction,
  type Point,
} from "@shared/map";
import { NPC_NAME, NPC_SAID_MAX } from "@shared/npc";
import { ArchiveDialog } from "@/components/ArchiveDialog";
import { BallotOverlay } from "@/components/BallotOverlay";
import { EventOverlay } from "@/components/EventOverlay";
import {
  GbDialogue,
  useDialogueChain,
  type DialogueChain,
} from "@/components/GbDialogue";
import { AvatarGallery } from "@/components/AvatarGallery";
import { AvatarSplash } from "@/components/AvatarSplash";
import { GbTextbox } from "@/components/GbTextbox";
import { GbWindow } from "@/components/GbWindow";
import { JukeboxDialog } from "@/components/JukeboxDialog";
import { LoginDialog } from "@/components/LoginDialog";
import { PttBar } from "@/components/PttBar";
import { SayBox } from "@/components/SayBox";
import { SnapDialog } from "@/components/SnapDialog";
import { VoiceLights } from "@/components/VoiceLights";
import { useAuth } from "@/context/AuthContext";
import { useEvent, type EventAction } from "@/context/EventContext";
import type { Standing } from "@/context/WebSocketContext";
import { drawBubble } from "@/game/badge";
import { crowdOf, type CrowdMember } from "@/game/crowd";
import { decorLayer } from "@/game/decor";
import { KEY_DIRS, isCancelKey, isConfirmKey, isSelectKey } from "@/game/keys";
import { MENU_ITEMS, visibleItems, type MenuItemId } from "@/game/menu";
import {
  ARTIST_SPRITE,
  NEIGHBOUR_SPRITE,
  npcSprite,
  PLAYER_H,
  PLAYER_W,
  playerSprites,
  VOTING_SPRITE,
  type SpriteSet,
} from "@/game/player";
import {
  lcdLabel,
  nameLabel,
  remoteGain,
  type RemoteStep,
} from "@/game/presence";
import { remoteSprites } from "@/game/remote-sprites";
import { speechFor, speechOf, type Speech } from "@/game/speech";
import {
  drawSplash,
  shouldSkipSplash,
  START_LABELS,
  startAction,
} from "@/game/splash";
import {
  hasLanded,
  poseAt,
  STEP_MS,
  strideTo,
  type Stride,
} from "@/game/stride";
import {
  animFrame,
  drawTile,
  JUKEBOX_LIT_TILE,
  JUKEBOX_TILE,
  TILE,
  tileAtlas,
} from "@/game/tiles";
import { useAvatarDraw } from "@/hooks/useAvatarDraw";
import { useChampion } from "@/hooks/useChampion";
import { useGameState } from "@/hooks/useGameState";
import { useJukebox, useRecordPlayback } from "@/hooks/useJukebox";
import { useMyAvatar } from "@/hooks/useMyAvatar";
import { useMySubmission } from "@/hooks/useMySubmission";
import { useNpcChat } from "@/hooks/useNpcChat";
import { usePresence } from "@/hooks/usePresence";
import { useSnapUpload } from "@/hooks/useSnapUpload";
import { useTownAvatars } from "@/hooks/useTownAvatars";
import { useVoice, type Voice } from "@/hooks/useVoice";
import { ADMIN_PATH } from "@/lib/admin";
import { noVoteWarning } from "@/lib/ballot";
import { IMAGE_ACCEPT } from "@/lib/image";
import { isCabinetLit } from "@/lib/jukebox";
import { SAY_MY_OWN } from "@/lib/npc-chat";
import { deleteSnap } from "@/lib/photos";
import { installInstructions, promptInstall } from "@/lib/pwa";
import {
  footstepCue,
  isMuted,
  playCue,
  setMuted,
  unlockAudio,
} from "@/lib/sound";

const VIEW_W = MAP_W * TILE;
const VIEW_H = MAP_H * TILE;

type Dialog =
  | { kind: "login"; note?: string }
  | { kind: "view"; id: number }
  | { kind: "talk" }
  | { kind: "menu" }
  | { kind: "signout" }
  | { kind: "note"; pages: readonly string[]; busy?: boolean }
  | { kind: "say" }
  | { kind: "votetalk" }
  | { kind: "vote" }
  | { kind: "archive" }
  | { kind: "artist" }
  | { kind: "wardrobe" }
  | { kind: "avatar-splash"; state: AvatarState }
  | { kind: "trophy" }
  | { kind: "jukebox" }
  | { kind: "chat" }
  | { kind: "chat-say" }
  | { kind: "confirm"; action: HostAction }
  | { kind: "confirm-replace" }
  /** Where a cancelled question puts the reader back: the snap they were looking at, or
   * the archive they opened it from. The viewer itself cannot stay on screen while the
   * question is asked — the dialogue box lives under the modal layer. */
  | { kind: "confirm-delete"; id: number; back: "view" | "archive" };

const SURVIVES_EVENT: Record<Dialog["kind"], boolean> = {
  login: true,
  menu: true,
  signout: true,
  note: true,
  confirm: true,
  view: false,
  talk: false,
  say: false,
  votetalk: false,
  vote: false,
  archive: false,
  artist: false,
  wardrobe: false,
  "avatar-splash": false,
  trophy: false,
  jukebox: false,
  chat: false,
  "chat-say": false,
  "confirm-replace": false,
  "confirm-delete": false,
};

interface Figure {
  img: HTMLCanvasElement;
  x: number;
  y: number;
  label: readonly string[] | null;
}

function drawFigure(ctx: CanvasRenderingContext2D, figure: Figure): void {
  const top = figure.y + TILE - PLAYER_H;
  ctx.drawImage(figure.img, figure.x, top);
  if (figure.label !== null) {
    drawBubble(ctx, figure.label, figure.x + PLAYER_W / 2, top);
  }
}

const MENU_PAGES = [""];

const SIGN_OUT_PAGE =
  "Sign out? Whatever you have already handed in stays handed in.";

const REPLACE_PAGE =
  "Swap today's snap? The one you handed in is gone for good.";

const DELETE_PAGE =
  "Tear this snap up? Its likes, its comments, the votes it got and the jury's verdict all go with it.";

const DELETING_PAGE = "Tearing it up…";

const DELETE_FAILED_PAGE = "The bin would not take it. Try again in a moment.";

const SENDING_PAGE = "Hold still… I'm taking a look at that one.";

const INSTALLING_PAGE = "Asking your browser to keep me…";

const DRAWING_PAGE = "AVATAR ARTIST: Hold very still — this takes a moment…";

const NO_QUOTA_PAGE =
  "AVATAR ARTIST: That is all the ink I have for today. Come back tomorrow.";

const COOLING_PAGE =
  "AVATAR ARTIST: Give me a second to clean the nibs, would you.";

const DRAW_COOLDOWN_MS = 10_000;

const REMOVING_PAGE = "AVATAR ARTIST: Rubbing it out…";

const REMOVED_PAGE =
  "AVATAR ARTIST: Back to your old self. Bring me another picture whenever you like.";

const REMOVE_FAILED_PAGE =
  "AVATAR ARTIST: The rubber would not take. Have another go.";

const VOTING_PAGES = [
  "Pick a top three out of today's snaps, best first. No names until the reveal, and you cannot vote for your own.",
  noVoteWarning(NO_VOTE_MULTIPLIER),
];

const FALLBACK_DAY = 1;

const VOICE_REFUSALS: Record<NonNullable<Voice["refusal"]>, string> = {
  "signed-out": "SIGN IN TO SPEAK · SIGNED-IN FRIENDS HEAR YOU LIVE",
  "no-microphone":
    "NO MICROPHONE · YOUR BROWSER TURNED IT DOWN, AND THE FIX IS IN ITS SETTINGS",
};

type HostAction = EventAction | "spin";

const EVENT_CONFIRM: Record<
  HostAction,
  { page: string; label: string; working: string }
> = {
  start: {
    page: "Start tonight's live event? Every screen drops into the countdown.",
    label: "Start it",
    working: "Getting everyone's attention…",
  },
  abort: {
    page: "Abort the live event? Everyone walks again and the day does not move.",
    label: "Abort it",
    working: "Calling it off…",
  },
  next: {
    page: "Move the podium on? Everyone's screen goes with you.",
    label: "Next place",
    working: "Turning everyone's page…",
  },
  spin: {
    page: "Spin the wheel for tonight's winner? The prize lands, the day turns over and the event is done.",
    label: "Spin it",
    working: "Turning the wheel…",
  },
};

const EVENT_REFUSED =
  "The event would not budge. Check what the world is doing.";

function submittedPages(jury: Jury): string[] {
  return [
    `${jury.name.toUpperCase()}: Today's snap is already in.`,
    `One a day is all I judge — but hand me a better one and I'll forget the first.`,
  ];
}

function confirmChain(
  id: string,
  page: string,
  label: string,
  onPick: () => void,
  onCancel: () => void,
): DialogueChain {
  return {
    id,
    pages: [page],
    choices: [
      { label: "Cancel", onPick: onCancel },
      { label, onPick },
    ],
  };
}

function neighbor(pos: Point, dir: Direction): Point {
  return {
    x: pos.x + (dir === "left" ? -1 : dir === "right" ? 1 : 0),
    y: pos.y + (dir === "up" ? -1 : dir === "down" ? 1 : 0),
  };
}

type Interactable =
  "jury" | "voting" | "artist" | "neighbour" | "shelf" | "trophy" | "jukebox";

function interactableAt(p: Point): Interactable | null {
  if (p.x === JURY.x && p.y === JURY.y) return "jury";
  if (p.x === VOTING.x && p.y === VOTING.y) return "voting";
  if (p.x === ARTIST.x && p.y === ARTIST.y) return "artist";
  if (p.x === NEIGHBOUR.x && p.y === NEIGHBOUR.y) return "neighbour";
  if (p.x === SHELF.x && p.y === SHELF.y) return "shelf";
  if (p.x === TROPHY.x && p.y === TROPHY.y) return "trophy";
  if (p.x === JUKEBOX.x && p.y === JUKEBOX.y) return "jukebox";
  return null;
}

const OPENS: Record<Interactable, Dialog> = {
  jury: { kind: "talk" },
  voting: { kind: "votetalk" },
  artist: { kind: "artist" },
  neighbour: { kind: "chat" },
  shelf: { kind: "archive" },
  trophy: { kind: "trophy" },
  jukebox: { kind: "jukebox" },
};

const ARTIST_PAGES = [
  "AVATAR ARTIST: Hold still! I'll redraw you as a proper trainer.",
  "Hand over any picture — a face, a pet, your dinner — and the machine redraws it as a trainer.",
];

const NO_CHAMPION_PAGE =
  "The plinth is bare. No champion yet — the first one is crowned when a day is revealed.";

function championPages(day: number, champion: DayResult): string[] {
  return [
    `DAY ${String(day)}'S CHAMPION: ${champion.uploader.name.toUpperCase()}, on ${String(Math.round(champion.total))} points.`,
    champion.critique ?? "The jury never got round to writing this one up.",
  ];
}

function promptFor(
  what: Interactable | null,
  jury: Jury,
  signedIn: boolean,
): string | null {
  switch (what) {
    case null:
      return null;
    case "jury":
      return signedIn
        ? `A· TALK TO ${jury.name.toUpperCase()}`
        : "A· SIGN IN TO MEET THE JURY";
    case "voting":
      return signedIn ? "A· RANK TODAY'S SNAPS" : "A· SIGN IN TO VOTE";
    case "artist":
      return signedIn
        ? "A· HAVE YOUR AVATAR DRAWN"
        : "A· SIGN IN FOR AN AVATAR";
    case "neighbour":
      return signedIn
        ? `A· TALK TO ${NPC_NAME.toUpperCase()}`
        : `A· SIGN IN TO TALK TO ${NPC_NAME.toUpperCase()}`;
    case "shelf":
      return signedIn
        ? "A· READ THE ARCHIVE"
        : "A· SIGN IN TO READ THE ARCHIVE";
    case "trophy":
      return signedIn
        ? "A· LOOK AT THE TROPHY"
        : "A· SIGN IN TO SEE THE CHAMPION";
    case "jukebox":
      return signedIn ? "A· PUT A RECORD ON" : "A· SIGN IN TO PUT A RECORD ON";
  }
}

export function Overworld() {
  const { user, isAdmin, logout } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const posRef = useRef({ x: SPAWN.x, y: SPAWN.y });
  const stepRef = useRef<Stride | null>(null);
  const facingRef = useRef<Direction>("down");
  const heldRef = useRef<Direction[]>([]);
  const pendingRef = useRef<Direction | null>(null);
  const bumpRef = useRef(0);
  const dialogRef = useRef<Dialog | null>(null);
  const juryRef = useRef<Jury>(juryForDay(FALLBACK_DAY));
  const splashRef = useRef(true);
  const submissionsRef = useRef<number | null>(null);
  const eventRef = useRef(false);
  const speechRef = useRef<Speech | null>(null);
  const announceRef = useRef<(standing: Standing) => void>(() => undefined);
  const avatarRef = useRef<SpriteSet | null>(null);
  const crowdRef = useRef<CrowdMember[]>([]);
  const crowdSeedRef = useRef(0);
  const drewAtRef = useRef(0);
  const jukeboxRef = useRef<JukeboxState>(SILENT);

  const [tile, setTile] = useState({ x: SPAWN.x, y: SPAWN.y });
  const [facing, setFacing] = useState<Direction>("down");
  const [openDialog, setDialog] = useState<Dialog | null>(null);
  const [splash, setSplash] = useState(true);
  const [muted, showMuted] = useState(isMuted);

  const { event, run: runEventAction, spin: spinWheel } = useEvent();
  const [done, setDone] = useState(false);
  const running = isEventRunning(event);
  const inEvent = running && !done;

  const dialog =
    openDialog !== null && inEvent && !SURVIVES_EVENT[openDialog.kind]
      ? null
      : openDialog;

  const gameState = useGameState();
  const hearStep = useCallback((step: RemoteStep) => {
    const gain = remoteGain(posRef.current, step.to);
    if (step.door) playCue("door", { gain });
    playCue(footstepCue(tileAt(step.to.x, step.to.y)), {
      gain,
      walker: "remote",
    });
  }, []);
  const { roster, names: company, announce, say } = usePresence(hearStep);
  const voice = useVoice(user !== null);
  const jury = juryForDay(gameState?.day ?? FALLBACK_DAY);
  const { mine, refresh: refreshMine } = useMySubmission(
    user?.id ?? null,
    gameState?.day,
  );
  const submitted = mine?.photo ?? null;
  const {
    sprites: avatar,
    quota,
    discard: discardAvatar,
    refresh: refreshAvatar,
  } = useMyAvatar(user?.id ?? null);
  const champion = useChampion(gameState?.day);
  const town = useTownAvatars();
  const chat = useNpcChat(
    dialog?.kind === "chat" || dialog?.kind === "chat-say",
  );
  const jukebox = useJukebox();
  useRecordPlayback(jukebox, muted);

  // Assigned during render on purpose: the keydown handler and the rAF loop read the
  // refs, and they must be fresh the moment the new frame paints.
  juryRef.current = jury;
  splashRef.current = splash;
  submissionsRef.current = gameState?.submissionCount ?? null;
  eventRef.current = inEvent;
  announceRef.current = announce;
  avatarRef.current = avatar;
  jukeboxRef.current = jukebox;

  useEffect(() => {
    if (user === null) return;
    announce({
      x: posRef.current.x,
      y: posRef.current.y,
      facing: facingRef.current,
    });
  }, [user, announce]);

  // Dismissing the splash is the app's GUARANTEED user gesture, so it is the one place
  // the AudioContext is created. Asking for the chime on the same tick is safe:
  // `playCue` waits for the context to be running.
  const dismissSplash = useCallback(() => {
    unlockAudio();
    playCue("start");
    setSplash(false);
  }, []);

  useEffect(() => {
    if (shouldSkipSplash(gameState)) setSplash(false);
  }, [gameState]);

  // A seed per SHOWING, held: the roster below revalidates on every content event the
  // socket delivers, and seeding off that re-shuffles a title screen nobody touched
  // because somebody else left a comment.
  useEffect(() => {
    if (splash) crowdSeedRef.current = Date.now();
  }, [splash]);
  useEffect(() => {
    crowdRef.current = splash ? crowdOf(town, crowdSeedRef.current) : [];
  }, [splash, town]);

  useEffect(() => {
    setDone(false);
  }, [event?.phase]);

  // The derived `dialog` above only HIDES a box the event does not carry: the state has
  // to go with it, or the conversation the countdown interrupted comes back on the map
  // the moment this screen presses Done.
  const stage = eventStageKey(event);
  useEffect(() => {
    if (stage === null) return;
    setDialog((open) =>
      open === null || SURVIVES_EVENT[open.kind] ? open : null,
    );
  }, [stage]);

  useEffect(() => {
    dialogRef.current = dialog;
    if (dialog !== null) {
      heldRef.current = [];
      pendingRef.current = null;
    }
  }, [dialog]);

  const pushHeld = useCallback((dir: Direction) => {
    heldRef.current = [...heldRef.current.filter((d) => d !== dir), dir];
    pendingRef.current = dir;
  }, []);
  const releaseHeld = useCallback((dir: Direction) => {
    heldRef.current = heldRef.current.filter((d) => d !== dir);
  }, []);

  const interact = useCallback(() => {
    if (eventRef.current) return;
    const what = interactableAt(neighbor(posRef.current, facingRef.current));
    if (what === null) return;
    if (user === null) {
      setDialog({
        kind: "login",
        note: "Snaps are for signed-in friends only.",
      });
      return;
    }
    setDialog(OPENS[what]);
  }, [user]);

  const closeDialog = useCallback(() => {
    setDialog(null);
  }, []);

  const {
    inputRef: snapInputRef,
    open: openSnapPicker,
    picked: snapPicked,
  } = useSnapUpload({
    onSending: useCallback(() => {
      setDialog({ kind: "note", pages: [SENDING_PAGE], busy: true });
    }, []),
    onSent: useCallback(
      (id: number) => {
        void refreshMine();
        setDialog({ kind: "view", id });
      },
      [refreshMine],
    ),
    onFailed: useCallback((message: string) => {
      setDialog({ kind: "note", pages: [message] });
    }, []),
  });

  const {
    inputRef: avatarInputRef,
    open: openAvatarPicker,
    picked: avatarPicked,
  } = useAvatarDraw({
    onDrawing: useCallback(() => {
      drewAtRef.current = Date.now();
      setDialog({ kind: "note", pages: [DRAWING_PAGE], busy: true });
    }, []),
    onDrawn: useCallback((state: AvatarState) => {
      setDialog({ kind: "avatar-splash", state });
    }, []),
    onFailed: useCallback((message: string) => {
      setDialog({ kind: "note", pages: [message] });
    }, []),
  });

  // Both viewers ask; neither deletes. A cancel lands back in the archive rather than out
  // on the map — at its default filters, since the question unmounts it.
  const askDeleteFromSnap = useCallback((id: number) => {
    setDialog({ kind: "confirm-delete", id, back: "view" });
  }, []);

  const askDeleteFromArchive = useCallback((id: number) => {
    setDialog({ kind: "confirm-delete", id, back: "archive" });
  }, []);

  const tearUpSnap = useCallback(
    (id: number, back: "view" | "archive") => {
      void (async () => {
        setDialog({ kind: "note", pages: [DELETING_PAGE], busy: true });
        try {
          await deleteSnap(id);
          // AWAITED before the screen comes back, or the very next A on the jury's tile
          // reopens the conversation this snap was still in and offers to show it.
          await refreshMine();
          setDialog(back === "archive" ? { kind: "archive" } : null);
        } catch (cause: unknown) {
          setDialog({
            kind: "note",
            pages: [
              cause instanceof Error ? cause.message : DELETE_FAILED_PAGE,
            ],
          });
        }
      })();
    },
    [refreshMine],
  );

  const speak = useCallback(() => {
    if (eventRef.current) return;
    if (user === null) return;
    setDialog({ kind: "say" });
  }, [user]);

  const onSay = useCallback(
    (text: string) => {
      say(text);
      speechRef.current = speechOf(text, performance.now());
    },
    [say],
  );

  const openMenu = useCallback(() => {
    setDialog({ kind: "menu" });
  }, []);

  const closeAvatar = useCallback(() => {
    refreshAvatar();
    setDialog(null);
  }, [refreshAvatar]);

  const takeAvatarOff = useCallback(() => {
    void (async () => {
      setDialog({ kind: "note", pages: [REMOVING_PAGE], busy: true });
      try {
        await discardAvatar();
        setDialog({ kind: "note", pages: [REMOVED_PAGE] });
      } catch (cause: unknown) {
        setDialog({
          kind: "note",
          pages: [cause instanceof Error ? cause.message : REMOVE_FAILED_PAGE],
        });
      }
    })();
  }, [discardAvatar]);

  const showSplash = useCallback(() => {
    setDialog(null);
    setSplash(true);
  }, []);

  const toggleMuted = useCallback(() => {
    showMuted((wasMuted) => {
      setMuted(!wasMuted);
      return !wasMuted;
    });
  }, []);

  const dismissEvent = useCallback(() => {
    setDone(true);
  }, []);

  const showResults = useCallback(() => {
    setDone(true);
    setDialog({ kind: "archive" });
  }, []);

  const askHostNext = useCallback(() => {
    setDialog({ kind: "confirm", action: "next" });
  }, []);

  const runEvent = useCallback(
    (action: HostAction) => {
      setDialog({
        kind: "note",
        pages: [EVENT_CONFIRM[action].working],
        busy: true,
      });
      void (
        action === "spin"
          ? spinWheel()
          : runEventAction(action).then(() => null)
      )
        .then((refusal) => {
          if (refusal === null) closeDialog();
          else setDialog({ kind: "note", pages: [refusal] });
        })
        .catch(() => {
          setDialog({ kind: "note", pages: [EVENT_REFUSED] });
        });
    },
    [closeDialog, runEventAction, spinWheel],
  );

  const menuHandlers = useMemo<Record<MenuItemId, () => void>>(
    () => ({
      install: () => {
        void (async () => {
          setDialog({ kind: "note", pages: [INSTALLING_PAGE], busy: true });
          const prompted = await promptInstall();
          setDialog(
            prompted
              ? null
              : {
                  kind: "note",
                  pages: installInstructions(
                    navigator.userAgent,
                    navigator.maxTouchPoints,
                  ),
                },
          );
        })();
      },
      sound: toggleMuted,
      auth: () => {
        setDialog(user === null ? { kind: "login" } : { kind: "signout" });
      },
      "admin-console": () => {
        window.location.assign(ADMIN_PATH);
      },
      eventStart: () => {
        setDialog({ kind: "confirm", action: "start" });
      },
      eventSpin: () => {
        setDialog({ kind: "confirm", action: "spin" });
      },
      eventAbort: () => {
        setDialog({ kind: "confirm", action: "abort" });
      },
    }),
    [toggleMuted, user],
  );

  const chain = useMemo<DialogueChain | null>(() => {
    const cancel = { label: "Cancel", onPick: closeDialog };
    switch (dialog?.kind) {
      case "talk":
        if (submitted === null) {
          return {
            id: "talk",
            pages: jury.dialogue,
            choices: [
              {
                label: "Upload photo",
                onPick: () => {
                  openSnapPicker(false);
                },
              },
              cancel,
            ],
          };
        }
        return {
          id: "talk-submitted",
          pages: submittedPages(jury),
          choices: [
            {
              label: "Replace photo",
              onPick: () => {
                setDialog({ kind: "confirm-replace" });
              },
            },
            {
              label: "See my snap",
              onPick: () => {
                setDialog({ kind: "view", id: submitted.id });
              },
            },
            cancel,
          ],
        };
      case "artist":
        return {
          id: "artist",
          pages: ARTIST_PAGES,
          choices: [
            {
              label: "Draw me",
              // Inside this very press: a deferred `click()` loses the user gesture and
              // Safari then opens nothing. Which is why both refusals are decided HERE,
              // synchronously.
              onPick: () => {
                if (quota !== null && quota.remaining === 0) {
                  setDialog({ kind: "note", pages: [NO_QUOTA_PAGE] });
                  return;
                }
                if (Date.now() - drewAtRef.current < DRAW_COOLDOWN_MS) {
                  setDialog({ kind: "note", pages: [COOLING_PAGE] });
                  return;
                }
                openAvatarPicker();
              },
            },
            {
              label: "Wear an old one",
              onPick: () => {
                setDialog({ kind: "wardrobe" });
              },
            },
            ...(quota?.avatar === undefined || quota.avatar === null
              ? []
              : [{ label: "Take it off", onPick: takeAvatarOff }]),
            cancel,
          ],
        };
      case "trophy":
        return {
          id: `trophy:${String(champion?.result.photoId ?? 0)}`,
          pages:
            champion === null
              ? [NO_CHAMPION_PAGE]
              : championPages(champion.day, champion.result),
          choices:
            champion === null
              ? []
              : [
                  {
                    label: "See the snap",
                    onPick: () => {
                      setDialog({ kind: "view", id: champion.result.photoId });
                    },
                  },
                  cancel,
                ],
        };
      case "chat":
        return {
          id: chat.id,
          pages: chat.pages,
          choices: chat.pending
            ? []
            : [
                ...chat.options.map((option) => ({
                  label: option,
                  onPick:
                    option === SAY_MY_OWN
                      ? () => {
                          setDialog({ kind: "chat-say" });
                        }
                      : () => {
                          chat.send(option);
                        },
                })),
                { label: "Goodbye", onPick: closeDialog },
              ],
        };
      case "votetalk":
        return {
          id: "votetalk",
          pages: VOTING_PAGES,
          choices: [
            {
              label: "View photos",
              onPick: () => {
                setDialog({ kind: "vote" });
              },
            },
            cancel,
          ],
        };
      case "menu":
        return {
          id: "menu",
          pages: MENU_PAGES,
          choices: visibleItems(MENU_ITEMS, {
            isAdmin,
            muted,
            signedIn: user !== null,
            // The REAL `running`, not the dismissed flag: a player who pressed Done
            // has not ended anybody's event, so an admin is still offered Abort.
            inEvent: running,
            isHost: user !== null && event?.hostUserId === user.id,
            wheelUnspun:
              event?.phase === "wheel" &&
              event.prizeIndex === null &&
              !isBeastOn(event, Date.now()),
          }).map((item) => ({
            label: item.label,
            onPick: menuHandlers[item.id],
          })),
        };
      case "signout":
        return confirmChain(
          "signout",
          SIGN_OUT_PAGE,
          "Sign out",
          () => {
            void logout();
            closeDialog();
          },
          closeDialog,
        );
      case "confirm-replace":
        return confirmChain(
          "confirm-replace",
          REPLACE_PAGE,
          "Replace it",
          () => {
            openSnapPicker(true);
          },
          closeDialog,
        );
      case "confirm-delete": {
        const { id, back } = dialog;
        return confirmChain(
          `confirm-delete:${id}`,
          DELETE_PAGE,
          "Delete it",
          () => {
            tearUpSnap(id, back);
          },
          () => {
            setDialog(
              back === "archive" ? { kind: "archive" } : { kind: "view", id },
            );
          },
        );
      }
      case "confirm": {
        const { action } = dialog;
        const { page, label } = EVENT_CONFIRM[action];
        return confirmChain(
          `confirm-${action}`,
          page,
          label,
          () => {
            runEvent(action);
          },
          closeDialog,
        );
      }
      case "note":
        return {
          id: `note:${dialog.pages.join("|")}`,
          pages: dialog.pages,
          choices: [],
          busy: dialog.busy ?? false,
        };
      default:
        return null;
    }
  }, [
    champion,
    chat,
    closeDialog,
    dialog,
    event,
    isAdmin,
    jury,
    logout,
    menuHandlers,
    muted,
    openAvatarPicker,
    openSnapPicker,
    quota,
    runEvent,
    takeAvatarOff,
    tearUpSnap,
    running,
    submitted,
    user,
  ]);
  const dialogue = useDialogueChain(chain, closeDialog);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (splashRef.current) {
        if (isConfirmKey(event.key)) {
          event.preventDefault();
          dismissSplash();
        }
        return;
      }
      if (dialogRef.current !== null) return;
      const dir = KEY_DIRS[event.key];
      if (dir !== undefined) {
        event.preventDefault();
        pushHeld(dir);
        return;
      }
      if (isConfirmKey(event.key)) {
        event.preventDefault();
        interact();
        return;
      }
      if (isCancelKey(event.key)) {
        event.preventDefault();
        speak();
        return;
      }
      if (isSelectKey(event.key)) {
        event.preventDefault();
        openMenu();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const dir = KEY_DIRS[event.key];
      if (dir !== undefined) releaseHeld(dir);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [dismissSplash, interact, openMenu, pushHeld, releaseHeld, speak]);

  const advance = useCallback((now: number) => {
    const step = stepRef.current;
    if (step !== null && hasLanded(step, now)) {
      stepRef.current = null;
      const { x, y } = posRef.current;
      playCue(footstepCue(tileAt(x, y)));
      announceRef.current({ x, y, facing: facingRef.current });
    }
    if (stepRef.current !== null || dialogRef.current !== null) return;
    // A tap made while the pad is not the player's is DROPPED rather than queued:
    // banking one across a live event made the player lurch a tile the instant the wheel
    // gave the world back. A key still physically HELD is left alone.
    if (splashRef.current || eventRef.current) {
      pendingRef.current = null;
      return;
    }
    const dir =
      pendingRef.current ?? heldRef.current[heldRef.current.length - 1];
    pendingRef.current = null;
    if (dir === undefined) return;
    if (facingRef.current !== dir) {
      facingRef.current = dir;
      setFacing(dir);
    }
    const pos = posRef.current;
    const next = neighbor(pos, dir);
    const dest = stepTarget(pos, next);
    if (dest === null) {
      if (now - bumpRef.current >= STEP_MS) {
        bumpRef.current = now;
        playCue("bump");
      }
      return;
    }
    if (stepsThroughDoor(pos, next)) playCue("door");
    stepRef.current = strideTo(pos, dest, now);
    posRef.current = dest;
    setTile(dest);
  }, []);

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, now: number) => {
      if (splashRef.current) {
        drawSplash(ctx, now, crowdRef.current);
        return;
      }
      const local = poseAt(posRef.current, stepRef.current, now);

      const frame = animFrame(now);
      const atlas = tileAtlas(frame);
      // `Date.now()`, not this loop's `now`, which is `performance.now()`: a record's end is
      // an absolute epoch-ms target.
      const lit = isCabinetLit(jukeboxRef.current, Date.now());
      for (let ty = 0; ty < MAP_H; ty++) {
        for (let tx = 0; tx < MAP_W; tx++) {
          const glyph = tileAt(tx, ty);
          drawTile(
            ctx,
            atlas,
            lit && glyph === JUKEBOX_TILE ? JUKEBOX_LIT_TILE : glyph,
            tx,
            ty,
          );
        }
      }
      ctx.drawImage(decorLayer(juryRef.current.decor, frame), 0, 0);

      // Painter's order: lower on the screen is drawn on top. The sort is stable, and
      // the local player is NOT in it — being last in a `y` sort only wins a shared
      // row, and with fourteen people out anybody standing lower covered you, name
      // bubble and all. One exception for one sprite: everybody else keeps the order.
      const centered = (px: number) => px + (TILE - PLAYER_W) / 2;
      const townsfolk = [
        {
          img: npcSprite(juryRef.current.sprite),
          x: centered(JURY.x * TILE),
          y: JURY.y * TILE,
          label: null,
        },
        {
          img: npcSprite(VOTING_SPRITE),
          x: centered(VOTING.x * TILE),
          y: VOTING.y * TILE,
          label: null,
        },
        {
          img: npcSprite(ARTIST_SPRITE),
          x: centered(ARTIST.x * TILE),
          y: ARTIST.y * TILE,
          label: null,
        },
        {
          img: npcSprite(NEIGHBOUR_SPRITE),
          x: centered(NEIGHBOUR.x * TILE),
          y: NEIGHBOUR.y * TILE,
          label: null,
        },
        ...[...roster.current.values()].map((friend) => {
          const pose = poseAt(friend, friend.stride, now);
          return {
            img: (remoteSprites(friend.sprite) ?? playerSprites())[
              friend.facing
            ][pose.walking ? 1 : 0],
            x: centered(pose.px),
            y: pose.py,
            // Expiry is this comparison and nothing else: no timer, no retraction.
            label: speechFor(friend.speech, now) ?? [nameLabel(friend.name)],
          };
        }),
      ].sort((a, b) => a.y - b.y);
      for (const person of townsfolk) drawFigure(ctx, person);

      const submissions = submissionsRef.current;
      if (submissions !== null) {
        drawBubble(
          ctx,
          [String(submissions)],
          VOTING.x * TILE + TILE / 2,
          VOTING.y * TILE + TILE - PLAYER_H,
        );
      }

      drawFigure(ctx, {
        // The local player's own sprite comes off `useMyAvatar`, not the roster: the
        // server does not fan a sprite change back to the socket that caused it.
        img: (avatarRef.current ?? playerSprites())[facingRef.current][
          local.walking ? 1 : 0
        ],
        x: centered(local.px),
        y: local.py,
        label: speechFor(speechRef.current, now),
      });
    },
    [roster],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;
    ctx.imageSmoothingEnabled = false;
    let raf = 0;
    const tick = (now: number) => {
      advance(now);
      draw(ctx, now);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [advance, draw]);

  const start = startAction(splash, gameState);
  const prompt =
    (inEvent
      ? null
      : promptFor(
          interactableAt(neighbor(tile, facing)),
          jury,
          user !== null,
        )) ?? (voice.refusal === null ? null : VOICE_REFUSALS[voice.refusal]);
  // ONE condition, because two of them drift: the badge it displaces reads the same
  // boolean.
  const menuFace =
    splash || inEvent || dialog?.kind !== "menu"
      ? null
      : (quota?.avatar?.url ?? null);

  return (
    <div className="gb-stage">
      <div className="gb-shell">
        <div className="gb-topline" />
        <div className="gb-bezel">
          <p className="gb-bezel-caption">DOT MATRIX WITH STEREO SOUND</p>
          <div className="gb-bezel-inner">
            <div className="gb-battery">
              <span className="gb-voice-power">
                <span className="gb-led" data-lit={user !== null} />
                <span className="gb-battery-text">
                  {user === null ? (
                    "BATTERY"
                  ) : (
                    <span data-testid="player-name">{user.name}</span>
                  )}
                </span>
              </span>
            </div>
            <div className="gb-lcd-frame">
              <canvas
                ref={canvasRef}
                width={VIEW_W}
                height={VIEW_H}
                role="img"
                aria-label={
                  splash
                    ? "Title screen"
                    : inEvent
                      ? "Live event"
                      : lcdLabel(company)
                }
                className="gb-lcd"
              />
              {!splash && !inEvent && gameState !== undefined && (
                <>
                  {/* The day's theme lives on the LCD all day, not just inside
                      the jury's dialogue — you should never have to walk over
                      and ask what you are shooting. It steps aside for the
                      avatar, which wants the same corner. */}
                  <p
                    className={`gb-badge is-theme${menuFace === null ? "" : " is-nudged"}`}
                    data-testid="game-theme"
                  >
                    {jury.theme.toUpperCase()}
                  </p>
                  <p className="gb-badge is-day" data-testid="game-day">
                    DAY {gameState.day}
                  </p>
                </>
              )}
              {/* The picture the artist drew, not the sprite sheet keyed out for the
                  walk loop — and a DOM overlay, because the canvas belongs to that
                  loop. */}
              {menuFace !== null && (
                <img
                  src={menuFace}
                  alt="Your avatar"
                  data-testid="lcd-avatar"
                  className="gb-badge is-avatar"
                />
              )}
              {/* Over the map, under the dialogue box: the menu has to stay
                  openable during an event, because "Abort event" lives in it —
                  and so does the host's confirmation, which the overlay raises
                  rather than answers. Gone once this player has pressed Done. */}
              {!splash && event !== undefined && !done && (
                <EventOverlay
                  event={event}
                  town={town}
                  onHostNext={askHostNext}
                  onDone={dismissEvent}
                  onResults={showResults}
                />
              )}
              {/* One slot at the bottom of the LCD, four things that can be
                  in it: the message field, an open dialogue, the hint for
                  whatever the player is standing in front of, or the bar's
                  refusal — the one of the four an event does not displace. */}
              {splash ? null : dialog?.kind === "say" ? (
                <SayBox onSay={onSay} onClose={closeDialog} />
              ) : dialog?.kind === "chat-say" ? (
                <SayBox
                  onSay={chat.send}
                  maxLength={NPC_SAID_MAX}
                  onClose={() => {
                    setDialog({ kind: "chat" });
                  }}
                />
              ) : dialogue === null ? (
                prompt !== null && <GbTextbox>{prompt}</GbTextbox>
              ) : (
                <GbDialogue view={dialogue} />
              )}
            </div>
          </div>
          <span
            className="gb-pos"
            data-testid="player-pos"
            data-x={tile.x}
            data-y={tile.y}
          >
            {tile.x}·{tile.y}
          </span>
        </div>
        <p className="gb-brand">
          IGNIS <span>SNAPS</span>
          <i>™</i>
        </p>
        <div className="gb-controls">
          <DPad
            onPress={(dir) => {
              if (splash) return;
              if (dialogue === null) pushHeld(dir);
              else if (dir === "up") dialogue.move(-1);
              else if (dir === "down") dialogue.move(1);
            }}
            onRelease={releaseHeld}
          />
          <div className="gb-ab">
            <div className="gb-ab-btn">
              <button
                type="button"
                aria-label="B — cancel"
                // CANCEL first and always: B only reaches for the message field with
                // nothing to back out of. The other order leaves the shell with no way
                // to close a dialogue.
                onClick={
                  dialogue !== null
                    ? dialogue.pressB
                    : dialog !== null
                      ? closeDialog
                      : speak
                }
              />
              <span>B</span>
            </div>
            <div className="gb-ab-btn">
              <button
                type="button"
                aria-label="A — interact"
                data-testid="a-button"
                onClick={
                  splash
                    ? dismissSplash
                    : dialogue === null
                      ? interact
                      : dialogue.pressA
                }
              />
              <span>A</span>
            </div>
          </div>
        </div>
        <div className="gb-bottom">
          <div className="gb-pills">
            <div className="gb-pill">
              <button
                type="button"
                className="gb-pill-cap"
                aria-label="Select — menu"
                data-testid="select-button"
                // The splash owns every button and a dialogue already has the pad and
                // A, so SELECT only opens the menu from the plain overworld. NOT
                // during an event: it is the only way to reach Abort.
                disabled={splash || dialog !== null}
                onClick={openMenu}
              />
              <span>SELECT</span>
            </div>
            <div className="gb-pill">
              <button
                type="button"
                className="gb-pill-cap"
                aria-label={START_LABELS[start]}
                data-testid="start-button"
                disabled={start === "none"}
                onClick={start === "begin" ? dismissSplash : showSplash}
              />
              <span>START</span>
            </div>
          </div>
          <div className="gb-voice-stack">
            <VoiceLights channel={voice.channel} />
            <PttBar voice={voice} />
          </div>
        </div>
      </div>

      {dialog?.kind === "login" && (
        <LoginDialog
          {...(dialog.note !== undefined ? { note: dialog.note } : {})}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === "view" && (
        <SnapDialog
          id={dialog.id}
          onDelete={askDeleteFromSnap}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === "vote" && <BallotOverlay onClose={closeDialog} />}
      {dialog?.kind === "jukebox" && (
        <JukeboxDialog jukebox={jukebox} onClose={closeDialog} />
      )}
      {dialog?.kind === "archive" && (
        <ArchiveDialog
          onDelete={askDeleteFromArchive}
          onWorn={refreshAvatar}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === "wardrobe" && (
        <GbWindow title="Your avatars" onClose={closeDialog}>
          <AvatarGallery mineOnly onWorn={refreshAvatar} />
        </GbWindow>
      )}
      {dialog?.kind === "avatar-splash" && (
        <AvatarSplash
          state={dialog.state}
          onDiscard={takeAvatarOff}
          onClose={closeAvatar}
        />
      )}
      {/* The two cameras in the app, both always mounted and never seen: a picker
          is opened by `click()` from inside the choice's own press, and a hidden
          input is the only file control a browser lets you do that with. Neither
          shows a preview — the jury's snap goes straight in, and the artist's
          photo is looked at by the editor the pick opens. */}
      <input
        ref={snapInputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        data-testid="snap-file"
        className="hidden"
        onChange={snapPicked}
      />
      <input
        ref={avatarInputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        data-testid="avatar-file"
        className="hidden"
        onChange={avatarPicked}
      />
    </div>
  );
}

function DPad({
  onPress,
  onRelease,
}: {
  onPress: (dir: Direction) => void;
  onRelease: (dir: Direction) => void;
}) {
  const pad = (dir: Direction, area: string) => (
    <button
      type="button"
      className="gb-dpad-key"
      style={{ gridArea: area }}
      aria-label={`Walk ${dir}`}
      data-dir={dir}
      onPointerDown={(event) => {
        event.preventDefault();
        onPress(dir);
      }}
      onPointerUp={() => {
        onRelease(dir);
      }}
      onPointerLeave={() => {
        onRelease(dir);
      }}
      onPointerCancel={() => {
        onRelease(dir);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
      }}
    />
  );
  return (
    <div className="gb-dpad">
      {pad("up", "up")}
      {pad("left", "left")}
      {pad("right", "right")}
      {pad("down", "down")}
      <span className="gb-dpad-center" aria-hidden="true" />
    </div>
  );
}
