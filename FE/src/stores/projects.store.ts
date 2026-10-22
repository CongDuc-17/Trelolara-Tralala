import { create, type StateCreator } from "zustand";
import { getSessionVersion } from "@/lib/apiClient";
interface Project {
  id: string;
  name: string;
  description?: string;
  status?: string;
  roleId?: string;
  roleName?: string;
  membersCount?: number;
  boardsCount?: number;
  members?: ProjectMembers[];
  boards?: Board[];
}
interface Board {
  id: string;
  projectId?: string;
  name: string;
  description?: string;
  background?: string;
  status?: string;
  membersCount?: number;
  listsCount?: number;
}

interface ProjectMembers {
  projectId: string;
  id: string;
  name: string;
  email: string;
  avatar?: string | null;
  roleId: string;
  roleName: string;
}

interface ProjectsStore {
  projects: Project[];
  loading: boolean;
  error: Error | null | string;

  setProjects: (projects: Project[]) => void;
  createProject: (project: Project) => void;
  updateProject: (project: Project) => void;
  deleteProject: (projectId: string) => void;
  updateProjectName: (projectId: string, newName: string) => void;
  updateProjectBoards: (projectId: string, boards: Board[]) => void;

  updateProjectMembers: (projectId: string, members: ProjectMembers[]) => void;
  createBoardToProject: (projectId: string, board: Board) => void;

  updateMembersCount: (projectId: string, count: number) => void;

  setLoading: (loading: boolean) => void;
  setError: (error: Error | null | string) => void;
}

const createProjectsState: StateCreator<ProjectsStore> = (rawSet) => {
  const version = getSessionVersion();
  const set = (partial: Partial<ProjectsStore> | ((state: ProjectsStore) => Partial<ProjectsStore>)) => {
    if (version === getSessionVersion()) rawSet(partial);
  };
  return ({
  projects: [],
  loading: false,
  error: null,

  setProjects: (projects) =>
    set((state) => ({
      projects: projects.map((project) => {
        const existing = state.projects.find((p) => p.id === project.id);

        return {
          ...existing,
          ...project,
          boards: project.boards ?? existing?.boards ?? [],
          members: project.members ?? existing?.members ?? [],
        };
      }),
      error: null,
    })),
  createProject: (project) =>
    set((state) => ({ projects: [...state.projects, project] })),
  updateProject: (project) =>
    set((state) => {
      const exists = state.projects.some((p) => p.id === project.id);

      if (!exists) {
        return { projects: [...state.projects, project] };
      }

      return {
        projects: state.projects.map((p) =>
          p.id === project.id
            ? {
                ...p,
                ...project,
                members: project.members ?? p.members,
                boards: project.boards ?? p.boards,
              }
            : p,
        ),
      };
    }),
  deleteProject: (projectId) =>
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== projectId),
    })),

  createBoardToProject: (projectId, board) =>
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              boards: p.boards ? [...p.boards, board] : [board],
              boardsCount: (p.boardsCount ?? 0) + 1,
            }
          : p,
      ),
    })),

  updateMembersCount: (projectId, count) =>
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === projectId ? { ...p, membersCount: count } : p,
      ),
    })),

  updateProjectName: (projectId, newName) =>
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === projectId ? { ...p, name: newName } : p,
      ),
    })),

  updateProjectBoards: (projectId, boards) =>
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === projectId ? { ...p, boards } : p,
      ),
    })),

  updateProjectMembers: (projectId, members) =>
    set((state) => {
      const exists = state.projects.some((p) => p.id === projectId);

      if (!exists) {
        return {
          projects: [
            ...state.projects,
            {
              id: projectId,
              name: "",
              members,
              boards: [],
            },
          ],
        };
      }

      return {
        projects: state.projects.map((p) =>
          p.id === projectId ? { ...p, members } : p,
        ),
      };
    }),

  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  });
};

export const useProjectsStore = create<ProjectsStore>(createProjectsState);
export function resetProjectsStore() {
  useProjectsStore.setState(createProjectsState(useProjectsStore.setState, useProjectsStore.getState, useProjectsStore), true);
}
