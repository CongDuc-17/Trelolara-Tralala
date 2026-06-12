import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { apiClient } from "@/lib/apiClient";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useCardsStore } from "@/stores/cards.store";
import { Spinner } from "../ui/spinner";

export function AddChecklist() {
  const [title, setTitle] = useState("");
  const [popoverOpen, setPopoverOpen] = useState(false);
  const { cardId } = useParams() as { cardId: string };
  const { addChecklist } = useCardsStore();
  const [isAdding, setIsAdding] = useState(false);

  async function handleAddChecklist() {
    if (!title.trim() || isAdding) return;

    try {
      setIsAdding(true);
      const response = await apiClient.post(`/cards/${cardId}/checklists`, {
        title,
      });
      setTitle("");
      setPopoverOpen(false);
      addChecklist(cardId, response.data);
    } catch (error) {
      console.error("Error adding checklist", error);
    } finally {
      setIsAdding(false);
    }
  }

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline">Add Checklist</Button>
      </PopoverTrigger>
      <PopoverContent className="w-90">
        <div className="grid gap-4">
          <div className="space-y-2">
            <h4 className="leading-none font-medium">Add Checklist</h4>
            <div className="text-xs text-muted-foreground">
              Add a checklist to your task to keep track of your progress.
            </div>
          </div>
          <div className="grid gap-2">
            <div className="grid grid-cols-5 items-center gap-4">
              <Label htmlFor="width">Title</Label>
              <Input
                id="width"
                className="col-span-4 h-8"
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && title.trim() && !isAdding) {
                    e.preventDefault();
                    handleAddChecklist();
                  }
                }}
                autoFocus
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setPopoverOpen(false);
                  setTitle("");
                }}
                disabled={isAdding}
              >
                Cancel
              </Button>

              {/* --- ĐÃ SỬA LẠI LOGIC RENDER SPINNER TẠI ĐÂY --- */}
              <Button
                type="button"
                disabled={isAdding || !title.trim()}
                onClick={handleAddChecklist}
              >
                {isAdding ? (
                  <div className="flex items-center">
                    <Spinner className="mr-2 h-4 w-4" />
                    Adding...
                  </div>
                ) : (
                  "Add Checklist"
                )}
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
