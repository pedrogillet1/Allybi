declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      googleId?: string | null;
    }

    interface Request {
      user?: User;
      correlationId?: string;
    }
  }
}

export {};
