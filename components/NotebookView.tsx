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
  
  const totalSpreads = 2;

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
      
      // 1. Save state
      const originalHeight = bookRef.current.style.height;
      const originalOverflow = bookRef.current.style.overflow;
      const scrollables = bookRef.current.querySelectorAll('.notebook-scroll-area');
      
      const originalStyles: { height: string; overflow: string }[] = [];
      
      // 2. Expand all scrollable areas
      scrollables.forEach((el) => {
        const element = el as HTMLElement;
        originalStyles.push({ height: element.style.height, overflow: element.style.overflow });
        element.style.height = 'auto';
        element.style.overflow = 'visible';
      });

      // Expand parent container
      bookRef.current.style.height = 'auto';
      bookRef.current.style.overflow = 'visible';
      
      // Wait for reflow
      await new Promise(resolve => setTimeout(resolve, 100));

      try {
        const canvas = await html2canvas(bookRef.current, {
          scale: 2, 
          useCORS: true,
          logging: false,
          backgroundColor: null, 
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
        // 3. Restore state
        bookRef.current.style.height = originalHeight;
        bookRef.current.style.overflow = originalOverflow;
        
        scrollables.forEach((el, index) => {
          const element = el as HTMLElement;
          element.style.height = originalStyles[index].height;
          element.style.overflow = originalStyles[index].overflow;
        });

        setIsDownloading(false);
      }
    }
  };

  // Helper to render a single page content
  const NotebookPage = ({ part }: { part: number }) => {
    const partQuestions = QUESTIONS.filter(q => q.part === part);
    const title = ["", "探索 · 启程", "得失 · 感悟", "生活 · 喜好", "自我 · 未来"][part];
    
    const today = new Date();
    const dateStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;

    return (
      <div className="min-h-full flex flex-col relative bg-[#fafafa]"
           style={{
             backgroundImage: 'linear-gradient(#e5e7eb 1px, transparent 1px)',
             backgroundSize: '100% 2rem', 
             backgroundPosition: '0 0',
             backgroundAttachment: 'local'
           }}
      >
        {/* Red Margin Line - Scrolls with content via absolute full height */}
        <div className="absolute top-0 bottom-0 left-0 w-full pointer-events-none z-0">
             <div className="absolute top-[3.5rem] left-0 w-full h-[1px] bg-red-300 opacity-60"></div>
        </div>

        {/* Header - No Background Needed */}
        <div className="flex-shrink-0 pt-4 pb-4 px-4 md:px-10 relative z-10">
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

        {/* Content */}
        <div className="flex-1 pb-16 pt-2 px-4 md:px-10 relative z-10">
            {partQuestions.map((q) => {
                const answer = answers[q.id] || "";
                return (
                <div key={q.id} className="relative group mb-6 leading-[2rem]">
                    <span className="font-bold text-stone-800 font-serif text-sm tracking-wide mr-2 select-text">
                        {q.id}. {q.text}
                    </span>
                    
                    <span className="font-chinese-hand text-xl text-blue-900 select-text break-words" style={{ textShadow: '0 0 1px rgba(30, 58, 138, 0.1)' }}>
                        {answer.trim() || <span className="text-stone-300 select-none">...</span>}
                    </span>
                </div>
                );
            })}
        </div>
        
        {/* Footer Page Number */}
        <div className="pb-4 w-full text-center font-typewriter text-[10px] text-stone-400 z-20 mt-auto">
           - {part} -
        </div>
      </div>
    );
  };

  return (
    <div 
      className="fixed inset-0 z-[10000] bg-stone-900/95 backdrop-blur-md flex items-center justify-center p-4 md:p-8 fade-in"
    >
      
      {/* Controls */}
      <div className="absolute top-6 right-6 flex gap-4 z-50">
        <button 
          onClick={handleDownloadSpread}
          disabled={isDownloading}
          className="text-stone-400 hover:text-white transition-colors p-2 flex flex-col items-center gap-1 group"
          title="保存图片"
        >
          <Download size={32} className={`${isDownloading ? 'animate-bounce' : ''}`} />
          <span className="text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">保存</span>
        </button>
        <button 
          onClick={onClose}
          className="text-stone-400 hover:text-white transition-colors p-2 flex flex-col items-center gap-1 group"
        >
          <X size={32} />
          <span className="text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">关闭</span>
        </button>
      </div>

      {/* FIXED BOOK CONTAINER */}
      <div 
        ref={bookRef}
        className="relative w-full max-w-[1200px] h-[85vh] flex shadow-[0_30px_60px_rgba(0,0,0,0.5)] bg-white rounded-r-md overflow-hidden"
      >
        {/* Cover Edge (Left) */}
        <div className="absolute left-0 top-0 bottom-0 w-3 bg-stone-300 z-20 shadow-xl"></div>

        {/* === LEFT PAGE === */}
        <div className="flex-1 border-r border-stone-200 relative h-full flex flex-col">
           {/* Navigation Hit Area */}
           <div className="absolute inset-y-0 left-0 w-12 z-50 cursor-pointer hover:bg-black/5 transition-colors flex items-center justify-center group"
                onClick={handlePrev}
                title="上一页">
              {currentSpread > 0 && <ArrowLeft className="text-stone-400 group-hover:text-stone-800" />}
           </div>

           {/* Scrollable Container */}
           <div className="w-full h-full overflow-y-auto custom-scrollbar pl-3 notebook-scroll-area">
              <NotebookPage part={currentSpread === 0 ? 1 : 3} />
           </div>

           {/* Page Shadow */}
           <div className="absolute top-0 bottom-0 right-0 w-12 pointer-events-none bg-gradient-to-l from-black/5 to-transparent z-30"></div>
        </div>

        {/* === CENTER SPINE === */}
        <div className="w-0 md:w-8 bg-[#f4f4f4] relative z-40 hidden md:block border-x border-stone-200 shadow-inner">
             <div className="absolute top-4 bottom-4 left-1/2 -translate-x-1/2 w-[1px] border-l border-dotted border-stone-300"></div>
        </div>

        {/* === RIGHT PAGE === */}
        <div className="flex-1 relative h-full flex flex-col">
            {/* Navigation Hit Area */}
           <div className="absolute inset-y-0 right-0 w-12 z-50 cursor-pointer hover:bg-black/5 transition-colors flex items-center justify-center group"
                onClick={handleNext}
                title="下一页">
              {currentSpread < totalSpreads - 1 && <ArrowRight className="text-stone-400 group-hover:text-stone-800" />}
           </div>

           {/* Scrollable Container */}
           <div className="w-full h-full overflow-y-auto custom-scrollbar notebook-scroll-area">
              <NotebookPage part={currentSpread === 0 ? 2 : 4} />
           </div>

           {/* Page Shadow */}
           <div className="absolute top-0 bottom-0 left-0 w-12 pointer-events-none bg-gradient-to-r from-black/5 to-transparent z-30"></div>
        </div>

      </div>
    </div>
  );
};