import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "../ui/avatar";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Button } from "../ui/button";
import { Field, FieldGroup } from "../ui/field";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { toast } from "sonner";
import { Card } from "../ui/card";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/apiClient";
import { useParams } from "react-router";
import { X } from "lucide-react";
import type { BoardMember } from "@/hooks/useBoards";

type Role = {
  id: string;
  name: string;
};

export function MembersBoard({
  boardMembers,
  fetchBoardMembers,
}: {
  boardMembers?: BoardMember[];
  fetchBoardMembers: () => Promise<void>;
}) {
  const { boardId } = useParams() as { boardId: string };
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [memberRoles, setMemberRoles] = useState<Record<string, string>>({});

  const validateEmail = (value: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!value) {
      setEmailError("Email is required");
      return false;
    }
    if (!emailRegex.test(value)) {
      setEmailError("Invalid email format");
      return false;
    }
    setEmailError("");
    return true;
  };

  async function fetchRoles() {
    try {
      const response = await apiClient.get("/roles");

      const projectRoles = response.data.filter((role: any) =>
        role.name.startsWith("BOARD_"),
      );
      setRoles(projectRoles);
      return projectRoles;
    } catch (error) {
      toast.error("Error fetching roles");
      console.error("Error fetching roles:", error);
    }
  }
  useEffect(() => {
    fetchRoles();
  }, []);

  async function handleUpdateMemberRole(userId: string, newRoleId: string) {
    try {
      await apiClient.patch(`/boards/${boardId}/members`, {
        userId: userId,
        roleId: newRoleId,
      });
      setMemberRoles((prev) => ({ ...prev, [userId]: newRoleId }));
      await fetchBoardMembers();
    } catch (error) {
      const message =
        (error as any)?.response?.data?.message || "Error updating member role";
      toast.error(message);
      console.error("Error changing role:", error);
    }
  }

  async function handleInvite() {
    if (!validateEmail(email)) {
      return;
    }

    if (!selectedRoleId || selectedRoleId === "") {
      toast.error("Please select a role");
      return;
    }

    try {
      const response = await apiClient.post(`/invitations/boards/${boardId}`, {
        email,
        roleId: selectedRoleId,
      });

      setEmail("");
      setSelectedRoleId("");
      await fetchBoardMembers();
    } catch (error) {
      const message =
        (error as any)?.response?.data?.message || "Error inviting member";
      toast.error(message);
    }
  }

  async function handleRemoveMember(userId: string) {
    try {
      await apiClient.delete(`/boards/${boardId}/members`, {
        data: { userId },
      });
      await fetchBoardMembers();
    } catch (error) {
      const message =
        (error as any)?.response?.data?.message || "Error removing member";
      toast.error(message);
    }
  }

  return (
    <Dialog>
      <form>
        <DialogTrigger asChild>
          <div className="flex flex-row flex-wrap items-center pr-4 gap-6 md:gap-12">
            <AvatarGroup className="">
              {boardMembers &&
                boardMembers?.slice(0, 3).map((member, index) => (
                  <Avatar key={index}>
                    <AvatarImage src={member.avatar} alt={member.name} />
                    <AvatarFallback>
                      {member.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                ))}
              {boardMembers && boardMembers.length > 3 && (
                <AvatarGroupCount>+{boardMembers.length - 3}</AvatarGroupCount>
              )}
            </AvatarGroup>
          </div>
        </DialogTrigger>

        <DialogContent className="sm:max-w-[500px]  max-h-[650px] ">
          <DialogHeader>
            <DialogTitle>Board Members</DialogTitle>
            <DialogDescription>
              View and manage board members here.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <Label htmlFor="email-1">Email new member</Label>
              <Input
                id="email-1"
                name="email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  validateEmail(e.target.value);
                }}
              />
              {emailError && (
                <p className="text-red-500 text-sm mt-1">{emailError}</p>
              )}
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {roles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.name.replace("BOARD_", "")}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>

            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleInvite}>Invite</Button>
          </DialogFooter>

          {/* members */}
          <div className="max-h-[300px] overflow-y-auto">
            {boardMembers?.map((member, index) => (
              <Card
                key={index}
                className="mb-2 flex flex-row justify-between items-center gap-4 p-4"
              >
                <div className="flex items-center">
                  <Avatar key={index}>
                    <AvatarImage src={member.avatar} alt={member.name} />
                    <AvatarFallback>
                      {member.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="ml-4">
                    <div className="font-bold">{member.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {member.email}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Select
                    value={memberRoles[member.userId] || member.roleId}
                    onValueChange={(newRoleId) =>
                      handleUpdateMemberRole(member.userId, newRoleId)
                    }
                    disabled={member.roleName === "BOARD_ADMIN"}
                  >
                    <SelectTrigger className="w-fit">
                      <SelectValue
                        placeholder={member.roleName.replace("BOARD_", "")}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {roles.map((role) => (
                          <SelectItem key={role.id} value={role.id}>
                            {role.name.replace("BOARD_", "")}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <X
                    className="cursor-pointer text-gray-400 hover:text-red-500 transition"
                    onClick={() => handleRemoveMember(member.userId)}
                  />
                </div>
              </Card>
            ))}
          </div>
        </DialogContent>
      </form>
    </Dialog>
  );
}
