import { useParams } from "react-router-dom";
import { BoardScreen } from "@/features/boards/BoardScreen";

export function Board() {
  const { boardId = "" } = useParams();
  return <BoardScreen key={boardId} boardId={boardId} />;
}
