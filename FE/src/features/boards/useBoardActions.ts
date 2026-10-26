import { useQueryClient } from "@tanstack/react-query";
import * as boardApi from "./api";
import * as cardApi from "@/features/cards/api";
import { readCardBase } from "@/features/cards/adapters";
import { assertBoardSession, useBoardScope, useBoardWrite } from "./queries";
import { neighbors, ordered } from "./ordering";
import { readLists } from "./adapters";
import { readCardList } from "@/features/cards/adapters";
import type { List } from "./types";
import i18n from "@/app/i18n";

export function useBoardActions(boardId: string) {
  const scope = useBoardScope(boardId);
  const client = useQueryClient();
  const write = useBoardWrite(boardId);

  function moveCard(id: string, targetListId: string, targetId?: string, direction: "top" | "bottom" = "bottom") {
    return write.mutateAsync(async () => {
      const lists = readLists(await boardApi.getBoardLists(boardId), boardId);
      const current = readCardBase(await cardApi.getCard(id), id);
      const sourceListId = current.listId;
      if (![sourceListId, targetListId].every((id) => lists.some((list) => list.id === id && list.status === "ACTIVE"))) throw new Error(i18n.t("board.listInactive"));
      const source = ordered(readCardList(await cardApi.getListCards(sourceListId), sourceListId));
      if (!source.some((card) => card.id === id && card.status === "ACTIVE")) throw new Error(i18n.t("board.cardMoved"));
      const target = sourceListId === targetListId ? source : ordered(readCardList(await cardApi.getListCards(targetListId), targetListId));
      const adjacent = neighbors(target.filter((card) => card.status === "ACTIVE"), id, targetId, direction);
      assertBoardSession(scope);
      write.assertCurrent();
      return cardApi.moveCard(id, { targetListId, beforeCardId: adjacent.before, afterCardId: adjacent.after });
    }, { kind: "card", id, listId: targetListId, targetId, direction });
  }

  function moveList(id: string, targetId?: string, direction?: "top" | "bottom") {
    const cached = client.getQueryData<List[]>([...scope, "lists"]) ?? [];
    const placement = direction ?? (cached.findIndex((list) => list.id === id) < cached.findIndex((list) => list.id === targetId) ? "bottom" : "top");
    return write.mutateAsync(async () => {
      const lists = ordered(readLists(await boardApi.getBoardLists(boardId), boardId)).filter((list) => list.status === "ACTIVE");
      const sourceIndex = lists.findIndex((list) => list.id === id);
      const targetIndex = lists.findIndex((list) => list.id === targetId);
      if (sourceIndex < 0 || (targetId && targetIndex < 0)) throw new Error(i18n.t("board.listInactive"));
      const adjacent = neighbors(lists, id, targetId, placement);
      assertBoardSession(scope);
      write.assertCurrent();
      return boardApi.moveList(id, { beforeListId: adjacent.before, afterListId: adjacent.after });
    }, { kind: "list", id, targetId, direction: placement });
  }

  return {
    moveCard, moveList, pending: write.isPending,
    createCard: (listId: string, title: string) => write.mutateAsync(() => cardApi.createCard(listId, title)),
    createList: (_boardId: string, data: { name: string }) => write.mutateAsync(() => boardApi.createList(boardId, data.name)),
    renameList: (id: string, name: string) => write.mutateAsync(() => boardApi.renameList(id, name)),
    lifecycle: (kind: "cards" | "lists", id: string, action: "archive" | "restore" | "delete") => write.mutateAsync(() => kind === "cards"
      ? cardApi.changeCardLifecycle(id, action) : boardApi.changeListLifecycle(id, action)),
  };
}
