import "next-auth";

declare module "next-auth" {
  interface User {
    role?: string;
    teamIds?: string[];
    sessionVersion?: number;
  }

  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
      teamIds: string[];
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
    teamIds?: string[];
    sessionVersion?: number;
  }
}
