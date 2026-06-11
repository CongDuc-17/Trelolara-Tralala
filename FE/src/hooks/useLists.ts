import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/apiClient";

type List = { id: string; name: string; position: number };

export const useLists = (boardId: string, options = { enabled: true }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [lists, setLists] = useState<List[]>([]);

const fetchLists = useCallback(async (boardId: string) => {
  try {
    setLoading(true);
    const response = await apiClient.get(`/boards/${boardId}/lists?status=ACTIVE`);
    const payload = (response as { data?: unknown }).data ?? response;
    setLists(Array.isArray(payload) ? (payload as List[]) : []);
    setError(null);
  } catch (error) {
    console.error("Failed to fetch lists", error);
    setError(error);
  } finally {
    setLoading(false);
  }
}, []);

useEffect(() => {
  if (options.enabled && boardId) {
    fetchLists(boardId);
  }
}, [boardId, options.enabled, fetchLists]);

  async function createList(
    boardId: string,
    data: { name: string; description?: string },
  ) {
    setLoading(true);
    try {
      const response = await apiClient.post(`/boards/${boardId}/lists`, data);
      const payload = (response as { data?: unknown }).data ?? response;
      const createdList = payload as List;

      setLists((prev) => [...prev, createdList]);
      setError(null);
      return createdList;
    } catch (error) {
      console.error("Failed to create list", error);
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }

  return { lists, loading, error, fetchLists, createList };
};
