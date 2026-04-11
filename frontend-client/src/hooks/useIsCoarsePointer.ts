import { useEffect, useState } from "react";

export function useIsCoarsePointer(): boolean {
  const [isCoarse, setIsCoarse] = useState(false);

  useEffect(() => {
    const media = globalThis.matchMedia("(pointer: coarse)");
    const update = () => setIsCoarse(media.matches);
    update();

    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return isCoarse;
}
