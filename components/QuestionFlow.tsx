import React, { useState, useEffect, useRef } from 'react';
import { ArrowRight, Sparkles, ChevronLeft } from 'lucide-react';
import { Question, Answers } from '../types';
import { QUESTIONS } from '../constants';
import { getInspiration } from '../services/openaiService';

interface Props {
  answers: Answers;
  setAnswers: React.Dispatch<React.SetStateAction<Answers>>;
  onComplete: () => void;
}

export const QuestionFlow: React.FC<Props> = ({ answers, setAnswers, onComplete }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentInput, setCurrentInput] = useState('');
  const [isSparking, setIsSparking] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [animating, setAnimating] = useState(false);
  
  // Interstitial State
  const [showPartTransition, setShowPartTransition] = useState(false);
  const [transitionPartNumber, setTransitionPartNumber] = useState(1);
  const [transitionPartTitle, setTransitionPartTitle] = useState("");

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const currentQuestion = QUESTIONS[currentIndex];
  
  // Calculate progress
  const progress = ((currentIndex + 1) / QUESTIONS.length) * 100;

  useEffect(() => {
    // Check if we entered a new part
    if (currentIndex > 0) {
      const prevQ = QUESTIONS[currentIndex - 1];
      if (prevQ.part !== currentQuestion.part) {
        triggerPartTransition(currentQuestion.part);
      }
    }
  }, [currentIndex, currentQuestion.part]);

  const triggerPartTransition = (part: number) => {
    let title = "";
    switch(part) {
      case 2: title = "得失 · 感悟"; break;
      case 3: title = "生活 · 喜好"; break;
      case 4: title = "自我 · 未来"; break;
      default: title = "";
    }
    setTransitionPartNumber(part);
    setTransitionPartTitle(title);
    setShowPartTransition(true);
    
    // Auto hide after 2.5s
    setTimeout(() => {
      setShowPartTransition(false);
    }, 2500);
  };

  useEffect(() => {
    setCurrentInput(answers[currentQuestion.id] || '');
    setHint(null);
    if (textareaRef.current && !showPartTransition) {
      // Small delay to ensure render
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [currentIndex, currentQuestion.id, answers, showPartTransition]);

  const handleNext = () => {
    setAnimating(true);
    setTimeout(() => {
      if (currentInput.trim()) {
        setAnswers(prev => ({ ...prev, [currentQuestion.id]: currentInput }));
      }
      if (currentIndex < QUESTIONS.length - 1) {
        setCurrentIndex(prev => prev + 1);
      } else {
        onComplete();
      }
      setAnimating(false);
    }, 300);
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setAnimating(true);
      setTimeout(() => {
        setCurrentIndex(prev => prev - 1);
        setAnimating(false);
      }, 300);
    }
  };

  const handleSkip = () => {
     setAnswers(prev => ({ ...prev, [currentQuestion.id]: "" }));
     if (currentIndex < QUESTIONS.length - 1) {
      handleNext();
    } else {
      onComplete();
    }
  }

  const handleSpark = async () => {
    if (isSparking || hint) return;
    setIsSparking(true);
    const suggestion = await getInspiration(currentQuestion);
    setHint(suggestion);
    setIsSparking(false);
  };

  if (showPartTransition) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1a1918] text-[#f4f0e6] fade-in relative overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{backgroundImage: "url('https://www.transparenttextures.com/patterns/stardust.png')"}}></div>
        <div className="text-center space-y-6 relative z-10">
          <div className="font-typewriter text-sm tracking-[0.3em] opacity-60 uppercase">
            Chapter 0{transitionPartNumber}
          </div>
          <h2 className="text-5xl font-serif tracking-widest border-y border-stone-600/50 py-8 px-12">
            {transitionPartTitle}
          </h2>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#fdfbf7] text-stone-800 transition-colors duration-500 relative">
      
      {/* Top Header */}
      <div className="flex justify-between items-center px-6 py-6 z-10">
        <button 
            onClick={handlePrev} 
            disabled={currentIndex === 0}
            className={`flex items-center gap-2 px-3 py-2 text-stone-500 hover:text-stone-800 transition-all ${currentIndex === 0 ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
          >
            <ChevronLeft className="w-5 h-5" />
            <span className="font-serif text-lg">上一题</span>
        </button>
        
        <div className="flex flex-col items-end">
          <span className="font-typewriter text-xs text-stone-400 tracking-widest">No. {currentQuestion.id.toString().padStart(2, '0')} / 40</span>
          <span className="font-hand text-2xl text-stone-600 mt-1">{currentQuestion.category}</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col max-w-2xl w-full mx-auto px-6 py-2 relative">
        
        {/* Question Content */}
        <div className={`flex-1 flex flex-col justify-start space-y-8 ${animating ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0'} transition-all duration-300 ease-out`}>
          
          <div className="mt-2">
            <h2 className="text-2xl md:text-3xl font-bold font-serif text-stone-900 leading-normal tracking-wide">
              {currentQuestion.text}
            </h2>
          </div>

          <div className="relative group flex-1 flex flex-col min-h-[40vh] bg-transparent">
            {/* The Notebook Input */}
            <textarea
              ref={textareaRef}
              value={currentInput}
              onChange={(e) => setCurrentInput(e.target.value)}
              placeholder="在此书写..."
              spellCheck={false}
              className="w-full flex-1 p-0 font-chinese-hand notebook-input text-stone-800 placeholder:text-stone-300/50"
            />
            
            {/* AI Spark Button */}
            <button
              onClick={handleSpark}
              className="absolute -right-8 top-0 p-2 text-stone-300 hover:text-amber-600 transition-all duration-300 hover:rotate-12 hover:scale-110"
              title="给我灵感"
            >
              <Sparkles className={`w-6 h-6 ${isSparking ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {hint && (
            <div className="font-hand text-2xl text-stone-600/90 p-6 -rotate-1 transform relative max-w-md mx-auto fade-in">
              <div className="absolute inset-0 bg-yellow-50 transform rotate-1 shadow-sm border border-stone-100 -z-10"></div>
              "{hint}"
            </div>
          )}

          {/* Controls */}
          <div className="flex items-center justify-between pt-4 pb-12">
            <button
              onClick={handleSkip}
              className="px-6 py-3 font-serif text-stone-400 hover:text-stone-600 transition-colors text-lg border border-transparent hover:border-stone-200 rounded"
            >
              跳过此题
            </button>
            
            <button
              onClick={handleNext}
              className="group flex items-center gap-3 px-8 py-3 bg-stone-900 text-[#f4f0e6] font-serif text-lg rounded-sm hover:bg-stone-800 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
            >
              <span>{currentIndex === QUESTIONS.length - 1 ? '完成回忆' : '继续'}</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      </div>

      {/* Hand-drawn Timeline Progress */}
      <div className="h-12 w-full bg-[#f4f0e6] border-t border-stone-200 flex items-center px-6 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{backgroundImage: "url('https://www.transparenttextures.com/patterns/aged-paper.png')"}}></div>
        <div className="w-full h-[2px] bg-stone-300 relative">
           <div 
             className="absolute top-0 left-0 h-full bg-stone-800 transition-all duration-700 ease-out"
             style={{ width: `${progress}%` }}
           >
             {/* Pen tip / Indicator */}
             <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-4 h-4 bg-stone-800 rounded-full border-[3px] border-[#f4f0e6] shadow-sm"></div>
           </div>
        </div>
        <div className="ml-6 font-hand text-xl text-stone-500 w-16 text-right">
          {Math.round(progress)}%
        </div>
      </div>
    </div>
  );
};
