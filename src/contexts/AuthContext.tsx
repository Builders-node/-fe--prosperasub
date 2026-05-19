import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

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
  user: User;
};

export type AppRole = 'super_admin' | 'restaurant_admin' | 'driver' | 'user';

interface UserData {
  id: string;
  email?: string;
  name?: string;
  display_name?: string;
  lightning_pubkey?: string;
  restaurant_id?: string;
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
  isRestaurantAdmin: boolean;
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

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUserDataReady, setIsUserDataReady] = useState(false);

  // Lightning auth state (stored separately)
  const [lightningPubkey, setLightningPubkey] = useState<string | null>(null);

  /**
   * Unified function to fetch user data from public.users table
   * This is the SINGLE source of truth for user data regardless of auth type
   */
  const fetchUserDataFromPublicUsers = async (userId?: string, pubkey?: string): Promise<void> => {
    try {
      setIsUserDataReady(false);
      
      let userRow: UserData | null = null;
      let userRoles: AppRole[] = [];

      if (userId) {
        // Supabase Auth user - fetch directly by ID from public.users
        // The trigger handle_new_auth_user ensures this row exists
        const { data: publicUser, error } = await supabase
          .from('users')
          .select('id, email, name, display_name, lightning_pubkey, restaurant_id, auth_provider, avatar_url')
          .eq('id', userId)
          .maybeSingle();

        if (error) {
          reportAuthError('[Auth] Error fetching public.users by id:', error.message);
        }

        if (publicUser) {
          userRow = {
            id: publicUser.id,
            email: publicUser.email || undefined,
            name: publicUser.name || publicUser.display_name || undefined,
            display_name: publicUser.display_name || undefined,
            lightning_pubkey: publicUser.lightning_pubkey || undefined,
            restaurant_id: publicUser.restaurant_id || undefined,
            auth_provider: publicUser.auth_provider || 'email',
            avatar_url: publicUser.avatar_url || undefined,
          };
        } else {
          // User row doesn't exist yet - this can happen if trigger hasn't fired
          // Fallback to creating minimal user data from auth
          const { data: authUser } = await supabase.auth.getUser();
          if (authUser?.user) {
            userRow = {
              id: authUser.user.id,
              email: authUser.user.email,
              name: authUser.user.user_metadata?.name || authUser.user.user_metadata?.full_name,
              auth_provider: authUser.user.app_metadata?.provider || 'email',
            };
            reportAuthError('[Auth] User not found in public.users, using auth metadata');
          }
        }

        // Fetch roles for Supabase auth user
        if (userRow) {
          const { data: rolesData } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', userRow.id);

          if (rolesData) {
            userRoles = rolesData.map(r => r.role as AppRole);
          }
        }
      } else if (pubkey) {
        // Lightning auth - set session variable first for RLS policies
        await supabase.rpc('set_lightning_session', { p_pubkey: pubkey });

        // Fetch from public.users by lightning_pubkey
        const { data: publicUser, error } = await supabase
          .from('users')
          .select('id, email, name, display_name, lightning_pubkey, restaurant_id, auth_provider, avatar_url')
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
            restaurant_id: publicUser.restaurant_id || undefined,
            auth_provider: publicUser.auth_provider || 'lightning',
            avatar_url: publicUser.avatar_url || undefined,
          };

          // Fetch roles for lightning user
          const { data: rolesData } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', publicUser.id);

          if (rolesData) {
            userRoles = rolesData.map(r => r.role as AppRole);
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
      setIsUserDataReady(true); // Mark as ready even on error to prevent infinite loading
    }
  };

  useEffect(() => {
    // Check for stored lightning pubkey first
    const storedPubkey = localStorage.getItem('lightning_pubkey');

    if (storedPubkey) {
      setLightningPubkey(storedPubkey);
    }

    // Set up Supabase auth listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // Supabase auth user - fetch from public.users
          // Use setTimeout to prevent potential race conditions with triggers
          setTimeout(() => {
            fetchUserDataFromPublicUsers(session.user.id);
          }, 0);
        } else {
          // No Supabase session - check for Lightning auth
          const currentPubkey = localStorage.getItem('lightning_pubkey');
          if (currentPubkey) {
            setLightningPubkey(currentPubkey);
            setTimeout(() => {
              fetchUserDataFromPublicUsers(undefined, currentPubkey);
            }, 0);
          } else {
            // No auth at all
            setUserData(null);
            setRoles([]);
            setIsUserDataReady(true);
          }
        }

        setIsLoading(false);
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchUserDataFromPublicUsers(session.user.id);
      } else if (storedPubkey) {
        fetchUserDataFromPublicUsers(undefined, storedPubkey);
      } else {
        setIsUserDataReady(true);
      }
      
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    const sessionRoles = ((data as any)?.session?.roles || []) as AppRole[];
    if (!error && data?.session) {
      setSession(data.session);
      setUser(data.session.user ?? data.user ?? null);
      if (sessionRoles.length > 0) {
        setRoles(sessionRoles);
      }
      if (data.session.user?.id || data.user?.id) {
        await fetchUserDataFromPublicUsers(data.session.user?.id ?? data.user.id);
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
    const redirectUrl = `${window.location.origin}/`;
    
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
    
    // Clear Supabase auth
    await supabase.auth.signOut();
    
    setUser(null);
    setSession(null);
    setUserData(null);
    setRoles([]);
    setIsUserDataReady(false);
  };

  const refreshUserData = async () => {
    if (user?.id) {
      await fetchUserDataFromPublicUsers(user.id);
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
  const isRestaurantAdmin = roles.includes('restaurant_admin');

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
        isRestaurantAdmin,
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
