import { expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Home } from "@/pages/Home";
import { NotFound } from "@/pages/NotFound";

it.each(["/", "/missing-page"])("offers real recovery navigation at %s with one page title", async (path) => {
  render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/" element={<Home />} /><Route path="/dashboard" element={<h1>Không gian đã mở</h1>} /><Route path="*" element={<NotFound />} /></Routes></MemoryRouter>);
  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  expect(document.querySelector("button button, a button")).toBeNull();
  await userEvent.setup().click(screen.getByRole("link", { name: path === "/" ? "Mở không gian làm việc" : "Về Tổng quan" }));
  expect(await screen.findByRole("heading", { name: "Không gian đã mở" })).toBeTruthy();
});
