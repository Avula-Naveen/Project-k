'use client';

import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import SignOutButton from './SignOutButton';

export default function NavBar() {
  const { user, loading } = useAuth();

  if (loading) return null;

  return (
    <nav className="w-full border-b border-gray-200 dark:border-gray-800 bg-white/50 dark:bg-black/50 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link href="/" className="text-xl font-bold text-black dark:text-white">
            Hire.AI
          </Link>
          <div className="flex items-center gap-4">
            {user ? (
              <>
                <span className="text-sm text-gray-600 dark:text-gray-400 hidden sm:inline">
                  {user.email}
                </span>
                <SignOutButton />
              </>
            ) : (
              <Link
                href="/signin"
                className="border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm font-medium"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

