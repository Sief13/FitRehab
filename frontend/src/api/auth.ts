import type { RegisterInput, Role, User } from "../auth/AuthContext";
import { request } from "./client";

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export const authApi = {
  register: (input: RegisterInput) =>
    request<AuthResponse>("/api/auth/register", { method: "POST", body: JSON.stringify(input) }),

  login: (email: string, password: string) =>
    request<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  me: () => request<User>("/api/auth/me"),

  /** development only: the backend returns 404 for this when APP_ENV is not "development" */
  devSetRole: (role: Role) =>
    request<User>("/api/dev/set-role", { method: "POST", body: JSON.stringify({ role }) }),
};
