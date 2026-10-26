import { lazy, type ComponentType } from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { deferred } from "../../support/helpers";
import { RouteBoundary } from "@/app/RouteBoundary";

it("announces a pending route and replaces it when its module loads", async () => {
  const module = deferred<{ default: ComponentType }>();
  const Page = lazy(() => module.promise);
  render(<MemoryRouter><RouteBoundary><Page /></RouteBoundary></MemoryRouter>);
  expect(screen.getByRole("status").textContent).toContain("Đang tải màn hình");
  await act(async () => module.resolve({ default: () => <h1>Loaded screen</h1> }));
  expect(await screen.findByRole("heading", { name: "Loaded screen" })).toBeTruthy();
  expect(screen.queryByRole("status")).toBeNull();
});

it("contains a rejected module and recovers on internal navigation without reloading", async () => {
  const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const reload = vi.spyOn(window.history, "go");
  const Page = lazy(() => Promise.reject(new Error("A stale route chunk")));
  render(<MemoryRouter initialEntries={["/broken"]}><RouteBoundary><Routes><Route path="/broken" element={<Page />} /><Route path="/dashboard" element={<h1>Overview recovered</h1>} /></Routes></RouteBoundary></MemoryRouter>);
  expect((await screen.findByRole("alert")).textContent).toContain("Không tải được màn hình");
  expect(screen.getByText(/Các thay đổi chưa lưu sẽ bị bỏ/)).toBeTruthy();
  await userEvent.setup().click(screen.getByRole("link", { name: "Về Tổng quan" }));
  expect(await screen.findByRole("heading", { name: "Overview recovered" })).toBeTruthy();
  expect(reload).not.toHaveBeenCalled();
  expect(errors).toHaveBeenCalled();
});
