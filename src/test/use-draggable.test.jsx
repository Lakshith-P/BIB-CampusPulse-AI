import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { useDraggable } from "@/lib/use-draggable";

// jsdom has no PointerEvent; this one carries the mouse fields (button, clientX, clientY)
if (!window.PointerEvent) window.PointerEvent = class extends MouseEvent {};

function Box({ onClick = () => {} }) {
  const box = useRef(null);
  const drag = useDraggable(box, "test-position", false);
  return (
    <div ref={box} data-testid="box" style={drag.style}>
      <button
        {...drag.handle}
        onClick={() => {
          if (!drag.wasDragged()) onClick();
        }}
      >
        Handle
      </button>
      <button data-nodrag>Close</button>
    </div>
  );
}

const place = () => {
  const box = screen.getByTestId("box");
  // a 100 x 50 box with its bottom right corner 24 px from the right and 68 px from the bottom
  Object.defineProperty(box, "offsetWidth", { value: 100, configurable: true });
  Object.defineProperty(box, "offsetHeight", { value: 50, configurable: true });
  box.getBoundingClientRect = () => ({
    right: window.innerWidth - 24,
    bottom: window.innerHeight - 68,
  });
  return box;
};

beforeEach(() => localStorage.clear());

describe("a box that can be dragged", () => {
  it("follows the pointer, keeping its distance from the right and bottom edges", () => {
    render(<Box />);
    const box = place();
    const handle = screen.getByText("Handle");
    fireEvent.pointerDown(handle, { clientX: 500, clientY: 500, button: 0 });
    fireEvent.pointerMove(handle, { clientX: 400, clientY: 450 });
    expect(box.style.right).toBe("124px");
    expect(box.style.bottom).toBe("118px");
    fireEvent.pointerUp(handle);
    expect(JSON.parse(localStorage.getItem("test-position"))).toEqual({ right: 124, bottom: 118 });
  });

  it("stays inside the window", () => {
    render(<Box />);
    const box = place();
    const handle = screen.getByText("Handle");
    fireEvent.pointerDown(handle, { clientX: 500, clientY: 500, button: 0 });
    fireEvent.pointerMove(handle, { clientX: -5000, clientY: -5000 });
    expect(box.style.right).toBe(`${window.innerWidth - 100}px`);
    expect(box.style.bottom).toBe(`${window.innerHeight - 50}px`);
    fireEvent.pointerMove(handle, { clientX: 9000, clientY: 9000 });
    expect(box.style.right).toBe("0px");
    expect(box.style.bottom).toBe("0px");
  });

  it("a click still works, but the click that ends a drag does not press the button", () => {
    let clicks = 0;
    render(<Box onClick={() => clicks++} />);
    place();
    const handle = screen.getByText("Handle");
    fireEvent.pointerDown(handle, { clientX: 10, clientY: 10, button: 0 });
    fireEvent.pointerUp(handle);
    fireEvent.click(handle);
    expect(clicks).toBe(1);
    fireEvent.pointerDown(handle, { clientX: 10, clientY: 10, button: 0 });
    fireEvent.pointerMove(handle, { clientX: 80, clientY: 80 });
    fireEvent.pointerUp(handle);
    fireEvent.click(handle);
    expect(clicks).toBe(1);
  });

  it("a button marked data-nodrag does not start a drag", () => {
    render(<Box />);
    const box = place();
    const close = screen.getByText("Close");
    fireEvent.pointerDown(close, { clientX: 500, clientY: 500, button: 0 });
    fireEvent.pointerMove(close, { clientX: 300, clientY: 300 });
    expect(box.style.right).toBe("");
  });

  it("remembers where it was left", () => {
    localStorage.setItem("test-position", JSON.stringify({ right: 200, bottom: 150 }));
    render(<Box />);
    place();
    expect(screen.getByTestId("box").style.right).toBe("200px");
    expect(screen.getByTestId("box").style.bottom).toBe("150px");
  });
});
