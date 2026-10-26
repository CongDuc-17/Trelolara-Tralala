import { useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { defaultDropAnimationSideEffects, DndContext, DragOverlay, KeyboardSensor, MeasuringStrategy, MouseSensor, TouchSensor, useDroppable, useSensor, useSensors, type DragEndEvent, type DragOverEvent, type DropAnimationSideEffects } from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { useTranslation } from "react-i18next";
import { ARCHIVE_DROP_ID, boardCollision, boardKeyboardCoordinates, listDragId, useReducedBoardMotion } from "./drag";
import { BoardCardFace } from "./BoardCardFace";
import { projectMove, sameOrder, type BoardState, type MoveIntent } from "./boardState";

const hideSource = defaultDropAnimationSideEffects({ styles: { active: { opacity: "0" } } });
const settleDrag: DropAnimationSideEffects = (args) => {
  const cleanup = hideSource(args);
  const preview = args.dragOverlay.node.querySelector(".board-drag-preview");
  const tilt = preview?.animate([{ rotate: "1.5deg" }, { rotate: "0deg" }], { duration: 200, easing: "cubic-bezier(0.2,0.8,0.2,1)", fill: "forwards" });
  return () => { tilt?.cancel(); cleanup?.(); };
};

export function ArchiveDropZone({ children }: { children: (ref: (node: HTMLElement | null) => void, over: boolean) => ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: ARCHIVE_DROP_ID, data: { kind: "archive" } });
  return children(setNodeRef, isOver);
}

export function BoardDnd({ state, onMove, onArchive, children }: {
  state: BoardState; onMove: (intent: MoveIntent) => void; onArchive: (kind: "card" | "list", id: string) => void;
  children: (state: BoardState, dragging: boolean) => ReactNode;
}) {
  const { t } = useTranslation();
  const reduced = useReducedBoardMotion();
  const [drag, setDrag] = useState<{ id: string; kind: "card" | "list"; preview: BoardState } | null>(null);
  const draft = useRef(drag);
  const view = drag?.preview ?? state;
  const listIds = useMemo(() => view.lists.filter((list) => list.status === "ACTIVE").map((list) => listDragId(list.id)), [view.lists]);
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: boardKeyboardCoordinates, scrollBehavior: reduced ? "auto" : "smooth", keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] } }));
  function change(next: typeof drag) { draft.current = next; setDrag(next); }
  function crossColumn({ active, over }: DragOverEvent) {
    const current = draft.current;
    if (!current || current.kind !== "card" || !over || over.id === ARCHIVE_DROP_ID) return;
    const listId = over.data.current?.listId as string | undefined;
    const source = Object.values(current.preview.cards).flat().find((card) => card.id === current.id);
    if (!listId || !source || source.listId === listId) return;
    const below = active.rect.current.translated && active.rect.current.translated.top > over.rect.top + over.rect.height / 2;
    change({ ...current, preview: projectMove(current.preview, { kind: "card", id: current.id, listId, targetId: over.data.current?.kind === "card" ? over.data.current.id : undefined, direction: below ? "bottom" : "top" }) });
  }
  function finish({ over }: DragEndEvent) {
    const current = draft.current;
    if (!current || !over) { change(null); return; }
    if (over.id === ARCHIVE_DROP_ID) { change(null); onArchive(current.kind, current.id); return; }
    const preview = current.preview;
    const source = current.kind === "list" ? preview.lists.filter((list) => list.status === "ACTIVE") : Object.values(preview.cards).find((cards) => cards.some((card) => card.id === current.id))?.filter((card) => card.status === "ACTIVE");
    if (!source) { change(null); return; }
    const from = source.findIndex((item) => item.id === current.id);
    const targetId = over.data.current?.id as string | undefined;
    const targetIndex = source.findIndex((item) => item.id === targetId);
    let result = preview;
    if (targetId && targetId !== current.id && targetIndex >= 0) result = projectMove(preview, { kind: current.kind, id: current.id,
      listId: current.kind === "card" ? over.data.current?.listId : undefined, targetId, direction: from < targetIndex ? "bottom" : "top" });
    else if (current.kind === "card" && over.data.current?.kind === "container") result = projectMove(preview, { kind: "card", id: current.id, listId: over.data.current.listId });
    if (sameOrder(state, result)) { change(null); return; }
    const siblings = current.kind === "list" ? result.lists.filter((list) => list.status === "ACTIVE") : Object.values(result.cards).find((cards) => cards.some((card) => card.id === current.id))?.filter((card) => card.status === "ACTIVE");
    if (!siblings) { change(null); return; }
    const next = siblings[siblings.findIndex((item) => item.id === current.id) + 1];
    const card = Object.values(result.cards).flat().find((card) => card.id === current.id);
    const settled = { ...current, preview: result };
    change(settled);
    onMove({ kind: current.kind, id: current.id, listId: card?.listId, targetId: next?.id, direction: "top" });
    // Keep the destination mounted while Query observers receive the optimistic cache update.
    requestAnimationFrame(() => requestAnimationFrame(() => { if (draft.current === settled) change(null); }));
  }
  const name = (id: string | number) => {
    if (id === ARCHIVE_DROP_ID) return t("board.archiveItems");
    const raw = String(id).slice(String(id).indexOf(":") + 1);
    return Object.values(state.cards).flat().find((card) => card.id === raw)?.title ?? state.lists.find((list) => list.id === raw)?.name ?? raw;
  };
  const activeCard = drag?.kind === "card" ? Object.values(drag.preview.cards).flat().find((card) => card.id === drag.id) : undefined;
  const activeList = drag?.kind === "list" ? drag.preview.lists.find((list) => list.id === drag.id) : undefined;
  return <DndContext sensors={sensors} collisionDetection={boardCollision} measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
    accessibility={{ screenReaderInstructions: { draggable: t("board.dragInstructions") }, announcements: {
      onDragStart: ({ active }) => t("board.dragStart", { name: name(active.id) }),
      onDragOver: ({ over }) => over ? t("board.dragOver", { name: name(over.id) }) : t("board.dragCancel"),
      onDragEnd: ({ active, over }) => over ? t("board.dragEnd", { name: name(active.id) }) : t("board.dragCancel"), onDragCancel: () => t("board.dragCancel"),
    } }} onDragStart={({ active }) => change({ id: active.data.current!.id, kind: active.data.current!.kind, preview: state })}
    onDragOver={crossColumn} onDragCancel={() => change(null)} onDragEnd={finish}>
    <SortableContext items={listIds} strategy={horizontalListSortingStrategy}>
      {children(drag?.preview ?? state, !!drag)}
    </SortableContext>
    {createPortal(<DragOverlay adjustScale={false} transition={(event) => reduced ? "none" : event instanceof KeyboardEvent ? "transform 180ms cubic-bezier(0.2,0.8,0.2,1)" : undefined}
      dropAnimation={reduced ? null : { duration: 200, easing: "cubic-bezier(0.2,0.8,0.2,1)", sideEffects: settleDrag }} className="board-drag-overlay" zIndex={60}>
      {activeCard || activeList ? <div className="h-full">{activeCard ? <div className="board-drag-preview h-full rounded-lg border bg-card p-3"><BoardCardFace card={activeCard} /></div> : activeList ? <div className="board-drag-preview h-full w-80 overflow-hidden rounded-lg border bg-background p-3"><p className="mb-3 text-sm font-semibold">{activeList.name}</p><div className="space-y-2">{drag?.preview.cards[activeList.id]?.filter((card) => card.status === "ACTIVE").map((card) => <div key={card.id} className="rounded-lg border bg-card p-3"><BoardCardFace card={card} /></div>)}</div></div> : null}</div> : null}
    </DragOverlay>, document.body)}
  </DndContext>;
}
