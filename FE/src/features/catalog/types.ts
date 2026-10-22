export type Project = {
  id: string;
  name: string;
  description?: string;
  status?: string;
  roleId?: string;
  roleName?: string;
  membersCount?: number;
  boardsCount?: number;
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

export type BoardDetails = Board & { projectId: string; memberCount?: number; listCount?: number; };
export type BoardLabel = { id: string; name: string; color: string; };
export type BoardMember = {
  boardId: string;
  userId: string;
  name: string;
  email: string;
  avatar: string;
  roleId: string;
  roleName: string;
};
export type ProjectMember = Omit<BoardMember, "boardId" | "userId" | "avatar"> & {
  projectId: string;
  id: string;
  avatar?: string | null;
};
export type Member = Omit<BoardMember, "boardId" | "avatar"> & { avatar?: string | null; };
export type MemberScope = "projects" | "boards";
export type Role = { id: string; name: string; status: "ACTIVE" | "INACTIVE"; };
export type Invitation = {
  id: string;
  token: string;
  email: string;
  projectId?: string;
  boardId?: string;
  roleId: string;
  inviterId: string;
  type: "EMAIL" | "LINK";
  status: "PENDING" | "ACCEPTED" | "EXPIRED" | "CANCELLED";
  expiresAt: string;
  delivery: {
    email: "SENT" | "FAILED" | "NOT_APPLICABLE";
    notification: "SENT" | "FAILED" | "NOT_APPLICABLE";
  };
  shareUrl?: string;
};
