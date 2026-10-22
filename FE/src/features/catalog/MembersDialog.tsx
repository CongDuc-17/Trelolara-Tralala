import { useId, useRef, useState, type FormEvent } from "react";
import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { X } from "lucide-react";
import { apiClient } from "@/lib/apiClient";
import { getApiError } from "@/lib/errors";
import { pageItems, useInvalidateCatalog, useMembers, useRoles } from "./queries";
import { LoadMore, QueryFeedback } from "./QueryFeedback";
import type { Invitation, MemberScope } from "./types";

export function MembersDialog({ kind, id, count }: { kind: MemberScope; id: string; count?: number; }) {
  const [open, setOpen] = useState(false);
  const members = useMembers(kind, id, open);
  const roles = useRoles(kind, open);
  const invalidate = useInvalidateCatalog();
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<Invitation | null>(null);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const emailId = useId();
  const items = pageItems(members.data);
  const title = kind === "projects" ? "Thành viên dự án" : "Thành viên bảng";

  async function invite(event: FormEvent) {
    event.preventDefault();
    if (busy.current || result) return;
    if (!email.trim() || !roleId) { setError("Nhập email và chọn vai trò."); return; }
    busy.current = true;
    setPending(true);
    setError("");
    try {
      const response = await apiClient.post<Invitation>(`/invitations/${kind}/${id}`, { email: email.trim(), roleId });
      if (!response.data.delivery || !["SENT", "FAILED"].includes(response.data.delivery.email)) {
        throw new Error("Không xác định được kết quả gửi lời mời.");
      }
      setResult(response.data);
    } catch (error) {
      setError(getApiError(error).message);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function changeMember(userId: string, newRoleId?: string) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      if (newRoleId) await apiClient.patch(`/${kind}/${id}/members`, { userId, roleId: newRoleId });
      else await apiClient.delete(`/${kind}/${id}/members`, { data: { userId } });
      await invalidate();
    } catch (error) {
      setError(getApiError(error).message);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild>
      <button type="button" aria-label={title} className="flex flex-row flex-wrap items-center pr-4 gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-ring">
        <AvatarGroup>{items.slice(0, 3).map((member) => <Avatar key={member.userId}>
          <AvatarImage src={member.avatar ?? ""} alt={member.name} /><AvatarFallback>{member.name.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>)}{(count ?? items.length) > 3 && <AvatarGroupCount>+{(count ?? items.length) - Math.min(items.length, 3)}</AvatarGroupCount>}</AvatarGroup>
        <span className="text-sm">Thành viên{count !== undefined ? ` (${count})` : ""}</span>
      </button>
    </DialogTrigger>
    <DialogContent className="sm:max-w-[500px] max-h-[90dvh] overflow-y-auto">
      <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>Xem thành viên, thay đổi vai trò hoặc gửi lời mời.</DialogDescription></DialogHeader>
      <form onSubmit={invite} className="space-y-4">
        <div className="space-y-2"><Label htmlFor={emailId}>Email thành viên mới</Label>
          <Input id={emailId} type="email" required value={email} disabled={pending} onChange={(event) => { setEmail(event.target.value); setResult(null); }} />
        </div>
        <QueryFeedback query={roles} empty={roles.data?.length === 0} label="vai trò" />
        <DialogFooter className="flex-col flex-wrap sm:flex-row">
          <Select value={roleId} disabled={pending || !roles.data?.length} onValueChange={(value) => { setRoleId(value); setResult(null); }}>
            <SelectTrigger aria-label="Vai trò lời mời" className="w-[180px]"><SelectValue placeholder="Chọn vai trò" /></SelectTrigger>
            <SelectContent>{roles.data?.map((role) => <SelectItem key={role.id} value={role.id}>{role.name.replace(/^(PROJECT|BOARD)_/, "")}</SelectItem>)}</SelectContent>
          </Select>
          <DialogClose asChild><Button type="button" variant="outline">Đóng</Button></DialogClose>
          <Button type="submit" disabled={pending || !!result || !roles.data?.length}>{pending ? "Đang xử lý…" : "Gửi lời mời"}</Button>
        </DialogFooter>
      </form>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {result && <div role="status" className="space-y-2 text-sm">
        <p>{result.delivery.email === "SENT" ? "Đã lưu và gửi email lời mời." : "Đã lưu lời mời nhưng gửi email thất bại. Không cần tạo lại lời mời."}</p>
        {result.delivery.notification === "FAILED" && <p>Thông báo trong ứng dụng chưa gửi được.</p>}
        <Button type="button" size="sm" variant="outline" onClick={() => { setResult(null); setEmail(""); setRoleId(""); }}>Mời người khác</Button>
      </div>}
      <div className="max-h-[300px] overflow-y-auto space-y-2">
        <QueryFeedback query={members} empty={items.length === 0} label="thành viên" />
        {items.map((member) => <Card key={member.userId} className="flex flex-row flex-wrap justify-between items-center gap-4 p-4">
          <div className="flex min-w-0 items-center"><Avatar><AvatarImage src={member.avatar ?? ""} alt={member.name} /><AvatarFallback>{member.name.charAt(0).toUpperCase()}</AvatarFallback></Avatar>
            <div className="ml-4 min-w-0"><div className="font-bold break-words">{member.name}</div><div className="text-sm text-muted-foreground break-all">{member.email}</div></div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={member.roleId} onValueChange={(value) => { void changeMember(member.userId, value); }} disabled={pending || !roles.data?.length}>
              <SelectTrigger className="w-fit" aria-label={`Vai trò của ${member.name}`}><SelectValue placeholder={member.roleName.replace(/^(PROJECT|BOARD)_/, "")} /></SelectTrigger>
              <SelectContent>{!roles.data?.some((role) => role.id === member.roleId) && <SelectItem value={member.roleId} disabled>{member.roleName}</SelectItem>}
                {roles.data?.map((role) => <SelectItem key={role.id} value={role.id}>{role.name.replace(/^(PROJECT|BOARD)_/, "")}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button type="button" variant="ghost" size="icon" disabled={pending} aria-label={`Xóa ${member.name} khỏi ${kind === "projects" ? "dự án" : "bảng"}`} onClick={() => { void changeMember(member.userId); }}><X className="text-gray-400" /></Button>
          </div>
        </Card>)}
        <LoadMore query={members} label="thành viên" />
        {kind === "boards" && <p className="text-xs text-muted-foreground">Danh sách hiển thị thành viên trực tiếp của bảng; quyền kế thừa từ dự án do máy chủ quyết định.</p>}
      </div>
    </DialogContent>
  </Dialog>;
}
