import Link from "next/link";


export default function Home() {
  return (
    <div className="flex flex-col min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <h2 className="text-6xl font-bold ">Welcome to Project K</h2>
      <p className="text-2xl mt-5">We help you to Achive Your Goals</p>
      <p className="m-2">Start with </p>
      <Link href='/interview'
         className="border border-white rounded-2xl px-4 py-3 hover:bg-white hover:text-black cursor-pointer">
          AI Mock Interview
        </Link>
    </div>
  
  );
}
