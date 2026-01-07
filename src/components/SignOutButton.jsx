'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

export default function SignOutButton({ className = '' }) {
  const { signOut, user } = useAuth();
  const router = useRouter();

  const handleSignOut = () => {
    signOut();
    router.push('/signin');
  };

  if (!user) return null;

  return (
    <button
      onClick={handleSignOut}
      className={`${className} border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm font-medium`}
    >
      Sign Out
    </button>
  );
}

