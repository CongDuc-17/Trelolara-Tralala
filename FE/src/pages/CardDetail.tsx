import { useParams, useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/apiClient";
import { Trash2 } from "lucide-react";
import { AddChecklist } from "@/components/cards/AddChecklist";
import { AddMember } from "@/components/cards/AddMember";
import { AddLabel } from "@/components/cards/AddLabel";
import { Textarea } from "@/components/ui/textarea";

import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "@/components/ui/avatar";

import { Progress } from "@/components/ui/progress";
import { useBoards } from "@/hooks/useBoards";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  useCardsStore,
  type CardLabel,
  type CardMember,
  type Checklist,
} from "@/stores/cards.store";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserStore } from "@/stores/user.store";
import { Spinner } from "@/components/ui/spinner";

interface Card {
  id: string;
  title: string;
  description?: string;
  listId: string;
  position: number;
  createdAt?: string;
  updatedAt?: string;
  cardMembers?: CardMember[];
  cardLabels?: CardLabel[];
  checklists?: Checklist[];
  comments?: any[];
}

export function CardDetail() {
  const { cardId, boardId } = useParams();
  const navigate = useNavigate();

  const { user: currentUser } = useUserStore();

  const [loading, setLoading] = useState(true);
  const [newDescription, setNewDescription] = useState("");
  const [newComments, setComments] = useState("");
  const [activeChecklistId, setActiveChecklistId] = useState<string | null>(
    null,
  );
  const [inputValue, setInputValue] = useState("");
  const [confirmDeleteChecklistId, setConfirmDeleteChecklistId] =
    useState(false);

  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);

  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [isAddingChecklistItem, setIsAddingChecklistItem] = useState(false);
  const [isDeletingChecklistId, setIsDeletingChecklistId] = useState<
    string | null
  >(null);

  const { labelsBoard, fetchLabelsBoard } = useBoards();
  const { cards, setCurrentCardId, setCards, updateCard } = useCardsStore();
  const card = useCardsStore((state) =>
    state.cards.find((c) => c.id === cardId),
  );

  useEffect(() => {
    fetchLabelsBoard();
  }, [boardId]);

  const fetchCard = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get(
        `/cards/${cardId}?include=members,labels,checklists,comments`,
      );
      setCurrentCardId(cardId || null);

      const existingCard = useCardsStore
        .getState()
        .cards.find((c) => c.id === cardId);
      if (existingCard) {
        updateCard(response.data);
      } else {
        setCards([...useCardsStore.getState().cards, response.data]);
      }
    } catch (error) {
      console.error("Error fetching card:", error);
    } finally {
      setLoading(false);
    }
  };

  async function handleAddChecklistItem(checklistId: string) {
    if (!inputValue.trim() || !card) return;
    try {
      setIsAddingChecklistItem(true); // Bật loading
      const response = await apiClient.post(`/checklists/${checklistId}`, {
        title: inputValue,
      });

      const updatedChecklists = card.checklists?.map((checklist: any) => {
        if (checklist.id === checklistId) {
          return {
            ...checklist,
            checklistItems: [
              ...(checklist.checklistItems || []),
              response.data,
            ],
          };
        }
        return checklist;
      });

      updateCard({ ...card, checklists: updatedChecklists });
      setInputValue("");
      setActiveChecklistId(null);
    } catch (error) {
      console.error("Error adding checklist item:", error);
    } finally {
      setIsAddingChecklistItem(false); // Tắt loading
    }
  }

  async function handleCompletedChecklistItem(
    checklistItemId: string,
    newCheckedState: boolean,
  ) {
    try {
      if (!card) return;

      const updatedChecklists = card.checklists?.map((checklist: any) => {
        const updatedItems = (checklist.checklistItems || []).map(
          (item: any) => {
            if (item.id === checklistItemId) {
              return { ...item, completed: newCheckedState };
            }
            return item;
          },
        );

        return {
          ...checklist,
          checklistItems: updatedItems,
          completedCount: updatedItems.filter((i: any) => i.completed).length,
        };
      });

      updateCard({ ...card, checklists: updatedChecklists });

      await apiClient.patch(`/checklist-items/${checklistItemId}`, {
        completed: newCheckedState,
      });
    } catch (error) {
      console.error("Error updating checklist item:", error);
    }
  }

  async function handleSubmitComment() {
    if (!newComments.trim() || !card) return;
    try {
      setIsSubmittingComment(true); // Bật loading
      if (editingCommentId) {
        await apiClient.patch(`/comments/${editingCommentId}`, {
          content: newComments,
        });

        const updatedComments = card.comments?.map((c: any) =>
          c.id === editingCommentId || c.commentId === editingCommentId
            ? {
                ...c,
                content: newComments,
                updatedAt: new Date().toISOString(),
              }
            : c,
        );

        updateCard({ ...card, comments: updatedComments });
        setComments("");
        setEditingCommentId(null);
      } else {
        const response = await apiClient.post(`/cards/${cardId}/comments`, {
          content: newComments,
        });

        const newCommentData = {
          id: response.data.commentId,
          content: response.data.content,
          createdAt: response.data.createdAt,
          updatedAt: response.data.updatedAt,
          user: response.data.user,
          userId: response.data.user?.id,
          userName: response.data.user?.name,
          userAvatar: response.data.user?.avatar,
        };
        updateCard({
          ...card,
          comments: [...(card.comments || []), newCommentData],
        });
        setComments("");
      }
    } catch (error) {
      console.error("Error saving comment:", error);
    } finally {
      setIsSubmittingComment(false); // Tắt loading
    }
  }

  async function handleDeleteChecklist(checklistId: string) {
    if (!card) return;
    const previousCard = { ...card };

    try {
      setIsDeletingChecklistId(checklistId); // Bật loading ở đúng popup đang xóa

      const updatedCard = {
        ...card,
        checklists: card.checklists?.filter((c) => c.id !== checklistId),
      };
      updateCard(updatedCard);

      await apiClient.delete(`/checklists/${checklistId}`);
    } catch (error) {
      updateCard(previousCard);
      alert("Xóa thất bại, vui lòng thử lại!");
    } finally {
      setIsDeletingChecklistId(null); // Tắt loading
    }
  }

  useEffect(() => {
    if (cardId) {
      fetchCard();
    }
  }, [cardId]);

  const handleClose = () => {
    navigate(`/boards/${boardId}`);
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="w-10/12 max-w-none! left-1/2 !top-0 !translate-y-0 transform -translate-x-1/2 mt-10 max-h-[90vh] bg-background rounded-lg shadow-md p-6 ">
        {loading && (
          <DialogHeader className="flex flex-col gap-2 mb-4">
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
          </DialogHeader>
        )}

        {!loading && card && (
          <DialogHeader className="flex justify-between mb-4">
            <DialogTitle className="text-xl font-bold">
              {card.title}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">{card.description}</p>
          </DialogHeader>
        )}

        {loading ? (
          <div className="grid grid-cols-2 gap-8">
            <div className="w-full flex flex-col gap-6">
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-24 w-full rounded-md" />
              </div>
              <div className="flex items-center gap-4">
                <Skeleton className="h-10 w-24 rounded-full" />
                <Skeleton className="h-10 w-24 rounded-md" />
                <Skeleton className="h-10 w-24 rounded-md" />
              </div>
              <div className="space-y-4">
                <Skeleton className="h-32 w-full rounded-md" />
                <Skeleton className="h-32 w-full rounded-md" />
              </div>
            </div>
            <div className="flex flex-col gap-4">
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
            </div>
          </div>
        ) : card ? (
          <div className="grid grid-cols-2 gap-8">
            <div className="w-full flex flex-col gap-4 ">
              <div>
                <Label className="pb-2 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Enter more description
                </Label>
                <Textarea
                  id="description"
                  name="description"
                  onChange={(e) => {
                    setNewDescription(e.target.value);
                  }}
                />
              </div>
              <div className="flex items-center flex-wrap pr-4 gap-2">
                {card.cardMembers && card.cardMembers?.length > 0 ? (
                  <AvatarGroup className="">
                    {card.cardMembers.map((cardMember: any) => {
                      const memberDetail = cardMember?.user;
                      if (!memberDetail) return null;

                      return (
                        <Avatar key={memberDetail.id}>
                          <AvatarImage
                            src={memberDetail.avatar || ""}
                            alt={`@${memberDetail.name}`}
                          />
                          <AvatarFallback>
                            {memberDetail.name
                              ? memberDetail.name.charAt(0).toUpperCase()
                              : "?"}
                          </AvatarFallback>
                        </Avatar>
                      );
                    })}
                    <AvatarGroupCount>
                      <AddMember membersCard={card?.cardMembers ?? []} />
                    </AvatarGroupCount>
                  </AvatarGroup>
                ) : (
                  <AddMember membersCard={card?.cardMembers ?? []} />
                )}

                <AddLabel
                  labelsBoard={labelsBoard}
                  fetchLabelsBoard={fetchLabelsBoard}
                />

                <AddChecklist />
              </div>

              <div className="overflow-y-auto max-h-[45vh] flex flex-col gap-4 ">
                {card.checklists?.map((checklist, index) => {
                  const totalItems = checklist.checklistItems?.length || 0;
                  const completedItems =
                    checklist.checklistItems?.filter((i: any) => i.completed)
                      .length || 0;
                  const progressPercent =
                    totalItems === 0
                      ? 0
                      : Math.round((completedItems / totalItems) * 100);
                  return (
                    <div
                      key={checklist.id || index}
                      className="border rounded p-4"
                    >
                      <div className="flex items-center justify-between ">
                        <div>{checklist.title}</div>

                        <Dialog>
                          <DialogTrigger>
                            <Trash2 className="cursor-pointer text-gray-400 hover:text-red-500 transition" />
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle className="text-red-500">
                                Are you absolutely sure you want to delete this
                                checklist?
                              </DialogTitle>
                              <DialogDescription>
                                This action cannot be undone. This will
                                permanently{" "}
                                <span className="font-bold">
                                  delete the checklist {checklist.title} and all
                                  its items
                                </span>{" "}
                                and remove your data from our servers.
                              </DialogDescription>
                            </DialogHeader>
                            <Button
                              onClick={() =>
                                handleDeleteChecklist(checklist.id)
                              }
                              disabled={isDeletingChecklistId === checklist.id}
                              className="hover:bg-red-500 transition cursor-pointer"
                            >
                              {isDeletingChecklistId === checklist.id && (
                                <Spinner className="mr-2 h-4 w-4" />
                              )}
                              I understand, delete checklist
                            </Button>
                          </DialogContent>
                        </Dialog>
                      </div>
                      <Progress value={progressPercent} className="mt-2 mb-2" />

                      {checklist?.checklistItems?.map((item, indexItem) => (
                        <div key={item.id || indexItem}>
                          <div className="flex items-center gap-2 pl-4">
                            <Checkbox
                              checked={item.completed || false}
                              onCheckedChange={(checked) =>
                                handleCompletedChecklistItem(
                                  item.id,
                                  checked as boolean,
                                )
                              }
                            />
                            <span
                              className={
                                item.completed
                                  ? "line-through text-gray-400"
                                  : ""
                              }
                            >
                              {item.title}
                            </span>
                          </div>
                        </div>
                      ))}
                      {activeChecklistId === checklist.id ? (
                        <div className="flex gap-2 p-2">
                          <Input
                            id="checklist-item"
                            name="checklist-item"
                            type="text"
                            placeholder="Add checklist item..."
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !isAddingChecklistItem) {
                                e.preventDefault();
                                handleAddChecklistItem(checklist.id);
                              }
                            }}
                          />
                          <Button
                            variant="default"
                            size="sm"
                            disabled={
                              isAddingChecklistItem || !inputValue.trim()
                            }
                            onClick={() => handleAddChecklistItem(checklist.id)}
                          >
                            {isAddingChecklistItem && (
                              <Spinner className="mr-2 h-4 w-4" />
                            )}
                            {isAddingChecklistItem ? "Adding..." : "Add"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isAddingChecklistItem}
                            onClick={() => {
                              setActiveChecklistId(null);
                              setInputValue("");
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          onClick={() => setActiveChecklistId(checklist.id)}
                          className=" mt-2"
                        >
                          Add Checklist Item
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-4 ">
              <div>
                <Label className="pb-2 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Comments
                </Label>

                <div className="flex gap-2 mb-4 mt-1">
                  <Input
                    id="comments"
                    name="comments"
                    type="text"
                    value={newComments}
                    placeholder="Write a comment..."
                    disabled={isSubmittingComment}
                    onChange={(e) => {
                      setComments(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !isSubmittingComment) {
                        e.preventDefault();
                        handleSubmitComment();
                      }
                    }}
                  />
                  <Button
                    onClick={handleSubmitComment}
                    disabled={isSubmittingComment || !newComments.trim()}
                  >
                    {isSubmittingComment && (
                      <Spinner className="mr-2 h-4 w-4" />
                    )}
                    {editingCommentId ? "Update" : "Comment"}
                  </Button>

                  {editingCommentId && (
                    <Button
                      variant="outline"
                      disabled={isSubmittingComment}
                      onClick={() => {
                        setEditingCommentId(null);
                        setComments("");
                      }}
                    >
                      Cancel
                    </Button>
                  )}
                </div>

                <div className="mt-4 space-y-4 max-h-[55vh] overflow-y-auto pr-2">
                  {card.comments?.map((comment: any) => {
                    const commentId = comment.id || comment.commentId;

                    const isOwner =
                      currentUser &&
                      (comment.user?.id === currentUser.id ||
                        comment.userId === currentUser.id);

                    const isEdited =
                      comment.updatedAt &&
                      new Date(comment.updatedAt).getTime() >
                        new Date(comment.createdAt).getTime();

                    return (
                      <div key={commentId} className="flex gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage
                            src={
                              comment.userAvatar ||
                              comment.user?.avatar ||
                              undefined
                            }
                          />
                          <AvatarFallback>
                            {comment.userName || comment.user?.name
                              ? (comment.userName || comment.user?.name)
                                  .charAt(0)
                                  .toUpperCase()
                              : "?"}
                          </AvatarFallback>
                        </Avatar>

                        <div className="flex flex-col animate-fade-in">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm">
                              {comment.userName || comment.user?.name}
                            </span>

                            <span className="text-xs text-gray-500 flex items-center gap-1">
                              {isEdited
                                ? new Date(comment.updatedAt).toLocaleString()
                                : new Date(comment.createdAt).toLocaleString()}

                              {isEdited && (
                                <span className="text-[11px] text-gray-400 italic font-normal ml-1">
                                  (edited)
                                </span>
                              )}
                            </span>
                          </div>

                          <p className="text-sm mt-1 bg-gray-100/50 p-2 rounded-md">
                            {comment.content}
                          </p>

                          {isOwner && (
                            <div className="mt-1">
                              <span
                                className="text-[11px] font-medium text-gray-400 hover:text-blue-600 hover:underline cursor-pointer transition-colors"
                                onClick={() => {
                                  setEditingCommentId(commentId);
                                  setComments(comment.content);
                                  document.getElementById("comments")?.focus();
                                }}
                              >
                                Edit
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-8">
            <p className="text-muted-foreground">Card not found</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
