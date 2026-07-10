import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase, accountApi } from '@/integrations/supabase/client';

type User = {
  id: string;
  email?: string;
  user_metadata?: Record<string, any>;
  app_metadata?: Record<string, any>;
};

type Session = {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  roles?: AppRole[];
  user: User;
};

export type AppRole = 'super_admin' | 'user';

const VALID_ROLES: AppRole[] = ['super_admin', 'user'];

const normalizeRoles = (roles: unknown): AppRole[] => {
  if (!Array.isArray(roles)) return [];

  return Array.from(
    new Set(
      roles.filter((role): role is AppRole =>
        VALID_ROLES.includes(role as AppRole)
      )
    )
  );
};

interface UserData {
  id: string;
  email?: string;
  name?: string;
  display_name?: string;
  lightning_pubkey?: string;
  auth_provider: string;
  avatar_url?: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  userData: UserData | null;
  roles: AppRole[];
  lightningPubkey: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isUserDataReady: boolean;
  isSuperAdmin: boolean;
  /** True if super_admin OR an RBAC admin role. */
  isAdmin: boolean;
  /** True once the admin check has resolved (avoids premature redirects). */
  isAdminResolved: boolean;
  login: (email: string, password: string) => Promise<{ error: Error | null; roles?: AppRole[] }>;
  signUp: (email: string, password: string, name: string) => Promise<{ error: Error | null }>;
  requestPasswordReset: (email: string) => Promise<{ data: any; error: Error | null }>;
  confirmPasswordReset: (token: string, password: string) => Promise<{ error: Error | null }>;
  loginWithGoogle: () => Promise<{ error: Error | null }>;
  loginWithLightning: (pubkey: string) => void;
  logout: () => Promise<void>;
  refreshUserData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const reportAuthError = (...args: unknown[]) => {
  if (import.meta.env.DEV) {
    console.error(...args);
  }
};

// Cheap synchronous check for a persisted session so the initial render doesn't
// have to guess between "loading" and "signed out" — if no marker exists in
// storage, we can skip the loading state entirely and paint the correct UI
// (Log in button) on first render. If a marker DOES exist, we stay in loading
// until the async restore completes, and never flash the wrong state.
function hasPersistedAuthMarker(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return !!(
      localStorage.getItem("prospera_owned_session") ||
      sessionStorage.getItem("prospera_owned_session") ||
      localStorage.getItem("lightning_pubkey")
    );
  } catch {
    return false;
  }
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  // Only enter the "loading" state if there's actually something to restore.
  // Without this, cold anonymous visits render a skeleton for a beat before
  // resolving to "Log in", which reads as a flash.
  const [isLoading, setIsLoading] = useState(() => hasPersistedAuthMarker());
  const [isUserDataReady, setIsUserDataReady] = useState(false);
  // RBAC admin status (for users who are admins via RBAC roles, not the legacy
  // super_admin role). null = not yet checked.
  const [isRbacAdmin, setIsRbacAdmin] = useState<boolean | null>(null);

  // Lightning auth state (stored separately)
  const [lightningPubkey, setLightningPubkey] = useState<string | null>(null);

  /**
   * Unified function to fetch user data from public.users table
   * This is the SINGLE source of truth for user data regardless of auth type
   */
  const fetchUserDataFromPublicUsers = async (
    userId?: string,
    pubkey?: string,
    fallbackRoles: AppRole[] = []
  ): Promise<void> => {
    try {
      setIsUserDataReady(false);
      
      let userRow: UserData | null = null;
      let userRoles: AppRole[] = fallbackRoles;

      if (userId) {
        const { data: meResult } = await supabase.auth.getUser();
        if (meResult?.user) {
          const u = meResult.user;
          userRow = {
            id: u.id,
            email: u.email || undefined,
            name: u.name || u.display_name || u.user_metadata?.name || undefined,
            display_name: u.display_name || u.name || u.user_metadata?.name || undefined,
            lightning_pubkey: u.lightning_pubkey || undefined,
            auth_provider: u.auth_provider || 'email',
            avatar_url: u.avatar_url || u.user_metadata?.picture || undefined,
          };
        }

        if (userRow) {
          const { data: rolesData } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', userRow.id);

          if (rolesData?.length) {
            userRoles = normalizeRoles(rolesData.map(r => r.role));
          }
        }
      } else if (pubkey) {
        // Lightning auth - set session variable first for RLS policies
        await supabase.rpc('set_lightning_session', { p_pubkey: pubkey });

        // Fetch from public.users by lightning_pubkey
        const { data: publicUser, error } = await supabase
          .from('users')
          .select('id, email, name, display_name, lightning_pubkey, auth_provider, avatar_url')
          .eq('lightning_pubkey', pubkey)
          .maybeSingle();

        if (error) {
          reportAuthError('[Auth] Error fetching public.users by pubkey:', error.message);
        }

        if (publicUser) {
          userRow = {
            id: publicUser.id,
            email: publicUser.email || undefined,
            name: publicUser.name || publicUser.display_name || undefined,
            display_name: publicUser.display_name || undefined,
            lightning_pubkey: publicUser.lightning_pubkey || undefined,
            auth_provider: publicUser.auth_provider || 'lightning',
            avatar_url: publicUser.avatar_url || undefined,
          };

          // Fetch roles for lightning user
          const { data: rolesData } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', publicUser.id);

          if (rolesData?.length) {
            userRoles = normalizeRoles(rolesData.map(r => r.role));
          }
        } else {
          reportAuthError('[Auth] No user found for lightning user');
        }
      }

      setUserData(userRow);
      setRoles(userRoles);
      setIsUserDataReady(true);
      
    } catch (error) {
      reportAuthError('[Auth] Error in fetchUserDataFromPublicUsers:', error);
      if (fallbackRoles.length > 0) {
        setRoles(fallbackRoles);
      }
      setIsUserDataReady(true); // Mark as ready even on error to prevent infinite loading
    }
  };

  useEffect(() => {
    let isMounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!isMounted) return;

        // Do NOT reset isLoading/isUserDataReady here. The login() and restoreSession()
        // functions manage loading state directly. Resetting here causes a spinner flash
        // on protected pages after login because this fires via setTimeout after navigate().
        const sessionRoles = normalizeRoles((session as Session | null)?.roles);

        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          await fetchUserDataFromPublicUsers(session.user.id, undefined, sessionRoles);
        } else {
          const currentPubkey = localStorage.getItem('lightning_pubkey');
          if (currentPubkey) {
            setLightningPubkey(currentPubkey);
            await fetchUserDataFromPublicUsers(undefined, currentPubkey);
          } else {
            setLightningPubkey(null);
            setUserData(null);
            setRoles([]);
            setIsUserDataReady(true);
          }
        }
      }
    );

    const restoreSession = async () => {
      setIsLoading(true);
      setIsUserDataReady(false);

      const storedPubkey = localStorage.getItem('lightning_pubkey');
      if (storedPubkey) {
        setLightningPubkey(storedPubkey);
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!isMounted) return;

      const sessionRoles = normalizeRoles((session as Session | null)?.roles);

      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        await fetchUserDataFromPublicUsers(session.user.id, undefined, sessionRoles);
      } else if (storedPubkey) {
        await fetchUserDataFromPublicUsers(undefined, storedPubkey);
      } else {
        setLightningPubkey(null);
        setUserData(null);
        setRoles([]);
        setIsUserDataReady(true);
      }
      
      if (isMounted) {
        setIsLoading(false);
      }
    };

    restoreSession().catch((error) => {
      reportAuthError('[Auth] Error restoring session:', error);
      if (isMounted) {
        setSession(null);
        setUser(null);
        setUserData(null);
        setRoles([]);
        setIsUserDataReady(true);
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    const sessionRoles = normalizeRoles((data as any)?.session?.roles || (data as any)?.roles);
    if (!error && data?.session) {
      setSession(data.session);
      setUser(data.session.user ?? data.user ?? null);
      if (sessionRoles.length > 0) {
        setRoles(sessionRoles);
      }
      if (data.session.user?.id || data.user?.id) {
        await fetchUserDataFromPublicUsers(data.session.user?.id ?? data.user.id, undefined, sessionRoles);
      }
    }

    return { error: error as Error | null, roles: sessionRoles };
  };

  const signUp = async (email: string, password: string, name: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          name,
        },
      },
    });

    // If signup successful, create user role
    // Note: The trigger handle_new_auth_user will create the public.users row
    if (!error && data.user) {
      await supabase.from('user_roles').insert({
        user_id: data.user.id,
        role: 'user',
      });
    }

    return { error: error as Error | null };
  };

  const requestPasswordReset = async (email: string) => {
    const redirectUrl = `${window.location.origin}/reset-password`;
    const { data, error } = await (supabase.auth as any).requestPasswordReset(email, redirectUrl);
    return { data, error: error as Error | null };
  };

  const confirmPasswordReset = async (token: string, password: string) => {
    const { error } = await (supabase.auth as any).confirmPasswordReset(token, password);
    return { error: error as Error | null };
  };

  const loginWithGoogle = async () => {
    const redirectUrl = `${window.location.origin}/auth`;
    
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
      },
    });
    return { error: error as Error | null };
  };

  const loginWithLightning = (pubkey: string) => {
    localStorage.setItem('lightning_pubkey', pubkey);
    setLightningPubkey(pubkey);
    fetchUserDataFromPublicUsers(undefined, pubkey);
  };

  const logout = async () => {
    // Clear lightning auth
    localStorage.removeItem('lightning_pubkey');
    setLightningPubkey(null);

    // Clear per-user client state so the next person on a shared device doesn't
    // inherit the previous user's cart or chosen delivery location.
    localStorage.removeItem('prospera_cart');
    localStorage.removeItem('prospera_residence');

    // Clear Supabase auth
    await supabase.auth.signOut();
    
    setUser(null);
    setSession(null);
    setUserData(null);
    setRoles([]);
    setIsUserDataReady(true);
    setIsLoading(false);
  };

  const refreshUserData = async () => {
    if (user?.id) {
      await fetchUserDataFromPublicUsers(user.id, undefined, roles);
    } else if (lightningPubkey) {
      await fetchUserDataFromPublicUsers(undefined, lightningPubkey);
    } else {
      // Check localStorage as fallback
      const storedPubkey = localStorage.getItem('lightning_pubkey');
      if (storedPubkey) {
        setLightningPubkey(storedPubkey);
        await fetchUserDataFromPublicUsers(undefined, storedPubkey);
      }
    }
  };

  const isAuthenticated = !!(user || lightningPubkey);
  const isSuperAdmin = roles.includes('super_admin');

  // Resolve admin access: super_admin (legacy) OR an RBAC admin role.
  useEffect(() => {
    if (!isAuthenticated || !isUserDataReady) { setIsRbacAdmin(null); return; }
    if (isSuperAdmin) { setIsRbacAdmin(true); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await accountApi("/account/is-admin");
        if (!cancelled) setIsRbacAdmin(Boolean((data as { isAdmin?: boolean } | null)?.isAdmin));
      } catch {
        if (!cancelled) setIsRbacAdmin(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated, isUserDataReady, isSuperAdmin, userData?.id]);

  const isAdmin = isSuperAdmin || isRbacAdmin === true;
  // Whether the admin check has resolved (so guards/UI don't act early).
  // Anonymous users are trivially "resolved" (definitely not admin).
  const isAdminResolved = !isAuthenticated || isSuperAdmin || isRbacAdmin !== null;

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        userData,
        roles,
        lightningPubkey,
        isAuthenticated,
        isLoading,
        isUserDataReady,
        isSuperAdmin,
        isAdmin,
        isAdminResolved,
        login,
        signUp,
        requestPasswordReset,
        confirmPasswordReset,
        loginWithGoogle,
        loginWithLightning,
        logout,
        refreshUserData,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
