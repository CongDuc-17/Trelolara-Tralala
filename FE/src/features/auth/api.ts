import { apiClient } from "@/lib/apiClient";
import { getApiBaseUrl } from "@/lib/env";

export type LoginInput = { email: string; password: string };
type RegisterInput = LoginInput & { name: string };
type VerifyEmailInput = { email: string; otp: string };
type ResetPasswordInput = VerifyEmailInput & { newPassword: string };
type SessionTokens = { accessToken: string; refreshToken: string };
type AccountSummary = {
  id: string;
  userId: string;
  email: string;
  name: string;
  avatar: string;
  verify: boolean;
  status: "ACTIVE" | "LOCKED";
};

export const login = (input: LoginInput) => apiClient.post<SessionTokens>("/auth/login", input);
export const logout = () => apiClient.post<null>("/auth/logout");
export const register = (input: RegisterInput) => apiClient.post<AccountSummary>("/auth/register", input, { withCredentials: true });
export const verifyEmail = (input: VerifyEmailInput) => apiClient.post<AccountSummary>("/auth/verify", input);
export const sendOtp = (input: { email: string }) => apiClient.post<null>("/auth/send-otp", input);
export const resetPassword = (input: ResetPasswordInput) => apiClient.post<AccountSummary>("/auth/forgot-password", input, { withCredentials: true });
export const googleLoginUrl = () => `${getApiBaseUrl()}/auth/google/login`;
