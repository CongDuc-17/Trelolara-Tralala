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
import { useCreateProject } from "@/features/catalog/queries";
import { getApiError } from "@/lib/errors";
import { Plus } from "lucide-react";
import { useRef, useState } from "react";
import { Spinner } from "../ui/spinner";

export function CreateProject() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [open, setOpen] = useState(false);
  const create = useCreateProject();
  const loading = create.isPending;
  const busy = useRef(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy.current) return;
    if (!name.trim()) { setError("Tên dự án không được để trống."); return; }
    busy.current = true;
    setError("");
    try {
      await create.mutateAsync({ name: name.trim(), description });
      setName("");
      setDescription("");
      setOpen(false);
    } catch (error) { setError(getApiError(error).message); }
    finally { busy.current = false; }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus color="white"></Plus>Create New Project
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
            <DialogDescription>
              Fill in the details below to create a new project.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <Label htmlFor="name-1">Name</Label>
              <Input
                id="name-1"
                name="name"
                value={name}
                placeholder="Project name"
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
                placeholder="Project description"
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
          </FieldGroup>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
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
