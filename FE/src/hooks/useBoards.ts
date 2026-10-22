import { useEffect, useState } from "react";
import { apiClient } from "@/lib/apiClient";
import { useProjectsStore } from "@/stores/projects.store";
import { useParams } from "react-router-dom";

type Board = {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  background?: string;
  status?: string;
  roleId?: string;
  roleName?: string;
  memberCount?: number;
  listCount?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type BoardMember = {
  boardId: string;
  userId: string;
  name: string;
  email: string;
  avatar: string;
  roleId: string;
  roleName: string;
};

type BoardLabel = {
  id: string;
  name: string;
  color: string;
};

export const useBoards = () => {
  const boardId = useParams().boardId as string;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [boardMembers, setBoardMembers] = useState<BoardMember[]>([]);
  const [labelsBoard, setLabelsBoard] = useState<BoardLabel[]>([]);
  const { createBoardToProject } = useProjectsStore();

  async function createBoard(
    projectId: string,
    data: { name: string; description?: string; background?: string },
  ) {
    try {
      setLoading(true);
      const response = await apiClient.post<Board>(
        `/projects/${projectId}/boards`,
        data,
      );

      createBoardToProject(projectId, {
        id: response.data.id,
        projectId: response.data.projectId,
        name: response.data.name,
        description: response.data.description,
        background: response.data.background,
        status: response.data.status,
        membersCount: response.data.memberCount,
        listsCount: response.data.listCount,
      });
      setLoading(false);
      setError(null);
    } catch (error) {
      setLoading(false);
      setError(error);
      throw error;
    }
  }

  async function fetchBoard() {
    if (!boardId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const response = await apiClient.get<Board>(
        `/boards/${boardId}`,
      );

      setBoard(response.data);
      setError(null);
    } catch (error) {
      console.error("Failed to fetch board", error);
      setError(error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchBoardMembers() {
    if (!boardId) {
      return;
    }

    try {
      const response = await apiClient.get<BoardMember[]>(
        `/boards/${boardId}/members`,
      );

      setBoardMembers(response.data);
    } catch (error) {
      console.error("Error fetching board members:", error);
      setError(error);
    }
  }

  async function fetchLabelsBoard() {
    if (!boardId) {
      return;
    }

    try {
      const response = await apiClient.get<BoardLabel[]>(
        `/boards/${boardId}/labels`,
      );

      setLabelsBoard(response.data);
    } catch (error) {
      console.error("Error fetching labels for board:", error);
      setError(error);
    }
  }

  useEffect(() => {
    fetchBoard();
    fetchBoardMembers();
    fetchLabelsBoard();
  }, [boardId]);

  return {
    loading,
    error,
    board,
    boardMembers,
    labelsBoard,
    createBoard,
    fetchBoard,
    fetchBoardMembers,
    fetchLabelsBoard,
  };
};
