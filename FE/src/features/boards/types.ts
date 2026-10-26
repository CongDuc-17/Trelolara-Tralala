export type Status = "ACTIVE" | "ARCHIVED";
export type List = { id: string; boardId: string; name: string; position: number; status: Status };
export type MoveListInput = { beforeListId?: string; afterListId?: string };
