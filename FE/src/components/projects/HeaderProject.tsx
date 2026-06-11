import { EllipsisVertical } from "lucide-react";

import { MembersProject } from "./MembersProject";
import { useState } from "react";
import { apiClient } from "@/lib/apiClient";
import { Input } from "../ui/input";
import { useProjectsStore } from "@/stores/projects.store";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export function HeaderProject({
  projectId,
  projectName,
  isLoading, // Thêm prop isLoading
}: {
  projectId: string;
  projectName?: string;
  isLoading?: boolean;
}) {
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [newName, setNewName] = useState(projectName || "");

  const updateProjectName = useProjectsStore(
    (state) => state.updateProjectName,
  );

  async function handleUpdateProjectName(name: string) {
    if (!name.trim()) {
      alert("Project name cannot be empty");
      return;
    }
    try {
      updateProjectName(projectId, name);
      await apiClient.patch(`/projects/${projectId}`, { name: name });
    } catch (error) {
      console.error("Failed to update project name", error);
      updateProjectName(projectId, projectName || "");
    } finally {
      setEditing(false);
    }
  }

  async function handleArchiveProject() {
    try {
      await apiClient.patch(`/projects/${projectId}/archive`);
      toast.success("Project archived successfully");
      navigate("/dashboard", { replace: true });
    } catch (error) {
      toast.error("Failed to archive project");
      console.error("Failed to archive project", error);
    }
  }

  // SKELETON RENDER NẾU ĐANG LOADING
  if (isLoading) {
    return (
      <div className="sticky top-0 z-10 shadow-md flex justify-between items-center px-4 py-3 bg-white">
        <div className="px-2">
          <Skeleton className="h-8 w-64 rounded-md" />
        </div>
        <div className="flex items-center gap-4 pr-2">
          {/* Skeleton cho Members (nhóm avatar) */}
          <Skeleton className="h-10 w-32 rounded-full" />
          {/* Skeleton cho nút Menu Ellipsis */}
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="sticky top-0 z-10 shadow-md flex justify-between items-center px-4 py-2 bg-white">
      <div className=" p-4 text-2xl font-bold border-none bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 px-0">
        {editing ? (
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={() => {
              setEditing(false);
              handleUpdateProjectName(newName);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setEditing(false);
                handleUpdateProjectName(newName);
              }
            }}
            autoFocus
            className="text-2xl font-bold p-4"
          />
        ) : (
          <div
            className="text-2xl font-bold cursor-text hover:bg-gray-100 rounded px-2 py-1 transition-colors"
            onDoubleClick={() => {
              setEditing(true);
              setNewName(projectName || "");
            }}
          >
            {projectName}
          </div>
        )}
      </div>
      <div className="flex items-center gap-4">
        {/* avatars */}
        <MembersProject projectId={projectId} />

        <AlertDialog>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <EllipsisVertical className="size-5 cursor-pointer" />
            </DropdownMenuTrigger>

            <DropdownMenuContent className="w-50" align="start">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Menu</DropdownMenuLabel>
              </DropdownMenuGroup>

              <DropdownMenuSeparator />

              <AlertDialogTrigger asChild>
                <DropdownMenuItem>Archive this project</DropdownMenuItem>
              </AlertDialogTrigger>
            </DropdownMenuContent>
          </DropdownMenu>

          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action will archive the project. You can restore it later
                from the archive settings.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>

              <AlertDialogAction
                onClick={handleArchiveProject}
                className="bg-red-600 hover:bg-red-700"
              >
                Confirm
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
