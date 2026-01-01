import { getUserFn } from "~/lib/server/user";
import { setAuthUser, type AuthStore, type AuthUser } from "~/lib/store/auth";

export const resolveAuthUser = async (
  authStore: AuthStore,
  routeUser?: AuthUser | null,
) => {
  if (routeUser) {
    if (authStore.state.status === "unknown") {
      setAuthUser(authStore, routeUser);
    }
    return routeUser;
  }

  if (authStore.state.user) return authStore.state.user;

  if (authStore.state.status === "unknown") {
    const user = await getUserFn();
    setAuthUser(authStore, user);
    return user;
  }

  return null;
};
