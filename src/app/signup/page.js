'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';

export default function SignUp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Basic validation
    if (!email || !password || !confirmPassword) {
      setError('Please fill in all fields');
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    // Password match validation
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // Password strength validation
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      // Call signup API
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name: email.split('@')[0] }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Sign up successful, now sign them in
        const result = await signIn(email, password);
        if (result.success) {
          router.push('/');
        } else {
          setError('Account created but sign in failed. Please try signing in.');
        }
      } else {
        // Show more detailed error message
        const errorMessage = data.error || 'Sign up failed';
        const errorDetails = data.details ? ` (${data.details})` : '';
        setError(errorMessage + errorDetails);
        console.error('Signup API error:', data);
      }
    } catch (err) {
      console.error('Signup error:', err);
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-zinc-50 dark:bg-black text-black dark:text-white flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md relative">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 bg-white dark:bg-gray-900 p-8 rounded-2xl border border-gray-200 dark:border-gray-800">
          {/* Close Button */}
          <Link
            href="/"
            className="absolute top-4 right-4 text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors"
            aria-label="Close"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </Link>
          
          <div className="text-center mb-4">
            <h1 className="text-3xl font-bold mb-2">Sign Up</h1>
            <p className="text-gray-600 dark:text-gray-400">Create a new account to get started</p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <label htmlFor="email" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Email
            </label>
            <div className="relative flex items-center border border-gray-300 dark:border-gray-600 rounded-lg h-12 px-3 focus-within:border-black dark:focus-within:border-white transition-colors">
              <svg
                height={20}
                width={20}
                viewBox="0 0 32 32"
                xmlns="http://www.w3.org/2000/svg"
                className="text-gray-400 dark:text-gray-500"
              >
                <path
                  fill="currentColor"
                  d="m30.853 13.87a15 15 0 0 0 -29.729 4.082 15.1 15.1 0 0 0 12.876 12.918 15.6 15.6 0 0 0 2.016.13 14.85 14.85 0 0 0 7.715-2.145 1 1 0 1 0 -1.031-1.711 13.007 13.007 0 1 1 5.458-6.529 2.149 2.149 0 0 1 -4.158-.759v-10.856a1 1 0 0 0 -2 0v1.726a8 8 0 1 0 .2 10.325 4.135 4.135 0 0 0 7.83.274 15.2 15.2 0 0 0 .823-7.455zm-14.853 8.13a6 6 0 1 1 6-6 6.006 6.006 0 0 1 -6 6z"
                />
              </svg>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your Email"
                className="ml-3 flex-1 bg-transparent border-none outline-none text-black dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="password" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Password
            </label>
            <div className="relative flex items-center border border-gray-300 dark:border-gray-600 rounded-lg h-12 px-3 focus-within:border-black dark:focus-within:border-white transition-colors">
              <svg
                height={20}
                width={20}
                viewBox="-64 0 512 512"
                xmlns="http://www.w3.org/2000/svg"
                className="text-gray-400 dark:text-gray-500"
              >
                <path
                  fill="currentColor"
                  d="m336 512h-288c-26.453125 0-48-21.523438-48-48v-224c0-26.476562 21.546875-48 48-48h288c26.453125 0 48 21.523438 48 48v224c0 26.476562-21.546875 48-48 48zm-288-288c-8.8125 0-16 7.167969-16 16v224c0 8.832031 7.1875 16 16 16h288c8.8125 0 16-7.167969 16-16v-224c0-8.832031-7.1875-16-16-16zm0 0"
                />
                <path
                  fill="currentColor"
                  d="m304 224c-8.832031 0-16-7.167969-16-16v-80c0-52.929688-43.070312-96-96-96s-96 43.070312-96 96v80c0 8.832031-7.167969 16-16 16s-16-7.167969-16-16v-80c0-70.59375 57.40625-128 128-128s128 57.40625 128 128v80c0 8.832031-7.167969 16-16 16zm0 0"
                />
              </svg>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your Password"
                className="ml-3 flex-1 bg-transparent border-none outline-none text-black dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                required
                minLength={6}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="confirmPassword" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Confirm Password
            </label>
            <div className="relative flex items-center border border-gray-300 dark:border-gray-600 rounded-lg h-12 px-3 focus-within:border-black dark:focus-within:border-white transition-colors">
              <svg
                height={20}
                width={20}
                viewBox="-64 0 512 512"
                xmlns="http://www.w3.org/2000/svg"
                className="text-gray-400 dark:text-gray-500"
              >
                <path
                  fill="currentColor"
                  d="m336 512h-288c-26.453125 0-48-21.523438-48-48v-224c0-26.476562 21.546875-48 48-48h288c26.453125 0 48 21.523438 48 48v224c0 26.476562-21.546875 48-48 48zm-288-288c-8.8125 0-16 7.167969-16 16v224c0 8.832031 7.1875 16 16 16h288c8.8125 0 16-7.167969 16-16v-224c0-8.832031-7.1875-16-16-16zm0 0"
                />
                <path
                  fill="currentColor"
                  d="m304 224c-8.832031 0-16-7.167969-16-16v-80c0-52.929688-43.070312-96-96-96s-96 43.070312-96 96v80c0 8.832031-7.167969 16-16 16s-16-7.167969-16-16v-80c0-70.59375 57.40625-128 128-128s128 57.40625 128 128v80c0 8.832031-7.167969 16-16 16zm0 0"
                />
              </svg>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your Password"
                className="ml-3 flex-1 bg-transparent border-none outline-none text-black dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                required
                minLength={6}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-4 bg-black dark:bg-white text-white dark:text-black font-medium py-3 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating account...' : 'Sign Up'}
          </button>

          <p className="text-center text-sm text-gray-600 dark:text-gray-400 mt-4">
            Already have an account?{' '}
            <Link href="/signin" className="text-black dark:text-white hover:underline underline-offset-4 font-medium">
              Sign In
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

