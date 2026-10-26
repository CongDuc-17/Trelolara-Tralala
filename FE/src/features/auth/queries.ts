import { useMutation } from "@tanstack/react-query";
import { register, resetPassword, sendOtp, verifyEmail } from "./api";

export const useRegister = () => useMutation({ mutationFn: register });
export const useVerifyEmail = () => useMutation({ mutationFn: verifyEmail });
export const useSendOtp = () => useMutation({ mutationFn: sendOtp });
export const useResetPassword = () => useMutation({ mutationFn: resetPassword });
