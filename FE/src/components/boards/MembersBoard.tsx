import { MembersDialog } from "@/features/catalog/MembersDialog";

export function MembersBoard({ boardId, count }: { boardId: string; count?: number }) {
  return <MembersDialog key={boardId} kind="boards" id={boardId} count={count} />;
}
