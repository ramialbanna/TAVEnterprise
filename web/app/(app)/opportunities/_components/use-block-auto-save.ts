"use client";

import { useCallback, useEffect, useRef, type FocusEvent, type RefObject } from "react";

type UseBlockAutoSaveOptions = {
  blockRef: RefObject<HTMLElement | null>;
  isDirty: boolean;
  canSave: boolean;
  pending: boolean;
  onSave: () => void;
  debounceMs?: number;
};

/**
 * Persists block edits when focus leaves the block container (item 32).
 * Focus moving between fields inside the same block does not trigger save.
 */
export function useBlockAutoSave({
  blockRef,
  isDirty,
  canSave,
  pending,
  onSave,
  debounceMs = 300,
}: UseBlockAutoSaveOptions) {
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      onSave();
    }, debounceMs);
  }, [debounceMs, onSave]);

  const handleBlur = useCallback(
    (event: FocusEvent<HTMLElement>) => {
      if (!canSave || pending || !isDirty) return;

      const container = blockRef.current;
      const nextTarget = event.relatedTarget as Node | null;

      if (container && nextTarget && container.contains(nextTarget)) return;

      scheduleSave();
    },
    [blockRef, canSave, pending, isDirty, scheduleSave],
  );

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  return { handleBlur };
}
