
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  BookOpen, Send, FileUp, Volume2, Pause, Play, Sparkles, 
  Trophy, Settings, CheckCircle2, XCircle, BrainCircuit,
  Award, TrendingUp, Mic, User, ChevronRight, Library, Trash2, Plus, 
  BookText, Headphones, RotateCcw, Square
} from 'lucide-react';
import { CHARACTERS, INITIAL_BADGES, VOICE_OPTIONS } from './constants';
import { Character, ChatMessage, DocumentState, Badge, UserProgress, AppTab } from './types';
import CharacterSelector from './components/CharacterSelector';
import { analyzeDocument, chatWithAssistant, generateTTS, decodeAudioData, generateQuiz } from './services/gemini';

const App: React.FC = () => {
  const [selectedCharacter, setSelectedCharacter] = useState<Character>(CHARACTERS[0]);
  const [allDocuments, setAllDocuments] = useState<DocumentState[]>(() => {
    const saved = localStorage.getItem('teyvat_scholar_docs');
    return saved ? JSON.parse(saved) : [];
  });
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(() => {
    const saved = localStorage.getItem('teyvat_scholar_active_doc');
    return saved || null;
  });
  
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [activeTab, setActiveTab] = useState<AppTab>('reader');
  const [isLibraryOpen, setIsLibraryOpen] = useState(true);
  
  // Learning Module State
  const [quiz, setQuiz] = useState<any[]>([]);
  const [currentQuizIndex, setCurrentQuizIndex] = useState(-1);
  const [quizScore, setQuizScore] = useState(0);
  const [quizFinished, setQuizFinished] = useState(false);

  // Settings State
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [activeVoice, setActiveVoice] = useState(selectedCharacter.voiceName);

  // Reader State
  const [readerScrollProgress, setReaderScrollProgress] = useState(0);

  // Progress State
  const [userProgress, setUserProgress] = useState<UserProgress>(() => {
    const saved = localStorage.getItem('teyvat_scholar_progress');
    return saved ? JSON.parse(saved) : {
      documentsCompleted: [],
      totalQuizzesTaken: 0,
      averageScore: 0,
      badges: INITIAL_BADGES
    };
  });

  const activeDocument = allDocuments.find(d => d.id === activeDocumentId) || null;

  const audioContextRef = useRef<AudioContext | null>(null);
  const currentAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const readerRef = useRef<HTMLDivElement>(null);

  // Persistence
  useEffect(() => {
    localStorage.setItem('teyvat_scholar_docs', JSON.stringify(allDocuments));
  }, [allDocuments]);

  useEffect(() => {
    if (activeDocumentId) localStorage.setItem('teyvat_scholar_active_doc', activeDocumentId);
  }, [activeDocumentId]);

  useEffect(() => {
    localStorage.setItem('teyvat_scholar_progress', JSON.stringify(userProgress));
  }, [userProgress]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isTyping]);

  const unlockBadge = (badgeId: string) => {
    setUserProgress(prev => {
      const updatedBadges = prev.badges.map(b => b.id === badgeId ? { ...b, unlocked: true } : b);
      return { ...prev, badges: updatedBadges };
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    try {
      const extractedText = await analyzeDocument(file);
      const newDoc: DocumentState = {
        id: Math.random().toString(36).substring(7),
        name: file.name,
        content: extractedText,
        type: file.type,
        progress: 0,
        quizScore: null
      };
      
      setAllDocuments(prev => [...prev, newDoc]);
      setActiveDocumentId(newDoc.id);
      
      setChatHistory([{
        role: 'model',
        content: `Traveler! I've added "${file.name}" to your Archive. My elemental sight reveals much within these pages. Should we begin our research?`
      }]);
      unlockBadge('first_steps');
    } catch (err) {
      console.error(err);
      alert("Failed to process document.");
    } finally {
      setIsLoading(false);
    }
  };

  const deleteDocument = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setAllDocuments(prev => prev.filter(d => d.id !== id));
    if (activeDocumentId === id) setActiveDocumentId(null);
  };

  const stopAudio = () => {
    if (currentAudioSourceRef.current) {
      currentAudioSourceRef.current.stop();
      currentAudioSourceRef.current = null;
    }
    setIsReading(false);
  };

  const playTTS = async (text: string) => {
    if (isReading) {
      stopAudio();
      return;
    }

    setIsReading(true);

    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }

    // Split text to handle potential limits, though for now we'll try a chunk
    const chunk = text.substring(0, 3000); 
    const audioData = await generateTTS(chunk, selectedCharacter, activeVoice);
    if (!audioData) {
      setIsReading(false);
      return;
    }

    const audioBuffer = await decodeAudioData(audioData, audioContextRef.current);
    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContextRef.current.destination);
    
    source.onended = () => {
      setIsReading(false);
      currentAudioSourceRef.current = null;
    };

    currentAudioSourceRef.current = source;
    source.start(0);
  };

  const handleSendMessage = async () => {
    if (!inputText.trim() || !activeDocument) return;

    const userMessage = inputText;
    setInputText('');
    setChatHistory(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsTyping(true);

    try {
      const response = await chatWithAssistant(
        selectedCharacter,
        userMessage,
        activeDocument.content,
        []
      );
      
      if (response) {
        setChatHistory(prev => [...prev, { role: 'model', content: response }]);
        if (chatHistory.length > 50) unlockBadge('loyal_traveler');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsTyping(false);
    }
  };

  const handleQuizAnswer = (isCorrect: boolean) => {
    if (isCorrect) setQuizScore(prev => prev + 1);
    
    if (currentQuizIndex < quiz.length - 1) {
      setCurrentQuizIndex(prev => prev + 1);
    } else {
      setQuizFinished(true);
      const finalScore = isCorrect ? quizScore + 1 : quizScore;
      const percent = (finalScore / quiz.length) * 100;
      
      if (percent === 100) unlockBadge('quiz_wizard');
      
      setUserProgress(prev => ({
        ...prev,
        totalQuizzesTaken: prev.totalQuizzesTaken + 1,
        averageScore: (prev.averageScore * prev.totalQuizzesTaken + percent) / (prev.totalQuizzesTaken + 1),
        documentsCompleted: [...new Set([...prev.documentsCompleted, activeDocument!.id])]
      }));

      if (userProgress.documentsCompleted.length + 1 >= 5) unlockBadge('master_scholar');
    }
  };

  const handleReaderScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const progress = (target.scrollTop / (target.scrollHeight - target.clientHeight)) * 100;
    setReaderScrollProgress(progress);
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#0f172a]">
      {/* Header */}
      <header className="genshin-glass px-6 py-4 flex items-center justify-between border-b border-slate-700/50 z-40">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="bg-amber-400 p-2 rounded-lg shadow-lg shadow-amber-400/20">
              <BookOpen className="w-6 h-6 text-slate-900" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-amber-200 to-amber-500">
                Teyvat Scholar
              </h1>
            </div>
          </div>
          
          <nav className="flex gap-1 bg-slate-800/50 p-1 rounded-xl border border-slate-700/50">
            <button 
              onClick={() => setActiveTab('reader')}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${activeTab === 'reader' ? 'bg-amber-500 text-slate-900' : 'text-slate-400 hover:text-white'}`}
            >
              <BookText className="w-4 h-4" /> Reader
            </button>
            <button 
              onClick={() => setActiveTab('study')}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${activeTab === 'study' ? 'bg-amber-500 text-slate-900' : 'text-slate-400 hover:text-white'}`}
            >
              <BrainCircuit className="w-4 h-4" /> Study
            </button>
            <button 
              onClick={() => setActiveTab('progress')}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${activeTab === 'progress' ? 'bg-amber-500 text-slate-900' : 'text-slate-400 hover:text-white'}`}
            >
              <Trophy className="w-4 h-4" /> Progress
            </button>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-900 px-4 py-2 rounded-full font-semibold cursor-pointer transition-all shadow-lg shadow-amber-500/20 active:scale-95">
            <Plus className="w-4 h-4" />
            <span>Add to Archive</span>
            <input type="file" className="hidden" onChange={handleFileUpload} accept=".pdf,.txt,.png,.jpg" />
          </label>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Library Sidebar (Common to Reader and Study) */}
        {activeTab !== 'progress' && (
          <div className={`${isLibraryOpen ? 'w-64' : 'w-0'} bg-slate-900/40 border-r border-slate-700/50 transition-all duration-300 overflow-hidden flex flex-col z-20`}>
            <div className="p-4 border-b border-slate-700/50 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Library className="w-3 h-3" /> Archive
              </h3>
              <span className="bg-slate-800 text-slate-400 text-[10px] px-2 py-0.5 rounded-full border border-slate-700">
                {allDocuments.length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-hide">
              {allDocuments.length === 0 ? (
                <div className="text-center py-10 px-4">
                  <p className="text-[10px] text-slate-600 uppercase font-bold">Your Archive is empty</p>
                </div>
              ) : (
                allDocuments.map(doc => (
                  <button
                    key={doc.id}
                    onClick={() => setActiveDocumentId(doc.id)}
                    className={`w-full group text-left p-3 rounded-xl border transition-all relative ${
                      activeDocumentId === doc.id 
                        ? 'bg-amber-500/10 border-amber-500/40' 
                        : 'bg-transparent border-transparent hover:bg-slate-800/50 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 p-1.5 rounded-lg ${activeDocumentId === doc.id ? 'bg-amber-500 text-slate-900' : 'bg-slate-800 text-slate-500'}`}>
                        <BookOpen className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-bold truncate ${activeDocumentId === doc.id ? 'text-amber-200' : 'text-slate-400'}`}>
                          {doc.name}
                        </p>
                        <p className="text-[9px] text-slate-600 truncate uppercase mt-0.5">{doc.type.split('/')[1] || 'file'}</p>
                      </div>
                      <button 
                        onClick={(e) => deleteDocument(doc.id, e)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-red-400 transition-all"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* Content Area */}
        <main className="flex-1 flex overflow-hidden relative">
          {activeTab !== 'progress' && (
            <button 
              onClick={() => setIsLibraryOpen(!isLibraryOpen)}
              className="absolute -left-3 top-10 bg-slate-800 border border-slate-700 rounded-full p-1 z-30 text-slate-400 hover:text-amber-400 transition-all shadow-xl"
            >
              {isLibraryOpen ? <ChevronRight className="w-4 h-4 rotate-180" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          )}

          {activeTab === 'reader' ? (
            <div className="flex-1 flex flex-col relative bg-[#1e293b]/30">
              {activeDocument ? (
                <div className="flex-1 flex flex-col overflow-hidden max-w-4xl mx-auto w-full px-8 py-10">
                  {/* Reader Header */}
                  <div className="flex items-center justify-between mb-8 border-b border-slate-700/50 pb-6">
                    <div>
                      <h2 className="text-3xl font-bold text-white mb-2">{activeDocument.name}</h2>
                      <div className="flex items-center gap-4">
                        <span className="text-xs text-slate-500 uppercase font-bold tracking-widest">{activeDocument.type}</span>
                        <div className="flex items-center gap-1.5">
                          <div className="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div className="bg-amber-500 h-full rounded-full" style={{ width: `${readerScrollProgress}%` }}></div>
                          </div>
                          <span className="text-[10px] text-slate-500 font-bold">{Math.round(readerScrollProgress)}% Read</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => playTTS(activeDocument.content)}
                        className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-black transition-all shadow-lg active:scale-95 ${isReading ? 'bg-amber-500 text-slate-900' : 'bg-slate-700 text-white hover:bg-slate-600'}`}
                      >
                        {isReading ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                        <span>{isReading ? 'PAUSE' : 'READ ALOUD'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Reader Content */}
                  <div 
                    ref={readerRef}
                    onScroll={handleReaderScroll}
                    className="flex-1 overflow-y-auto px-10 py-12 bg-slate-900/40 rounded-3xl border border-slate-700/50 shadow-inner selection:bg-amber-500/30 font-serif leading-relaxed text-xl text-slate-200"
                  >
                    <div className="max-w-2xl mx-auto whitespace-pre-wrap">
                      {activeDocument.content}
                    </div>
                  </div>

                  {/* Reader Footer Control Bar */}
                  <div className="mt-8 genshin-glass rounded-3xl p-5 flex items-center justify-between shadow-2xl border-amber-500/20">
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <img src={selectedCharacter.avatar} alt="" className="w-14 h-14 rounded-full border-2 border-amber-400 shadow-lg object-cover" />
                        {isReading && <div className="absolute inset-0 rounded-full border-2 border-amber-400 animate-ping opacity-30"></div>}
                      </div>
                      <div>
                        <p className="text-sm font-black text-white">{selectedCharacter.name}</p>
                        <p className="text-[10px] text-amber-500 uppercase font-bold tracking-widest">Master Narrator</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-6 bg-slate-800/80 px-8 py-3 rounded-2xl border border-slate-700 shadow-inner">
                       <button 
                        onClick={() => { stopAudio(); playTTS(activeDocument.content); }} 
                        className="text-slate-400 hover:text-amber-400 transition-all p-2 hover:bg-slate-700 rounded-lg"
                        title="Restart Reading"
                       >
                         <RotateCcw className="w-5 h-5" />
                       </button>

                       <button 
                        onClick={() => playTTS(activeDocument.content)}
                        className={`w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-90 shadow-xl ${isReading ? 'bg-amber-500 text-slate-900' : 'bg-white text-slate-900 hover:bg-amber-400'}`}
                        title={isReading ? "Pause" : "Play"}
                       >
                         {isReading ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 ml-1" />}
                       </button>

                       <button 
                        onClick={stopAudio} 
                        className="text-slate-400 hover:text-red-400 transition-all p-2 hover:bg-slate-700 rounded-lg"
                        title="Stop Reading"
                       >
                         <Square className="w-5 h-5 fill-current" />
                       </button>
                    </div>

                    <div className="flex items-center gap-3 bg-slate-800/50 p-2.5 rounded-2xl border border-slate-700">
                      <div className="p-1.5 bg-slate-700 rounded-lg">
                        <Headphones className="w-4 h-4 text-amber-400" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[8px] text-slate-500 font-bold uppercase">Voice Profile</span>
                        <select 
                          value={activeVoice}
                          onChange={(e) => setActiveVoice(e.target.value)}
                          className="bg-transparent text-xs font-bold text-slate-300 focus:outline-none cursor-pointer hover:text-white"
                        >
                          {VOICE_OPTIONS.map(v => <option key={v} value={v} className="bg-slate-900">{v}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center px-10">
                  <div className="p-10 rounded-full bg-slate-800/20 border border-slate-700/50 mb-8">
                    <BookText className="w-24 h-24 text-slate-700 opacity-50" />
                  </div>
                  <h3 className="text-3xl font-black text-slate-300">Archive Selection Required</h3>
                  <p className="max-w-xs text-slate-500 mt-4 leading-relaxed font-medium">Select a chronicle from your library to begin an immersive vocal recreation of its contents.</p>
                </div>
              )}
            </div>
          ) : activeTab === 'study' ? (
            <div className="flex-1 flex overflow-hidden p-6 gap-6">
               {/* Study View */}
               <div className="flex-1 flex flex-col genshin-glass rounded-3xl overflow-hidden shadow-2xl">
                <div className="px-6 py-4 border-b border-slate-700/50 flex items-center justify-between bg-slate-800/30">
                  <h2 className="font-semibold flex items-center gap-2 text-slate-200">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    {activeDocument ? activeDocument.name : 'Vignette of Knowledge'}
                  </h2>
                </div>
                
                <div className="flex-1 overflow-y-auto p-10 leading-relaxed text-slate-300 selection:bg-amber-500/30 scrollbar-hide">
                  {isLoading ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-6">
                      <div className="relative w-20 h-20">
                        <div className="absolute inset-0 border-4 border-amber-400/10 rounded-full"></div>
                        <div className="absolute inset-0 border-4 border-t-amber-400 rounded-full animate-spin"></div>
                        <BrainCircuit className="absolute inset-0 m-auto w-8 h-8 text-amber-400 animate-pulse" />
                      </div>
                      <p className="font-medium text-lg">Harnessing Elemental Knowledge...</p>
                    </div>
                  ) : activeDocument ? (
                    <div className="max-w-3xl mx-auto">
                      <div className="prose prose-invert max-w-none whitespace-pre-wrap text-lg leading-8 font-light">
                        {activeDocument.content}
                      </div>
                      
                      {/* Quiz Overlay */}
                      {currentQuizIndex !== -1 && !quizFinished && (
                        <div className="mt-12 p-8 bg-indigo-900/30 rounded-3xl border border-indigo-500/30 shadow-2xl animate-in slide-in-from-bottom-4">
                          <div className="flex items-center justify-between mb-6">
                            <span className="text-indigo-400 font-bold uppercase tracking-widest text-xs">Knowledge Check</span>
                            <span className="text-slate-400 text-xs">Question {currentQuizIndex + 1} of {quiz.length}</span>
                          </div>
                          <h3 className="text-xl font-bold text-white mb-8">{quiz[currentQuizIndex].question}</h3>
                          <div className="grid gap-4">
                            {quiz[currentQuizIndex].options.map((option: string, i: number) => (
                              <button
                                key={i}
                                onClick={() => handleQuizAnswer(i === quiz[currentQuizIndex].answerIndex)}
                                className="w-full text-left px-6 py-4 rounded-xl bg-slate-800/50 border border-slate-700 hover:border-indigo-500 hover:bg-indigo-500/10 transition-all font-medium text-slate-300"
                              >
                                {option}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {quizFinished && (
                        <div className="mt-12 p-10 bg-green-900/20 rounded-3xl border border-green-500/30 text-center animate-in zoom-in-95">
                          <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-green-500/20">
                            <Award className="w-10 h-10 text-slate-900" />
                          </div>
                          <h3 className="text-2xl font-bold text-white mb-2">Module Complete!</h3>
                          <p className="text-slate-400 mb-6">You scored {quizScore} out of {quiz.length}</p>
                          <button 
                            onClick={() => {setCurrentQuizIndex(-1); setQuizFinished(false);}}
                            className="bg-green-500 text-slate-900 px-6 py-2 rounded-full font-bold hover:bg-green-400 transition-colors"
                          >
                            Return to Reading
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center px-10">
                      <div className="bg-slate-800/50 p-8 rounded-full mb-8 relative">
                        <Library className="w-16 h-16 text-slate-600" />
                        <div className="absolute -top-2 -right-2 w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center text-slate-900 font-bold animate-bounce">!</div>
                      </div>
                      <h3 className="text-2xl font-bold text-slate-200 mb-4">Select a Document</h3>
                      <p className="max-w-md text-slate-400 leading-relaxed">Select a document from your archive to begin studying with your assistant.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Chat Interface */}
              <div className="w-96 flex flex-col gap-6">
                <div className="genshin-glass rounded-3xl p-5 shadow-xl">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                      <User className="w-3 h-3" /> Assistant
                    </h3>
                  </div>
                  <CharacterSelector 
                    selectedId={selectedCharacter.id} 
                    onSelect={(char) => {
                      setSelectedCharacter(char);
                      setActiveVoice(char.voiceName);
                      stopAudio();
                    }} 
                  />
                </div>

                <div className="flex-1 genshin-glass rounded-3xl overflow-hidden flex flex-col shadow-xl">
                  <div className="px-5 py-4 border-b border-slate-700/50 flex items-center gap-4 bg-slate-800/30">
                    <img src={selectedCharacter.avatar} alt={selectedCharacter.name} className="w-12 h-12 rounded-full object-cover border-2 border-amber-400/30" />
                    <div>
                      <p className="text-sm font-bold text-amber-200">{selectedCharacter.name}</p>
                      <p className="text-[10px] text-slate-400 uppercase tracking-tighter">{selectedCharacter.title}</p>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-hide">
                    {chatHistory.map((msg, i) => (
                      <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                        <div className={`max-w-[85%] rounded-2xl px-5 py-3 text-sm relative group shadow-lg ${
                          msg.role === 'user' 
                            ? 'bg-amber-500 text-slate-900 rounded-tr-none' 
                            : 'bg-slate-800/80 text-slate-200 rounded-tl-none border border-slate-700/50'
                        }`}>
                          {msg.content}
                          {msg.role === 'model' && (
                            <button onClick={() => playTTS(msg.content)} className="absolute -right-10 top-2 p-2 opacity-0 group-hover:opacity-100 transition-all text-slate-500 hover:text-amber-400">
                              <Volume2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>

                  <div className="p-5 bg-slate-900/50 border-t border-slate-700/50">
                    <div className="relative group">
                      <input
                        type="text"
                        placeholder={activeDocument ? `Ask ${selectedCharacter.name}...` : "Archive empty"}
                        disabled={!activeDocument || isTyping}
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                        className="w-full bg-slate-800 border border-slate-700 rounded-2xl py-4 pl-5 pr-14 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all disabled:opacity-50"
                      />
                      <button
                        disabled={!activeDocument || !inputText.trim() || isTyping}
                        onClick={handleSendMessage}
                        className="absolute right-2 top-2 bottom-2 w-10 bg-amber-500 text-slate-900 rounded-xl disabled:opacity-50 disabled:bg-slate-700 transition-all flex items-center justify-center shadow-lg active:scale-90"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Progress Dashboard Tab */
            <div className="flex-1 overflow-y-auto p-10 animate-in fade-in zoom-in-95 duration-300 scrollbar-hide">
              <div className="max-w-6xl mx-auto">
                <div className="flex items-center justify-between mb-10">
                  <div>
                    <h2 className="text-3xl font-bold text-white mb-2">Traveler's Log</h2>
                    <p className="text-slate-400">Your journey of knowledge across Teyvat.</p>
                  </div>
                  <div className="flex gap-4">
                    <div className="bg-slate-800/50 px-6 py-4 rounded-3xl border border-slate-700 flex flex-col items-center min-w-[120px]">
                       <span className="text-2xl font-black text-amber-400">{userProgress.documentsCompleted.length}</span>
                       <span className="text-[10px] text-slate-500 uppercase font-bold">Researched</span>
                    </div>
                    <div className="bg-slate-800/50 px-6 py-4 rounded-3xl border border-slate-700 flex flex-col items-center min-w-[120px]">
                       <span className="text-2xl font-black text-indigo-400">{Math.round(userProgress.averageScore)}%</span>
                       <span className="text-[10px] text-slate-500 uppercase font-bold">Mastery</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-8 mb-12">
                  <div className="col-span-2 genshin-glass rounded-3xl p-8 shadow-xl">
                     <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                       <TrendingUp className="w-5 h-5 text-amber-400" /> Recent Achievements
                     </h3>
                     <div className="grid grid-cols-2 gap-6">
                        {userProgress.badges.map(badge => (
                          <div key={badge.id} className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${badge.unlocked ? 'bg-amber-500/10 border-amber-500/30' : 'bg-slate-800/30 border-slate-700 opacity-50 grayscale'}`}>
                            <div className={`w-14 h-14 rounded-full flex items-center justify-center text-3xl shadow-lg ${badge.unlocked ? 'bg-amber-500 shadow-amber-500/20' : 'bg-slate-800'}`}>
                              {badge.icon}
                            </div>
                            <div>
                              <h4 className={`font-bold text-sm ${badge.unlocked ? 'text-amber-200' : 'text-slate-400'}`}>{badge.name}</h4>
                              <p className="text-[10px] text-slate-500 leading-tight">{badge.description}</p>
                            </div>
                          </div>
                        ))}
                     </div>
                  </div>

                  <div className="genshin-glass rounded-3xl p-8 shadow-xl flex flex-col items-center justify-center text-center">
                     <div className="w-32 h-32 rounded-full bg-gradient-to-tr from-amber-500 to-amber-300 p-1 mb-6 shadow-2xl shadow-amber-500/20">
                        <img src={selectedCharacter.avatar} className="w-full h-full rounded-full object-cover border-4 border-slate-900" />
                     </div>
                     <h3 className="text-lg font-bold text-white mb-1">Scholar Profile</h3>
                     <p className="text-sm text-slate-400 mb-6 italic">Current Mentor: {selectedCharacter.name}</p>
                     <div className="w-full space-y-3">
                        <div className="w-full bg-slate-800 rounded-full h-2">
                          <div className="bg-amber-500 h-2 rounded-full shadow-[0_0_10px_rgba(251,191,36,0.5)]" style={{ width: `${(userProgress.badges.filter(b=>b.unlocked).length / userProgress.badges.length) * 100}%` }}></div>
                        </div>
                        <p className="text-[10px] text-slate-500 font-bold uppercase">Badge Completion: {userProgress.badges.filter(b=>b.unlocked).length}/{userProgress.badges.length}</p>
                     </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* GLOBAL PLAYBACK CONTROLLER (Accessible from any tab when active) */}
      {isReading && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 genshin-glass px-8 py-5 rounded-3xl border-2 border-amber-500/50 flex items-center gap-8 shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-50 animate-in slide-in-from-bottom-12">
          <div className="flex gap-2 items-end h-10 w-16">
            {[1, 2, 3, 4, 5, 6, 7].map(i => (
              <div key={i} className="w-1.5 bg-amber-400 rounded-full animate-wave" style={{ height: `${Math.random() * 100}%`, animationDelay: `${i * 0.1}s` }}></div>
            ))}
          </div>
          
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full border-2 border-amber-400 overflow-hidden shadow-lg">
               <img src={selectedCharacter.avatar} alt="" className="w-full h-full object-cover" />
            </div>
            <div className="flex flex-col min-w-[120px]">
              <span className="text-[10px] text-amber-500 font-black uppercase tracking-widest">Resonating With</span>
              <span className="text-lg font-black text-white leading-tight">{selectedCharacter.name}</span>
            </div>
          </div>

          <div className="flex items-center gap-4 bg-slate-900/60 p-2 rounded-2xl border border-slate-700/50">
             <button 
                onClick={() => { stopAudio(); if (activeDocument) playTTS(activeDocument.content); }}
                className="p-3 text-slate-400 hover:text-amber-400 transition-all hover:bg-slate-800 rounded-xl"
                title="Restart"
             >
                <RotateCcw className="w-5 h-5" />
             </button>

             <button 
                onClick={() => playTTS("") /* logic handles stop/start toggle */}
                className="bg-amber-500 text-slate-900 w-12 h-12 rounded-xl flex items-center justify-center transition-all hover:bg-amber-400 active:scale-90 shadow-lg shadow-amber-500/20"
                title="Pause"
             >
                <Pause className="w-6 h-6 fill-current" />
             </button>

             <button 
                onClick={stopAudio} 
                className="p-3 text-slate-400 hover:text-red-400 transition-all hover:bg-slate-800 rounded-xl"
                title="Stop"
             >
                <Square className="w-5 h-5 fill-current" />
             </button>
          </div>

          <button 
            onClick={stopAudio} 
            className="bg-slate-800/80 text-slate-400 hover:text-white p-2 rounded-full border border-slate-700 transition-all ml-2"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>
      )}

      <style>{`
        @keyframes wave {
          0%, 100% { height: 20%; }
          50% { height: 100%; }
        }
        .animate-wave {
          animation: wave 0.8s ease-in-out infinite;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .genshin-glass {
          background: rgba(15, 23, 42, 0.85);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
      `}</style>
    </div>
  );
};

export default App;
