import { useTranslation } from "react-i18next";
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
import { Spinner } from "../ui/spinner";
import { toast } from "sonner";

export function CreateBoard({ projectId, compact = false }: { projectId: string; compact?: boolean }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [open, setOpen] = useState(false);
  const create = useCreateBoard(projectId);
  const loading = create.isPending;
  const busy = useRef(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy.current) return;
    if (!name.trim()) { toast.error(t("createBoard.requiredName")); return; }
    busy.current = true;
    try {
      await create.mutateAsync({ name: name.trim(), description });
      setName("");
      setDescription("");
      setOpen(false);
    } catch (error) {
      const message = getErrorMessage(error, t("createBoard.failed"));
      toast.error(message);
    } finally {
      busy.current = false;
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {compact ? <Button className="h-11"><Plus className="size-4" />{t("createBoard.create")}</Button> : <Button type="button" variant="outline" className="board-create-tile h-auto min-h-28 w-full rounded-lg border-dashed bg-transparent font-normal text-muted-foreground">
          <Plus className="size-4" />{t("createBoard.add")}
        </Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t("createBoard.title")}</DialogTitle>
            <DialogDescription>
              {t("createBoard.description")}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <Label htmlFor="name-1">{t("createBoard.name")}</Label>
              <Input
                id="name-1"
                name="name"
                value={name}
                placeholder={t("createBoard.namePlaceholder")}
                required
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field>
              <Label htmlFor="description-1">{t("common.description")}</Label>
              <Input
                id="description-1"
                name="description"
                value={description}
                placeholder={t("createBoard.descriptionPlaceholder")}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
          </FieldGroup>
          <DialogFooter className="mt-4">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("common.cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={loading}>
              {loading && <Spinner data-icon="inline-start" />}
              {loading ? t("common.creating") : t("createBoard.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
