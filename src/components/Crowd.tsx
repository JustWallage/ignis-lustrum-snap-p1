import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type CSSProperties,
} from "react";
import type { User } from "@shared/api";
import {
  crowdOf,
  CROWD_FIGURE_W,
  type CrowdMember,
  type CrowdPlayer,
} from "@/game/crowd";
import { playerSprites } from "@/game/player";
import { remoteSprites, whenSpritesSettle } from "@/game/remote-sprites";

/** How much of `.gb-crowd`'s height the back row is lifted by. It has to be MORE than
 * the height a back figure loses to its scale, or somebody standing directly in front
 * covers them completely and a crowd of fourteen reads as a crowd of five. */
const LIFT = 0.4;

function useWorn(url: string | null): HTMLCanvasElement {
  const [, settled] = useReducer((count: number) => count + 1, 0);
  const worn = remoteSprites(url);
  useEffect(() => {
    if (worn !== null) return undefined;
    // ASKED AGAIN here, because a cached sprite can land between that render and this
    // effect: `whenSpritesSettle` would then find an entry already settled, subscribe
    // nobody, and leave the character in the default sprite for the life of the mount.
    if (remoteSprites(url) !== null) {
      settled();
      return undefined;
    }
    return whenSpritesSettle(url, settled);
  }, [url, worn]);
  return (worn ?? playerSprites()).down[0];
}

export function PixelSprite({
  sprite,
  className,
  style,
  testId,
  player,
}: {
  sprite: HTMLCanvasElement;
  className: string;
  style?: CSSProperties | undefined;
  testId: string;
  player?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx === null || ctx === undefined) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, sprite.width, sprite.height);
    ctx.drawImage(sprite, 0, 0);
  }, [sprite]);

  return (
    <canvas
      ref={canvasRef}
      width={sprite.width}
      height={sprite.height}
      className={className}
      style={style}
      data-testid={testId}
      {...(player === undefined ? {} : { "data-player": player })}
    />
  );
}

export function Character({
  who,
  url,
  style,
}: {
  who: string;
  url: string | null;
  style?: CSSProperties;
}) {
  return (
    <PixelSprite
      sprite={useWorn(url)}
      className="gb-character"
      style={style}
      testId="crowd-character"
      player={who}
    />
  );
}

function figureStyle(member: CrowdMember): CSSProperties {
  return {
    left: `${String(member.x * 100)}%`,
    bottom: `${String((1 - member.depth) * LIFT * 100)}%`,
    width: `${String(member.scale * CROWD_FIGURE_W * 100)}%`,
  };
}

export function Crowd({ town, seed }: { town: CrowdPlayer[]; seed: number }) {
  const crowd = useMemo(() => crowdOf(town, seed), [town, seed]);
  if (crowd.length === 0) return null;
  return (
    <div className="gb-crowd">
      {crowd.map((member) => (
        <Character
          key={member.id}
          who={member.name}
          url={member.url}
          style={figureStyle(member)}
        />
      ))}
    </div>
  );
}

export function NamedCharacter({
  who,
  url,
  testId,
}: {
  who: User;
  url: string | null;
  testId: string;
}) {
  return (
    <div className="gb-named">
      <Character who={who.name} url={url} />
      <p className="gb-reveal-name" data-testid={testId}>
        {who.name.toUpperCase()}
      </p>
    </div>
  );
}
