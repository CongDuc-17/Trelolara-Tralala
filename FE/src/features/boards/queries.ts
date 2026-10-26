import { useIsMutating, useMutation, useQueries, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { CanceledError } from "axios";
import { getSessionVersion } from "@/lib/apiClient";
import { useSession } from "@/features/auth/session-context";
import { useInvalidateCatalog } from "@/features/catalog/queries";
import { readLists } from "./adapters";
import { getBoardLists } from "./api";
import { getListCards } from "@/features/cards/api";
import { readCardList } from "@/features/cards/adapters";
import { ordered } from "./ordering";
import type { List } from "./types";
import { boardQueue } from "./boardQueue";
import type { MoveIntent } from "./boardState";

export function useBoardScope(boardId: string) {
  const { user } = useSession();
  return ["kanban", getSessionVersion(), user?.id, boardId] as const;
}
export type BoardScope = ReturnType<typeof useBoardScope>;
export function assertBoardSession(scope: BoardScope) {
  if (scope[1] !== getSessionVersion() || !scope[2]) throw new CanceledError();
}

export function listsOptions(scope: BoardScope, client: QueryClient) {
  return { queryKey: [...scope, "lists"], queryFn: async ({ signal }: { signal: AbortSignal }) => {
    await boardQueue(client, scope).wait(signal);
    assertBoardSession(scope);
    return ordered(readLists(await getBoardLists(scope[3], signal), scope[3]));
  } };
}
export function cardsOptions(scope: BoardScope, listId: string, client: QueryClient) {
  return { queryKey: [...scope, "cards", listId], queryFn: async ({ signal }: { signal: AbortSignal }) => {
    await boardQueue(client, scope).wait(signal);
    assertBoardSession(scope);
    return ordered(readCardList(await getListCards(listId, signal), listId));
  } };
}
export function useBoardLists(boardId: string, enabled = true) {
  const scope = useBoardScope(boardId);
  const client = useQueryClient();
  return useQuery({ ...listsOptions(scope, client), enabled: enabled && !!scope[2] && !!boardId });
}
export function useBoardCards(boardId: string, lists: List[], enabled = true) {
  const scope = useBoardScope(boardId);
  const client = useQueryClient();
  return useQueries({ queries: lists.map((list) => ({ ...cardsOptions(scope, list.id, client), enabled: enabled && !!scope[2] })) });
}
export function useBoardWrite(boardId: string) {
  const scope = useBoardScope(boardId);
  const client = useQueryClient();
  const invalidateCatalog = useInvalidateCatalog();
  const queue = boardQueue(client, scope);
  const count = useIsMutating({ mutationKey: scope });
  const mutation = useMutation({
    mutationKey: scope,
    mutationFn: ({ result }: { result: Promise<unknown> }) => result,
    onSettled: async () => {
      if (scope[1] !== getSessionVersion() || queue.pending) return;
      await Promise.all([client.invalidateQueries({ queryKey: scope }), invalidateCatalog()]);
    },
  });
  return { ...mutation, isPending: count > 0, assertCurrent: () => queue.assertCurrent(),
    mutateAsync: (write: () => Promise<unknown>, move?: MoveIntent) => mutation.mutateAsync({ result: queue.enqueue(write, move) }) };
}
