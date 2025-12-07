import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, Upload, BookOpen, Camera, Heart, Star, Music, RotateCw, X, Sun, Zap, Coffee, Smile, Anchor, Cloud } from 'lucide-react';
import { YearSummary, DraggableItem, SummaryContent, Answers } from '../types';
import { NotebookView } from './NotebookView';
import html2canvas from 'html2canvas';

interface Props {
  summary: YearSummary;
  allAnswers?: Answers;
  onRetake: () => void;
}

export const SummaryBoard: React.FC<Props> = ({ summary, allAnswers, onRetake }) => {
  const [items, setItems] = useState<DraggableItem[]>([]);
  const [highestZ, setHighestZ] = useState(10);
  const [printingIndex, setPrintingIndex] = useState(0);
  const [showNotebook, setShowNotebook] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  
  const boardRef = useRef<HTMLDivElement>(null);
  
  // Interaction Refs
  const dragItemRef = useRef<string | null>(null);
  const dragStartRef = useRef<{x: number, y: number}>({x: 0, y: 0});
  const itemStartPosRef = useRef<{x: number, y: number}>({x: 0, y: 0});
  
  const isRotatingRef = useRef(false);
  const rotationStartAngleRef = useRef<number>(0);
  const itemStartRotationRef = useRef<number>(0);

  // Start continuous printing
  useEffect(() => {
    if (printingIndex < summary.cards.length) {
      const timer = setTimeout(() => {
        spawnCard(printingIndex);
        setPrintingIndex(prev => prev + 1);
      }, 1500); 
      return () => clearTimeout(timer);
    }
  }, [printingIndex, summary]);

  const spawnCard = (index: number) => {
    const cardContent = summary.cards[index];
    const boardW = window.innerWidth;
    const boardH = window.innerHeight;
    
    // Distribute nicely
    const spreadX = boardW * 0.4; 
    const spreadY = boardH * 0.3; 
    
    const targetX = (boardW / 2) - 150 + (Math.random() * spreadX - spreadX/2);
    const targetY = (boardH / 2) - 250 + (Math.random() * spreadY - spreadY/2);
    const rotation = (Math.random() * 40) - 20; // Random +/- 20 deg

    const newItem: DraggableItem = {
      id: `card-${index}`,
      type: 'text-card',
      content: cardContent,
      x: targetX,
      y: targetY,
      rotation: rotation,
      zIndex: index + 1
    };

    setItems(prev => [...prev, newItem]);
  };

  // --- DRAG LOGIC ---
  const handlePointerDown = (e: React.PointerEvent, id: string) => {
    // If clicking rotate handle, don't drag
    if ((e.target as HTMLElement).closest('.rotate-handle')) return;

    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    
    setActiveId(id);
    dragItemRef.current = id;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    
    const item = items.find(i => i.id === id);
    if (item) {
      itemStartPosRef.current = { x: item.x, y: item.y };
      const newZ = highestZ + 1;
      setHighestZ(newZ);
      setItems(prev => prev.map(i => i.id === id ? { ...i, zIndex: newZ } : i));
    }
  };

  // --- ROTATE LOGIC ---
  const handleRotateDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    const item = items.find(i => i.id === id);
    if (!item) return;

    const el = document.getElementById(`item-${id}`);
    if (!el) return;
    
    // Set capture on the handle or the item wrapper? 
    // Usually better to let window handle move, but here we capture on the handle
    e.currentTarget.setPointerCapture(e.pointerId);

    isRotatingRef.current = true;
    
    // Calculate center
    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    // Calculate initial angle
    rotationStartAngleRef.current = Math.atan2(e.clientY - centerY, e.clientX - centerX);
    itemStartRotationRef.current = item.rotation;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    // 1. Rotation
    if (isRotatingRef.current && activeId) {
       const item = items.find(i => i.id === activeId);
       const el = document.getElementById(`item-${activeId}`);
       if (item && el) {
         const rect = el.getBoundingClientRect();
         const centerX = rect.left + rect.width / 2;
         const centerY = rect.top + rect.height / 2;
         
         const currentAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX);
         const angleDiff = currentAngle - rotationStartAngleRef.current;
         const angleDeg = angleDiff * (180 / Math.PI);
         
         const newRotation = itemStartRotationRef.current + angleDeg;
         
         setItems(prev => prev.map(i => i.id === activeId ? { ...i, rotation: newRotation } : i));
       }
       return;
    }

    // 2. Dragging
    if (dragItemRef.current) {
      const deltaX = e.clientX - dragStartRef.current.x;
      const deltaY = e.clientY - dragStartRef.current.y;

      setItems(prev => prev.map(item => {
        if (item.id === dragItemRef.current) {
          return {
            ...item,
            x: itemStartPosRef.current.x + deltaX,
            y: itemStartPosRef.current.y + deltaY
          };
        }
        return item;
      }));
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragItemRef.current || isRotatingRef.current) {
      e.currentTarget.releasePointerCapture(e.pointerId);
      dragItemRef.current = null;
      isRotatingRef.current = false;
    }
  };
  
  const handleBackgroundClick = () => {
    setActiveId(null);
  }

  // --- FILE UPLOAD ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const newItem: DraggableItem = {
          id: `photo-${Date.now()}`,
          type: 'image-upload',
          imageUrl: ev.target?.result as string,
          x: window.innerWidth / 2 - 100 + (Math.random() * 40),
          y: window.innerHeight / 2 - 100 + (Math.random() * 40),
          rotation: Math.random() * 20 - 10,
          zIndex: highestZ + 1
        };
        setHighestZ(prev => prev + 1);
        setItems(prev => [...prev, newItem]);
        setActiveId(newItem.id);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDeleteItem = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setItems(prev => prev.filter(i => i.id !== id));
    setActiveId(null);
  }

  const handleScreenshot = async () => {
    // Deselect before screenshot
    setActiveId(null);
    // Short delay to allow UI to update
    await new Promise(r => setTimeout(r, 100));
    
    if (boardRef.current && !isCapturing) {
      setIsCapturing(true);
      try {
        const canvas = await html2canvas(boardRef.current, {
          scale: 2,
          useCORS: true,
          ignoreElements: (element) => element.classList.contains('no-screenshot'),
          logging: false
        });
        const link = document.createElement('a');
        link.download = `2025-Year-Review.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      } catch (error) {
        alert("保存失败");
      } finally {
        setIsCapturing(false);
      }
    }
  };

  // --- CARD RENDERERS ---
  const renderCardContent = (content: SummaryContent) => {
    const style = (content.style || 'paper').toLowerCase();

    // 1. TICKET STYLE
    if (style === 'ticket') {
      return (
        <div className="w-[300px] min-h-[180px] bg-[#e6e2d3] p-0 shadow-xl relative select-none rounded-sm overflow-hidden flex flex-col border border-stone-800/20">
           {/* Decorative strip */}
           <div className="h-4 w-full bg-[#3d3d3d] flex items-center justify-between px-2">
              <span className="text-[8px] text-white/50 tracking-widest font-mono">ADMIT ONE</span>
              <span className="text-[8px] text-white/50 tracking-widest font-mono">2025</span>
           </div>
           
           <div className="p-5 flex-1 flex flex-col relative">
             {/* Perforations */}
             <div className="absolute top-1/2 -left-3 w-6 h-6 bg-[#5c4033] rounded-full shadow-inner"></div>
             <div className="absolute top-1/2 -right-3 w-6 h-6 bg-[#5c4033] rounded-full shadow-inner"></div>

             <div className="text-center border-b-2 border-stone-800 border-dotted pb-2 mb-3">
               <h3 className="font-retro text-2xl text-stone-900 tracking-widest font-bold">{content.title}</h3>
               <div className="font-typewriter text-[10px] uppercase tracking-[0.4em] text-stone-500 mt-1">Admission Ticket</div>
             </div>
             
             <p className="font-serif text-sm text-stone-800 leading-relaxed text-justify px-2">{content.content}</p>
             
             <div className="mt-auto pt-4 flex justify-between items-center opacity-70">
               <span className="font-mono text-xs font-bold border border-stone-800 px-1">DEST: 2025</span>
               <span className="font-mono text-xs font-bold bg-stone-800 text-[#e6e2d3] px-2">{content.keyword}</span>
             </div>
           </div>
        </div>
      );
    }
    
    // 2. POLAROID STYLE
    if (style === 'polaroid') {
       return (
        <div className="w-[260px] min-h-[400px] bg-white p-3 pb-8 shadow-xl select-none flex flex-col items-center">
           <div className="w-full aspect-[4/3] bg-stone-100 mb-4 overflow-hidden relative border border-stone-200 grayscale contrast-125">
              <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/noise.png')]"></div>
              {/* Abstract Visual */}
              <div className="w-full h-full flex items-center justify-center bg-stone-50">
                 <span className="font-hand text-9xl text-stone-300 transform rotate-12 select-none">{content.keyword ? content.keyword.charAt(0) : '25'}</span>
              </div>
              <div className="absolute bottom-2 right-2 font-mono text-[9px] text-stone-400">2025.12.31</div>
           </div>
           
           <h3 className="font-chinese-hand text-2xl text-stone-800 tracking-widest mb-3 leading-none">{content.title}</h3>
           
           {/* Handwritten Summary */}
           <div className="font-chinese-hand text-sm text-stone-600 leading-6 text-center px-2 flex-1 w-full break-words">
             {content.content}
           </div>

           <div className="mt-3">
             <span className="font-typewriter text-[10px] text-stone-400 px-3 py-0.5 border border-stone-200 rounded-full">{content.keyword}</span>
           </div>
        </div>
       );
    }
    
    // 3. NOTE STYLE (Yellow)
    if (style === 'note') {
       return (
        <div className="w-[300px] min-h-[380px] bg-[#fef9c3] p-0 shadow-lg select-none relative overflow-hidden flex flex-col">
           {/* Lines */}
           <div className="absolute inset-0 z-0 pointer-events-none" style={{
              backgroundImage: 'linear-gradient(#94a3b8 1px, transparent 1px)',
              backgroundSize: '100% 24px',
              marginTop: '48px'
           }}></div>
           {/* Red Margin */}
           <div className="absolute top-0 bottom-0 left-8 w-[1px] bg-red-400/50 z-0 pointer-events-none"></div>

           {/* Header */}
           <div className="pt-12 px-10 pb-2 z-10 relative">
              <h3 className="font-chinese-hand text-3xl text-stone-900 mb-1 leading-none">{content.title}</h3>
              <div className="w-full h-[2px] bg-stone-800/80 rounded-full opacity-10"></div>
           </div>

           {/* Content */}
           <div className="px-10 py-2 z-20 relative flex-1">
              <div className="font-chinese-hand text-xl text-stone-800 leading-[24px]">
                 {content.content}
              </div>
           </div>

           {/* Footer */}
           <div className="px-10 pb-6 z-10 relative flex justify-end items-center gap-2">
             <Heart className="w-4 h-4 text-red-400 fill-current opacity-60" />
             <div className="font-typewriter text-[10px] text-stone-500 uppercase tracking-widest border-b border-stone-400/50">
               KEY: {content.keyword}
             </div>
           </div>
        </div>
       );
    }

    // 4. PAPER STYLE (White - Redesigned)
    // Default
    return (
      <div className="w-[320px] min-h-[420px] bg-[#f9f9f9] p-8 shadow-xl select-none relative flex flex-col justify-start border border-stone-100">
        
        {/* Subtle Texture */}
        <div className="absolute inset-0 opacity-30 bg-[url('https://www.transparenttextures.com/patterns/cream-paper.png')] pointer-events-none z-0"></div>

        {/* Watermark (Subtle Background) */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-serif text-[12rem] text-stone-900/5 select-none pointer-events-none z-0 italic font-bold">
          {content.keyword ? content.keyword.charAt(0).toUpperCase() : 'A'}
        </div>
        
        {/* Tape Top */}
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-24 h-6 bg-white/80 rotate-1 shadow-sm border border-stone-100/50 backdrop-blur-sm z-20"></div>

        {/* --- Content Layer --- */}
        <div className="relative z-10 flex flex-col flex-1 justify-start">
            
            {/* Header: Top Aligned */}
            <div className="mb-6 border-b-2 border-stone-900 pb-4 pt-2">
               <div className="flex justify-between items-center mb-3 opacity-60">
                 <span className="font-typewriter text-[9px] tracking-[0.2em] uppercase">Chapter 01</span>
                 <span className="font-typewriter text-[9px] tracking-widest">2025</span>
               </div>
               <h3 className="font-serif text-4xl text-stone-900 font-bold leading-tight">{content.title}</h3>
            </div>

            {/* Content: Justified, Indented */}
            <div className="flex-1 flex flex-col justify-start">
               <p className="font-serif text-stone-800 leading-8 text-sm text-justify indent-8 tracking-wide">
                 {content.content || "..."}
               </p>
            </div>
            
            {/* Footer */}
            <div className="mt-8 pt-4 flex justify-between items-center opacity-60">
               <span className="text-[9px] font-mono">PAGE 25</span>
               <span className="font-typewriter text-[9px] uppercase tracking-widest border border-stone-300 px-2 py-0.5 rounded-full">{content.keyword || "END"}</span>
            </div>
        </div>
      </div>
    );
  };

  return (
    <>
    <div ref={boardRef} 
         className="min-h-screen bg-[#5c4033] overflow-hidden relative touch-none shadow-inner"
         onPointerDown={handleBackgroundClick} // Deselect on bg click
    >
      
      {/* Backgrounds */}
      <div className="absolute inset-0 pointer-events-none opacity-80" 
        style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/cork-board.png")', backgroundBlendMode: 'multiply' }}>
      </div>
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_20%,rgba(0,0,0,0.4)_100%)]"></div>

      {/* Decorations - Stickers & Doodles */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
         {/* Top Left Title */}
         <div className="absolute top-8 left-8 select-none">
            <h1 className="text-5xl font-hand text-white/20 -rotate-3" style={{ textShadow: '2px 2px 0px rgba(0,0,0,0.2)' }}>2025 Review</h1>
         </div>
         
         {/* Stickers */}
         <div className="absolute top-[10%] left-[15%] rotate-[-12deg] text-yellow-200/60"><Star size={64} fill="currentColor" /></div>
         
         <div className="absolute top-[5%] right-[10%] rotate-[15deg] text-orange-300/60 opacity-80">
            <Sun size={80} strokeWidth={1.5} />
         </div>

         <div className="absolute bottom-[20%] right-[5%] rotate-[-5deg] text-stone-800/20 opacity-60">
            <Coffee size={100} strokeWidth={1} />
         </div>

         <div className="absolute top-[40%] left-[2%] rotate-[45deg] text-yellow-400/50">
            <Zap size={40} fill="currentColor" />
         </div>

         <div className="absolute bottom-[10%] left-[8%] rotate-[-15deg] text-blue-200/40">
            <Cloud size={90} fill="currentColor" />
         </div>

         <div className="absolute top-[30%] right-[20%] rotate-[10deg] text-pink-300/40">
            <Smile size={50} strokeWidth={1.5} />
         </div>

         <div className="absolute bottom-[35%] left-[25%] rotate-[30deg] text-stone-900/10">
            <Anchor size={60} strokeWidth={1} />
         </div>
         
         {/* Washi Tapes */}
         <div className="absolute top-[-20px] left-[40%] w-32 h-8 bg-red-400/30 rotate-3 shadow-sm backdrop-blur-[1px]"></div>
         <div className="absolute bottom-[50px] right-[-20px] w-24 h-6 bg-blue-400/30 -rotate-45 shadow-sm backdrop-blur-[1px]"></div>
      </div>

      {/* --- CARDS LAYER --- */}
      <div className="absolute inset-0 w-full h-full overflow-hidden">
        {items.map((item, i) => (
          <div
            key={item.id}
            id={`item-${item.id}`}
            onPointerDown={(e) => handlePointerDown(e, item.id)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className={`absolute cursor-move group will-change-transform ${item.id.startsWith('card') && parseInt(item.id.split('-')[1]) === items.length - 1 ? 'fly-in' : ''}`}
            style={{
              left: 0, 
              top: 0,
              transform: `translate(${item.x}px, ${item.y}px) rotate(${item.rotation}deg)`,
              zIndex: item.zIndex,
            }}
          >
             {/* Render Card */}
             {item.type === 'text-card' && item.content && renderCardContent(item.content)}
             
             {item.type === 'image-upload' && item.imageUrl && (
               <div className="p-3 bg-white shadow-xl w-48 border border-stone-200">
                 <img src={item.imageUrl} alt="Memory" className="w-full h-auto block filter contrast-110 sepia-[0.2]" />
               </div>
             )}

             {/* ACTIVE STATE UI: Selection Border & Controls */}
             {activeId === item.id && (
               <div className="absolute inset-[-10px] border-2 border-stone-400/50 border-dashed rounded-lg pointer-events-none no-screenshot z-50">
                  {/* Delete Button (Top Left) */}
                  <div 
                    className="absolute -top-3 -left-3 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center cursor-pointer shadow-md pointer-events-auto hover:scale-110 transition-transform"
                    onClick={(e) => handleDeleteItem(e, item.id)}
                  >
                    <X size={12} />
                  </div>

                  {/* Rotate Handle (Top Right) */}
                  <div 
                    className="rotate-handle absolute -top-3 -right-3 w-8 h-8 bg-white text-stone-800 rounded-full flex items-center justify-center cursor-ew-resize shadow-md border border-stone-200 pointer-events-auto hover:bg-stone-100"
                    onPointerDown={(e) => handleRotateDown(e, item.id)}
                  >
                    <RotateCw size={14} />
                  </div>
               </div>
             )}
          </div>
        ))}
      </div>

      {/* --- TYPEWRITER --- */}
      <div className="absolute bottom-[-50px] left-1/2 -translate-x-1/2 w-[400px] h-[180px] z-[500] pointer-events-none flex justify-center no-screenshot">
         <div className="w-full h-full bg-[#1a1a1a] rounded-t-xl shadow-2xl border-t border-stone-700 flex flex-col items-center pt-4 relative">
             <div className="text-stone-500 font-typewriter text-xs tracking-[0.3em] mb-2 uppercase">Memory_Printer_v4.0</div>
             <div className="w-64 h-2 bg-black rounded-full mb-2 shadow-[inset_0_2px_4px_rgba(0,0,0,0.8)]"></div>
             {printingIndex < summary.cards.length && (
               <div className="absolute -top-12 bg-black/80 text-[#00ff41] px-3 py-1 font-typewriter text-xs rounded-full flex items-center gap-2">
                 <div className="w-2 h-2 bg-[#00ff41] rounded-full animate-pulse"></div>
                 Printing...
               </div>
             )}
         </div>
      </div>

      {/* --- CONTROLS --- */}
      <div className="absolute bottom-8 right-8 flex flex-col gap-4 z-[9999] no-screenshot">
         <button 
           onClick={handleScreenshot}
           disabled={isCapturing}
           className="bg-stone-800 text-white w-14 h-14 rounded-full shadow-2xl hover:bg-stone-700 hover:scale-110 transition-all flex items-center justify-center border-2 border-stone-600 group disabled:opacity-50"
         >
           <Camera className={`w-6 h-6 ${isCapturing ? 'animate-pulse' : ''}`} />
         </button>

         <label className="cursor-pointer bg-white text-stone-800 w-14 h-14 rounded-full shadow-2xl hover:scale-110 transition-all flex items-center justify-center border-2 border-stone-100 group">
           <Upload className="w-6 h-6 group-hover:text-stone-600" />
           <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
         </label>

         <button 
           onClick={() => setShowNotebook(true)}
           className="bg-amber-100 text-amber-900 w-14 h-14 rounded-full shadow-2xl hover:bg-amber-200 hover:scale-110 transition-all flex items-center justify-center border-2 border-amber-300 group"
         >
           <BookOpen className="w-6 h-6 group-hover:scale-110 transition-transform" />
         </button>

         <button 
           onClick={onRetake}
           className="bg-stone-800 text-stone-100 w-14 h-14 rounded-full shadow-2xl hover:bg-stone-700 hover:scale-110 transition-all flex items-center justify-center border-2 border-stone-700 group"
         >
           <RefreshCw className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" />
         </button>
      </div>
    </div>
    
    {/* Notebook Overlay */}
    {showNotebook && (
      <NotebookView 
        answers={allAnswers || {}} 
        summary={summary} 
        onClose={() => setShowNotebook(false)} 
      />
    )}
    </>
  );
};