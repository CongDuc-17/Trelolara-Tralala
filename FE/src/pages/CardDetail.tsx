import { useParams } from "react-router-dom";
import { CardDialog } from "@/features/cards/CardDialog";

export function CardDetail() {
  const { cardId = "", boardId = "" } = useParams();
  return <CardDialog key={`${boardId}/${cardId}`} cardId={cardId} boardId={boardId} />;
}
