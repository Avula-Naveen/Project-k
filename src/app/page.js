'use client';

import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import NavBar from "@/components/NavBar";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const handleInterviewClick = (e) => {
    if (!user) {
      e.preventDefault();
      router.push('/signin');
    } else {
      router.push('/interview');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen bg-zinc-50 font-sans dark:bg-black">
        <NavBar />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-lg">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <NavBar />
      
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-10">
        <h2 className="text-6xl font-bold text-center">Welcome to Hire.AI</h2>
        <p className="text-2xl mt-5 text-center">We help you to Achieve Your Goals</p>
        <p className="m-2 text-center">Start with </p>
        <div className="flex gap-4 mt-4">
          <button
            onClick={handleInterviewClick}
            className="border border-white rounded-2xl px-4 py-3 hover:bg-white hover:text-black cursor-pointer transition-colors"
          >
            AI Mock Interview
          </button>
          <Link
            href="/feedback"
            className="border border-white rounded-2xl px-4 py-3 hover:bg-white hover:text-black cursor-pointer transition-colors"
          >
            View Feedbacks
          </Link>
        </div>
      </div>
    </div>
  );
}
