// Express type augmentation — adds user fields set by auth middleware

import "express";

declare global {
  namespace Express {
    interface User {
      id: string;
      email?: string;
      role?: string;
      roles?: string[];
    }
    interface Request {
      user?: User;
      requestId?: string;
    }
  }
}
