import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/apiClient";

type Card = {
  id: string;
  title: string;
  position: number;
  listId: string;
};

export const useCards = (listIds: string[]) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [cards, setCards] = useState<Card[]>([]);

  const createCard = useCallback(async (listId: string, title: string) => {
    try {
      setLoading(true);
      const response = await apiClient.post(`/lists/${listId}/cards`, {
        title,
      });

      const newCard = (response as { data?: unknown }).data ?? response;
      if (newCard && typeof newCard === "object" && "id" in newCard) {
        setCards((prevCards) => [...prevCards, { ...newCard, listId } as Card]);
      }

      setError(null);
      setLoading(false);
    } catch (error) {
      console.error("Failed to create card", error);
      setError(error);
      setLoading(false);
    }
  }, []);

  const fetchCards = useCallback(async (targetListIds: string[]) => {
    if (!targetListIds.length) {
      setCards([]);
      setLoading(false);
      setError(null);
      return;
    }

    try {
      setLoading(true);
      const cardsByList = await Promise.all(
        targetListIds.map(async (listId) => {
          const response = await apiClient.get(
            `/lists/${listId}/cards?status=ACTIVE`,
          );
          console.log("API Response for cards in list", listId, response);
          const payload = Array.isArray(response?.data) ? response.data : [];
          const listCards = Array.isArray(payload)
            ? (payload as Array<{
                id: string;
                title: string;
                position: number;
              }>)
            : [];

          return listCards.map((card) => ({ ...card, listId }));
        }),
      );

      setCards(cardsByList.flat());
      setLoading(false);
      setError(null);
    } catch (error) {
      console.error("Failed to fetch cards", error);
      setError(error);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCards(listIds);
  }, [listIds, fetchCards]);

  return { cards, loading, error, fetchCards, createCard };
};
