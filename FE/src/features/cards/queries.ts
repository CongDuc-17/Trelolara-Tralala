import { useRef } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { assertBoardSession, listsOptions, useBoardScope, useBoardWrite } from "@/features/boards/queries";
import { getApiError } from "@/lib/errors";
import * as api from "./api";
import { readCardBase, readCardDetail, readComment } from "./adapters";
import type { CardDetail, Label, LabelInput, UpdateCardInput } from "./types";
import i18n from "@/app/i18n";

export function useCardDetail(boardId: string, cardId: string) {
  const scope = useBoardScope(boardId);
  const client = useQueryClient();
  return useQuery({ queryKey: [...scope, "detail", cardId], enabled: !!scope[2] && !!boardId && !!cardId,
    refetchInterval: 60_000,
    queryFn: async ({ signal }) => {
      assertBoardSession(scope);
      const card = readCardDetail(await api.getCardDetail(cardId, signal), cardId);
      assertBoardSession(scope);
      const lists = await client.fetchQuery(listsOptions(scope, client));
      if (!lists.some((list) => list.id === card.listId)) throw new Error(i18n.t("card.wrongBoard"));
      return card;
    } });
}

export function useCardActions(boardId: string, cardId: string) {
  const scope = useBoardScope(boardId);
  const detailKey = [...scope, "detail", cardId];
  const client = useQueryClient();
  const write = useBoardWrite(boardId);

  return {
    pending: write.isPending,
    update: (input: UpdateCardInput) => write.mutateAsync(async () => {
      const saved = readCardBase(await api.updateCard(cardId, input), cardId);
      write.assertCurrent();
      client.setQueryData<CardDetail>(detailKey, (current) => current ? { ...current,
        title: saved.title, description: saved.description, dueDate: saved.dueDate,
        isComplete: saved.isComplete, reminderMinutesBefore: saved.reminderMinutesBefore,
        isOverdue: !saved.isComplete && saved.dueDate !== null && Date.parse(saved.dueDate) < Date.now(),
      } : current);
    }),
    saveComment: (content: string, commentId: string | null) => write.mutateAsync(async () => {
      const comment = readComment(commentId ? await api.updateComment(commentId, content) : await api.createComment(cardId, content), cardId);
      write.assertCurrent();
      client.setQueryData<CardDetail>(detailKey, (current) => {
        if (!current) return current;
        const exists = current.comments.some((item) => item.id === comment.id);
        return { ...current, comments: exists ? current.comments.map((item) => item.id === comment.id ? comment : item) : [...current.comments, comment],
          commentCount: current.commentCount + (exists ? 0 : 1) };
      });
    }),
    createChecklist: (title: string) => write.mutateAsync(() => api.createChecklist(cardId, title)),
    createChecklistItem: (checklistId: string, title: string) => write.mutateAsync(() => api.createChecklistItem(checklistId, title)),
    setChecklistItemCompletion: (id: string, completed: boolean) => write.mutateAsync(() => api.setChecklistItemCompletion(id, completed)),
    deleteChecklist: (id: string) => write.mutateAsync(() => api.deleteChecklist(id)),
    updateChecklistTitle: (id: string, title: string) => write.mutateAsync(() => api.updateChecklistTitle(id, title)),
    updateChecklistItemTitle: (id: string, title: string) => write.mutateAsync(() => api.updateChecklistItemTitle(id, title)),
    deleteChecklistItem: (id: string) => write.mutateAsync(() => api.deleteChecklistItem(id)),
    deleteLabel: (id: string) => write.mutateAsync(() => api.deleteBoardLabel(id)),
    uploadAttachment: (file: File, signal: AbortSignal) => write.mutateAsync(() => api.uploadAttachment(cardId, file, signal)),
    deleteAttachment: (id: string) => write.mutateAsync(() => api.deleteAttachment(cardId, id)),
    setLabel: (labelId: string, attached: boolean) => write.mutateAsync(() => attached ? api.attachCardLabel(cardId, labelId) : api.detachCardLabel(cardId, labelId)),
    addMember: (userId: string) => write.mutateAsync(() => api.addCardMember(cardId, userId)),
    removeMember: (userId: string) => write.mutateAsync(() => api.removeCardMember(cardId, userId)),
  };
}

export function useCardAttachments(boardId: string, cardId: string) {
  const scope = useBoardScope(boardId);
  return useQuery({ queryKey: [...scope, "attachments", cardId], enabled: !!scope[2],
    queryFn: async ({ signal }) => { assertBoardSession(scope); const files = await api.getAttachments(cardId, signal); assertBoardSession(scope); return files; } });
}
export function useCardActivities(boardId: string, cardId: string) {
  const scope = useBoardScope(boardId);
  return useInfiniteQuery({ queryKey: [...scope, "activities", cardId], enabled: !!scope[2], initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) => { assertBoardSession(scope); const events = await api.getCardActivities(cardId, pageParam, signal); assertBoardSession(scope); return events; },
    getNextPageParam: (page, pages) => page.nextCursor && !pages.slice(0, -1).some((previous) => previous.nextCursor === page.nextCursor) ? page.nextCursor : undefined });
}

export function useSaveCardLabel(boardId: string, cardId: string) {
  const scope = useBoardScope(boardId);
  const write = useBoardWrite(boardId);
  const created = useRef<Label | null>(null);

  return {
    pending: write.isPending,
    resetCreated: () => { created.current = null; },
    errorMessage: (error: unknown) => (created.current ? i18n.t("cardLabels.partial") : "") + getApiError(error).message,
    async save(input: LabelInput, editing: Label | null) {
      await write.mutateAsync(async () => {
        const retryingAttachment = !editing && created.current !== null;
        const existing = editing ?? created.current;
        const label = existing ? await api.updateBoardLabel(existing.id, input) : await api.createBoardLabel(boardId, input);
        if (!existing) created.current = label;
        assertBoardSession(scope);
        if (!editing) {
          if (retryingAttachment) {
            const card = readCardDetail(await api.getCardDetail(cardId), cardId);
            assertBoardSession(scope);
            if (card.labels.some((item) => item.id === label.id)) return;
          }
          await api.attachCardLabel(cardId, label.id);
        }
      });
      created.current = null;
    },
  };
}
