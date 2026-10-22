import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

import { apiClient } from "@/lib/apiClient";
import { getApiError } from "@/lib/errors";
import { authLink, safeReturnTo } from "@/features/auth/redirect";

import { useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast, Toaster } from "sonner";
import { Eye, EyeOff } from "lucide-react";

export function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setshowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const [params] = useSearchParams();
  const returnTo = safeReturnTo(params.get("returnTo"));

  const navigate = useNavigate();
  async function handleRegister(event: React.FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    setError("");
    if (name.trim().length < 2) {
      setError("Name must be at least 2 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      toast.error("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    try {
      pending.current = true;
      setLoading(true);
      await apiClient.post(
        "/auth/register",
        {
          email: email.trim(),
          password,
          name: name.trim(),
        },
        { withCredentials: true },
      );
      localStorage.setItem("emailForVerification", email.trim());
      toast.success("Registration successful. Please verify your email.");
      navigate(authLink("/verify", returnTo), { replace: true });
    } catch (error) {
      const issue = getApiError(error);
      if (issue.kind === "canceled") return;
      const message = issue.message;
      toast.error(message);
      setError(message);
    } finally {
      pending.current = false;
      setLoading(false);
    }
  }

  return (
    <>
      <Toaster position="top-right" />
      <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
        <form id="register-form" className="w-full max-w-sm" onSubmit={handleRegister}>
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle><h1>Register a new account</h1></CardTitle>
            <CardDescription>
              Enter your email below to register a new account
            </CardDescription>
            <CardAction>
              <Link to={authLink("/login", returnTo)}>
                <Button type="button" variant="link">Login</Button>
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
              <div className="flex flex-col gap-6">
                <div className="grid gap-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    minLength={2}
                    maxLength={100}
                    autoComplete="name"
                    disabled={loading}
                    type="text"
                    placeholder="Name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    autoComplete="email"
                    disabled={loading}
                    type="email"
                    placeholder="Email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <div className="flex items-center">
                    <Label htmlFor="password">Password</Label>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      minLength={8}
                      autoComplete="new-password"
                      disabled={loading}
                      type={showPassword ? "text" : "password"}
                      placeholder="Password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      onClick={() => setshowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-900 transition-colors"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
                <div className="grid gap-2">
                  <div className="flex items-center">
                    <Label htmlFor="confirm-password">Confirm Password</Label>
                  </div>
                  <div className="relative">
                    <Input
                      id="confirm-password"
                      minLength={8}
                      autoComplete="new-password"
                      disabled={loading}
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="Confirm Password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      aria-label={showConfirmPassword ? "Hide password confirmation" : "Show password confirmation"}
                      onClick={() =>
                        setShowConfirmPassword(!showConfirmPassword)
                      }
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-900 transition-colors"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
              {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          </CardContent>
          <CardFooter className="flex-col gap-2">
            <Button
              type="submit"
              form="register-form"
              className="w-full"
              disabled={loading}
            >
              {loading && <Spinner aria-hidden="true" data-icon="inline-start" />}
              {loading ? "Registering..." : "Register"}
            </Button>
          </CardFooter>
        </Card>
        </form>
      </div>
    </>
  );
}
