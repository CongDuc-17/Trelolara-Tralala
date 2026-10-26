import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Home } from "@/pages/Home";
import { NotFound } from "@/pages/NotFound";
vi.mock("@/features/auth/session-context", () => ({ useSession: () => ({ user: { id: "reader" } }) }));
beforeEach(() => { vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))); });

it.each(["/", "/missing-page"])("offers real recovery navigation at %s with one page title", async (path) => {
  render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/" element={<Home />} /><Route path="/dashboard" element={<h1>Không gian đã mở</h1>} /><Route path="*" element={<NotFound />} /></Routes></MemoryRouter>);
  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  expect(document.querySelector("button button, a button")).toBeNull();
  const navigation = path === "/" ? within(document.querySelector(".landing-hero-copy") as HTMLElement) : screen;
  await userEvent.setup().click(navigation.getByRole("link", { name: path === "/" ? "Mở không gian làm việc" : "Về Tổng quan" }));
  expect(await screen.findByRole("heading", { name: "Không gian đã mở" })).toBeTruthy();
});

it("keeps the Dither Burn poster without allocating a GPU context under reduced motion", () => {
  const canvas = vi.spyOn(HTMLCanvasElement.prototype, "getContext");
  render(<MemoryRouter><Home /></MemoryRouter>);
  expect(canvas).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Tạm dừng hiệu ứng" })).toBeNull();
  expect(document.querySelector(".public-backdrop-poster")?.getAttribute("src")).toBe("/illustrations/dither-burn.webp");
  canvas.mockRestore();
});
