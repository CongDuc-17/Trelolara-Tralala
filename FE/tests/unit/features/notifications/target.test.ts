import { expect, it } from "vitest";
import { notificationTarget } from "@/features/notifications/target";
import type { Notification } from "@/features/notifications/types";

const notification: Notification = { id: "notice", type: "CARD_ASSIGNED", title: "Giao thẻ", content: "Thẻ cần xem", entityId: "card", entityType: "CARD", metadata: { boardId: "board", token: "private-invite" }, isRead: false, createdAt: "2026-10-23T10:00:00Z" };
it("opens private invitations through the invitation route instead of the resource before membership", () => {
  expect(notificationTarget({ ...notification, type: "PROJECT_INVITED", entityType: "PROJECT", metadata: { token: "signed/token", invitationId: "invite" } })).toBe("/invite/projects/signed%2Ftoken");
  expect(notificationTarget({ ...notification, type: "BOARD_INVITED", entityType: "BOARD", metadata: { token: "signed-token" } })).toBe("/invite/boards/signed-token");
  expect(notificationTarget(notification)).toBe("/boards/board/cards/card");
});
it("keeps legacy resource links and encodes route segments without trusting arbitrary URLs", () => {
  expect(notificationTarget({ ...notification, entityType: "BOARD", entityId: "a/b?x", metadata: {} })).toBe("/boards/a%2Fb%3Fx");
  expect(notificationTarget({ ...notification, type: "PROJECT_INVITED", entityType: "PROJECT", entityId: "project", metadata: {} })).toBe("/projects/project");
  expect(notificationTarget({ ...notification, metadata: ["board"] })).toBeNull();
  expect(notificationTarget({ ...notification, entityId: "" })).toBeNull();
  expect(notificationTarget({ ...notification, entityType: "UNKNOWN", metadata: { url: "https://evil.test" } })).toBeNull();
});
