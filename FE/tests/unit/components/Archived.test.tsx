import { expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Archived } from "@/components/Archived";
import type { Board, Project } from "@/features/catalog/types";

it("accepts existing domain types and preserves restore and confirmed deletion", async () => {
  const projects: Project[] = [
    { id: "archived-project", name: "Dự án lưu trữ", status: "ARCHIVED" },
    { id: "active-project", name: "Dự án đang mở", status: "ACTIVE" },
  ];
  const boards: Board[] = [
    { id: "archived-board", name: "Bảng lưu trữ", status: "ARCHIVED" },
    { id: "active-board", name: "Bảng đang mở" },
  ];
  const restoreProject = vi.fn();
  const deleteProject = vi.fn();
  const restoreBoard = vi.fn();
  const deleteBoard = vi.fn();
  const user = userEvent.setup();
  render(<Archived
    projects={projects}
    boards={boards}
    handleRestoreProject={restoreProject}
    handleDeleteProject={deleteProject}
    handleRestoreBoard={restoreBoard}
    handleDeleteBoard={deleteBoard}
  />);

  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByText("Dự án đang mở")).toBeNull();
  const projectTile = screen.getByText("Dự án lưu trữ").closest<HTMLElement>("article");
  if (!projectTile) throw new Error("Archived project tile missing");
  const restoreAction = within(projectTile).getByRole("button", { name: "Khôi phục dự án Dự án lưu trữ" });
  const deleteAction = within(projectTile).getByRole("button", { name: "Xóa dự án Dự án lưu trữ" });
  await user.click(restoreAction);
  expect(restoreProject).toHaveBeenCalledWith("archived-project");

  await user.click(deleteAction);
  expect(within(screen.getByRole("alertdialog")).getByText("Dự án lưu trữ")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Hủy" }));
  expect(deleteProject).not.toHaveBeenCalled();
  await user.click(deleteAction);
  await user.click(screen.getByRole("button", { name: "Xóa vĩnh viễn" }));
  expect(deleteProject).toHaveBeenCalledWith("archived-project");

  await user.click(screen.getByRole("tab", { name: /Bảng/ }));
  expect(screen.getByText("Bảng lưu trữ")).toBeTruthy();
  expect(screen.queryByText("Bảng đang mở")).toBeNull();
  expect(deleteBoard).not.toHaveBeenCalled();
});
