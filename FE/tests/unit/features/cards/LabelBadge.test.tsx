import { expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LabelBadge } from "@/features/cards/LabelBadge";

it.each([
  ["#ef4444", "rgb(239, 68, 68)", "rgb(0, 0, 0)"],
  ["#eab308", "rgb(234, 179, 8)", "rgb(0, 0, 0)"],
  ["#123456", "rgb(18, 52, 86)", "rgb(255, 255, 255)"],
  ["#fff", "rgb(255, 255, 255)", "rgb(0, 0, 0)"],
])("keeps the label's %s background with readable text", (color, background, foreground) => {
  render(<LabelBadge label={{ name: "Nhãn công việc", color }} />);
  const badge = screen.getByText("Nhãn công việc").closest("[data-slot=badge]") as HTMLElement;
  expect(badge.style.backgroundColor).toBe(background);
  expect(badge.style.color).toBe(foreground);
});

it("uses the neutral badge for an invalid legacy color", () => {
  render(<LabelBadge label={{ name: "Nhãn cũ", color: "invalid" }} />);
  expect(screen.getByText("Nhãn cũ").closest("[data-slot=badge]")?.getAttribute("style")).toBeNull();
});
