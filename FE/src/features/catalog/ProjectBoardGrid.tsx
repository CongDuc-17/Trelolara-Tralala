import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateBoard } from "@/components/boards/CreateBoard";
import { pageItems, useProjectBoards } from "./queries";
import { LoadMore, QueryFeedback } from "./QueryFeedback";
import type { Board } from "./types";

export function BoardTile({ board }: { board: Board; }) {
  return <Link to={`/boards/${board.id}`}><Card
    className="h-36 cursor-pointer hover:shadow-lg transition-shadow relative overflow-hidden group"
    style={board.background ? { backgroundImage: `url(${board.background})`, backgroundSize: "cover", backgroundPosition: "center" } : { backgroundColor: "#f3f4f6" }}>
    <div className="absolute inset-0 bg-black/10 group-hover:bg-black/0 transition-colors" />
    <div className="absolute bottom-0 w-full text-center p-2 bg-white/90 backdrop-blur-sm font-medium border-t">{board.name}</div>
  </Card></Link>;
}

export function ProjectBoardGrid({ projectId, activeOnly = false }: { projectId: string; activeOnly?: boolean; }) {
  const query = useProjectBoards(projectId);
  const boards = pageItems(query.data).filter((board) => !activeOnly || board.status === "ACTIVE");
  return <div>
    <QueryFeedback query={query} empty={boards.length === 0} label="bảng" />
    <div className="grid grid-cols-4 gap-6">
      {query.isPending && [1, 2].map((id) => <Skeleton key={id} className="h-36 w-full rounded-xl" />)}
      {boards.map((board) => <BoardTile key={board.id} board={board} />)}
      <CreateBoard projectId={projectId} />
    </div>
    <LoadMore query={query} label="bảng" />
  </div>;
}
