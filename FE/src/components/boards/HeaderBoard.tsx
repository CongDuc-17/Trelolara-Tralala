import { EllipsisVertical } from "lucide-react";

import { MembersBoard } from "./MembersBoard";
import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/apiClient";
import { Input } from "../ui/input";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useInvalidateCatalog } from "@/features/catalog/queries";
import { getApiError } from "@/lib/errors";
import { useNavigate } from "react-router-dom";

export function HeaderBoard({
  boardId,
  boardName,
  membersCount,
  onPreviewBackground,
}: {
  boardId: string;
  boardName?: string;
  membersCount?: number;
  onPreviewBackground?: (url: string | null) => void;
}) {
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [newName, setNewName] = useState(boardName || "");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const invalidate = useInvalidateCatalog();
  const busy = useRef(false);
  const upload = useRef<AbortController | null>(null);
  const preview = useRef<string | null>(null);
  const [uploading, setUploading] = useState(false);
  useEffect(() => () => {
    upload.current?.abort();
    if (preview.current) URL.revokeObjectURL(preview.current);
    preview.current = null;
  }, []);

  async function handleUpdateBoardName(name: string) {
    if (busy.current) return;
    if (!name.trim()) {
      toast.error("Board name cannot be empty");
      return;
    }
    busy.current = true;
    try {
      await apiClient.patch(`/boards/${boardId}`, { name: name.trim() });
      await invalidate();
      setEditing(false);
    } catch (error) {
      toast.error(getApiError(error).message);
    } finally {
      busy.current = false;
    }
  }

  async function handleArchiveBoard() {
    try {
      await apiClient.patch(`/boards/${boardId}/archive`);
      await invalidate();
      toast.success("Board archived successfully");
      navigate("/dashboard", { replace: true });
    } catch (error) {
      toast.error("Failed to archive board");
      console.error("Failed to archive board", error);
    }
  }

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (file && !upload.current) {
      const controller = new AbortController();
      upload.current = controller;
      setUploading(true);
      const objectUrl = URL.createObjectURL(file);
      preview.current = objectUrl;
      if (onPreviewBackground) {
        onPreviewBackground(objectUrl);
      }
      const formData = new FormData();
      formData.append("background", file);
      try {
        toast.info("Uploading background...");
        await apiClient.post(`/boards/${boardId}/background`, formData, { signal: controller.signal });
        await invalidate();
        if (controller.signal.aborted) return;
        toast.success("Background updated successfully");
      } catch (error) {
        if (!controller.signal.aborted) toast.error(getApiError(error).message);
      } finally {
        if (!controller.signal.aborted) {
          onPreviewBackground?.(null);
          setUploading(false);
        }
        if (preview.current === objectUrl) {
          URL.revokeObjectURL(objectUrl);
          preview.current = null;
        }
        upload.current = null;
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    }
  };

  return (
    <div className="sticky top-0 z-10 shadow-md flex justify-between items-center px-4 py-2">
      <div className="p-4 text-2xl font-bold border-none bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 px-0">
        {editing ? (
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={() => {
              handleUpdateBoardName(newName);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleUpdateBoardName(newName);
              }
            }}
            autoFocus
            className="text-2xl font-bold p-4"
          />
        ) : (
          <h1
            className="text-2xl font-bold cursor-text hover:bg-gray-100 rounded px-2 py-1 transition-colors"
            onDoubleClick={() => {
              setEditing(true);
              setNewName(boardName || "");
            }}
          >
            {boardName}
          </h1>
        )}
      </div>

      <div className="flex items-center gap-4">
        <MembersBoard boardId={boardId} count={membersCount} />

        <AlertDialog>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label="Tùy chọn bảng"><EllipsisVertical className="size-5 cursor-pointer" /></button>
            </DropdownMenuTrigger>

            <DropdownMenuContent className="w-50" align="start">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Menu</DropdownMenuLabel>
                <DropdownMenuItem disabled={uploading} onSelect={(e) => e.preventDefault()}>
                  <div onClick={() => fileInputRef.current?.click()}>
                    Change background
                  </div>
                  <input
                    type="file"
                    aria-label="Ảnh nền bảng"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/*"
                    className="hidden"
                    disabled={uploading}
                  />
                </DropdownMenuItem>
              </DropdownMenuGroup>

              <DropdownMenuSeparator />

              <AlertDialogTrigger asChild>
                <DropdownMenuItem>Archive this board</DropdownMenuItem>
              </AlertDialogTrigger>
            </DropdownMenuContent>
          </DropdownMenu>

          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action will archive the board. You can restore it later
                from the archive settings.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>

              <AlertDialogAction
                onClick={handleArchiveBoard}
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
