import { useCallback, useState } from "react";

export function useOpsWrite(path: string, mutate: () => void) {
  const [busy, setBusy] = useState(false);

  const write = useCallback(
    async (init: RequestInit, to = path) => {
      setBusy(true);
      try {
        await fetch(to, init);
        mutate();
      } finally {
        setBusy(false);
      }
    },
    [mutate, path],
  );

  return { busy, write };
}
