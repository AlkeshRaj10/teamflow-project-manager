import type { Request } from "express";

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
}

export interface AuthenticatedRequest extends Request {
  currentUser: AuthenticatedUser;
}
