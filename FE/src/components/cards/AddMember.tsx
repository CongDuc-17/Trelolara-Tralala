import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useBoards } from "@/hooks/useBoards";
import { useEffect } from "react";

import { useParams } from "react-router-dom";
import { apiClient } from "@/lib/apiClient";
import { Plus, X } from "lucide-react";
import { useCardsStore } from "@/stores/cards.store";
export function AddMember({ membersCard = [] }: { membersCard: any[] }) {
  const cardId = useParams().cardId as string;
  const { boardMembers, fetchBoardMembers } = useBoards();
  const { addMember, removeMember } = useCardsStore();
  // Lấy list userId đã có trên card
  const cardMemberIds = membersCard.map(
    (member) => member.userId || member.user?.id,
  );

  async function handleAddMemberToCard(memberId: string) {
    try {
      await apiClient.post(`/cards/${cardId}/members`, {
        userId: memberId,
      });

      // Optimistic update
      const memberToAdd = boardMembers.find(
        (member) => member.userId === memberId,
      );
      if (memberToAdd) {
        const newMember = {
          id: memberId,
          name: memberToAdd.name,
          avatar: memberToAdd.avatar,
        };

        addMember(cardId, newMember);
      }
    } catch (error) {
      console.error("Error adding member to card:", error);
    }
  }

  async function handleRemoveMemberFromCard(memberId: string) {
    try {
      await apiClient.delete(`/cards/${cardId}/members/${memberId}`);

      removeMember(cardId, memberId);
    } catch (error) {
      console.error("Error removing member from card:", error);
    }
  }

  useEffect(() => {
    fetchBoardMembers();
  }, []);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Avatar>
          <AvatarImage src="" alt="@shadcn" className="" />
          <AvatarFallback>
            <Plus />
          </AvatarFallback>
        </Avatar>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="grid gap-4">
          <div className="space-y-2">
            <h4 className="leading-none font-medium">Add Member</h4>
            <p className="text-sm text-muted-foreground">
              Set the dimensions for the layer.
            </p>
          </div>
          <div className="grid gap-2">
            <Label>Search for a member to add</Label>
            <Input id="member-search" name="member-search" type="text" />
          </div>

          <div className="flex flex-col gap-2  overflow-y-scroll   max-h-60">
            <div className="text-sm text-muted-foreground">Member of card</div>
            {membersCard?.map((member, index) => (
              <Button
                variant={"outline"}
                className="flex justify-between h-auto items-center hover:bg-white"
                key={member.userId || member.user.id || index}
              >
                <div className="flex items-center r gap-2">
                  <Avatar key={index}>
                    <AvatarImage
                      src={member.user.avatar}
                      alt={member.user.name}
                    />
                    <AvatarFallback>
                      {member.user.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>{member.user?.name}</div>
                </div>

                <Button
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveMemberFromCard(
                      member.userId || member.user?.id,
                    );
                  }}
                  className="p-1 hover:bg-red-100 rounded"
                >
                  <X size={16} />
                </Button>
              </Button>
            ))}
            <div className="text-sm text-muted-foreground">Member of board</div>
            {boardMembers
              .filter((member) => !cardMemberIds.includes(member.userId))
              .map((member, index) => (
                <Button
                  variant={"outline"}
                  className="flex justify-start h-auto items-center "
                  key={index}
                  onClick={() => handleAddMemberToCard(member.userId)}
                >
                  <div className="flex items-center gap-2">
                    <Avatar key={index}>
                      <AvatarImage src={member.avatar} alt={member.name} />
                      <AvatarFallback>
                        {member.name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>

                    <div>{member.name}</div>
                  </div>
                </Button>
              ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
