import { useEffect, useState } from "react";
import { NOT_FOLDABLE, native, type DuoState } from "../../modules/duo-layout";

/**
 * The foldable state of this device, kept current. On a device without the module, or any
 * iPhone that isn't foldable, it returns a fixed "not foldable" state and never re-renders.
 */
export function useDuo(): DuoState {
  const [state, setState] = useState<DuoState>(NOT_FOLDABLE);
  useEffect(() => {
    if (!native) return;
    let active = true;
    void native.getState().then((next) => active && setState(next)).catch(() => undefined);
    const subscription = native.addListener("onChange", (next) => active && setState(next));
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return state;
}
