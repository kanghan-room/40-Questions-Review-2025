import React, { useState, useRef, useEffect } from 'react';
import { X, ArrowLeft, ArrowRight, Download } from 'lucide-react';
import { QUESTIONS } from '../constants';
import { Answers, YearSummary } from '../types';
import html2canvas from 'html2canvas';

interface Props {
  answers: Answers;
  summary: YearSummary;
  onClose: () => void;
}

export const NotebookView: React.FC<Props> = ({ answers, summary, onClose }) => {
  const [currentSpread, setCurrentSpread] = useState(0); // 0 = Part 1 & 2, 1 = Part 3 & 4
  const [isDownloading, setIsDownloading] = useState(false);
  
  const bookRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  const totalSpreads = 2;

  // Scroll to top when flipping pages
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [currentSpread]);

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentSpread < totalSpreads - 1) setCurrentSpread(prev => prev + 1);
  };

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentSpread > 0) setCurrentSpread(prev => prev - 1);
  };

  const handleDownloadSpread = async () => {
    if (bookRef.current && !isDownloading) {
      setIsDownloading(true);
      
      try {
        // Capture
        const canvas = await html2canvas(bookRef.current, {
          scale: 2, // High resolution
          useCORS: true,
          logging: false,
          backgroundColor: '#fafafa', 
          height: bookRef.current.scrollHeight, 
          windowHeight: bookRef.current.scrollHeight,
        });
        
        const link = document.createElement('a');
        link.download = `2025-Review-Part${currentSpread === 0 ? '1-2' : '3-4'}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();

      } catch (error) {
        console.error("Screenshot failed:", error);
        alert("保存图片失败，请重试");
      } finally {
        setIsDownloading(false);
      }
    }
  };

  // Helper to render a single page content
  const NotebookPage = ({ part, isLeft }: { part: number, isLeft: boolean }) => {
    const partQuestions = QUESTIONS.filter(q => q.part === part);
    const title = ["", "探索 · 启程", "得失 · 感悟", "生活 · 喜好", "自我 · 未来"][part];
    
    const today = new Date();
    const dateStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;

    return (
      <div 
        className={`relative flex-1 flex flex-col bg-[#fafafa]`}
        // Lined Paper Background
        style={{
           backgroundImage: 'linear-gradient(#e5e7eb 1px, transparent 1px)',
           backgroundSize: '100% 2rem', // Matches line-height
           backgroundAttachment: 'scroll' // Moves with the element
        }}
      >
        
        {/* Page Shadow for Curvature */}
        <div className={`absolute inset-y-0 ${isLeft ? 'right-0 w-12 page-shadow-left' : 'left-0 w-12 page-shadow-right'} z-10 pointer-events-none`}></div>
        
        {/* Top Margin Red Line (Optional, classic notebook style) */}
        <div className="absolute top-[5rem] left-0 w-full h-[1px] bg-red-300 opacity-60 pointer-events-none z-0"></div>

        {/* Header Area */}
        <div className={`flex-shrink-0 pt-8 pb-4 relative z-20 px-4 md:px-10 bg-[#fafafa]/90 backdrop-blur-[1px]`}>
            <div className="flex justify-between items-end border-b-2 border-stone-800 pb-2">
                <h2 className="text-xl font-serif font-bold text-stone-900 tracking-wide">
                   PART {part}
                </h2>
                <div className="font-typewriter text-xs text-stone-500 tracking-widest uppercase">
                   {dateStr}
                </div>
            </div>
            <div className="mt-2 font-hand text-lg text-stone-500">
               {title}
            </div>
        </div>

        {/* Content Area - No internal scroll, just full height */}
        <div className={`flex-1 pb-16 pt-2 px-4 md:px-10`}>
           {partQuestions.map((q) => {
             const answer = answers[q.id] || "";
             return (
               <div key={q.id} className="relative group mb-6 leading-[2rem]">
                  {/* Question - Dark Grey Serif - INLINE */}
                  <span className="font-bold text-stone-800 font-serif text-sm tracking-wide mr-2 select-text">
                    {q.id}. {q.text}
                  </span>
                  
                  {/* Answer - Ink Blue Handwriting - INLINE */}
                  <span className="font-chinese-hand text-xl text-blue-900 select-text break-words" style={{ textShadow: '0 0 1px rgba(30, 58, 138, 0.1)' }}>
                     {answer.trim() || <span className="text-stone-300 select-none">...</span>}
                  </span>
               </div>
             );
           })}
        </div>
        
        {/* Footer Page Number */}
        <div className="absolute bottom-4 w-full text-center font-typewriter text-[10px] text-stone-400 z-20">
           - {part} -
        </div>

      </div>
    );
  };

  return (
    <div 
      ref={scrollContainerRef}
      className="fixed inset-0 z-[10000] bg-stone-900/95 backdrop-blur-md overflow-y-auto fade-in book-perspective"
    >
      
      {/* Controls - Fixed to Viewport */}
      <div className="fixed top-6 right-6 flex gap-4 z-50">
        <button 
          onClick={handleDownloadSpread}
          disabled={isDownloading}
          className="text-stone-400 hover:text-white transition-colors p-2 flex flex-col items-center gap-1 group"
          title="保存当前页面为图片"
        >
          <Download size={32} className={`${isDownloading ? 'animate-bounce' : ''}`} />
          <span className="text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">保存图片</span>
        </button>
        <button 
          onClick={onClose}
          className="text-stone-400 hover:text-white transition-colors p-2 flex flex-col items-center gap-1 group"
        >
          <X size={32} />
          <span className="text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">关闭</span>
        </button>
      </div>

      {/* Scrollable Wrapper */}
      <div className="min-h-full w-full flex items-center justify-center py-12 md:py-20">

        {/* Book Container - Auto Height */}
        <div 
          ref={bookRef}
          className="relative w-[95vw] md:w-[90vw] max-w-[1200px] min-h-[85vh] flex shadow-[0_30px_60px_rgba(0,0,0,0.5)] transform transition-transform duration-500 bg-white"
        >
          {/* Cover Edge Effect (Left) */}
          <div className="absolute left-0 top-1 bottom-1 w-2 bg-stone-200 rounded-l-md -translate-x-full shadow-lg"></div>

          {/* LEFT PAGE (Part 1 or 3) */}
          <div 
            className="flex-1 flex flex-col relative border-r border-stone-200 cursor-pointer group"
            onClick={handlePrev}
          >
             {/* Click hint for previous */}
             {currentSpread > 0 && (
               <div className="sticky top-1/2 -translate-y-1/2 left-0 w-16 h-32 flex items-center justify-start pl-4 z-50 pointer-events-none group-hover:pointer-events-auto">
                  <div className="bg-stone-800/20 p-2 rounded-full backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity">
                    <ArrowLeft className="text-white w-6 h-6" />
                  </div>
               </div>
             )}

             <NotebookPage part={currentSpread === 0 ? 1 : 3} isLeft={true} />
          </div>

          {/* CENTER SPINE */}
          <div className="w-8 relative z-30 book-spine-shadow flex-shrink-0 bg-[#fafafa]">
             {/* Stitching visualization */}
             <div className="absolute top-4 bottom-4 left-1/2 -translate-x-1/2 w-[1px] border-l border-dotted border-stone-300"></div>
          </div>

          {/* RIGHT PAGE (Part 2 or 4) */}
          <div 
            className="flex-1 flex flex-col relative cursor-pointer group"
            onClick={handleNext}
          >
             {/* Click hint for next */}
             {currentSpread < totalSpreads - 1 && (
               <div className="sticky top-1/2 -translate-y-1/2 right-0 w-16 h-32 flex items-center justify-end pr-4 z-50 pointer-events-none group-hover:pointer-events-auto">
                   <div className="bg-stone-800/20 p-2 rounded-full backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity">
                      <ArrowRight className="text-white w-6 h-6" />
                   </div>
               </div>
             )}

             <NotebookPage part={currentSpread === 0 ? 2 : 4} isLeft={false} />
          </div>

          {/* Cover Edge Effect (Right) */}
          <div className="absolute right-0 top-1 bottom-1 w-2 bg-stone-200 rounded-r-md translate-x-full shadow-lg"></div>
        </div>

      </div>

    </div>
  );
};