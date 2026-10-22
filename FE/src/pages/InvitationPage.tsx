import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { toast, Toaster } from "sonner";
import { apiClient } from "@/lib/apiClient";
import { getApiError } from "@/lib/errors";
import { useSession } from "@/features/auth/session-context";
import { authLink } from "@/features/auth/redirect";
import { useInvalidateCatalog } from "@/features/catalog/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function InvitationPage() {
  const { scope, token = "" } = useParams();
  const session = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const invalidate = useInvalidateCatalog();
  const [accountError, setAccountError] = useState("");
  const busy = useRef(false);
  const valid = (scope === "projects" || scope === "boards") && token.length > 0 && token.length <= 512;
  const returnTo = location.pathname + location.search + location.hash;
  const mutation = useMutation({
    mutationFn: (action: "accept" | "reject") => apiClient.post<string>(`/invitations/${encodeURIComponent(token)}/${action}`),
    onSuccess: async (_response, action) => {
      await invalidate();
      toast.success(action === "accept" ? "Đã chấp nhận lời mời." : "Đã từ chối lời mời.");
      navigate("/dashboard", { replace: true });
    },
    onSettled: () => { busy.current = false; },
  });
  const failure = mutation.error ? getApiError(mutation.error) : null;
  // shortcut: BE exposes messages rather than invitation error codes; replace when codes are available.
  const unverified = failure?.status === 403 && failure.message.includes("Verify your email");
  const message = failure?.message.includes("expired") ? "Lời mời đã hết hạn. Hãy yêu cầu người mời gửi lại."
    : failure?.message.includes("already a member") ? "Bạn đã là thành viên. Có thể mở lại Tổng quan."
      : failure?.message.includes("already processed") ? "Lời mời đã được xử lý."
        : failure?.status === 404 ? "Không tìm thấy lời mời hoặc tài nguyên được mời."
          : failure?.status === 403 && !unverified ? "Tài khoản này không thể xử lý lời mời. Kiểm tra email nhận lời mời hoặc đổi tài khoản."
            : unverified ? "Bạn cần xác minh email trước khi chấp nhận lời mời."
              : failure?.message;

  async function changeAccount() {
    setAccountError("");
    try {
      await session.logout();
      navigate(authLink("/login", returnTo), { replace: true });
    } catch (error) { setAccountError(getApiError(error).message); }
  }

  function respond(action: "accept" | "reject") {
    if (!valid || busy.current || session.isLoggingOut) return;
    busy.current = true;
    mutation.mutate(action);
  }

  return <main className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
    <Toaster position="top-right" />
    <Card className="w-full max-w-lg">
      <CardHeader><CardTitle><h1 className="text-xl">Lời mời tham gia {scope === "projects" ? "dự án" : "bảng"}</h1></CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {!valid ? <p role="alert">Liên kết lời mời không hợp lệ.</p> : <>
          <p>Bạn đang đăng nhập bằng <strong className="break-all">{session.user?.email}</strong>.</p>
          <p className="text-sm text-muted-foreground">Chỉ tiếp tục nếu bạn tin cậy người gửi. Chấp nhận lời mời sẽ thêm tài khoản này vào tài nguyên được mời.</p>
          {message && <p role="alert">{message}</p>}
          {unverified && <Button variant="outline" onClick={() => {
            localStorage.setItem("emailForVerification", session.user?.email ?? "");
            navigate(authLink("/verify", returnTo));
          }}>Xác minh email</Button>}
          <div className="flex flex-wrap gap-2">
            <Button disabled={mutation.isPending || session.isLoggingOut} onClick={() => respond("accept")}>{mutation.isPending ? "Đang xử lý…" : "Chấp nhận"}</Button>
            <Button variant="outline" disabled={mutation.isPending || session.isLoggingOut} onClick={() => respond("reject")}>Từ chối</Button>
          </div>
          <Button variant="link" disabled={mutation.isPending || session.isLoggingOut} onClick={() => { void changeAccount(); }}>Đổi tài khoản</Button>
          {accountError && <p role="alert">{accountError}</p>}
        </>}
        <div><Link to="/dashboard" className="text-sm underline">Về Tổng quan</Link></div>
      </CardContent>
    </Card>
  </main>;
}
