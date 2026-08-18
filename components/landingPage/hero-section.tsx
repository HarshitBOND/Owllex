"use client"

import { Scale, FileText, Users, Truck } from "lucide-react"
import { HeroButtons } from "./hero-buttons"
import React from "react"

export function HeroSection() {
  const [menuOpen, setMenuOpen] = React.useState(false);
    return (
        <section className="flex items-center flex-col justify-between bg-[url('https://raw.githubusercontent.com/prebuiltui/prebuiltui/main/assets/hero/bg-gradient.png')] bg-cover text-sm text-gray-800 text-center h-[785px] w-full">
            {/* NAVBAR */}
            <nav className='flex items-center justify-between w-full md:px-16 lg:px-24 xl:px-32 py-4'>
                

                {/* MENU LINKS */}
                <div className={`max-md:absolute max-md:bg-white/50 max-md:h-[785px] max-md:overflow-hidden max-md:transition-[width] max-md:duration-300 max-md:top-0 max-md:left-0 max-md:flex-col max-md:justify-center max-md:text-lg max-md:backdrop-blur flex items-center gap-8 font-medium ${ menuOpen ? 'max-md:w-full' : 'max-md:w-0' }`} >
                    <a href='#'>Home</a>
                    <a href='#'>Team</a>
                    <a href='#'>Pricing</a>
                    <a href='#'>Docs</a>
                    <button aria-label='close menu' className='size-6 md:hidden' onClick={() => setMenuOpen(false)}>
                        <svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' className='lucide lucide-x'>
                            <path d='M18 6 6 18M6 6l12 12' />
                        </svg>
                    </button>
                </div>

                <button className='max-md:hidden px-6 py-2 bg-white hover:bg-gray-200 transition active:scale-95 rounded-full border border-gray-600'>Get Started</button>

                {/* BURGER MENU */}
                <button aria-label='menu burger' className='size-6 md:hidden' onClick={() => setMenuOpen(true)}>
                    <svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' className='lucide lucide-align-justify'>
                        <path d='M3 12h18M3 18h18M3 6h18' />
                    </svg>
                </button>
            </nav>

            {/* HERO CONTENT */}
            <div className='flex flex-col items-center justify-center w-full'>
                <h1 className='text-4xl md:text-[40px]'>What do you want to create?</h1>
                <p className='text-base mt-6'>Create something amazing with one simple message.</p>

                {/* INPUT BOX */}
                <div className='max-w-xl w-full bg-gray-900 rounded-xl overflow-hidden mt-4'>
                    <textarea className='w-full p-3 pb-0 resize-none outline-none bg-transparent text-white' placeholder='Tell us about your idea' rows={3} />
                    <div className='flex items-center justify-between pb-3 px-3'>
                        <button className='flex items-center justify-center bg-gray-500 p-1 rounded-full size-6' aria-label='Add'>
                            <svg width='11' height='11' viewBox='0 0 11 11' fill='none' xmlns='http://www.w3.org/2000/svg'>
                                <path d='M1 5.5h9M5.5 1v9' stroke='#CCD5E2' strokeLinecap='round' strokeLinejoin='round' />
                            </svg>
                        </button>
                        <button className='flex items-center justify-center p-1 rounded size-6 bg-indigo-600' aria-label='Send'>
                            <svg width='11' height='12' viewBox='0 0 11 12' fill='none' xmlns='http://www.w3.org/2000/svg'>
                                <path d='M1 5.5 5.5 1 10 5.5m-4.5 5.143V1' stroke='#fff' strokeLinecap='round' strokeLinejoin='round' />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* FAQ LINKS */}
                <div className='grid grid-cols-2 gap-4 mt-8 text-slate-500'>
                    <p className='cursor-pointer'>How do I write a resume or cover letter?</p>
                    <p className='cursor-pointer'>How do I improve my writing skills?</p>
                    <div className='w-full h-px bg-gray-400/50'></div>
                    <div className='w-full h-px bg-gray-400/50'></div>
                    <p className='cursor-pointer'>Can you translate something for me?</p>
                    <p className='cursor-pointer'>How can I be more productive?</p>
                </div>
            </div>

            <p className='text-gray-500 pb-3'> By messaging us, you agree to our <a href='#' className='underline'> Terms of Use </a> and confirm you've read our <a href='#' className='underline'> Privacy Policy </a> .</p>
        </section>
    );
}


