import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useNavigate, useParams } from "react-router-dom";
import { toast, Toaster } from "sonner";
import { MessageSquareText, SquareCheck } from "lucide-react";

import {
  KanbanBoardProvider,
  KanbanBoard,
  KanbanBoardColumn,
  KanbanBoardColumnHeader,
  KanbanBoardColumnTitle,
  KanbanBoardColumnList,
  KanbanBoardColumnListItem,
  KanbanBoardCard,
  KanbanBoardCardTitle,
  KanbanBoardColumnFooter,
  type KanbanBoardDropDirection,
} from "@/components/kanban";

import { apiClient } from "@/lib/apiClient";
import { useBoards } from "@/hooks/useBoards";
import { useLists } from "@/hooks/useLists";
import { useCardsStore, type Card as BoardCard } from "@/stores/cards.store";

import { HeaderBoard } from "@/components/boards/HeaderBoard";
import { ArchivePopover } from "@/components/boards/ArchivedOfBoard";
import { CreateList } from "@/components/lists/CreateList";
import { CreateCard } from "@/components/cards/CreateCard";

import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarImage,
} from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

type List = {
  id: string;
  name: string;
  position: number;
};

type ArchivedList = List & {
  previousIndex: number;
  previousListId: string | null;
  nextListId: string | null;
};

type ArchivedCard = BoardCard & {
  previousIndex: number;
  previousCardId: string | null;
  nextCardId: string | null;
};

export function Board() {
  const boardId = useParams().boardId as string;
  const navigate = useNavigate();

  const { board, boardMembers, fetchBoard, fetchBoardMembers, loading, error } =
    useBoards();

  const isActiveBoard = board?.status?.toUpperCase() === "ACTIVE";

  const {
    lists,
    createList,
    loading: listsLoading,
    fetchLists,
  } = useLists(boardId, { enabled: isActiveBoard });

  const { cards, setCards } = useCardsStore();

  const [listOrder, setListOrder] = useState<string[] | null>(null);
  const [draggedListId, setDraggedListId] = useState<string | null>(null);
  const [dragOverListId, setDragOverListId] = useState<string | null>(null);

  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editingListName, setEditingListName] = useState("");

  const [archivedCards, setArchivedCards] = useState<ArchivedCard[]>([]);
  const [archivedLists, setArchivedLists] = useState<ArchivedList[]>([]);
  const [isDragOverArchive, setIsDragOverArchive] = useState(false);

  const [previewBackground, setPreviewBackground] = useState<string | null>(
    null,
  );
  const prevPreviewRef = useRef<string | null>(null);

  useEffect(() => {
    if (
      prevPreviewRef.current &&
      prevPreviewRef.current !== previewBackground
    ) {
      URL.revokeObjectURL(prevPreviewRef.current);
    }
    prevPreviewRef.current = previewBackground;

    return () => {
      if (prevPreviewRef.current) {
        URL.revokeObjectURL(prevPreviewRef.current);
      }
    };
  }, [previewBackground]);
  const displayBackground = previewBackground || board?.background;

  const listIds = useMemo(() => lists.map((list) => list.id), [lists]);
  // const listIdsKey = listIds.join(",");

  const baseLists = useMemo<List[]>(
    () =>
      [...lists]
        .sort((a, b) => a.position - b.position)
        .map((list) => ({
          id: list.id,
          name: list.name,
          position: list.position,
        })),
    [lists],
  );

  const archivedListIds = useMemo(
    () => new Set(archivedLists.map((list) => list.id)),
    [archivedLists],
  );

  const visibleLists = useMemo(
    () => baseLists.filter((list) => !archivedListIds.has(list.id)),
    [baseLists, archivedListIds],
  );

  const orderedLists = useMemo<List[]>(() => {
    if (!listOrder) {
      return visibleLists;
    }

    const listMap = new Map(visibleLists.map((list) => [list.id, list]));

    const mappedLists = listOrder
      .map((listId) => listMap.get(listId))
      .filter((list): list is List => Boolean(list));

    const missingLists = visibleLists.filter(
      (list) => !listOrder.includes(list.id),
    );

    return [...mappedLists, ...missingLists];
  }, [visibleLists, listOrder]);

  const fetchActiveCards = useCallback(async (targetListIds: string[]) => {
    if (!targetListIds.length) {
      setCards([]);
      return;
    }

    try {
      const cardsByList = await Promise.all(
        targetListIds.map(async (listId) => {
          const response = await apiClient.get(
            `/lists/${listId}/cards?status=ACTIVE`,
          );

          const payload = (response as { data?: unknown }).data ?? response;
          const listCards = Array.isArray(payload) ? payload : [];

          return listCards.map((card: any) => ({
            ...card,
            listId,
          }));
        }),
      );

      setCards(cardsByList.flat());
    } catch {
      toast.error("Failed to fetch cards");
    }
  }, []);

  useEffect(() => {
    fetchActiveCards(listIds);
  }, [listIds, fetchActiveCards]);

  useEffect(() => {
    setListOrder((prev) => {
      const visibleListIds = visibleLists.map((list) => list.id);

      if (!prev) {
        return visibleListIds;
      }

      const filteredPrev = prev.filter((id) => visibleListIds.includes(id));
      const missingIds = visibleListIds.filter(
        (id) => !filteredPrev.includes(id),
      );

      return [...filteredPrev, ...missingIds];
    });
  }, [visibleLists]);

  const fetchArchivedLists = useCallback(async () => {
    try {
      const response = await apiClient.get(
        `/boards/${boardId}/lists?status=ARCHIVED`,
      );

      const payload = (response as { data?: unknown }).data ?? response;
      const archived = Array.isArray(payload) ? payload : [];

      setArchivedLists(
        archived.map((list: any) => ({
          ...list,
          previousIndex: 0,
          previousListId: null,
          nextListId: null,
        })),
      );
    } catch {
      toast.error("Failed to fetch archived lists");
    }
  }, [boardId]);

  useEffect(() => {
    if (!boardId || !isActiveBoard) {
      return;
    }

    fetchArchivedLists();
  }, [boardId, isActiveBoard, fetchArchivedLists]);

  const allListsForArchivedCards = useMemo(() => {
    const merged = [...baseLists, ...archivedLists];
    const uniqueLists = merged.filter(
      (list, index, self) =>
        self.findIndex((item) => item.id === list.id) === index,
    );

    return uniqueLists;
  }, [baseLists, archivedLists]);

  const fetchArchivedCards = useCallback(
    async (listsToScan: { id: string }[]) => {
      if (!listsToScan.length) {
        setArchivedCards([]);
        return;
      }

      try {
        const archivedCardsByList = await Promise.all(
          listsToScan.map(async (list) => {
            const response = await apiClient.get(
              `/lists/${list.id}/cards?status=ARCHIVED`,
            );

            const payload = (response as { data?: unknown }).data ?? response;
            const listCards = Array.isArray(payload) ? payload : [];

            return listCards.map((card: any) => ({
              ...card,
              listId: list.id,
              previousIndex: 0,
              previousCardId: null,
              nextCardId: null,
            }));
          }),
        );

        setArchivedCards(archivedCardsByList.flat());
      } catch {
        toast.error("Failed to fetch archived cards");
      }
    },
    [],
  );

  const getCurrentCards = () => useCardsStore.getState().cards;

  const updateCards = (updater: (currentCards: BoardCard[]) => BoardCard[]) => {
    const currentCards = getCurrentCards();
    setCards(updater(currentCards));
  };

  const getCardsInList = (listId: string, sourceCards: BoardCard[]) =>
    sourceCards.filter((card) => card.listId === listId);

  const getCurrentListOrder = () =>
    listOrder ?? baseLists.map((list) => list.id);

  const findListById = (listId: string) =>
    baseLists.find((list) => list.id === listId) ??
    orderedLists.find((list) => list.id === listId);

  const createCard = async (listId: string, title: string) => {
    try {
      const response = await apiClient.post(`/lists/${listId}/cards`, {
        title,
      });
      const newCard = (response as { data?: unknown }).data ?? response;

      if (newCard && typeof newCard === "object" && "id" in newCard) {
        updateCards((currentCards) => [
          ...currentCards,
          { ...(newCard as BoardCard), listId },
        ]);
      }
    } catch {
      toast.error("Failed to create card");
    }
  };

  function handleListDragStart(e: React.DragEvent, listId: string) {
    e.stopPropagation();
    setDraggedListId(listId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("application/x-kanban-column", listId);
  }

  function handleListDragOver(e: React.DragEvent, listId: string) {
    if (!e.dataTransfer.types.includes("application/x-kanban-column")) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    if (draggedListId && draggedListId !== listId) {
      setDragOverListId(listId);
    }
  }

  async function handleListDrop(e: React.DragEvent, targetListId: string) {
    if (!e.dataTransfer.types.includes("application/x-kanban-column")) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    if (!draggedListId || draggedListId === targetListId) {
      return;
    }

    const sourceLists =
      listOrder?.length === orderedLists.length
        ? listOrder
            .map((listId) => orderedLists.find((list) => list.id === listId))
            .filter((list): list is List => Boolean(list))
        : orderedLists;

    const nextLists = [...sourceLists];
    const draggedIndex = nextLists.findIndex(
      (list) => list.id === draggedListId,
    );
    const targetIndex = nextLists.findIndex((list) => list.id === targetListId);

    if (draggedIndex < 0 || targetIndex < 0) {
      return;
    }

    const [draggedList] = nextLists.splice(draggedIndex, 1);
    nextLists.splice(targetIndex, 0, draggedList);

    const previousListId = nextLists[targetIndex - 1]?.id;
    const nextListId = nextLists[targetIndex + 1]?.id;

    const previousOrder = sourceLists.map((list) => list.id);
    const nextOrder = nextLists.map((list) => list.id);

    setListOrder(nextOrder);

    try {
      await apiClient.patch(`/lists/${draggedList.id}/move`, {
        beforeListId: previousListId,
        afterListId: nextListId,
      });
    } catch {
      setListOrder(previousOrder);
      toast.error("Error updating list position");
    } finally {
      setDraggedListId(null);
      setDragOverListId(null);
    }
  }

  function handleListDragEnd() {
    setDraggedListId(null);
    setDragOverListId(null);
  }

  async function handleCardDropToList(targetListId: string, data: string) {
    try {
      // Trim whitespace and check if data is valid
      const trimmedData = (data || "").trim();

      if (!trimmedData) {
        console.error("Data is empty/null after trimming");
        toast.error("Invalid card data");
        return;
      }

      console.log("Raw data received:", trimmedData);

      let draggedCard: BoardCard;
      try {
        draggedCard = JSON.parse(trimmedData);
        console.log("Parsed successfully:", draggedCard);
      } catch (parseError) {
        console.error("JSON.parse failed:", parseError, "Data:", trimmedData);
        toast.error("Error parsing card data");
        return;
      }

      if (!draggedCard.id) {
        console.error("Card has no ID");
        toast.error("Invalid card: no ID");
        return;
      }

      if (draggedCard.listId === targetListId) {
        return;
      }

      const previousCards = getCurrentCards();
      const nextCards = previousCards.map((card) =>
        card.id === draggedCard.id ? { ...card, listId: targetListId } : card,
      );

      setCards(nextCards);

      try {
        await apiClient.patch(`/cards/${draggedCard.id}/move`, {
          targetListId,
        });
      } catch {
        setCards(previousCards);
        toast.error("Error updating card position");
      }
    } catch (error) {
      console.error("Error in handleCardDropToList:", error);
      toast.error("Error parsing card data");
    }
  }

  async function handleCardDropToCard(
    targetCardId: string,
    data: string,
    direction: KanbanBoardDropDirection,
  ) {
    if (direction === "none") {
      return;
    }

    try {
      // Trim whitespace and check if data is valid
      const trimmedData = (data || "").trim();

      if (!trimmedData) {
        console.error("Data is empty/null after trimming");
        toast.error("Invalid card data");
        return;
      }

      console.log("Raw card-to-card data:", trimmedData);

      let draggedCard: BoardCard;
      try {
        draggedCard = JSON.parse(trimmedData);
        console.log("Parsed successfully:", draggedCard);
      } catch (parseError) {
        console.error("JSON.parse failed:", parseError, "Data:", trimmedData);
        toast.error("Error parsing card data");
        return;
      }

      if (!draggedCard.id) {
        console.error("Card has no ID");
        toast.error("Invalid card: no ID");
        return;
      }

      if (draggedCard.id === targetCardId) {
        return;
      }

      const previousCards = getCurrentCards();
      const targetCard = previousCards.find((card) => card.id === targetCardId);

      if (!targetCard) {
        return;
      }

      const cardsWithoutDragged = previousCards.filter(
        (card) => card.id !== draggedCard.id,
      );

      const targetIndex = cardsWithoutDragged.findIndex(
        (card) => card.id === targetCardId,
      );

      if (targetIndex === -1) {
        return;
      }

      const insertIndex = direction === "top" ? targetIndex : targetIndex + 1;

      const nextCards = [
        ...cardsWithoutDragged.slice(0, insertIndex),
        { ...draggedCard, listId: targetCard.listId },
        ...cardsWithoutDragged.slice(insertIndex),
      ];

      const beforeCardId = nextCards[insertIndex - 1]?.id;
      const afterCardId = nextCards[insertIndex + 1]?.id;

      setCards(nextCards);

      try {
        await apiClient.patch(`/cards/${draggedCard.id}/move`, {
          targetListId: targetCard.listId,
          beforeCardId,
          afterCardId,
        });
      } catch {
        setCards(previousCards);
        toast.error("Error updating card position");
      }

      return nextCards;
    } catch (error) {
      console.error("Error in handleCardDropToCard:", error);
      toast.error("Error parsing card data");
    }
  }

  function handleArchiveDragOver(e: React.DragEvent) {
    const isCard = e.dataTransfer.types.includes("kanban-board-card");
    const isList = e.dataTransfer.types.includes("application/x-kanban-column");

    if (!isCard && !isList) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    setIsDragOverArchive(true);
  }

  function handleArchiveDragLeave() {
    setIsDragOverArchive(false);
  }

  async function archiveCard(card: BoardCard) {
    const currentCards = getCurrentCards();
    const cardsInSameList = getCardsInList(card.listId, currentCards);
    const previousIndex = cardsInSameList.findIndex(
      (currentCard) => currentCard.id === card.id,
    );

    if (previousIndex === -1) {
      return;
    }

    const previousCardId =
      previousIndex > 0 ? cardsInSameList[previousIndex - 1].id : null;
    const nextCardId =
      previousIndex < cardsInSameList.length - 1
        ? cardsInSameList[previousIndex + 1].id
        : null;

    setArchivedCards((prev) =>
      prev.find((archivedCard) => archivedCard.id === card.id)
        ? prev
        : [
            ...prev,
            {
              ...card,
              previousIndex,
              previousCardId,
              nextCardId,
            },
          ],
    );

    updateCards((current) =>
      current.filter((currentCard) => currentCard.id !== card.id),
    );

    try {
      await apiClient.patch(`/cards/${card.id}/archive`);
      toast.success(`Archived card "${card.title}"`);
    } catch (error) {
      setCards(currentCards);
      setArchivedCards((prev) => prev.filter((c) => c.id !== card.id));
      toast.error("Failed to archive card");
    }
  }

  async function archiveList(listId: string) {
    const list = findListById(listId);
    const currentListOrder = getCurrentListOrder();
    const previousIndex = currentListOrder.findIndex((id) => id === listId);

    if (!list || previousIndex === -1) {
      return;
    }

    const previousListId =
      previousIndex > 0 ? currentListOrder[previousIndex - 1] : null;
    const nextListId =
      previousIndex < currentListOrder.length - 1
        ? currentListOrder[previousIndex + 1]
        : null;

    setArchivedLists((prev) =>
      prev.find((savedList) => savedList.id === list.id)
        ? prev
        : [
            ...prev,
            {
              ...list,
              previousIndex,
              previousListId,
              nextListId,
            },
          ],
    );

    setListOrder((prev) => {
      const currentOrder = prev ?? baseLists.map((baseList) => baseList.id);
      return currentOrder.filter((id) => id !== list.id);
    });

    try {
      await apiClient.patch(`/lists/${list.id}/archive`);
      toast.success(`Archived list "${list.name}"`);
    } catch (error) {
      setListOrder((prev) => {
        const currentOrder = prev ?? baseLists.map((baseList) => baseList.id);
        return [...currentOrder, list.id];
      });
      toast.error("Failed to archive list");
    }
  }

  function handleArchiveDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOverArchive(false);

    const cardData = e.dataTransfer.getData("kanban-board-card");
    if (cardData && cardData.trim()) {
      try {
        const card = JSON.parse(cardData) as BoardCard;
        archiveCard(card);
        return;
      } catch (error) {
        console.error("Failed to parse card data for archive:", error);
        toast.error("Error parsing card data");
        return;
      }
    }

    const listId = e.dataTransfer.getData("application/x-kanban-column");
    if (!listId) {
      return;
    }

    archiveList(listId);
    setDraggedListId(null);
    setDragOverListId(null);
  }

  const startEditingList = (list: List) => {
    setEditingListId(list.id);
    setEditingListName(list.name);
  };

  const handleSaveListName = async (listId: string) => {
    const nextName = editingListName.trim();

    if (!nextName) {
      setEditingListId(null);
      return;
    }

    try {
      await apiClient.patch(`/lists/${listId}/update`, {
        name: nextName,
      });

      fetchLists(boardId);
    } catch {
      toast.error("Failed to update list name");
    } finally {
      setEditingListId(null);
    }
  };

  const restoreCard = async (card: ArchivedCard) => {
    setArchivedCards((prev) =>
      prev.filter((archivedCard) => archivedCard.id !== card.id),
    );

    updateCards((currentCards) => {
      if (currentCards.find((currentCard) => currentCard.id === card.id)) {
        return currentCards;
      }

      const cardsNotInTargetList = currentCards.filter(
        (currentCard) => currentCard.listId !== card.listId,
      );

      const cardsInTargetList = currentCards.filter(
        (currentCard) => currentCard.listId === card.listId,
      );

      const nextCardsInTargetList = [...cardsInTargetList];

      if (card.previousCardId) {
        const previousIndex = nextCardsInTargetList.findIndex(
          (currentCard) => currentCard.id === card.previousCardId,
        );
        if (previousIndex !== -1) {
          nextCardsInTargetList.splice(previousIndex + 1, 0, card);
          return [...cardsNotInTargetList, ...nextCardsInTargetList];
        }
      }

      if (card.nextCardId) {
        const nextIndex = nextCardsInTargetList.findIndex(
          (currentCard) => currentCard.id === card.nextCardId,
        );
        if (nextIndex !== -1) {
          nextCardsInTargetList.splice(nextIndex, 0, card);
          return [...cardsNotInTargetList, ...nextCardsInTargetList];
        }
      }

      const insertIndex = Math.max(
        0,
        Math.min(card.previousIndex, nextCardsInTargetList.length),
      );

      nextCardsInTargetList.splice(insertIndex, 0, card);

      return [...cardsNotInTargetList, ...nextCardsInTargetList];
    });

    try {
      await apiClient.patch(`/cards/${card.id}/restore`);
      await fetchActiveCards(listIds);
      await fetchArchivedCards(allListsForArchivedCards);
      toast.success(`Restored card "${card.title}"`);
    } catch {
      setArchivedCards((prev) => [...prev, card]);
      updateCards((current) => current.filter((c) => c.id !== card.id));
      toast.error("Failed to restore card");
    }
  };

  const restoreList = async (list: ArchivedList) => {
    const previous = archivedLists;
    setArchivedLists((prev) =>
      prev.filter((archivedList) => archivedList.id !== list.id),
    );

    setListOrder((prev) => {
      const currentOrder =
        prev ??
        baseLists.map((baseList) => baseList.id).filter((id) => id !== list.id);

      if (currentOrder.includes(list.id)) {
        return currentOrder;
      }

      const nextOrder = [...currentOrder];

      if (list.previousListId) {
        const previousIndex = nextOrder.indexOf(list.previousListId);
        if (previousIndex !== -1) {
          nextOrder.splice(previousIndex + 1, 0, list.id);
          return nextOrder;
        }
      }

      if (list.nextListId) {
        const nextIndex = nextOrder.indexOf(list.nextListId);
        if (nextIndex !== -1) {
          nextOrder.splice(nextIndex, 0, list.id);
          return nextOrder;
        }
      }

      const insertIndex = Math.max(
        0,
        Math.min(list.previousIndex, nextOrder.length),
      );
      nextOrder.splice(insertIndex, 0, list.id);

      return nextOrder;
    });

    try {
      await apiClient.patch(`/lists/${list.id}/restore`);
      await fetchLists(boardId);
      await fetchArchivedLists();
      toast.success(`Restored list "${list.name}"`);
    } catch {
      setArchivedLists(previous);
      setListOrder((prev) => {
        const currentOrder =
          prev ??
          baseLists
            .map((baseList) => baseList.id)
            .filter((id) => id !== list.id);
        return currentOrder.filter((id) => id !== list.id);
      });
      toast.error("Failed to restore list");
    }
  };

  if (loading) {
    return (
      <div className="flex h-full w-full flex-col overflow-hidden bg-gray-50/50">
        {/* Header Board Skeleton */}
        <div className="flex items-center justify-between px-6 py-3 border-b bg-white ">
          <div className="flex items-center gap-4">
            <Skeleton className="h-8 w-48 rounded-md" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-8 w-8 rounded-full" />
          </div>
        </div>

        {/* Kanban Columns Skeleton */}
        <div className="flex-1 overflow-x-auto p-4 flex gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="w-88 flex-shrink-0 flex flex-col gap-3 rounded-xl bg-gray-200/50 p-3 h-max"
            >
              <Skeleton className="h-6 w-32 mb-2" />
              <Skeleton className="h-28 w-full rounded-lg bg-white/80" />
              <Skeleton className="h-28 w-full rounded-lg bg-white/80" />
              <Skeleton className="h-8 w-full rounded-md mt-2 bg-black/5" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>You do not have access to this board or it has been archived.</div>
    );
  }

  if (
    board?.status?.toUpperCase() === "ARCHIVED" ||
    board?.status?.toUpperCase() === "ARCHIVE"
  ) {
    return <div>This board is archived.</div>;
  }
  return (
    <>
      <Toaster position="top-right" />
      <div
        className="flex h-full w-full flex-col overflow-hidden"
        style={
          displayBackground
            ? {
                backgroundImage: `url(${displayBackground})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : {}
        }
      >
        <HeaderBoard
          boardId={boardId}
          boardName={board?.name}
          boardMembers={boardMembers}
          fetchBoard={fetchBoard}
          fetchBoardMembers={fetchBoardMembers}
          onPreviewBackground={setPreviewBackground}
        />

        <KanbanBoardProvider>
          <div className="hide-scrollbar flex-1 overflow-x-auto overflow-y-hidden p-4">
            <KanbanBoard>
              {orderedLists.map((list) => (
                <div
                  key={list.id}
                  onDragOver={(e) => handleListDragOver(e, list.id)}
                  onDrop={(e) => handleListDrop(e, list.id)}
                  className={`transition-all ${
                    draggedListId === list.id ? "opacity-50" : ""
                  } ${
                    dragOverListId === list.id && draggedListId !== list.id
                      ? "scale-105"
                      : ""
                  }`}
                >
                  <KanbanBoardColumn
                    className="relative w-88"
                    columnId={list.id}
                    onDropOverColumn={(data) =>
                      handleCardDropToList(list.id, data)
                    }
                  >
                    <KanbanBoardColumnHeader
                      draggable={editingListId !== list.id}
                      onDragStart={(e) => handleListDragStart(e, list.id)}
                      onDragEnd={handleListDragEnd}
                      className={editingListId !== list.id ? "cursor-move" : ""}
                    >
                      {editingListId === list.id ? (
                        <div className="w-full px-2">
                          <Input
                            value={editingListName}
                            onChange={(e) => setEditingListName(e.target.value)}
                            onBlur={() => handleSaveListName(list.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                handleSaveListName(list.id);
                              }

                              if (e.key === "Escape") {
                                setEditingListId(null);
                              }
                            }}
                            autoFocus
                            className="h-8 text-sm font-semibold"
                          />
                        </div>
                      ) : (
                        <KanbanBoardColumnTitle
                          columnId={list.id}
                          className="w-full select-none pl-2"
                          onDoubleClick={() => startEditingList(list)}
                        >
                          {list.name}
                        </KanbanBoardColumnTitle>
                      )}
                    </KanbanBoardColumnHeader>

                    <KanbanBoardColumnList>
                      {cards
                        .filter((card) => card.listId === list.id)
                        .map((card) => {
                          const totalItems =
                            card.checklists?.reduce(
                              (sum, checklist) =>
                                sum + (checklist.checklistItems?.length || 0),
                              0,
                            ) ?? 0;

                          const completedItems =
                            card.checklists?.reduce(
                              (sum, checklist) =>
                                sum +
                                (checklist.checklistItems?.filter(
                                  (item) => item.completed,
                                ).length || 0),
                              0,
                            ) ?? 0;

                          return (
                            <KanbanBoardColumnListItem
                              key={card.id}
                              cardId={card.id}
                              onDropOverListItem={(data, direction) =>
                                handleCardDropToCard(card.id, data, direction)
                              }
                            >
                              <KanbanBoardCard
                                data={card}
                                onClick={() =>
                                  navigate(
                                    `/boards/${boardId}/cards/${card.id}`,
                                  )
                                }
                                className="relative"
                              >
                                {card.cardLabels &&
                                  card.cardLabels.length > 0 && (
                                    <div className="mb-2 flex flex-wrap gap-1">
                                      {card.cardLabels.map((cardLabel: any) => {
                                        const labelDetail = cardLabel?.label;
                                        if (!labelDetail) {
                                          return null;
                                        }

                                        return (
                                          <span
                                            key={labelDetail.id}
                                            className="inline-block rounded-full px-2 text-[10px] font-semibold text-white"
                                            style={{
                                              backgroundColor:
                                                labelDetail.color,
                                            }}
                                          >
                                            {labelDetail.name}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  )}

                                <KanbanBoardCardTitle>
                                  {card.title}
                                </KanbanBoardCardTitle>

                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-4 text-xs">
                                    <div className="flex items-center gap-1">
                                      <MessageSquareText className="w-4" />
                                      {card.commentsCount || 0}
                                    </div>

                                    {totalItems > 0 && (
                                      <div className="flex items-center gap-1">
                                        <SquareCheck
                                          className="w-4"
                                          color={
                                            completedItems === totalItems
                                              ? "green"
                                              : "gray"
                                          }
                                        />
                                        <div className="flex items-center gap-1">
                                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200">
                                            <div
                                              className={`h-full rounded-full transition-all ${
                                                completedItems === totalItems
                                                  ? "bg-green-500"
                                                  : "bg-blue-400"
                                              }`}
                                              style={{
                                                width: `${(completedItems / totalItems) * 100}%`,
                                              }}
                                            />
                                          </div>
                                          <span
                                            className={`text-xs font-medium ${
                                              completedItems === totalItems
                                                ? "text-green-600"
                                                : "text-muted-foreground"
                                            }`}
                                          >
                                            {completedItems}/{totalItems}
                                          </span>
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  <div>
                                    {card.cardMembers &&
                                      card.cardMembers.length > 0 && (
                                        <AvatarGroup>
                                          {card.cardMembers.map(
                                            (cardMember: any) => {
                                              const memberDetail =
                                                cardMember?.user;
                                              if (!memberDetail) {
                                                return null;
                                              }

                                              return (
                                                <Avatar key={memberDetail.id}>
                                                  <AvatarImage
                                                    src={
                                                      memberDetail.avatar || ""
                                                    }
                                                    alt={`@${memberDetail.name}`}
                                                  />
                                                  <AvatarFallback>
                                                    {memberDetail.name
                                                      ? memberDetail.name
                                                          .charAt(0)
                                                          .toUpperCase()
                                                      : "?"}
                                                  </AvatarFallback>
                                                </Avatar>
                                              );
                                            },
                                          )}
                                        </AvatarGroup>
                                      )}
                                  </div>
                                </div>
                              </KanbanBoardCard>
                            </KanbanBoardColumnListItem>
                          );
                        })}
                    </KanbanBoardColumnList>

                    <KanbanBoardColumnFooter>
                      <CreateCard listId={list.id} onCardCreated={createCard} />
                    </KanbanBoardColumnFooter>
                  </KanbanBoardColumn>
                </div>
              ))}

              <div className="w-88 flex-shrink-0">
                <CreateList
                  boardId={boardId}
                  createList={createList}
                  loading={listsLoading}
                />
              </div>
            </KanbanBoard>
          </div>
        </KanbanBoardProvider>

        <Outlet />

        <div className="absolute bottom-8 right-6">
          <ArchivePopover
            savedCards={archivedCards}
            savedLists={archivedLists}
            isDragOver={isDragOverArchive}
            onDragOver={handleArchiveDragOver}
            onDragLeave={handleArchiveDragLeave}
            onDrop={handleArchiveDrop}
            onRestoreCard={restoreCard}
            onDeleteCard={async (card) => {
              const previous = archivedCards;
              setArchivedCards((prev) =>
                prev.filter((archivedCard) => archivedCard.id !== card.id),
              );

              try {
                await apiClient.delete(`/cards/${card.id}`);
                toast.success(`Deleted card "${card.title}"`);
              } catch {
                setArchivedCards(previous);
                toast.error("Failed to delete card");
              }
            }}
            onRestoreList={restoreList}
            onDeleteList={async (list) => {
              const previous = archivedLists;
              setArchivedLists((prev) =>
                prev.filter((archivedList) => archivedList.id !== list.id),
              );

              try {
                await apiClient.delete(`/lists/${list.id}`);
                await fetchLists(boardId);
                await fetchArchivedLists();
                toast.success(`Deleted list "${list.name}"`);
              } catch {
                setArchivedLists(previous);
                toast.error("Failed to delete list");
              }
            }}
          />
        </div>
      </div>
    </>
  );
}
