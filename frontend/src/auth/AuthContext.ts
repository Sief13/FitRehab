import { createContext } from "react";

export type Role = "user" | "premium" | "physiatrist";

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  role: "user" | "physiatrist";
}

export interface AuthContextValue {
  user: User | null;
  /** true while we check a saved token with the server after a page load */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => void;
  /** replace the stored user object (used by the development role switcher) */
  updateUser: (user: User) => void;
}

export const ROLE_LABELS: Record<Role, string> = {
  user: "Free",
  premium: "Premium",
  physiatrist: "Physiatrist",
};

export const AuthContext = createContext<AuthContextValue | null>(null);
