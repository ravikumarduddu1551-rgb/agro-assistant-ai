import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, addDoc, query, where, orderBy, getDocs, serverTimestamp, getDoc, doc, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function ChatInterface() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  
  const [chats, setChats] = useState([]);
  const [selectedChatId, setSelectedChatId] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // Destructure active chat context
  const activeChat = chats.find(c => c.id === selectedChatId);
  const messages = activeChat?.messages || [];

  const [input, setInput] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // Sync Chats to LocalStorage Automatically
  useEffect(() => {
    if (currentUser && chats.length > 0) {
       localStorage.setItem(`chats_user_${currentUser.uid}`, JSON.stringify(chats));
    }
  }, [chats, currentUser]);

  useEffect(() => {
    if (currentUser) {
      // 1. Try to load precisely from LocalStorage first for instant UI response and persistence
      let localChats = [];
      try {
         const saved = localStorage.getItem(`chats_user_${currentUser.uid}`);
         if (saved) localChats = JSON.parse(saved) || [];
      } catch (e) {
         console.warn("Local storage parse error", e);
      }
      
      if (localChats.length > 0) {
         setChats(localChats);
         // Ensure active chat state defaults correctly
         if (!selectedChatId) {
            handleNewChat(localChats);
         }
      } else {
         // 2. If nothing exists locally, fall back strictly to Firebase query
         loadUserChats();
      }
    }
  }, [currentUser]);

  useEffect(() => {
    if (messagesEndRef.current) {
      const container = messagesEndRef.current.parentElement?.parentElement;
      if (container) {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      }
    }
  }, [messages, loading]);

  const loadUserChats = async () => {
    try {
      const q = query(collection(db, "ChatsData"), where("userId", "==", currentUser.uid), orderBy("updatedAt", "desc"));
      const querySnapshot = await getDocs(q);
      const userChats = [];
      
      // Deduplicate on fetch to prevent DB anomalies
      const uniqueMap = new Map();
      querySnapshot.forEach((docSnap) => {
         if (!uniqueMap.has(docSnap.id)) {
             uniqueMap.set(docSnap.id, { id: docSnap.id, messages: [], ...docSnap.data() });
         }
      });
      userChats.push(...uniqueMap.values());
      
      setChats(userChats);
      
      // Initialize fresh chat logic securely
      handleNewChat(userChats);
      
    } catch (err) {
      console.error("Error loading chats:", err);
      if (chats.length === 0) handleNewChat();
    }
  };

  const selectChat = async (chatId) => {
    setSelectedChatId(chatId);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
    
    // Bypass fetching if already mapped locally to save bounds
    const targetChat = chats.find(c => c.id === chatId);
    if (targetChat && targetChat.messages && targetChat.messages.length > 0) return;
    
    try {
      // Firebase Composite Index Fix: Remove server-side orderBy to prevent silent failures 
      // if the user hasn't explicitly created a composite index via Firebase Console.
      const q = query(collection(db, "Messages"), where("chatId", "==", chatId));
      const querySnapshot = await getDocs(q);
      const msgs = [];
      querySnapshot.forEach((docSnap) => {
        msgs.push({ id: docSnap.id, ...docSnap.data() });
      });
      
      // Sort messages chronologically on the client side
      msgs.sort((a, b) => {
         const timeA = a.timestamp?.toMillis ? a.timestamp.toMillis() : 0;
         const timeB = b.timestamp?.toMillis ? b.timestamp.toMillis() : 0;
         return timeA - timeB;
      });
      
      // Inject fetched messages directly into specific chat in overarching state array
      setChats(prev => prev.map(c => c.id === chatId ? { ...c, messages: msgs } : c));
    } catch (err) {
      console.error("Error loading messages:", err);
    }
  };

  const handleNewChat = (existingChats = null) => {
    setChats(prev => {
        let base = (existingChats && Array.isArray(existingChats)) ? existingChats : prev;
        
        // Remove purely local duplicate 'New Conversation' entries to prevent clutter/StrictMode duplicated chats
        base = base.filter(c => !(String(c.id).startsWith("chat_") && c.title === "New Conversation"));

        const newId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        // eslint-disable-next-line
        setSelectedChatId(newId);
        if (window.innerWidth < 768) setIsSidebarOpen(false);
        
        return [{ id: newId, title: "New Conversation", userId: currentUser.uid, messages: [], updatedAt: new Date() }, ...base];
    });
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/auth');
    } catch {
      console.error('Failed to log out');
    }
  };

  const handleImageChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
  };

  const saveMessageToFirebase = async (msgObj, targetChatId) => {
    try {
      // Prevent Firestore 1MB document crash limit from huge base64 images causing silent failures
      const safeMsg = { ...msgObj };
      if (safeMsg.image && safeMsg.image.length > 500) {
          safeMsg.image = "[Image Preview Included]"; 
      }
      
      await addDoc(collection(db, "Messages"), {
        ...safeMsg,
        chatId: targetChatId,
        userId: currentUser.uid,
        timestamp: serverTimestamp()
      });
      
      // Smart Naming
      let chatTitle = chats.find(c => c.id === targetChatId)?.title;
      if (!chatTitle || chatTitle === "New Conversation") {
         chatTitle = msgObj.text ? msgObj.text.split(' ').slice(0, 5).join(' ') + "..." : "Image Upload Analysis";
         setChats(prev => prev.map(c => c.id === targetChatId ? { ...c, title: chatTitle } : c));
      }

      // Update chat root
      await setDoc(doc(db, "ChatsData", targetChatId), {
        title: chatTitle,
        userId: currentUser.uid,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (e) {
      console.warn("Could not save to Firebase (likely config/rules):", e);
    }
  };

  const handleDeleteChat = async (e, chatId) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this conversation?")) return;
    
    // Optimistic UI update
    const updatedChats = chats.filter(c => c.id !== chatId);
    setChats(updatedChats);
    if (selectedChatId === chatId) {
        handleNewChat(updatedChats);
    }

    try {
       await deleteDoc(doc(db, "ChatsData", chatId));
       const q = query(collection(db, "Messages"), where("chatId", "==", chatId));
       const messagesSnapshot = await getDocs(q);
       
       if (!messagesSnapshot.empty) {
          const batch = writeBatch(db);
          messagesSnapshot.forEach((d) => batch.delete(d.ref));
          await batch.commit();
       }
    } catch (err) {
       console.error("Failed to delete chat: ", err);
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm("Are you sure you want to permanently delete ALL chat history?")) return;
    
    const chatsToDelete = [...chats];
    setChats([]);
    
    // Explicitly wipe local storage to obey Clear command
    if (currentUser) {
        localStorage.removeItem(`chats_user_${currentUser.uid}`);
    }
    
    handleNewChat([]);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
    
    try {
       for (const c of chatsToDelete) {
          await deleteDoc(doc(db, "ChatsData", c.id));
          const q = query(collection(db, "Messages"), where("chatId", "==", c.id));
          const msn = await getDocs(q);
          if (!msn.empty) {
             const batch = writeBatch(db);
             msn.forEach((d) => batch.delete(d.ref));
             await batch.commit();
          }
       }
    } catch (err) {
       console.error("Failed to clear all chats: ", err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() && !imageFile) return;

    const currentId = selectedChatId; // capture closure context
    
    // 1. Send User Message
    const userMsg = { role: 'user', text: input, image: imagePreview || null, id: Date.now().toString() };
    
    // Add explicitly to overarching activeChat element directly
    setChats(prev => prev.map(c => c.id === currentId ? { ...c, messages: [...c.messages, userMsg] } : c));
    setInput('');
    removeImage();
    setLoading(true);
    
    // Fire and forget Firebase save
    saveMessageToFirebase(userMsg, currentId).catch(console.error);

    try {
      let botResponse = "";
      
      // If there's an image, hit the /api/upload endpoint
      if (userMsg.image) {
        // We use the imageFile object (file)
        
        botResponse = "Processing image..."; // To show something or wait
        const formData = new FormData();
        // Fallback for demo just text if file reset somehow
        formData.append("file", imageFile || new Blob(["fake"], { type: "image/jpeg" }));
        formData.append("user_id", currentUser.uid);
        
        try{
           const res = await axios.post(`${API_URL}/api/upload`, formData, {
            headers: { "Content-Type": "multipart/form-data" }
           });
           
           const prediction = res.data.prediction;
           botResponse = `**Crop Detected:** ${prediction.crop}\n**Disease:** ${prediction.disease} (${(prediction.confidence * 100).toFixed(1)}% confidence)\n\n**Symptoms:** ${prediction.symptoms}\n\n**Cure Method:** ${prediction.cure}\n\n**Prevention Tips:** ${prediction.prevention}`;
        }
        catch(err) {
             console.error(err);
             botResponse = "Error connecting to AI Backend. Ensure the FastAPI server is running on localhost:8000.";
        }
      } else {
        // Just text chat
        try{
           const res = await axios.post(`${API_URL}/api/chat`, {
             message: userMsg.text,
             user_id: currentUser.uid
           });
           botResponse = res.data.response;
        } catch(err) {
           console.error(err);
           botResponse = "Error connecting to AI Backend. Ensure the FastAPI server is running on localhost:8000.";
        }
      }

      const botMsg = { role: 'bot', text: botResponse, id: (Date.now() + 1).toString() };
      setChats(prev => prev.map(c => c.id === currentId ? { ...c, messages: [...c.messages, botMsg] } : c));
      saveMessageToFirebase(botMsg, currentId).catch(console.error);
      
    } catch (err) {
      console.error("General error:", err);
    }
    setLoading(false);
  };

  // Deduplicate before render safely
  const uniqueChatsToRender = chats.filter((c, index, self) => 
    index === self.findIndex((t) => t.id === c.id)
  );

  return (
    <div className="h-[100dvh] w-full liquid-bg flex overflow-hidden relative">
      
      {/* Mobile Backdrop Overlay */}
      {isSidebarOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity"
          onClick={() => setIsSidebarOpen(false)}
        ></div>
      )}

      {/* Sidebar - Floating Drawer */}
      <div className={`fixed md:relative inset-y-0 left-0 z-50 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 transition-transform duration-300 w-[280px] h-full flex flex-col bg-[#0A1118]/95 backdrop-blur-3xl border-r border-white/10 shadow-[10px_0_30px_rgba(0,0,0,0.5)]`}>
        <div className="absolute inset-0 bg-agri-bg/40 pointer-events-none -z-10"></div>
        <div className="p-5 border-b border-white/10 relative flex items-center gap-2">
          <button onClick={() => handleNewChat()} className="flex-grow py-3 bg-gradient-to-r from-agri-light to-emerald-400 hover:from-emerald-400 hover:to-agri-light text-black rounded-xl transition-all shadow-[0_0_15px_rgba(0,220,130,0.3)] hover:shadow-[0_0_25px_rgba(0,220,130,0.5)] font-bold flex items-center justify-center gap-2 text-sm transform hover:-translate-y-0.5">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            New Chat
          </button>
          
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-3 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        
        <div className="flex-grow overflow-y-auto px-4 py-4 space-y-2">
          <div className="text-white/40 text-xs font-bold uppercase tracking-wider mb-3 px-2">Recent History</div>
          {uniqueChatsToRender.map(c => (
             <div 
                key={c.id} 
                onClick={() => selectChat(c.id)}
                className={`group flex items-center justify-between p-3.5 rounded-xl cursor-pointer transition-all ${selectedChatId === c.id ? 'bg-white/10 border border-agri-light/50 shadow-[0_0_15px_rgba(0,220,130,0.15)] text-agri-light' : 'hover:bg-white/5 text-white/70 border border-transparent'}`}
             >
               <h3 className="font-medium truncate text-sm flex-grow mr-2 select-none" title={c.title || 'Conversation'}>{c.title || 'Wait...'}</h3>
               <button 
                  onClick={(e) => handleDeleteChat(e, c.id)}
                  className="opacity-0 lg:group-hover:opacity-100 p-1.5 text-red-400 hover:bg-red-500/20 hover:text-red-300 rounded-md transition-all lg:translate-x-2 lg:group-hover:translate-x-0"
                  title="Delete Chat"
               >
                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 md:w-4 md:h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
               </button>
             </div>
          ))}
          {uniqueChatsToRender.length === 0 && <div className="text-white/30 text-xs text-center mt-12 py-8 bg-white/5 rounded-xl border border-white/5 border-dashed">No conversation history</div>}
        </div>
        
        {uniqueChatsToRender.length > 0 && (
          <div className="px-5 py-3 border-t border-white/5">
             <button onClick={handleClearAll} className="w-full py-2.5 text-xs font-semibold text-white/40 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors flex items-center justify-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                Clear All 
             </button>
          </div>
        )}

        <div className="p-5 border-t border-white/10 mt-auto bg-black/20 backdrop-blur-3xl">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-full bg-agri-dark border border-agri-light/50 flex items-center justify-center text-agri-light font-bold shadow-[0_0_10px_rgba(0,220,130,0.2)]">
              {currentUser?.email?.charAt(0).toUpperCase()}
            </div>
            <div className="overflow-hidden">
              <div className="text-white text-sm font-bold truncate">{currentUser?.displayName || 'User'}</div>
              <div className="text-white/50 text-xs truncate">{currentUser?.email}</div>
            </div>
          </div>
          <button 
             onClick={handleLogout}
             className="w-full py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg transition-colors text-sm font-semibold"
          >
            Log Out
          </button>
        </div>
      </div>
      
      {/* Main Chat Area */}
      <div className="flex-grow h-full flex flex-col relative bg-agri-bg/30 backdrop-blur-sm overflow-hidden">
         {/* Mobile Header */}
         <div className="md:hidden flex items-center justify-between p-4 bg-black/40 backdrop-blur-xl border-b border-white/10 z-20 shadow-md">
           <div className="flex items-center gap-3">
             <button onClick={() => setIsSidebarOpen(true)} className="p-2 -ml-2 text-white/80 hover:text-white rounded-lg hover:bg-white/10 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" /></svg>
             </button>
             <h1 className="text-lg font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-agri-light to-white">AgroAssistant</h1>
           </div>
           <button onClick={handleLogout} className="text-white/60 hover:text-white text-sm font-semibold">Log out</button>
         </div>

         {/* Chat Messages */}
         <div className="flex-grow overflow-y-auto p-4 sm:p-6">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-2xl mx-auto space-y-8">
                 <div className="w-28 h-28 rounded-full bg-black/50 border border-agri-light/50 flex items-center justify-center p-6 shadow-[0_0_50px_rgba(0,220,130,0.15)] relative">
                    <div className="absolute inset-0 rounded-full border border-agri-light animate-[spin_10s_linear_infinite] opacity-30"></div>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="#00DC82" className="w-full h-full relative z-10">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
                    </svg>
                 </div>
                 <div>
                   <h2 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-white/60 drop-shadow-md mb-4">AgroAssistant</h2>
                   <p className="text-white/60 text-lg max-w-md mx-auto leading-relaxed">System Online. Upload a crop image for deep scan or query the agricultural database.</p>
                 </div>
              </div>
            ) : (
              <div className="max-w-4xl mx-auto space-y-8">
                {messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] sm:max-w-[75%] rounded-3xl p-5 shadow-2xl ${
                      msg.role === 'user' 
                        ? 'bg-gradient-to-br from-agri-dark to-agri-mid text-white rounded-br-sm border border-agri-light/30 shadow-[0_5px_20px_rgba(0,220,130,0.1)]' 
                        : 'bg-[#101920]/80 backdrop-blur-md text-white/90 rounded-bl-sm border border-white/10'
                    }`}>
                      {msg.image && (
                         <div className="mb-4 rounded-xl overflow-hidden border border-white/10 shadow-inner">
                           <img src={msg.image} alt="Uploaded Crop" className="w-64 h-auto object-cover max-h-80" />
                         </div>
                      )}
                      
                      {msg.role === 'bot' ? (
                        <div className="prose prose-invert prose-sm sm:prose-base max-w-none leading-relaxed">
                          {msg.text.split('\n').map((line, idx) => (
                             <p key={idx} className="my-1.5 whitespace-pre-wrap">
                               {line.includes('**') ? (
                                  <span dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.*?)\*\*/g, '<strong class="text-agri-light font-bold">$1</strong>') }} />
                               ) : line}
                             </p>
                          ))}
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                      )}
                    </div>
                  </div>
                ))}
                
                {loading && (
                   <div className="flex justify-start">
                      <div className="bg-[#101920]/80 backdrop-blur-md text-agri-light p-5 rounded-3xl rounded-bl-sm border border-agri-light/20 flex gap-2.5 items-center shadow-[0_5px_15px_rgba(0,220,130,0.05)]">
                         <div className="w-2.5 h-2.5 rounded-full bg-agri-light animate-bounce shadow-[0_0_8px_rgba(0,220,130,0.8)]" style={{ animationDelay: '0ms' }} />
                         <div className="w-2.5 h-2.5 rounded-full bg-agri-light animate-bounce shadow-[0_0_8px_rgba(0,220,130,0.8)]" style={{ animationDelay: '150ms' }} />
                         <div className="w-2.5 h-2.5 rounded-full bg-agri-light animate-bounce shadow-[0_0_8px_rgba(0,220,130,0.8)]" style={{ animationDelay: '300ms' }} />
                         <span className="text-sm font-medium ml-3 tracking-wide text-agri-light/80">Processing Data...</span>
                      </div>
                   </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
         </div>
         
         {/* Fixed Input Area - Removed pointer-events-none completely */}
         <div className="w-full shrink-0 p-4 sm:p-6 bg-[#040A0F]/60 backdrop-blur-xl border-t border-white/5 z-30">
            <div className="max-w-4xl mx-auto shadow-[0_0_40px_rgba(0,0,0,0.5)] rounded-2xl overflow-hidden bg-[#0A1118]/80 backdrop-blur-2xl border border-white/10 relative z-30 transition-all focus-within:border-agri-light/50 focus-within:shadow-[0_0_30px_rgba(0,220,130,0.15)]">
              
              {imagePreview && (
                 <div className="p-3 bg-black/40 border-b border-white/5 relative flex items-center gap-4">
                    <img src={imagePreview} className="w-12 h-12 object-cover rounded-lg border border-white/20" alt="Preview" />
                    <span className="text-white/80 text-sm font-medium truncate">{imageFile?.name}</span>
                    <button onClick={removeImage} className="ml-auto w-8 h-8 flex items-center justify-center bg-red-500/20 hover:bg-red-500/40 text-red-200 rounded-full transition-colors cursor-pointer">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                 </div>
              )}
              
              <form onSubmit={handleSubmit} className="flex items-center gap-2 relative p-2">
                <input 
                  type="file" 
                  accept="image/*" 
                  id="imageUpload" 
                  className="hidden" 
                  onChange={handleImageChange}
                />
                
                <button 
                   type="button" 
                   onClick={() => document.getElementById('imageUpload').click()}
                   className={`p-3 w-12 h-12 flex items-center justify-center bg-transparent rounded-xl transition-colors cursor-pointer ${imageFile ? "text-agri-light bg-agri-light/10" : "text-white/50 hover:bg-white/5 hover:text-white"}`}
                >
                   <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.846 7.846a1.5 1.5 0 0 0 2.121 2.121l7.846-7.846a1.5 1.5 0 0 0-2.121-2.121Z" /></svg>
                </button>
                
                <input 
                  type="text" 
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask a question or upload an image..."
                  className="flex-grow px-3 py-3 bg-transparent text-white placeholder-white/40 font-medium focus:outline-none focus:ring-0 text-base"
                />
                
                <button 
                   type="submit" 
                   disabled={loading || (!input.trim() && !imageFile)}
                   className="w-12 h-12 flex items-center justify-center bg-gradient-to-br from-agri-light to-emerald-500 hover:from-emerald-400 hover:to-agri-light disabled:from-white/10 disabled:to-white/5 text-black disabled:text-white/30 rounded-xl font-bold transition-all shadow-[0_0_15px_rgba(0,220,130,0.4)] disabled:shadow-none hover:scale-105 active:scale-95 cursor-pointer"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5 ml-0.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" /></svg>
                </button>
              </form>
            </div>
         </div>
         
      </div>
    </div>
  );
}
