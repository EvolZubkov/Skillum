/**
 * @module components/__tests__/folder-tree-select.test
 * @description The folder picker keeps a folder the reader may not use visible
 * but not selectable (`isDisabled`, folder access inheritance); the root and the
 * other folders stay selectable.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FolderTreeSelect } from "../folder-tree-select";

const folders = [
  { id: "f1", name: "Охрана труда", parentId: null },
  { id: "f2", name: "Чужая папка", parentId: null },
];

function open(isDisabled?: (id: string) => boolean) {
  const onChange = vi.fn();
  render(<FolderTreeSelect folders={folders} value={null} onChange={onChange} isDisabled={isDisabled} />);
  fireEvent.click(screen.getByRole("button", { name: /Без папки/ }));
  return onChange;
}

describe("<FolderTreeSelect isDisabled />", () => {
  it("marks the locked folder disabled and ignores a click on it", () => {
    const onChange = open((id) => id === "f2");
    const locked = screen.getByText("Чужая папка").closest("[role='treeitem']")!;
    expect(locked.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(screen.getByText("Чужая папка"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("still selects the other folders", () => {
    const onChange = open((id) => id === "f2");
    fireEvent.click(screen.getByText("Охрана труда"));
    expect(onChange).toHaveBeenCalledWith("f1");
  });

  it("disables nothing without the prop", () => {
    open();
    const row = screen.getByText("Чужая папка").closest("[role='treeitem']")!;
    expect(row.getAttribute("aria-disabled")).toBeNull();
  });
});
