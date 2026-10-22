import { MembersDialog } from "@/features/catalog/MembersDialog";

export function MembersProject({ projectId, count }: { projectId: string; count?: number }) {
  return <MembersDialog key={projectId} kind="projects" id={projectId} count={count} />;
}
