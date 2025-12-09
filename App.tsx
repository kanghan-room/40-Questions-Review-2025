import React, { useState } from 'react';
import { AppState, Answers, YearSummary } from './types';
import { QUESTIONS } from './constants';
import { Welcome } from './components/Welcome';
import { QuestionFlow } from './components/QuestionFlow';
import { SummaryBoard } from './components/SummaryBoard';
import { generateYearSummary, extractAnswersFromData } from './services/openaiService';
import { Loader2 } from 'lucide-react';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.WELCOME);
  const [answers, setAnswers] = useState<Answers>({});
  const [summary, setSummary] = useState<YearSummary | null>(null);
  const [isProcessingFile, setIsProcessingFile] = useState(false);

  const startReview = () => {
    setAppState(AppState.QUESTIONS);
  };

  const handleFileUpload = async (file: File) => {
    setIsProcessingFile(true);
    try {
      // 1. Convert file to base64
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // Remove data URL prefix (e.g., "data:application/pdf;base64,")
          const base64 = result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // 2. Extract answers using Gemini
      // Ensure we have a mimeType, fallback to text/plain if empty
      const mimeType = file.type || 'text/plain';
      
      const extractedAnswers = await extractAnswersFromData(base64Data, mimeType);
      
      if (Object.keys(extractedAnswers).length === 0) {
        throw new Error("No answers extracted");
      }

      setAnswers(extractedAnswers);
      
      // 3. Generate Summary immediately
      setAppState(AppState.ANALYZING);
      const result = await generateYearSummary(extractedAnswers, QUESTIONS);
      setSummary(result);
      setAppState(AppState.SUMMARY);

    } catch (error) {
      console.error("File processing failed", error);
      alert("抱歉，无法读取该文件或未在文件中找到回答。请确保文件包含清晰的文字。");
      setAppState(AppState.WELCOME);
    } finally {
      setIsProcessingFile(false);
    }
  };

  const finishReview = async () => {
    setAppState(AppState.ANALYZING);
    try {
      const result = await generateYearSummary(answers, QUESTIONS);
      setSummary(result);
      setAppState(AppState.SUMMARY);
    } catch (e) {
      console.error(e);
      // Fallback handled in service or UI
      setAppState(AppState.SUMMARY);
    }
  };

  const retake = () => {
    setAnswers({});
    setSummary(null);
    setAppState(AppState.WELCOME);
  };

  return (
    <div className="antialiased min-h-screen">
      {appState === AppState.WELCOME && (
        <Welcome 
          onStart={startReview} 
          onFileUpload={handleFileUpload}
          isProcessing={isProcessingFile}
        />
      )}

      {appState === AppState.QUESTIONS && (
        <QuestionFlow 
          answers={answers} 
          setAnswers={setAnswers} 
          onComplete={finishReview} 
        />
      )}

      {appState === AppState.ANALYZING && (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[#fdfbf7] space-y-8 fade-in">
          <div className="relative">
            <div className="absolute inset-0 bg-orange-200 rounded-full blur-2xl opacity-40 animate-pulse"></div>
            <Loader2 className="w-12 h-12 text-stone-800 animate-spin relative z-10" />
          </div>
          <div className="text-center space-y-3 z-10">
            <h3 className="text-2xl font-serif font-bold text-stone-900">正在冲洗你的年度胶卷...</h3>
            <p className="font-typewriter text-stone-500 text-xs tracking-widest uppercase">Developing Memories...</p>
          </div>
        </div>
      )}

      {appState === AppState.SUMMARY && summary && (
        <SummaryBoard summary={summary} allAnswers={answers} onRetake={retake} />
      )}
    </div>
  );
};

export default App;
