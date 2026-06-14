import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Card, CardTitle } from "../ui/card";
import { Checkbox } from "../ui/checkbox";
import { Plus, SquarePen } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { apiClient } from "@/lib/apiClient";
import { useCardsStore } from "@/stores/cards.store";

export function AddLabel({
  labelsBoard,
  fetchLabelsBoard,
}: {
  labelsBoard: any[];
  fetchLabelsBoard: () => void;
}) {
  const { boardId, cardId } = useParams() as {
    boardId: string;
    cardId: string;
  };

  const card = useCardsStore((state) =>
    state.cards.find((c) => c.id === cardId),
  );

  const addLabel = useCardsStore((state) => state.addLabel);
  const removeLabel = useCardsStore((state) => state.removeLabel);

  const currentCardLabels = card?.cardLabels || []; //lay

  const selectedLabelIds = currentCardLabels.map(
    (label: any) => label.labelId || label.label?.id || label.id,
  );

  const [pendingLabelIds, setPendingLabelIds] = useState<Set<string>>(
    new Set(),
  );
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [labelInputPopoverOpen, setLabelInputPopoverOpen] = useState(false);

  const [labelName, setLabelName] = useState("");
  const [selectedColor, setSelectedColor] = useState<string>("");
  const [editingLabel, setEditingLabel] = useState<{
    id: string;
    name: string;
    color: string;
  } | null>(null);

  const DEFAULT_LABEL_COLORS = [
    "#ef4444",
    "#22c55e",
    "#3b82f6",
    "#eab308",
    "#a855f7",
    "#f97316",
  ];

  // 3. Logic xử lý Tick/Bỏ tick checkbox
  const handleLabelToggle = async (labelColor: string, labelId: string) => {
    try {
      if (!cardId) {
        console.error("⚠️ cardId is undefined!");
        return;
      }

      if (!card) {
        console.error("⚠️ card not found in store!");
        return;
      }

      // Kiểm tra xem label này đã được tick hay chưa
      const isSelected = selectedLabelIds.includes(labelId);
      const fullLabelObj = labelsBoard.find((l) => l.id === labelId);

      if (!fullLabelObj) {
        console.error("⚠️ fullLabelObj not found in labelsBoard!");
        return;
      }

      if (isSelected) {
        // Optimistic Update: Xóa khỏi UI ngay lập tức

        removeLabel(cardId, labelId);
        await apiClient.delete(`/cards/${cardId}/labels/${labelId}`);
      } else {
        addLabel(cardId, {
          id: fullLabelObj.id,
          name: fullLabelObj.name,
          color: fullLabelObj.color,
        });
        await apiClient.post(`/cards/${cardId}/labels`, { labelId });
      }
      // Defensive check
    } catch (error) {
      console.error("❗ Error toggling label:", error);
    } finally {
      setPendingLabelIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(labelId);
        return newSet;
      });
    }
  };

  const handleSaveLabel = async () => {
    if (!labelName.trim() || !selectedColor) return;

    try {
      if (editingLabel) {
        // Cập nhật label cũ
        await apiClient.patch(`/labels/${editingLabel.id}`, {
          name: labelName,
          color: selectedColor,
        });
      } else {
        // Tạo label mới trên Board
        const response = await apiClient.post(`/boards/${boardId}/labels`, {
          name: labelName,
          color: selectedColor,
        });

        // Gắn label mới vào Card
        await apiClient.post(`/cards/${cardId}/labels`, {
          labelId: response.data.id,
        });

        // Cập nhật UI ngay lập tức
        addLabel(cardId, {
          id: response.data.id,
          name: response.data.name,
          color: response.data.color,
        });
      }

      // Làm mới danh sách label của Board
      fetchLabelsBoard();

      // Reset Form Popover
      setLabelInputPopoverOpen(false);
      setLabelName("");
      setSelectedColor("");
      setEditingLabel(null);
    } catch (error) {
      console.error("Error saving label:", error);
    }
  };

  const handleUpdateLabel = (label: {
    id: string;
    name: string;
    color: string;
  }) => {
    setEditingLabel(label);
    setLabelName(label.name);
    setSelectedColor(label.color);
    setLabelInputPopoverOpen(true);
  };

  return (
    <Popover
      open={popoverOpen}
      onOpenChange={(open) => {
        // Không đóng popover cha nếu popover con đang mở
        if (labelInputPopoverOpen) return;
        setPopoverOpen(open);
      }}
    >
      <div className="flex items-center flex-wrap gap-1 ">
        {/* Render danh sách label đã gắn lên Card */}
        {currentCardLabels.map((label: any) => {
          // Xử lý an toàn đề phòng backend trả về lồng object (label.label.xxx)
          const labelDetail = label.name ? label : label.label;
          if (!labelDetail) return null;

          return (
            <div key={labelDetail.id} className="flex items-center gap-2">
              <Card
                className={`p-4 h-8 flex items-center justify-center cursor-pointer`}
                style={{ backgroundColor: labelDetail.color }}
              >
                <CardTitle className="text-xs text-white">
                  {labelDetail.name}
                </CardTitle>
              </Card>
            </div>
          );
        })}
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8">
            <Plus size={16} />
          </Button>
        </PopoverTrigger>
      </div>

      <PopoverContent className="w-80">
        <div className="grid gap-4 relative">
          <div className="space-y-2">
            <h4 className="leading-none font-medium">Add Label</h4>
            <p className="text-sm text-muted-foreground">
              Select labels for your card.
            </p>
          </div>
          <div className="grid gap-2">
            <div className="grid gap-2">
              <Input
                id="label-search"
                placeholder="Search labels..."
                type="text"
              />
            </div>

            {labelsBoard.length > 0 ? (
              <div>
                <div className="grid gap-2 max-h-56 overflow-y-auto pr-1">
                  {labelsBoard.map((label) => (
                    <div key={label.id} className="flex items-center  gap-2">
                      <Checkbox
                        id={`label-checkbox-${label.id}`}
                        // Tự động Tick nếu ID của label này nằm trong selectedLabelIds
                        checked={selectedLabelIds.includes(label.id)}
                        onCheckedChange={() =>
                          handleLabelToggle(label.color, label.id)
                        }
                        disabled={pendingLabelIds.has(label.id)}
                      />
                      <Card
                        className={`p-3 w-full flex items-center gap-2 cursor-pointer transition-opacity hover:opacity-80`}
                        style={{ backgroundColor: label.color }}
                        onClick={() => handleLabelToggle(label.color, label.id)}
                      >
                        <CardTitle className="text-sm text-white m-0">
                          {label.name}
                        </CardTitle>
                      </Card>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleUpdateLabel(label)}
                      >
                        <SquarePen size={16} />
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end pt-4">
                  <Button
                    className="w-full"
                    onClick={() => {
                      setEditingLabel(null);
                      setLabelInputPopoverOpen(true);
                      setSelectedColor("");
                      setLabelName("");
                    }}
                  >
                    Create new label
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex justify-end pt-4">
                <Button
                  className="w-full"
                  onClick={() => {
                    setEditingLabel(null);
                    setLabelInputPopoverOpen(true);
                    setSelectedColor("");
                    setLabelName("");
                  }}
                >
                  Create new label
                </Button>
              </div>
            )}
          </div>

          {/* Popover con: Tạo / Sửa Label */}
          <Popover
            open={labelInputPopoverOpen}
            onOpenChange={(open) => {
              if (!open) {
                setEditingLabel(null);
                setLabelName("");
                setSelectedColor("");
              }
              setLabelInputPopoverOpen(open);
            }}
          >
            <PopoverTrigger asChild>
              <div className="absolute bottom-0 right-0 w-[1px] h-full opacity-0 pointer-events-none" />
            </PopoverTrigger>
            <PopoverContent
              className="w-64"
              side="right"
              align="start"
              sideOffset={17}
            >
              <div className="grid gap-4">
                <div className="space-y-2">
                  <h4 className="leading-none font-medium">
                    {editingLabel ? "Edit label" : "Create new label"}
                  </h4>
                </div>

                <div>
                  <Label className="text-sm mb-2 block">Select color</Label>
                  <div className="grid grid-cols-5 gap-2">
                    {DEFAULT_LABEL_COLORS.map((color) => (
                      <div
                        key={color}
                        className={`w-8 h-8 rounded cursor-pointer border-2 transition-all ${
                          selectedColor === color
                            ? "border-gray-800 scale-110"
                            : "border-transparent hover:scale-105"
                        }`}
                        style={{ backgroundColor: color }}
                        onClick={() => setSelectedColor(color)}
                      />
                    ))}
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="label-name">Label Name</Label>
                  <Input
                    id="label-name"
                    placeholder="Enter label name..."
                    value={labelName}
                    onChange={(e) => setLabelName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSaveLabel()}
                  />
                </div>

                {selectedColor && (
                  <div
                    className="h-8 rounded flex items-center justify-center text-white text-xs font-medium"
                    style={{ backgroundColor: selectedColor }}
                  >
                    Preview: {labelName || "Empty"}
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLabelInputPopoverOpen(false)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveLabel}
                    disabled={!labelName.trim() || !selectedColor}
                    className="flex-1"
                  >
                    {editingLabel ? "Update" : "Create"}
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </PopoverContent>
    </Popover>
  );
}
