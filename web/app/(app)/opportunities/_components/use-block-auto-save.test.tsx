import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import { useBlockAutoSave } from "./use-block-auto-save";

function TestBlock({
  isDirty,
  canSave,
  pending,
  onSave,
}: {
  isDirty: boolean;
  canSave: boolean;
  pending: boolean;
  onSave: () => void;
}) {
  const blockRef = createRef<HTMLDivElement>();
  const { handleBlur } = useBlockAutoSave({
    blockRef,
    isDirty,
    canSave,
    pending,
    onSave,
    debounceMs: 50,
  });

  return (
    <div>
      <div ref={blockRef} onBlur={handleBlur}>
        <label htmlFor="field-a">Field A</label>
        <input id="field-a" defaultValue="a" />
        <label htmlFor="field-b">Field B</label>
        <input id="field-b" defaultValue="b" />
      </div>
      <button type="button">Outside</button>
    </div>
  );
}

describe("useBlockAutoSave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not save when focus moves between fields inside the block", async () => {
    const onSave = vi.fn();
    render(<TestBlock isDirty canSave pending={false} onSave={onSave} />);

    fireEvent.blur(screen.getByLabelText("Field A"), {
      relatedTarget: screen.getByLabelText("Field B"),
    });

    await vi.advanceTimersByTimeAsync(100);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("saves when focus leaves the block and the block is dirty", async () => {
    const onSave = vi.fn();
    render(<TestBlock isDirty canSave pending={false} onSave={onSave} />);

    fireEvent.blur(screen.getByLabelText("Field A"), {
      relatedTarget: screen.getByRole("button", { name: "Outside" }),
    });

    await vi.advanceTimersByTimeAsync(100);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("does not save when the block is not dirty", async () => {
    const onSave = vi.fn();
    render(<TestBlock isDirty={false} canSave pending={false} onSave={onSave} />);

    fireEvent.blur(screen.getByLabelText("Field A"), {
      relatedTarget: screen.getByRole("button", { name: "Outside" }),
    });

    await vi.advanceTimersByTimeAsync(100);
    expect(onSave).not.toHaveBeenCalled();
  });
});
