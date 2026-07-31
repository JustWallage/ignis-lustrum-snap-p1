import { afterEach, describe, expect, it, vi } from "vitest";
import { compressedPhotoForm, compressImage } from "./image";

const ENCODED = new Blob([new Uint8Array([255, 216, 255])], {
  type: "image/jpeg",
});

interface Recorded {
  canvas: { width: number; height: number };
  drawn: { width: number; height: number } | null;
  encoding: { type: string; quality: number } | null;
  closed: boolean;
}

function stubBrowser(
  source: { width: number; height: number },
  options: { context?: boolean; blob?: Blob | null } = {},
): Recorded {
  const recorded: Recorded = {
    canvas: { width: 0, height: 0 },
    drawn: null,
    encoding: null,
    closed: false,
  };

  vi.stubGlobal("createImageBitmap", () =>
    Promise.resolve({
      width: source.width,
      height: source.height,
      close: () => {
        recorded.closed = true;
      },
    }),
  );

  const context = {
    drawImage: (
      _bitmap: unknown,
      _x: number,
      _y: number,
      width: number,
      height: number,
    ) => {
      recorded.drawn = { width, height };
    },
  };

  const canvas = {
    set width(value: number) {
      recorded.canvas.width = value;
    },
    set height(value: number) {
      recorded.canvas.height = value;
    },
    getContext: () => (options.context === false ? null : context),
    toBlob: (
      done: (blob: Blob | null) => void,
      type: string,
      quality: number,
    ) => {
      recorded.encoding = { type, quality };
      done(options.blob === undefined ? ENCODED : options.blob);
    },
  };
  vi.stubGlobal("document", { createElement: () => canvas });

  return recorded;
}

function pngFile(): File {
  return new File([new Uint8Array([137, 80, 78, 71])], "snap.png", {
    type: "image/png",
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("compressImage", () => {
  it("downscales a phone-sized photo to the 1024 px cap, keeping its aspect", async () => {
    const recorded = stubBrowser({ width: 4000, height: 3000 });

    const blob = await compressImage(pngFile());

    expect(recorded.canvas).toEqual({ width: 1024, height: 768 });
    expect(recorded.drawn).toEqual({ width: 1024, height: 768 });
    expect(blob).toBe(ENCODED);
  });

  it("scales the long edge whichever way the photo is turned", async () => {
    const recorded = stubBrowser({ width: 1500, height: 3000 });

    await compressImage(pngFile());

    expect(recorded.canvas).toEqual({ width: 512, height: 1024 });
  });

  it("never upscales a photo that is already small", async () => {
    const recorded = stubBrowser({ width: 800, height: 600 });

    await compressImage(pngFile());

    expect(recorded.canvas).toEqual({ width: 800, height: 600 });
  });

  it("keeps a degenerate aspect ratio at one pixel rather than zero", async () => {
    // 1 * (1024 / 3000) rounds to 0, and a zero-height canvas encodes nothing.
    const recorded = stubBrowser({ width: 3000, height: 1 });

    await compressImage(pngFile());

    expect(recorded.canvas).toEqual({ width: 1024, height: 1 });
  });

  it("re-encodes as lossy JPEG and releases the bitmap", async () => {
    const recorded = stubBrowser({ width: 4000, height: 3000 });

    await compressImage(pngFile());

    expect(recorded.encoding?.type).toBe("image/jpeg");
    expect(recorded.encoding?.quality).toBeGreaterThan(0);
    expect(recorded.encoding?.quality).toBeLessThan(1);
    expect(recorded.closed).toBe(true);
  });

  it("fails loudly when the browser has no 2d canvas", async () => {
    stubBrowser({ width: 800, height: 600 }, { context: false });

    await expect(compressImage(pngFile())).rejects.toThrow(
      /canvas is not supported/i,
    );
  });

  it("fails loudly when the encoder yields nothing", async () => {
    stubBrowser({ width: 800, height: 600 }, { blob: null });

    await expect(compressImage(pngFile())).rejects.toThrow(/could not encode/i);
  });
});

describe("compressedPhotoForm", () => {
  it("posts the downscaled bytes as `photo`, named and typed together", async () => {
    stubBrowser({ width: 4000, height: 3000 });

    const form = await compressedPhotoForm(pngFile(), "bench.jpg");

    const sent = form.get("photo");
    if (!(sent instanceof File)) throw new Error("no photo in the form");
    expect(sent.name).toBe("bench.jpg");
    // Every route this posts to reads `photo` and re-checks the allowlist against
    // this type, so the declared type has to be what was encoded.
    expect(sent.type).toBe("image/jpeg");
    expect(await sent.arrayBuffer()).toEqual(await ENCODED.arrayBuffer());
  });

  it("hands the unreadable file straight back to its caller", async () => {
    stubBrowser({ width: 800, height: 600 }, { blob: null });

    await expect(compressedPhotoForm(pngFile(), "snap.jpg")).rejects.toThrow(
      /could not encode/i,
    );
  });
});
