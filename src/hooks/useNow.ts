import { useEffect, useState } from "react";

export function useNow(everyMs: number): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const read = () => {
      setNow(Date.now());
    };
    read();
    const timer = setInterval(read, everyMs);
    return () => {
      clearInterval(timer);
    };
  }, [everyMs]);

  return now;
}
