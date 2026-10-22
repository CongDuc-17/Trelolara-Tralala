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

import { Card } from "../ui/card";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/apiClient";

import { X } from "lucide-react";
import { useProjectsStore } from "@/stores/projects.store";
import { useProjects } from "@/hooks/useProjects";

type Role = {
  id: string;
  name: string;
};

export function MembersProject({ projectId }: { projectId: string }) {
  const projectMembers =
    useProjectsStore(
      (state) => state.projects.find((p) => p.id === projectId)?.members,
    ) ?? [];
  const updateProjectMembers = useProjectsStore(
    (state) => state.updateProjectMembers,
  );
  const { fetchProjectMembers } = useProjects({ autoFetch: false });

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
      const response = await apiClient.get<Role[]>("/roles");
      const projectRoles = response.data.filter((role: Role) =>
        role.name.startsWith("PROJECT_"),
      );
      setRoles(projectRoles);
    } catch (error) {
      console.error("Error fetching roles:", error);
    }
  }

  useEffect(() => {
    fetchRoles();
  }, []);

  async function handleUpdateMemberRole(userId: string, newRoleId: string) {
    try {
      await apiClient.patch(`/projects/${projectId}/members`, {
        userId,
        roleId: newRoleId,
      });
      setMemberRoles((prev) => ({ ...prev, [userId]: newRoleId }));
      await fetchProjectMembers(projectId);
    } catch (error) {
      console.error("Error changing role:", error);
    }
  }

  async function handleInvite() {
    if (!validateEmail(email)) {
      return;
    }

    if (!selectedRoleId) {
      alert("Please select a role");
      return;
    }

    try {
      await apiClient.post(`/invitations/projects/${projectId}`, {
        email,
        roleId: selectedRoleId,
      });

      setEmail("");
      setSelectedRoleId("");
      await fetchProjectMembers(projectId);
    } catch (error) {
      console.error("Error inviting member:", error);
      alert("Error inviting member");
    }
  }

  async function handleRemoveMember(userId: string) {
    try {
      await apiClient.delete(`/projects/${projectId}/members`, {
        data: { userId },
      });

      updateProjectMembers(
        projectId,
        projectMembers.filter((member) => member.id !== userId),
      );
    } catch (error) {
      console.error("Error removing member:", error);
      alert("Error removing member");
    }
  }

  return (
    <Dialog>
      <form>
        <DialogTrigger asChild>
          <div className="flex flex-row flex-wrap items-center pr-4 gap-6 md:gap-12">
            <AvatarGroup>
              {projectMembers.slice(0, 3).map((member) => (
                <Avatar key={member.id}>
                  <AvatarImage src={member.avatar ?? ""} alt={member.name} />
                  <AvatarFallback>
                    {member.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              ))}
              {projectMembers.length > 3 && (
                <AvatarGroupCount>
                  +{projectMembers.length - 3}
                </AvatarGroupCount>
              )}
            </AvatarGroup>
          </div>
        </DialogTrigger>

        <DialogContent className="sm:max-w-[500px] max-h-[650px]">
          <DialogHeader>
            <DialogTitle>Project Members</DialogTitle>
            <DialogDescription>
              View and manage project members here.
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
                      {role.name.replace("PROJECT_", "")}
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

          <div className="max-h-[300px] overflow-y-auto">
            {projectMembers.map((member) => (
              <Card
                key={member.id}
                className="mb-2 flex flex-row justify-between items-center gap-4 p-4"
              >
                <div className="flex items-center">
                  <Avatar>
                    <AvatarImage src={member.avatar ?? ""} alt={member.name} />
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
                    value={memberRoles[member.id] || member.roleId}
                    onValueChange={(newRoleId) =>
                      handleUpdateMemberRole(member.id, newRoleId)
                    }
                    disabled={member.roleName === "PROJECT_ADMIN"}
                  >
                    <SelectTrigger className="w-fit">
                      <SelectValue
                        placeholder={member.roleName.replace("PROJECT_", "")}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {roles.map((role) => (
                          <SelectItem key={role.id} value={role.id}>
                            {role.name.replace("PROJECT_", "")}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <X
                    className="cursor-pointer text-gray-400 hover:text-red-500 transition"
                    onClick={() => handleRemoveMember(member.id)}
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
