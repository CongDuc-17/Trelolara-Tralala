import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { AxiosAdapter } from "axios";
import { createQueryClient } from "@/app/queryClient";
import { axiosClient, getSessionVersion, resetApiSession } from "@/lib/apiClient";
import { testCard } from "../../../support/fixtures";
import { deferred, reply } from "../../../support/helpers";
import { useCardActions } from "@/features/cards/queries";
import { boardQueue } from "@/features/boards/boardQueue";
import type { CardDetail } from "@/features/cards/types";

vi.mock("@/features/auth/session-context", () => ({ useSession: () => ({ user: { id: "alice" } }) }));
const blocked = axiosClient.defaults.adapter;
let client = createQueryClient();
let adapter: ReturnType<typeof vi.fn<AxiosAdapter>>;
const key = () => ["kanban", getSessionVersion(), "alice", "board", "detail", testCard.id];
const initial: CardDetail = { ...testCard, dueDate: "2026-10-23T10:00:00.000Z", isComplete: true, reminderMinutesBefore: 60,
  labels: [{ id: "label", name: "Nghiệm thu", color: "#123456" }], members: [], checklists: [], comments: [] };

beforeEach(() => {
  resetApiSession();
  client = createQueryClient();
  adapter = vi.fn<AxiosAdapter>(async (config) => reply(config, { success: true, data: {
    ...initial, status: "ACTIVE", ...JSON.parse(config.data),
  } }));
  axiosClient.defaults.adapter = adapter;
  client.setQueryData(key(), structuredClone(initial));
});
afterEach(() => { client.clear(); axiosClient.defaults.adapter = blocked; });
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

it("does not restore private detail from a late save after board permission is revoked", async () => {
  const gate = deferred<void>(); const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => { await gate.promise; return base(config); });
  const scope = ["kanban", getSessionVersion(), "alice", "board"] as const;
  const hook = renderHook(() => useCardActions("board", testCard.id), { wrapper });
  let pending!: Promise<unknown>;
  act(() => { pending = hook.result.current.update({ title: "Private draft" }).catch((error) => error); });
  await waitFor(() => expect(adapter).toHaveBeenCalledOnce());
  boardQueue(client, scope).revoke(); client.removeQueries({ queryKey: scope });
  await act(async () => { gate.resolve(); await pending; });
  expect(client.getQueryData(key())).toBeUndefined();
});

it("sends explicit null/false and patches metadata without replacing included relationships", async () => {
  const hook = renderHook(() => useCardActions("board", testCard.id), { wrapper });
  await act(async () => {
    await hook.result.current.update({ dueDate: null, isComplete: false, reminderMinutesBefore: null });
  });
  const request = adapter.mock.calls[0][0];
  expect(request.url).toBe(`/cards/${testCard.id}`);
  expect(JSON.parse(request.data)).toEqual({ dueDate: null, isComplete: false, reminderMinutesBefore: null });
  expect(client.getQueryData<CardDetail>(key())).toMatchObject({
    dueDate: null, isComplete: false, isOverdue: false, reminderMinutesBefore: null, labels: initial.labels, comments: [],
  });
});

it.each([
  ["2026-10-23T09:59:59.000Z", false, true],
  ["2026-10-23T10:00:00.000Z", false, false],
  ["2026-10-23T10:00:01.000Z", false, false],
  ["2026-10-23T09:59:59.000Z", true, false],
] as const)("keeps the overdue flag consistent with a saved deadline %s and completion %s", async (dueDate, isComplete, isOverdue) => {
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-23T10:00:00.000Z"));
  const hook = renderHook(() => useCardActions("board", testCard.id), { wrapper });
  await act(async () => { await hook.result.current.update({ dueDate, isComplete }); });
  expect(client.getQueryData<CardDetail>(key())?.isOverdue).toBe(isOverdue);
});

it("never creates a partial detail cache entry from a basic mutation response", async () => {
  client.removeQueries({ queryKey: key() });
  const hook = renderHook(() => useCardActions("board", testCard.id), { wrapper });
  await act(async () => { await hook.result.current.update({ title: "Tên đã lưu" }); });
  expect(client.getQueryData(key())).toBeUndefined();
});

it("does not repopulate a cleared detail cache after the session ends during a mutation", async () => {
  const gate = deferred<void>();
  const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => { await gate.promise; return base(config); });
  const oldKey = key();
  const hook = renderHook(() => useCardActions("board", testCard.id), { wrapper });
  let pending!: Promise<unknown>;
  act(() => { pending = hook.result.current.update({ title: "Không ghi lại phiên cũ" }).catch((error: unknown) => error); });
  await waitFor(() => expect(adapter).toHaveBeenCalledTimes(1));
  resetApiSession(); client.clear();
  await act(async () => { gate.resolve(); await pending; });
  expect(client.getQueryData(oldKey)).toBeUndefined();
  expect(client.getQueryCache().getAll()).toHaveLength(0);
});
