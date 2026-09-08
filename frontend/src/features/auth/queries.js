import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { queryKeys } from '@/app/queryClient';
import { useAuthStore } from '@/stores/authStore';
import { disconnectSocket } from '@/lib/socket';
import { authApi } from './api';

/**
 * The authoritative profile. The store's copy is only a boot-time placeholder
 * so the shell can render before this resolves.
 */
export function useMe() {
  const token = useAuthStore((s) => s.token);
  const setUser = useAuthStore((s) => s.setUser);

  return useQuery({
    queryKey: queryKeys.auth.me,
    queryFn: async () => {
      const { user } = await authApi.me();
      setUser(user);
      return user;
    },
    enabled: Boolean(token),
    staleTime: 5 * 60_000,
  });
}

export function useLogin() {
  const signIn = useAuthStore((s) => s.signIn);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: authApi.login,
    onSuccess: ({ token, user }) => {
      signIn({ token, user });
      queryClient.setQueryData(queryKeys.auth.me, user);
      toast.success(`Welcome back, ${user.displayName}`);
    },
  });
}

export function useRegister() {
  const signIn = useAuthStore((s) => s.signIn);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: authApi.register,
    onSuccess: ({ token, user }) => {
      signIn({ token, user });
      queryClient.setQueryData(queryKeys.auth.me, user);
      toast.success('Account created. Add a trusted contact next.');
    },
  });
}

/**
 * Signing out must clear every cache — a shared device would otherwise leak
 * the previous user's journeys and contacts into the next session.
 */
export function useLogout() {
  const signOut = useAuthStore((s) => s.signOut);
  const queryClient = useQueryClient();

  return () => {
    signOut();
    disconnectSocket();
    queryClient.clear();
  };
}

export function useUpdateSettings() {
  const setUser = useAuthStore((s) => s.setUser);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: authApi.updateSettings,
    onSuccess: ({ user }) => {
      setUser(user);
      queryClient.setQueryData(queryKeys.auth.me, user);
      toast.success('Settings saved');
    },
    onError: (error) => toast.error(error.message),
  });
}

export function useDeleteAccount() {
  const logout = useLogout();

  return useMutation({
    mutationFn: authApi.deleteAccount,
    onSuccess: () => {
      toast.success('Account and personal data deleted');
      logout();
    },
    onError: (error) => toast.error(error.message),
  });
}
