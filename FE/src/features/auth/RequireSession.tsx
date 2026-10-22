import { useEffect } from "react";
import { Link, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { getApiError } from "@/lib/errors";
import { useSession } from "./session-context";
import { authLink, takeOAuthReturnTo } from "./redirect";

export function RequireSession() {
  const session = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (session.user && location.pathname === "/dashboard") {
      const path = takeOAuthReturnTo();
      if (path && path !== "/dashboard") navigate(path, { replace: true });
    }
  }, [session.user, location.pathname, navigate]);

  if (session.isLoading) return <div role="status" className="flex min-h-screen items-center justify-center gap-2"><Spinner aria-hidden="true" />Đang kiểm tra phiên đăng nhập…</div>;
  if (session.error) return <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
    <p role="alert">{getApiError(session.error).message}</p>
    <Button onClick={session.retry}>Thử lại</Button>
    <Link to={authLink("/login", location.pathname + location.search + location.hash)}>Về đăng nhập</Link>
  </div>;
  if (!session.user) return <Navigate replace to={authLink("/login", location.pathname + location.search + location.hash)} />;
  return <Outlet />;
}
