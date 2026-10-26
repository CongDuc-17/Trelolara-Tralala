import { CanceledError } from "axios";
import type { QueryClient } from "@tanstack/react-query";
import { getSessionVersion } from "@/lib/apiClient";
import { getListCards } from "@/features/cards/api";
import { readCardList } from "@/features/cards/adapters";
import type { CardSummary } from "@/features/cards/types";
import { getBoardLists } from "./api";
import { readLists } from "./adapters";
import { ordered } from "./ordering";
import { projectMove, type BoardState, type MoveIntent } from "./boardState";
import type { BoardScope } from "./queries";
import type { List } from "./types";

type Entry = { write: () => Promise<unknown>; move?: MoveIntent; resolve: (result: unknown) => void; reject: (error: unknown) => void };
const clients = new WeakMap<QueryClient, Map<string, BoardQueue>>();

export function boardQueue(client: QueryClient, scope: BoardScope) {
  let queues = clients.get(client);
  if (!queues) { queues = new Map(); clients.set(client, queues); }
  const key = JSON.stringify(scope);
  let queue = queues.get(key);
  if (!queue) { queue = new BoardQueue(client, scope, () => queues.delete(key)); queues.set(key, queue); }
  return queue;
}

class BoardQueue {
  private client: QueryClient;
  private scope: BoardScope;
  private revoked = false;
  private dispose: () => void;
  private entries: Entry[] = [];
  private base: BoardState = { lists: [], cards: {} };
  private idle = new Set<() => void>();
  constructor(client: QueryClient, scope: BoardScope, dispose: () => void) { this.client = client; this.scope = scope; this.dispose = dispose; }
  get pending() { return this.entries.length > 0; }
  private current() { return !this.revoked && this.scope[1] === getSessionVersion() && !!this.scope[2]; }
  assertCurrent() { if (!this.current()) throw new CanceledError(); }
  revoke() { this.revoked = true; this.dispose(); }
  private capture(): BoardState {
    const lists = this.client.getQueryData<List[]>([...this.scope, "lists"]) ?? [];
    return { lists, cards: Object.fromEntries(lists.flatMap((list) => {
      const cards = this.client.getQueryData<CardSummary[]>([...this.scope, "cards", list.id]);
      return cards ? [[list.id, cards]] : [];
    })) };
  }
  private publish() {
    if (!this.current()) return;
    const projected = this.entries.reduce((state, entry) => entry.move ? projectMove(state, entry.move) : state, this.base);
    if (this.client.getQueryData([...this.scope, "lists"])) this.client.setQueryData([...this.scope, "lists"], projected.lists);
    for (const [id, cards] of Object.entries(projected.cards)) this.client.setQueryData([...this.scope, "cards", id], cards);
  }
  enqueue(write: Entry["write"], move?: MoveIntent) {
    if (!this.current()) return Promise.reject(new CanceledError());
    if (!this.pending) this.base = this.capture();
    const promise = new Promise<unknown>((resolve, reject) => this.entries.push({ write, move, resolve, reject }));
    void this.client.cancelQueries({ queryKey: this.scope });
    this.publish();
    if (this.entries.length === 1) void this.drain();
    return promise;
  }
  wait(signal: AbortSignal) {
    if (!this.pending) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const finish = () => { this.idle.delete(finish); signal.removeEventListener("abort", abort); resolve(); };
      const abort = () => { this.idle.delete(finish); signal.removeEventListener("abort", abort); reject(new CanceledError()); };
      this.idle.add(finish);
      if (signal.aborted) abort(); else signal.addEventListener("abort", abort, { once: true });
    });
  }
  private async refresh() {
    if (!this.current() || !this.client.getQueryData([...this.scope, "lists"])) return;
    const lists = ordered(readLists(await getBoardLists(this.scope[3]), this.scope[3]));
    const rows = await Promise.all(lists.filter((list) => this.base.cards[list.id]).map(async (list) =>
      [list.id, ordered(readCardList(await getListCards(list.id), list.id))] as const));
    if (!this.current()) throw new CanceledError();
    this.base = { lists, cards: Object.fromEntries(rows) };
  }
  private async drain() {
    while (this.entries.length) {
      const entry = this.entries[0];
      let result: unknown; let failure: unknown; let failed = false;
      try {
        if (!this.current()) throw new CanceledError();
        await this.client.cancelQueries({ queryKey: this.scope });
        if (!this.current()) throw new CanceledError();
        result = await entry.write();
      } catch (error) { failed = true; failure = error; }
      // Rebase later intentions on confirmed server order, including ambiguous network failures.
      try { await this.refresh(); } catch { if (!failed && entry.move) this.base = projectMove(this.base, entry.move); }
      this.entries.shift();
      this.publish();
      if (failed) entry.reject(failure); else entry.resolve(result);
    }
    this.base = { lists: [], cards: {} };
    this.idle.forEach((finish) => finish());
  }
}
