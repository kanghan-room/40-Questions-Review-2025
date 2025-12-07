import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, Download, GripHorizontal } from 'lucide-react';
import { YearSummary } from '../types';

interface Props {
  summary: YearSummary;
  onRetake: () => void;
}

export const SummaryCard: React.FC<Props> = ({ summary, onRetake }) => {
  const [typedPoem, setTypedPoem] = useState('');
  const [typedAnalysis, setTypedAnalysis] = useState('');
  const [isTypingComplete, setIsTypingComplete] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  
  const cardRef = useRef<HTMLDivElement>(null);
  const dragStartPos = useRef<{x: number, y: number} | null>(null);

  // Typing effect logic
  useEffect(() => {
    // Fixed: changed NodeJS.Timeout to any to avoid namespace error in environments where @types/node is missing
    let timeout: any;
    const fullPoem = summary.poem;
    const fullAnalysis = summary.analysis;

    let poemIndex = 0;
    let analysisIndex = 0;
    
    // Reset
    setTypedPoem('');
    setTypedAnalysis('');
    setIsTypingComplete(false);

    const typeWriter = () => {
      // Phase 1: Type Poem
      if (poemIndex < fullPoem.length) {
        setTypedPoem(prev => prev + fullPoem.charAt(poemIndex));
        poemIndex++;
        timeout = setTimeout(typeWriter, 50 + Math.random() * 50); // Random delay for realism
      } 
      // Phase 2: Type Analysis (after poem)
      else if (analysisIndex < fullAnalysis.length) {
        setTypedAnalysis(prev => prev + fullAnalysis.charAt(analysisIndex));
        analysisIndex++;
        timeout = setTimeout(typeWriter, 20); // Faster for long text
      } 
      else {
        setIsTypingComplete(true);
      }
    };

    timeout = setTimeout(typeWriter, 1000); // Initial delay
    return () => clearTimeout(timeout);
  }, [summary]);

  // Dragging Logic
  const handlePointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStartPos.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragStartPos.current) return;
    setPosition({
      x: e.clientX - dragStartPos.current.x,
      y: e.clientY - dragStartPos.current.y
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    dragStartPos.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <div className="min-h-screen bg-[#2c2c2c] overflow-hidden flex flex-col relative">
      
      {/* Background - The "Desk" */}
      <div className="absolute inset-0 opacity-20 pointer-events-none" 
           style={{
             backgroundImage: 'radial-gradient(#444 1px, transparent 1px)',
             backgroundSize: '30px 30px'
           }}
      ></div>

      <div className="z-0 absolute top-10 left-10 text-stone-600 font-typewriter text-xs opacity-50 select-none">
        MOTOROLA FIX BEEPER // TYPEWRITER PROTOCOL v2.0
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        
        {/* Draggable Wrapper */}
        <div 
          ref={cardRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="relative cursor-move touch-none transform transition-transform will-change-transform"
          style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
        >
          {/* THE TYPEWRITER / BEEPER DEVICE */}
          <div className="w-[360px] md:w-[400px] bg-[#e3e1d3] rounded-sm shadow-[0_20px_50px_rgba(0,0,0,0.5)] border-t border-l border-[#f5f5f0] border-b-4 border-r-4 border-b-[#b8b6a8] border-r-[#b8b6a8] relative p-6 pb-12">
            
            {/* Device Header / Screen */}
            <div className="bg-[#2a2a2a] rounded p-4 mb-6 border-4 border-[#1a1a1a] shadow-inner relative overflow-hidden">
               {/* LCD Glare */}
               <div className="absolute top-0 right-0 w-20 h-full bg-gradient-to-l from-white/10 to-transparent pointer-events-none"></div>
               
               <div className="flex justify-between items-end">
                 <div>
                   <div className="text-[#00ff41] font-mono text-[10px] uppercase tracking-widest opacity-80 mb-1">Year Summary</div>
                   <div className="text-[#00ff41] font-mono text-xl uppercase tracking-widest truncate" style={{ textShadow: '0 0 5px #00ff41' }}>
                     {summary.keyword}
                   </div>
                 </div>
                 <div className="text-[#00ff41] font-mono text-xs opacity-60">
                   {new Date().getFullYear()}
                 </div>
               </div>
            </div>

            {/* The Paper Sheet */}
            <div className="bg-[#fffcf5] p-6 shadow-md min-h-[400px] relative font-typewriter text-stone-800 text-sm leading-relaxed border-t border-stone-200">
               {/* Paper texture */}
               <div className="absolute inset-0 opacity-30 bg-repeat" style={{ backgroundImage: "url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjZmZmIj48L3JlY3Q+CjxyZWN0IHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiNjY2MiPjwvcmVjdD4KPC9zdmc+')", backgroundSize: '4px 4px' }}></div>
               
               <div className="relative z-10 space-y-6">
                 
                 {/* Header Info */}
                 <div className="flex justify-between border-b-2 border-stone-800 pb-2 mb-4 border-double">
                    <span>REPORT_ID: #40Q</span>
                    <span>ANIMAL: {summary.animal}</span>
                 </div>

                 {/* Poem Section */}
                 <div className="whitespace-pre-line text-stone-900 font-bold">
                    {typedPoem}
                    {!isTypingComplete && <span className="typing-cursor"></span>}
                 </div>

                 {/* Separator */}
                 <div className="text-center text-stone-300 tracking-widest">
                   * * *
                 </div>

                 {/* Analysis Section */}
                 <div className="text-xs leading-6 text-stone-600 text-justify">
                    {typedAnalysis}
                 </div>

                 {/* Stamp */}
                 {isTypingComplete && (
                   <div className="absolute bottom-4 right-4 border-2 border-red-700/60 text-red-700/60 font-retro px-2 py-1 transform -rotate-12 text-lg animate-pulse">
                     CONFIDENTIAL
                   </div>
                 )}
               </div>
            </div>

            {/* Device Footer / Grip */}
            <div className="absolute bottom-2 left-0 w-full flex justify-center text-[#b8b6a8]">
               <GripHorizontal className="w-6 h-6" />
            </div>

          </div>
        </div>

      </div>

      {/* Control Panel (Fixed at bottom) */}
      <div className="p-8 flex justify-center gap-6 z-50">
         <button 
           onClick={onRetake}
           className="bg-[#2a2a2a] text-[#00ff41] border border-[#00ff41]/30 hover:bg-[#00ff41]/10 px-6 py-3 font-mono text-xs uppercase tracking-widest rounded transition-colors flex items-center gap-2"
         >
           <RefreshCw className="w-4 h-4" /> Reset System
         </button>
      </div>

    </div>
  );
};