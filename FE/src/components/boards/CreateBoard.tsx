import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateBoard } from "@/features/catalog/queries";
import { getErrorMessage } from "@/lib/errors";

import { Plus } from "lucide-react";
import { useRef, useState } from "react";
import { Card } from "../ui/card";
import { Spinner } from "../ui/spinner";
import { toast } from "sonner";

export function CreateBoard({ projectId }: { projectId: string }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [open, setOpen] = useState(false);
  const create = useCreateBoard(projectId);
  const loading = create.isPending;
  const busy = useRef(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy.current) return;
    if (!name.trim()) { toast.error("Tên bảng không được để trống."); return; }
    busy.current = true;
    try {
      await create.mutateAsync({ name: name.trim(), description });
      setName("");
      setDescription("");
      setOpen(false);
    } catch (error) {
      const message = getErrorMessage(error, "Error creating board");
      toast.error(message);
    } finally {
      busy.current = false;
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className="w-full text-left">
        <Card className="h-36 cursor-pointer hover:shadow-lg transition-shadow flex justify-center items-center border-dashed border-2 border-gray-300">
          <div className="flex h-full justify-center items-center gap-2">
            <Plus></Plus> Add New Board
          </div>
        </Card>
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create New Board</DialogTitle>
            <DialogDescription>
              Fill in the details below to create a new board.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <Label htmlFor="name-1">Name</Label>
              <Input
                id="name-1"
                name="name"
                value={name}
                placeholder="Board name"
                required
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field>
              <Label htmlFor="description-1">Description</Label>
              <Input
                id="description-1"
                name="description"
                value={description}
                placeholder="Board description"
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
          </FieldGroup>
          <DialogFooter className="mt-4">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={loading}>
              {loading && <Spinner data-icon="inline-start" />}
              {loading ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
