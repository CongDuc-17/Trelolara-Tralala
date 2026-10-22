import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldSeparator } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getApiError } from "@/lib/errors";
import { getApiBaseUrl } from "@/lib/env";
import { useSession } from "@/features/auth/session-context";
import { authLink, safeReturnTo, saveOAuthReturnTo, takeOAuthReturnTo } from "@/features/auth/redirect";

import { useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast, Toaster } from "sonner";
import { Eye, EyeOff } from "lucide-react";

export function Login() {
  const navigate = useNavigate();
  const session = useSession();
  const [params] = useSearchParams();
  const returnTo = safeReturnTo(params.get("returnTo"));
  const pending = useRef(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending.current) return;
    if (!email.trim() || password.length < 8) {
      setError("Enter an email and a password with at least 8 characters");
      return;
    }
    pending.current = true;
    takeOAuthReturnTo();
    setError(""); // Clear previous error
    setIsLoading(true);

    try {
      await session.login({ email: email.trim(), password });

      toast.success("Login successful");
      navigate(returnTo, { replace: true });
    } catch (error) {
      const issue = getApiError(error);
      if (issue.kind === "canceled") return;
      const message = issue.message;
      setError(message);
      toast.error(message, {
        duration: 5000, // Hiển thị 5 giây
      });
    } finally {
      pending.current = false;
      setIsLoading(false);
    }
  }

  function handleLoginGoogle() {
    if (pending.current) return;
    try {
      const url = `${getApiBaseUrl()}/auth/google/login`;
      saveOAuthReturnTo(returnTo);
      session.startSession();
      pending.current = true;
      setIsLoading(true);
      window.location.assign(url);
    } catch (error) {
      pending.current = false;
      setIsLoading(false);
      setError(getApiError(error).message);
    }
  }

  return (
    <>
      <Toaster position="top-right" />
      <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle><h1>Login to your account</h1></CardTitle>
            <CardDescription>
              Enter your email below to login to your account
            </CardDescription>
            <CardAction>
              <Link to={authLink("/register", returnTo)}>
                <Button variant="link">Sign Up</Button>
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit}>
              <div className="flex flex-col gap-6">
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="Email"
                    required
                    disabled={isLoading}
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError(""); // Clear error when user types
                    }}
                  />
                </div>
                <div className="grid gap-2">
                  <div className="flex items-center">
                    <Label htmlFor="password">Password</Label>
                    <Link
                      to={authLink("/forgot-password", returnTo)}
                      className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
                    >
                      Forgot your password?
                    </Link>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showNewPassword ? "text" : "password"}
                      placeholder="Password"
                      required
                      minLength={8}
                      autoComplete="current-password"
                      disabled={isLoading}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setError(""); // Clear error when user types
                      }}
                    />
                    <button
                      type="button"
                      aria-label={showNewPassword ? "Hide password" : "Show password"}
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-900 transition-colors"
                    >
                      {showNewPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading}
                >
                  {isLoading ? "Logging in..." : "Login"}
                </Button>
                {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
                {/* shortcut: BE exposes unverified accounts only through this message; use an error code when available. */}
                {error.includes("has not been verified") && <Button type="button" variant="link" onClick={() => {
                  localStorage.setItem("emailForVerification", email.trim());
                  navigate(authLink("/verify", returnTo));
                }}>Verify email</Button>}
              </div>
              <div className="relative mt-6">
                <FieldSeparator className="mb-4">
                  Or continue with
                </FieldSeparator>
                <Field>
                  <Button
                    variant="outline"
                    type="button"
                    disabled={isLoading}
                    onClick={() => handleLoginGoogle()}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                      <path
                        d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                        fill="currentColor"
                      />
                    </svg>
                    Login with Google
                  </Button>
                </Field>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
