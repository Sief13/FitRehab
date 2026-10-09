import { createContext } from "react";

export type Role = "user" | "premium" | "physiatrist";

export interface User {
  name: string;
  email: string;
  role: Role;
}

export interface AuthContextValue {
  user: User | null;
  login: (user: User) => void;
  logout: () => void;
}

export const ROLE_LABELS: Record<Role, string> = {
  user: "Free",
  premium: "Premium",
  physiatrist: "Physiatrist",
};

export const AuthContext = createContext<AuthContextValue | null>(null);
