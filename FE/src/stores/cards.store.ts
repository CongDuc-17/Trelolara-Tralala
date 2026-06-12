import { create } from "zustand";

export interface Label {
  id: string;
  name: string;
  color: string;
}

export interface CardLabel {
  id: string;
  cardId: string;
  labelId: string;
  label: Label; // Object lồng nhau do Prisma include
}

export interface User {
  id: string;
  name: string;
  avatar?: string | null;
}

export interface CardMember {
  id: string;
  cardId: string;
  userId: string;
  user: User; // Object lồng nhau
}

export interface ChecklistItem {
  id: string;
  title: string;
  completed: boolean;
}

export interface Checklist {
  id: string;
  cardId: string;
  title: string;
  createdAt?: string;
  checklistItems: ChecklistItem[];
}

export interface Comment {
  id: string;
  cardId: string;
  content: string;

  user?: User;

  createdAt: string;
  updatedAt: string;
}

export interface Card {
  id: string;
  title: string;
  description?: string | null;
  listId: string;
  position: number;
  dueDate?: string | null;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
  cardLabels?: CardLabel[];
  cardMembers?: CardMember[];
  checklists?: Checklist[];
  comments?: Comment[];
  commentsCount?: number;
}

interface CardsStore {
  cards: Card[];
  currentCardId: string | null;
  loading: boolean;
  error: Error | null | string;

  setCards: (cards: Card[]) => void;
  setCurrentCardId: (cardId: string | null) => void;
  getCurrentCard: () => Card | undefined;
  createCard: (card: Card) => void;
  updateCard: (card: Card) => void;
  deleteCard: (cardId: string) => void;

  setLoading: (loading: boolean) => void;
  setError: (error: Error | null | string) => void;

  // Optimistic UI Actions
  addLabel: (cardId: string, label: Label) => void;
  removeLabel: (cardId: string, labelId: string) => void;

  addMember: (cardId: string, user: User) => void;
  removeMember: (cardId: string, userId: string) => void;

  addChecklist: (cardId: string, checklist: Checklist) => void;
  removeChecklist: (cardId: string, checklistId: string) => void;
}

export const useCardsStore = create<CardsStore>((set, get) => ({
  cards: [],
  currentCardId: null,
  loading: false,
  error: null,

  setCards: (incomingCards) =>
    set((state) => {
      // 1. Lưu state cũ thành Map để tra cứu ID cho nhanh
      const existingCardsMap = new Map(state.cards.map((c) => [c.id, c]));

      // 2. Map mảng mới và hòa trộn (merge) nếu card đã tồn tại
      const mergedCards = incomingCards.map((incomingCard) => {
        const existingCard = existingCardsMap.get(incomingCard.id);
        if (existingCard) {
          return {
            ...existingCard, // Lấy nền cũ
            ...incomingCard, // Đè thông tin cơ bản mới lên (title, position...)
            // 3. Giữ lại comments nếu API load board không trả về comments
            comments: incomingCard.comments ?? existingCard.comments,
          };
        }
        return incomingCard;
      });

      // 4. BẢO HIỂM: Nếu user đang mở 1 card chi tiết nhưng API của Board load chậm
      // chưa kịp trả về card đó, ta ráng nhét nó lại vào mảng để UI modal không bị crash
      if (state.currentCardId) {
        const isCurrentCardInMerged = mergedCards.some(
          (c) => c.id === state.currentCardId,
        );
        if (!isCurrentCardInMerged) {
          const currentCardData = existingCardsMap.get(state.currentCardId);
          if (currentCardData) {
            mergedCards.push(currentCardData);
          }
        }
      }

      return { cards: mergedCards, error: null };
    }),

  setCurrentCardId: (cardId) => set({ currentCardId: cardId }),
  getCurrentCard: () => {
    const { cards, currentCardId } = get();
    return cards.find((c) => c.id === currentCardId);
  },
  createCard: (card) => set((state) => ({ cards: [...state.cards, card] })),

  updateCard: (updatedCard) =>
    set((state) => ({
      cards: state.cards.map((c) =>
        c.id === updatedCard.id ? { ...c, ...updatedCard } : c,
      ),
    })),
  deleteCard: (cardId) =>
    set((state) => ({
      cards: state.cards.filter((card) => card.id !== cardId),
    })),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),

  // --- LOGIC XỬ LÝ LỒNG NHAU (Khớp với Prisma Join Table) ---
  addLabel: (cardId, label) =>
    set((state) => ({
      cards: state.cards.map((card) =>
        card.id === cardId
          ? {
              ...card,
              cardLabels: [
                ...(card.cardLabels || []),
                {
                  id: `temp-${Date.now()}`,
                  cardId: cardId,
                  labelId: label.id,
                  label: label,
                },
              ],
            }
          : card,
      ),
    })),

  removeLabel: (cardId, labelIdToRemove) =>
    set((state) => ({
      cards: state.cards.map((card) =>
        card.id === cardId
          ? {
              ...card,
              cardLabels: card.cardLabels?.filter(
                (cl) =>
                  cl.labelId !== labelIdToRemove &&
                  cl.label?.id !== labelIdToRemove,
              ),
            }
          : card,
      ),
    })),

  addMember: (cardId, user) =>
    set((state) => ({
      cards: state.cards.map((card) =>
        card.id === cardId
          ? {
              ...card,
              cardMembers: [
                ...(card.cardMembers || []),
                {
                  id: `temp-${Date.now()}`,
                  cardId: cardId,
                  userId: user.id,
                  user: user,
                },
              ],
            }
          : card,
      ),
    })),

  removeMember: (cardId, userIdToRemove) =>
    set((state) => ({
      cards: state.cards.map((card) =>
        card.id === cardId
          ? {
              ...card,
              cardMembers: card.cardMembers?.filter(
                (m) =>
                  m.userId !== userIdToRemove && m.user?.id !== userIdToRemove,
              ),
            }
          : card,
      ),
    })),

  addChecklist: (cardId, checklist) =>
    set((state) => ({
      cards: state.cards.map((card) =>
        card.id === cardId
          ? { ...card, checklists: [...(card.checklists || []), checklist] }
          : card,
      ),
    })),

  removeChecklist: (cardId, checklistId) =>
    set((state) => ({
      cards: state.cards.map((card) =>
        card.id === cardId
          ? {
              ...card,
              checklists: card.checklists?.filter((c) => c.id !== checklistId),
            }
          : card,
      ),
    })),
}));
