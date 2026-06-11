import { apiClient } from "@/lib/apiClient";
import { useProjectsStore } from "@/stores/projects.store";
import { useEffect, useState } from "react";

type ApiResponse<T> = {
  success: boolean;
  data: T;
  pagination?: unknown;
};

export type Project = {
  id: string;
  name: string;
  description?: string;
  status?: string;
  roleId?: string;
  roleName?: string;
  membersCount?: number;
  boardsCount?: number;
  boards?: Board[];
  members?: ProjectMember[];
};

export type Board = {
  id: string;
  projectId?: string;
  name: string;
  description?: string;
  background?: string;
  status?: string;
  roleId?: string;
  roleName?: string;
  projectName?: string;
  projectStatus?: string;
  membersCount?: number;
  listsCount?: number;
};

type ProjectMember = {
  projectId: string;
  id: string;
  name: string;
  email: string;
  avatar?: string | null;
  roleId: string;
  roleName: string;
};

type UseProjectsOptions = {
  includeBoards?: boolean;
  autoFetch?: boolean;
};

const toStoreError = (error: unknown) =>
  error instanceof Error ? error : String(error);

export const useProjects = ({
  includeBoards = false,
  autoFetch = true,
}: UseProjectsOptions = {}) => {
  const [userBoards, setUserBoards] = useState<Board[]>([]);
  const {
    projects,
    setProjects,
    updateProject,
    updateProjectBoards,
    updateProjectMembers,
    loading,
    setLoading,
    error,
    setError,
  } = useProjectsStore();

  async function fetchProjects() {
    try {
      const response = (await apiClient.get(
        "/projects",
      )) as unknown as ApiResponse<Project[]>;

      console.log("Response object:", response);  
      // console.log("Response data:", response.data);  
    
      setProjects(
        response.data.map((project: Project) => ({
          ...project,
          boards: [],
          members: [],
        })),
      );
      setError(null);
    } catch (error) {
      console.error("Failed to fetch projects", error);
      setError(toStoreError(error));
    }
  }

  async function fetchProjectById(projectId: string) {
    try {
      const response = (await apiClient.get(
        `/projects/${projectId}`,
      )) as unknown as ApiResponse<Project>;

      updateProject(response.data);

      setError(null);
      return response.data;
    } catch (error) {
      console.error("Failed to fetch project detail", error);
      setError(toStoreError(error));
      return null;
    }
  }

  async function fetchProjectBoards(projectId: string) {
    try {
      const response = (await apiClient.get(
        `/projects/${projectId}/boards`,
      )) as unknown as ApiResponse<Board[]>;

      updateProjectBoards(projectId, response.data);

      setError(null);
      return response.data;
    } catch (error) {
      console.error("Failed to fetch project boards", error);
      setError(toStoreError(error));
      return [];
    }
  }

  async function fetchUserBoards() {
    try {
      const response = (await apiClient.get(
        "/boards",
      )) as unknown as ApiResponse<Board[]>;

      setUserBoards(response.data);
      setError(null);
      return response.data;
    } catch (error) {
      console.error("Failed to fetch user boards", error);
      setError(toStoreError(error));
      return [];
    }
  }

  async function fetchProjectMembers(projectId: string) {
    try {
      const response = (await apiClient.get(
        `/projects/${projectId}/members`,
      )) as unknown as ApiResponse<ProjectMember[]>;

      updateProjectMembers(projectId, response.data);

      setError(null);
      return response.data;
    } catch (error) {
      console.error("Failed to fetch project members", error);
      setError(toStoreError(error));
      return [];
    }
  }

  async function fetchProjectsWithBoards() {
    try {
      setLoading(true);

      const projectsResponse = (await apiClient.get(
        "/projects",
      )) as unknown as ApiResponse<Project[]>;
      const projects = projectsResponse.data;
      const [boardResults, userBoardsResult] = await Promise.all([
        Promise.allSettled(
          projects.map(
            async (project: Project) =>
              (await apiClient.get(
                `/projects/${project.id}/boards`,
              )) as unknown as ApiResponse<Board[]>,
          ),
        ),
        Promise.allSettled([
          apiClient.get("/boards") as unknown as Promise<ApiResponse<Board[]>>,
        ]),
      ]);
      setUserBoards(
        userBoardsResult[0].status === "fulfilled"
          ? userBoardsResult[0].value.data
          : [],
      );

      const projectsWithBoards = projects.map((project: Project, index) => ({
        ...project,
        boards:
          boardResults[index].status === "fulfilled"
            ? boardResults[index].value.data
            : undefined,
      }));

      setProjects(projectsWithBoards);
      setError(null);
    } catch (error) {
      console.error("Failed to fetch dashboard projects", error);
      setError(toStoreError(error));
    } finally {
      setLoading(false);
    }
  }

  async function createProject(data: { name: string; description?: string }) {
    try {
      setLoading(true);
      await apiClient.post("/projects", data);
      await fetchProjects();
    } catch (error) {
      console.error("Failed to create project", error);
      setError(toStoreError(error));
    } finally {
      setLoading(false);
    }
  }

  // Helper function to get boards for a specific project from store
  const getProjectBoards = (projectId: string) => {
    const project = projects.find((p) => p.id === projectId);
    return project?.boards || [];
  };

  const getProjectById = (projectId: string) => {
    return projects.find((p) => p.id === projectId);
  };

  useEffect(() => {
    if (!autoFetch) {
      return;
    }

    if (includeBoards) {
      fetchProjectsWithBoards();
    } else {
      fetchProjects();
    }
  }, [autoFetch, includeBoards]);

  return {
    projects,
    loading,
    error,
    createProject,
    userBoards,
    getProjectBoards,
    getProjectById,
    fetchProjects,
    fetchProjectById,
    fetchProjectBoards,
    fetchUserBoards,
    fetchProjectMembers,
    fetchProjectsWithBoards,
  };
};
