'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Mic, 
  MicOff, 
  Send, 
  Volume2, 
  VolumeX, 
  Settings, 
  Trash2, 
  Sparkles,
  User,
  Bot,
  ChevronDown,
  Loader2,
  X,
  ExternalLink,
  Globe,
  Smartphone,
  Share2,
  Copy,
  Check,
  History,
  Plus,
  MessageSquare,
  MoreVertical
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { QRCodeSVG } from 'qrcode.react';
import { ai, MODELS } from '@/lib/gemini';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  lastUpdated: number;
}

export default function Assistant() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [showMobileModal, setShowMobileModal] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [appUrl, setAppUrl] = useState('');

  // Load sessions from localStorage on mount
  useEffect(() => {
    const savedSessions = localStorage.getItem('inova_sessions');
    if (savedSessions) {
      try {
        const parsed = JSON.parse(savedSessions);
        setSessions(parsed);
        if (parsed.length > 0) {
          // Don't auto-load the last one, start fresh or let user pick
          // Actually, let's auto-load the most recent one if it exists
          const mostRecent = parsed.sort((a: ChatSession, b: ChatSession) => b.lastUpdated - a.lastUpdated)[0];
          setCurrentSessionId(mostRecent.id);
          setMessages(mostRecent.messages);
        }
      } catch (e) {
        console.error('Failed to parse saved sessions', e);
      }
    }
    
    if (typeof window !== 'undefined') {
      setAppUrl(window.location.href);
    }
  }, []);

  // Save sessions to localStorage whenever they change
  useEffect(() => {
    if (sessions.length > 0) {
      localStorage.setItem('inova_sessions', JSON.stringify(sessions));
    }
  }, [sessions]);

  // Update current session when messages change
  useEffect(() => {
    if (currentSessionId && messages.length > 0) {
      setSessions(prev => prev.map(session => {
        if (session.id === currentSessionId) {
          // Update title based on first message if it's still "New Chat"
          let title = session.title;
          if (title === 'New Chat' && messages.length > 0) {
            title = messages[0].content.slice(0, 30) + (messages[0].content.length > 30 ? '...' : '');
          }
          return {
            ...session,
            messages,
            title,
            lastUpdated: Date.now()
          };
        }
        return session;
      }));
    }
  }, [messages, currentSessionId]);

  const createNewChat = () => {
    const newSession: ChatSession = {
      id: Date.now().toString(),
      title: 'New Chat',
      messages: [],
      lastUpdated: Date.now()
    };
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    setMessages([]);
    setShowHistory(false);
    window.speechSynthesis.cancel();
  };

  const loadSession = (id: string) => {
    const session = sessions.find(s => s.id === id);
    if (session) {
      setCurrentSessionId(session.id);
      setMessages(session.messages);
      setShowHistory(false);
      window.speechSynthesis.cancel();
    }
  };

  const deleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSessions(prev => prev.filter(s => s.id !== id));
    if (currentSessionId === id) {
      setMessages([]);
      setCurrentSessionId(null);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(appUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const synthesisRef = useRef<SpeechSynthesisUtterance | null>(null);

  const speak = useCallback((text: string) => {
    if (!speechEnabled || typeof window === 'undefined') return;

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    
    // Cute voice settings
    utterance.pitch = 1.4; // Higher pitch for cuteness
    utterance.rate = 1.1;  // Slightly faster
    
    // Pick a nice voice if available
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => v.name.includes('Google') || v.name.includes('Female') || v.name.includes('Samantha')) || voices[0];
    if (preferredVoice) utterance.voice = preferredVoice;

    synthesisRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [speechEnabled]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      setError(null);
      recognitionRef.current?.start();
      setIsListening(true);
    }
  }, [isListening]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isGenerating]);

  const handleSend = useCallback(async (text: string = input) => {
    if (!text.trim() || isGenerating) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    
    // Check for "open [site]" commands
    const openMatch = text.toLowerCase().match(/^open\s+(facebook|google|instagram|youtube|free\s*fire)$/i);
    if (openMatch) {
      const site = openMatch[1].toLowerCase().replace(/\s+/g, '');
      const urls: Record<string, string> = {
        facebook: 'https://www.facebook.com',
        google: 'https://www.google.com',
        instagram: 'https://www.instagram.com',
        youtube: 'https://www.youtube.com',
        freefire: 'https://ff.garena.com'
      };
      if (urls[site]) {
        setActiveUrl(urls[site]);
        setInput('');
        return;
      }
    }

    // If no session exists, create one
    let sessionId = currentSessionId;
    if (!sessionId) {
      const newSession: ChatSession = {
        id: Date.now().toString(),
        title: text.slice(0, 30) + (text.length > 30 ? '...' : ''),
        messages: [userMessage],
        lastUpdated: Date.now()
      };
      setSessions(prev => [newSession, ...prev]);
      setCurrentSessionId(newSession.id);
      sessionId = newSession.id;
    }

    setInput('');
    setIsGenerating(true);
    setError(null);

    try {
      const chat = ai.chats.create({
        model: MODELS.flash,
        config: {
          systemInstruction: "You are Inova, an incredibly cute, helpful, and friendly AI assistant. Use a playful tone, include relevant emojis (like ✨, 🌸, 🎀, 🐾), and keep your responses concise and conversational. Your goal is to be the most adorable and helpful assistant ever! Suitable for voice interaction. You can open websites directly for the user if they ask (e.g., 'Open Facebook', 'Go to Google').",
        },
        history: messages.map(m => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.content }]
        }))
      });

      const result = await chat.sendMessageStream({ message: text });
      
      let assistantContent = '';
      const assistantMessageId = (Date.now() + 1).toString();
      
      setMessages(prev => [...prev, {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      }]);

      for await (const chunk of result) {
        const chunkText = chunk.text;
        assistantContent += chunkText;
        
        setMessages(prev => prev.map(m => 
          m.id === assistantMessageId ? { ...m, content: assistantContent } : m
        ));
      }

      if (speechEnabled) {
        speak(assistantContent);
      }
    } catch (err: any) {
      console.error('Gemini API Error:', err);
      setError(err.message || 'Failed to get response from AI');
    } finally {
      setIsGenerating(false);
    }
  }, [input, isGenerating, messages, speechEnabled, speak, currentSessionId]);

  // Initialize Speech Recognition
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = false;
        recognitionRef.current.lang = 'en-US';

        recognitionRef.current.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          setInput(transcript);
          handleSend(transcript);
          setIsListening(false);
        };

        recognitionRef.current.onerror = (event: any) => {
          console.error('Speech recognition error', event.error);
          setIsListening(false);
          setError(`Speech recognition error: ${event.error}`);
        };

        recognitionRef.current.onend = () => {
          setIsListening(false);
        };
      }
    }
  }, [handleSend]);

  const clearChat = () => {
    if (currentSessionId) {
      setSessions(prev => prev.map(s => s.id === currentSessionId ? { ...s, messages: [], lastUpdated: Date.now() } : s));
    }
    setMessages([]);
    setError(null);
    window.speechSynthesis.cancel();
  };

  return (
    <div className="flex h-screen bg-[#0A0A0A] text-white font-sans selection:bg-white/20 overflow-hidden">
      {/* Sidebar - History */}
      <AnimatePresence>
        {showHistory && (
          <motion.aside
            initial={{ x: -300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -300, opacity: 0 }}
            className="w-72 border-r border-white/10 bg-[#0F0F0F] flex flex-col z-30 absolute md:relative h-full shadow-2xl"
          >
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <h2 className="font-bold tracking-tight text-sm uppercase text-white/40">History</h2>
              <button 
                onClick={() => setShowHistory(false)}
                className="md:hidden p-1 hover:bg-white/5 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-4">
              <button 
                onClick={createNewChat}
                className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 transition-all flex items-center justify-center gap-2 font-semibold text-sm shadow-lg shadow-blue-500/20"
              >
                <Plus className="w-4 h-4" />
                New Chat
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-2 space-y-1">
              {sessions.length === 0 ? (
                <div className="p-8 text-center space-y-2">
                  <MessageSquare className="w-8 h-8 text-white/10 mx-auto" />
                  <p className="text-xs text-white/20">No previous chats yet</p>
                </div>
              ) : (
                sessions.sort((a, b) => b.lastUpdated - a.lastUpdated).map((session) => (
                  <button
                    key={session.id}
                    onClick={() => loadSession(session.id)}
                    className={cn(
                      "w-full p-3 rounded-xl flex items-center gap-3 transition-all group text-left",
                      currentSessionId === session.id 
                        ? "bg-white/10 border border-white/10" 
                        : "hover:bg-white/5 border border-transparent"
                    )}
                  >
                    <MessageSquare className={cn(
                      "w-4 h-4 flex-shrink-0",
                      currentSessionId === session.id ? "text-blue-400" : "text-white/20"
                    )} />
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        "text-sm truncate font-medium",
                        currentSessionId === session.id ? "text-white" : "text-white/60"
                      )}>
                        {session.title}
                      </p>
                      <p className="text-[10px] text-white/20 mt-0.5">
                        {new Date(session.lastUpdated).toLocaleDateString()}
                      </p>
                    </div>
                    <button 
                      onClick={(e) => deleteSession(e, session.id)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/20 hover:text-red-400 rounded-lg transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </button>
                ))
              )}
            </div>
            
            <div className="p-4 border-t border-white/10">
              <div className="flex items-center gap-3 px-2">
                <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center">
                  <User className="w-4 h-4 text-white/40" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white/60 truncate">Guest User</p>
                  <p className="text-[10px] text-white/20 truncate">Local Session</p>
                </div>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col relative min-w-0">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#0A0A0A]/80 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Inova</h1>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px] uppercase tracking-widest text-white/40 font-medium">Online</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowHistory(!showHistory)}
            className={cn(
              "p-2 rounded-full transition-colors",
              showHistory ? "bg-blue-600 text-white" : "bg-white/5 text-white/60 hover:text-white"
            )}
            title="Chat History"
          >
            <History className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setShowMobileModal(true)}
            className="p-2 rounded-full hover:bg-white/5 text-white/60 hover:text-white transition-colors"
            title="Mobile Access"
          >
            <Smartphone className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setSpeechEnabled(!speechEnabled)}
            className={cn(
              "p-2 rounded-full transition-all duration-300",
              speechEnabled ? "bg-white/5 text-white" : "bg-red-500/10 text-red-400"
            )}
            title={speechEnabled ? "Mute Voice" : "Unmute Voice"}
          >
            {speechEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>
          <button 
            onClick={clearChat}
            className="p-2 rounded-full hover:bg-white/5 text-white/60 hover:text-white transition-colors"
            title="Clear Chat"
          >
            <Trash2 className="w-5 h-5" />
          </button>
          <button className="p-2 rounded-full hover:bg-white/5 text-white/60 hover:text-white transition-colors">
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Messages Area */}
      <main 
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-8 space-y-8 scroll-smooth"
      >
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-md space-y-6"
            >
              <div className="w-20 h-20 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-8">
                <Sparkles className="w-10 h-10 text-blue-400" />
              </div>
              <h2 className="text-3xl font-bold tracking-tight">How can I help you today?</h2>
              <p className="text-white/50 text-lg leading-relaxed">
                I&apos;m Inova, your personal AI assistant. You can chat with me or use your voice to ask questions.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4">
                {[
                  { label: "Facebook", url: "https://www.facebook.com" },
                  { label: "Google", url: "https://www.google.com" },
                  { label: "Instagram", url: "https://www.instagram.com" },
                  { label: "YouTube", url: "https://www.youtube.com" },
                  { label: "Free Fire", url: "https://ff.garena.com" }
                ].map((app) => (
                  <button
                    key={app.label}
                    onClick={() => setActiveUrl(app.url)}
                    className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all text-sm text-left font-medium flex items-center justify-between group"
                  >
                    <span>Open {app.label}</span>
                    <ExternalLink className="w-4 h-4 text-white/20 group-hover:text-blue-400 transition-colors" />
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                {[
                  "Tell me a joke",
                  "What's the weather?"
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => handleSend(suggestion)}
                    className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all text-sm text-left font-medium"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}

        <AnimatePresence mode="popLayout">
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className={cn(
                "flex gap-4 max-w-3xl mx-auto",
                message.role === 'user' ? "flex-row-reverse" : "flex-row"
              )}
            >
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1",
                message.role === 'user' ? "bg-white/10" : "bg-blue-600"
              )}>
                {message.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>
              <div className={cn(
                "flex flex-col gap-1",
                message.role === 'user' ? "items-end" : "items-start"
              )}>
                <div className={cn(
                  "px-4 py-3 rounded-2xl text-[15px] leading-relaxed",
                  message.role === 'user' 
                    ? "bg-white/10 text-white rounded-tr-none" 
                    : "bg-[#1A1A1A] text-white/90 border border-white/5 rounded-tl-none"
                )}>
                  <div className="prose prose-invert prose-sm max-w-none">
                    <ReactMarkdown
                      components={{
                        a: ({ node, ...props }) => (
                          <button
                            onClick={() => setActiveUrl(props.href || null)}
                            className="text-blue-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                          >
                            {props.children}
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        ),
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </div>
                </div>
                <span className="text-[10px] text-white/30 uppercase tracking-widest font-medium px-1">
                  {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {isGenerating && (
          <div className="flex gap-4 max-w-3xl mx-auto">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 animate-pulse">
              <Bot className="w-4 h-4" />
            </div>
            <div className="flex items-center gap-1.5 px-4 py-3 bg-[#1A1A1A] rounded-2xl rounded-tl-none border border-white/5">
              <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
              <span className="text-sm text-white/40">Inova is thinking...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="max-w-3xl mx-auto px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
            {error}
          </div>
        )}
      </main>

      {/* Input Area */}
      <footer className="p-6 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A] to-transparent">
        <div className="max-w-3xl mx-auto relative">
          <div className="relative flex items-end gap-3 bg-[#1A1A1A] border border-white/10 rounded-2xl p-2 focus-within:border-blue-500/50 transition-all shadow-2xl">
            <button
              onClick={toggleListening}
              className={cn(
                "p-3 rounded-xl transition-all duration-300 relative overflow-hidden group",
                isListening ? "bg-red-500 text-white" : "bg-white/5 text-white/60 hover:text-white"
              )}
            >
              {isListening ? (
                <>
                  <MicOff className="w-6 h-6 relative z-10" />
                  <motion.div 
                    animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                    className="absolute inset-0 bg-white/20 rounded-full"
                  />
                </>
              ) : (
                <Mic className="w-6 h-6" />
              )}
            </button>
            
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={isListening ? "Listening..." : "Ask Inova anything..."}
              className="flex-1 bg-transparent border-none focus:ring-0 text-white placeholder:text-white/20 py-3 px-2 resize-none max-h-32 min-h-[48px]"
              rows={1}
            />

            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || isGenerating}
              className={cn(
                "p-3 rounded-xl transition-all",
                input.trim() && !isGenerating 
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20" 
                  : "bg-white/5 text-white/20 cursor-not-allowed"
              )}
            >
              <Send className="w-6 h-6" />
            </button>
          </div>
          
          <div className="mt-4 flex items-center justify-between px-2">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <div className={cn(
                  "w-2 h-2 rounded-full transition-colors",
                  isSpeaking ? "bg-blue-500 animate-pulse" : "bg-white/10"
                )} />
                <span className="text-[10px] uppercase tracking-widest text-white/30 font-bold">Voice Output</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className={cn(
                  "w-2 h-2 rounded-full transition-colors",
                  isListening ? "bg-red-500 animate-pulse" : "bg-white/10"
                )} />
                <span className="text-[10px] uppercase tracking-widest text-white/30 font-bold">Mic Active</span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="text-[10px] text-white/40 font-bold tracking-wider uppercase">Developed by Deep Mahanta</span>
            </div>
          </div>
        </div>
      </footer>

      {/* Visualizer overlay when speaking/listening */}
      <AnimatePresence>
        {(isListening || isSpeaking) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 pointer-events-none z-0 overflow-hidden"
          >
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-64 flex items-end justify-center gap-1 px-12 opacity-20">
              {Array.from({ length: 40 }).map((_, i) => (
                <motion.div
                  key={i}
                  animate={{ 
                    height: [20, Math.random() * 100 + 20, 20],
                  }}
                  transition={{ 
                    repeat: Infinity, 
                    duration: 0.5 + Math.random(),
                    ease: "easeInOut"
                  }}
                  className={cn(
                    "w-1 rounded-full",
                    isListening ? "bg-red-500" : "bg-blue-500"
                  )}
                />
              ))}
            </div>
            <div className={cn(
              "absolute inset-0 bg-radial from-transparent via-transparent transition-colors duration-1000",
              isListening ? "to-red-500/5" : isSpeaking ? "to-blue-500/5" : "to-transparent"
            )} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* In-App Browser Modal */}
      <AnimatePresence>
        {activeUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col bg-black"
          >
            <header className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#0A0A0A]">
              <div className="flex items-center gap-3 overflow-hidden">
                <Globe className="w-5 h-5 text-blue-400 flex-shrink-0" />
                <span className="text-sm font-medium text-white/60 truncate">{activeUrl}</span>
              </div>
              <div className="flex items-center gap-2">
                <a 
                  href={activeUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="p-2 rounded-full hover:bg-white/5 text-white/60 hover:text-white transition-colors"
                  title="Open in new tab"
                >
                  <ExternalLink className="w-5 h-5" />
                </a>
                <button 
                  onClick={() => setActiveUrl(null)}
                  className="p-2 rounded-full hover:bg-white/5 text-white/60 hover:text-white transition-colors"
                  title="Close"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </header>
            <div className="flex-1 bg-white relative">
              <iframe 
                src={activeUrl} 
                className="w-full h-full border-none"
                title="In-App Browser"
                sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
              />
              {/* Note: Some sites might block iframe loading via X-Frame-Options */}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Access Modal */}
      <AnimatePresence>
        {showMobileModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm"
            onClick={() => setShowMobileModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-[#1A1A1A] border border-white/10 rounded-3xl p-8 max-w-sm w-full shadow-2xl space-y-8 text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="space-y-2">
                <h3 className="text-2xl font-bold tracking-tight">Mobile Access</h3>
                <p className="text-white/40 text-sm">Scan this code to open Inova on your phone! 🐾✨</p>
              </div>

              <div className="bg-white p-4 rounded-2xl inline-block mx-auto shadow-lg shadow-blue-500/10">
                <QRCodeSVG value={appUrl} size={200} level="H" />
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2 bg-black/40 border border-white/5 rounded-xl p-3">
                  <span className="text-xs text-white/40 truncate flex-1 text-left">{appUrl}</span>
                  <button 
                    onClick={copyToClipboard}
                    className="p-2 rounded-lg hover:bg-white/5 text-blue-400 transition-colors"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                
                <button 
                  onClick={() => setShowMobileModal(false)}
                  className="w-full py-4 rounded-2xl bg-white/5 hover:bg-white/10 text-white font-semibold transition-all border border-white/10"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}
