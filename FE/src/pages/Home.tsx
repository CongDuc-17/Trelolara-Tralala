import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";

export function Home() {
  return (
    <div className="relative flex h-screen w-full flex-col items-center justify-center overflow-hidden bg-black font-sans">
      {/* --- NHÚNG CSS ANIMATION TRỰC TIẾP --- */}
      <style>
        {`
          @keyframes slideRight {
            0% { transform: translateX(-10%); }
            100% { transform: translateX(10%); }
          }
          @keyframes slideLeft {
            0% { transform: translateX(10%); }
            100% { transform: translateX(-10%); }
          }
          
          /* infinite alternate: Giúp nó chạy tới chạy lui liên tục không bị giật cục */
          .animate-text-1 {
            animation: slideRight 10s ease-in-out infinite alternate;
          }
          .animate-text-2 {
            animation: slideLeft 10s ease-in-out infinite alternate;
          }
          .animate-text-3 {
            animation: slideRight 10s ease-in-out infinite alternate;
          }
        `}
      </style>

      <div className="flex w-[150vw] select-none flex-col items-center justify-center text-center font-normal tracking-tighter text-white">
        <h1 className="animate-text-1 whitespace-nowrap text-[20vw] leading-[0.85]">
          READY TO
        </h1>
        <h1 className="animate-text-2 whitespace-nowrap text-[20vw] leading-[0.85]">
          MANAGE YOUR
        </h1>
        <h1 className="animate-text-3 whitespace-nowrap text-[20vw] leading-[0.85] pb-10">
          NEXT PROJECT
        </h1>
      </div>

      <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 transform">
        <Link to="/login">
          <button className="group flex items-center gap-2 rounded-full bg-white px-8 py-3 text-lg font-semibold text-black transition-all duration-300 hover:scale-105 hover:bg-white  border-5 border-black">
            Get started
            <ArrowUpRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-1" />
          </button>
        </Link>
      </div>
    </div>
  );
}
