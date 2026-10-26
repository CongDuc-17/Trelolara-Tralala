import { useMutation } from "@tanstack/react-query";
import { useSession } from "@/features/auth/session-context";
import { changePassword, updateMyInformation } from "./api";

export function useUpdateProfile() {
  const { getMyInformation } = useSession();
  return useMutation({ mutationFn: updateMyInformation, onSuccess: getMyInformation });
}

export const useChangePassword = () => useMutation({ mutationFn: changePassword });
