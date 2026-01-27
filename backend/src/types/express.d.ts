// Express type augmentation — adds user fields set by auth middleware

declare namespace Express {
  interface User {
    id: string;
    email?: string;
    role?: string;
  }
}
