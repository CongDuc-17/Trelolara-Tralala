import { expect, it } from "vitest";
import { readLists } from "@/features/boards/adapters";
import { readCardDetail, readCardList, readComment } from "@/features/cards/adapters";
import { commentResponse, testCard } from "../../../support/fixtures";
import type { CardDetailDto, CardListDto } from "@/features/cards/types";

it("normalizes list joins and counts without inventing included comments", () => {
  const raw: CardListDto = { ...testCard, status: "ACTIVE", cardMembers: [{ id: "relation", userId: "user", user: { id: "user", name: "An", avatar: null } }],
    cardLabels: [{ id: "label-relation", label: { id: "label", name: "Gấp", color: "#ff0000" } }], checklists: [], _count: { comments: 3, attachments: 2 } };
  const [card] = readCardList([raw], raw.listId);
  expect(card.members[0]).toEqual({ id: "relation", userId: "user", userName: "An", userAvatar: null });
  expect(card.labels[0].name).toBe("Gấp");
  expect(card.commentCount).toBe(3);
  expect(card.attachmentCount).toBe(2);
  expect(card).not.toHaveProperty("comments");
});
it("normalizes included flat detail comments with their card scope", () => {
  const card = readCardDetail({ ...testCard, comments: [{ id: "comment", content: "Nội dung", userId: "user", userName: "An", userAvatar: null, createdAt: "2026-10-22T00:00:00Z", updatedAt: "2026-10-22T00:00:00Z" }] }, testCard.id);
  expect(card.comments[0]).toMatchObject({ id: "comment", cardId: testCard.id, userName: "An" });
});
it.each(["members", "labels", "checklists", "comments"] as const)("rejects an unloaded detail relation %s", (relation) => {
  const raw: CardDetailDto = { ...testCard, [relation]: undefined };
  expect(() => readCardDetail(raw, raw.id)).toThrow("Chưa tải đủ");
});
it("maps the mutation comment id, author, dates and cardId", () => {
  expect(readComment(commentResponse.data, testCard.id)).toEqual({ id: commentResponse.data.commentId, cardId: testCard.id,
    userId: commentResponse.data.user.id, userName: commentResponse.data.user.name, userAvatar: null,
    content: commentResponse.data.content, createdAt: commentResponse.data.createdAt, updatedAt: commentResponse.data.updatedAt });
  expect(() => readComment(commentResponse.data, "another-card")).toThrow();
});
it("rejects another board's lists and non-finite positions", () => {
  expect(() => readLists([{ id: "l", boardId: "wrong", name: "List", position: 1, status: "ACTIVE" }], "board")).toThrow();
  expect(() => readLists([{ id: "l", boardId: "board", name: "List", position: NaN, status: "ACTIVE" }], "board")).toThrow();
});
