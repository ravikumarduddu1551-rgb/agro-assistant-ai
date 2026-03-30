import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, addDoc, query, where, orderBy, getDocs, serverTimestamp, getDoc, doc, setDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function ChatInterface() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  
  const [chats, setChats] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  
  const [input, setInput] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (currentUser) {
      loadUserChats();
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
    if (!currentUser) return;
    try {
      // Query only by userId to avoid needing a complex composite index
      const q = query(
        collection(db, "ChatsData"), 
        where("userId", "==", currentUser.uid)
      );
      
      const querySnapshot = await getDocs(q);
      const userChats = [];
      querySnapshot.forEach((docSnap) => {
        userChats.push({ id: docSnap.id, ...docSnap.data() });
      });
      
      // Sort locally by updatedAt (descending)
      userChats.sort((a, b) => {
        const timeA = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : (a.updatedAt || 0);
        const timeB = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : (b.updatedAt || 0);
        return timeB - timeA;
      });

      setChats(userChats);
      
      // User specifically wants to start with a fresh conversation on login,
      // but we must pass userChats to ensure the history isn't wiped out by a race condition
      handleNewChat(userChats);
      
    } catch (err) {
      console.error("Error loading chats:", err);
      // Fallback: If query fails (indexing), still start fresh
      handleNewChat();
    }
  };

  const selectChat = async (chatId) => {
    if (!chatId) return;
    setCurrentChatId(chatId);
    setMessages([]); // Clear current view
    
    try {
      // Query by chatId and ensure we only get messages for the current user
      const q = query(
        collection(db, "Messages"), 
        where("chatId", "==", chatId),
        where("userId", "==", currentUser.uid)
      );
      
      const querySnapshot = await getDocs(q);
      const msgs = [];
      querySnapshot.forEach((docSnap) => {
        msgs.push({ id: docSnap.id, ...docSnap.data() });
      });
      
      // Sort messages locally by timestamp to avoid needing a Firestore composite index
      const sortedMsgs = msgs.sort((a, b) => {
        const timeA = a.timestamp?.toMillis ? a.timestamp.toMillis() : (a.timestamp || 0);
        const timeB = b.timestamp?.toMillis ? b.timestamp.toMillis() : (b.timestamp || 0);
        return timeA - timeB;
      });
      
      setMessages(sortedMsgs);
    } catch (err) {
      console.error("Error loading messages:", err);
      // Helpful alert for the user
      if (err.message.includes("index")) {
        console.warn("Firestore needs an index. For now, I have bypassed this with local sorting.");
      }
    }
  };

  const handleNewChat = (initialChats = null) => {
    const newId = `chat_${Date.now()}`;
    setCurrentChatId(newId);
    setMessages([]);
    
    setChats(prev => {
      const baseChats = initialChats || prev;
      // Don't add a duplicate "New Conversation" if we already have one at the top
      if (baseChats.length > 0 && baseChats[0].title === "New Conversation" && !messages.length) {
        return baseChats;
      }
      return [{ id: newId, title: "New Conversation", userId: currentUser.uid, updatedAt: new Date() }, ...baseChats];
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

  const saveMessageToFirebase = async (msgObj, isFirstMessage = false) => {
    try {
      await addDoc(collection(db, "Messages"), {
        ...msgObj,
        chatId: currentChatId,
        userId: currentUser.uid,
        timestamp: serverTimestamp()
      });
      
      // Update chat root (updatedAt and initial title if not already set)
      await setDoc(doc(db, "ChatsData", currentChatId), {
        userId: currentUser.uid,
        updatedAt: serverTimestamp(),
        ...(isFirstMessage && { title: msgObj.text?.substring(0, 30) || "New Conversation" })
      }, { merge: true });
    } catch (e) {
      console.warn("Could not save to Firebase (likely config/rules):", e);
    }
  };

  const updateChatTitle = async (chatId, newTitle) => {
    try {
      await setDoc(doc(db, "ChatsData", chatId), {
        title: newTitle,
        updatedAt: serverTimestamp()
      }, { merge: true });

      // Update local state for immediate sidebar change
      setChats(prev => prev.map(chat => 
        chat.id === chatId ? { ...chat, title: newTitle } : chat
      ));
    } catch (err) {
      console.error("Error updating title:", err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() && !imageFile) return;

    // 1. Send User Message
    const userMsg = { role: 'user', text: input, image: imagePreview || null };
    const isFirstMsg = messages.length === 0;

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    removeImage();
    setLoading(true);
    
    // Fire and forget Firebase save
    saveMessageToFirebase(userMsg, isFirstMsg).catch(console.error);

    try {
      let botResponse = "";
      
      // Generate AI Title for first message in background
      if (isFirstMsg && input.trim()) {
        const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
        axios.post(`${apiBaseUrl}/api/generate_title`, { message: input })
          .then(res => updateChatTitle(currentChatId, res.data.title))
          .catch(err => console.error("Title generation failed", err));
      }
      
      // If there's an image, hit the /api/upload endpoint
      if (userMsg.image) {
        // We use the imageFile object (file)
        
        botResponse = "Processing image..."; // To show something or wait
        const formData = new FormData();
        // Fallback for demo just text if file reset somehow
        formData.append("file", imageFile || new Blob(["fake"], { type: "image/jpeg" }));
        formData.append("user_id", currentUser.uid);
        
        try{
           const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
           const res = await axios.post(`${apiBaseUrl}/api/upload`, formData, {
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
           const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
           const res = await axios.post(`${apiBaseUrl}/api/chat`, {
             message: userMsg.text,
             user_id: currentUser.uid
           });
           botResponse = res.data.response;
        } catch(err) {
           console.error(err);
           botResponse = "Error connecting to AI Backend. Please check your internet connection or backend server.";
        }
      }

      const botMsg = { role: 'bot', text: botResponse };
      setMessages(prev => [...prev, botMsg]);
      saveMessageToFirebase(botMsg).catch(console.error);
      
    } catch (err) {
      console.error("General error:", err);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen liquid-bg flex overflow-hidden">
      {/* Sidebar */}
      <div className="glass-panel w-72 h-screen border-r border-white/10 flex-col hidden md:flex flex-shrink-0 z-10 transition-all duration-300 relative shadow-[10px_0_30px_rgba(0,0,0,0.5)]">
        <div className="absolute inset-0 bg-agri-bg/40 backdrop-blur-2xl -z-10"></div>
        <div className="p-5 border-b border-white/10 relative">
          <button onClick={handleNewChat} className="w-full py-3.5 bg-gradient-to-r from-agri-light to-emerald-400 hover:from-emerald-400 hover:to-agri-light text-black rounded-xl transition-all shadow-[0_0_15px_rgba(0,220,130,0.3)] hover:shadow-[0_0_25px_rgba(0,220,130,0.5)] font-bold flex items-center justify-center gap-2 transform hover:-translate-y-0.5">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            New Chat
          </button>
        </div>
        
        <div className="flex-grow overflow-y-auto px-4 py-6 space-y-2">
          {chats.map(c => (
             <div 
                key={c.id} 
                onClick={() => selectChat(c.id)}
                className={`p-4 rounded-xl cursor-pointer transition-all ${currentChatId === c.id ? 'bg-white/10 border border-agri-light/50 shadow-[0_0_15px_rgba(0,220,130,0.15)] text-agri-light' : 'hover:bg-white/5 text-white/70 border border-transparent'}`}
             >
               <h3 className="font-semibold truncate text-sm">{c.title || 'Conversation'}</h3>
             </div>
          ))}
          {chats.length === 0 && <div className="text-white/40 text-sm text-center mt-8">No previous chats</div>}
        </div>
        
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
      <div className="flex-grow h-screen flex flex-col relative bg-agri-bg/30 backdrop-blur-sm">
         {/* Mobile Header */}
         <div className="md:hidden flex items-center justify-between p-4 bg-black/40 backdrop-blur-xl border-b border-white/10 z-20 shadow-md">
           <h1 className="text-lg font-bold text-white tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-agri-light to-white">AgroAssistant</h1>
           <button onClick={handleLogout} className="text-white/60 hover:text-white text-sm font-semibold">Log out</button>
         </div>

         {/* Chat Messages */}
         <div className="flex-grow overflow-y-auto p-4 sm:p-6 pb-40">
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
         <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 bg-gradient-to-t from-[#040A0F] via-[#040A0F]/90 to-transparent">
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
