import { DrizzleAdapter } from '@auth/drizzle-adapter';
import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { getDb, hasDatabase } from './db/client';
import {
  accounts,
  authenticators,
  sessions,
  users,
  verificationTokens,
} from './db/schema';

function googleProvider() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    return [];
  }

  return [
    GoogleProvider({
      clientId,
      clientSecret,
    }),
  ];
}

function authSecret() {
  return process.env.NEXTAUTH_SECRET?.trim() || process.env.AUTH_SECRET?.trim();
}

function authAdapter() {
  const db = getDb();

  if (!db) {
    return undefined;
  }

  return DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
    authenticatorsTable: authenticators,
  });
}

export const authOptions: NextAuthOptions = {
  adapter: authAdapter(),
  providers: googleProvider(),
  secret: authSecret(),
  session: {
    strategy: hasDatabase() ? 'database' : 'jwt',
  },
  pages: {
    signIn: '/account',
  },
  callbacks: {
    session({ session, user, token }) {
      const id = user?.id ?? token?.sub;
      if (session.user && id) {
        (session.user as typeof session.user & { id: string }).id = id;
      }
      return session;
    },
  },
};

export function authIsConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
    process.env.GOOGLE_CLIENT_SECRET?.trim() &&
    authSecret()
  );
}
