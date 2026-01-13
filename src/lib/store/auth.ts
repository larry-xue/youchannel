import { useRouteContext, useRouter } from "@tanstack/react-router";
import { Store, useStore } from "@tanstack/react-store";
import { useEffect } from "react";

export interface AuthUser {
  id: string;
  email?: string;
  user_metadata: Record<string, any>;
  app_metadata: Record<string, any>;
}

export type AuthStatus = "unknown" | "authenticated" | "unauthenticated";

export interface AuthState {
  user: AuthUser | null;
  status: AuthStatus;
}

export const createAuthStore = () =>
  new Store<AuthState>({
    user: null,
    status: "unknown",
  });

export type AuthStore = Store<AuthState>;

export const setAuthUser = (store: AuthStore, user: AuthUser | null) => {
  store.setState((prev) => ({
    ...prev,
    user,
    status: user ? "authenticated" : "unauthenticated",
  }));
};

export const useAuthStore = <TSelected>(selector: (state: AuthState) => TSelected) => {
  const router = useRouter();
  return useStore(router.options.context.authStore, selector);
};

export const useAuthUser = () => {
  const router = useRouter();
  const authStore = router.options.context.authStore;
  const storeState = useStore(authStore, (state) => state);
  const contextUser = useRouteContext({
    from: "__root__",
    select: (context) => context.user ?? null,
  });
  const user = storeState.status === "unknown" ? contextUser : storeState.user;

  useEffect(() => {
    if (storeState.status === "unknown") {
      setAuthUser(authStore, user ?? null);
    }
  }, [authStore, storeState.status, user]);

  return user;
};

export const useAuthStatus = () => useAuthStore((state) => state.status);
