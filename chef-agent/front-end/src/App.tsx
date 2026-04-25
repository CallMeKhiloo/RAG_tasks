import React, { useState, useRef, useEffect } from 'react';
import { ChefHat, Send, User, Bot, Sparkles, SlidersHorizontal, AlignLeft, AlignJustify } from 'lucide-react';
import './App.css';

interface Message {
  id: string;
  type: 'user' | 'bot';
  content: string;
}

function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      type: 'bot',
      content: "Bonjour! I am Chef AI. Tell me what ingredients you have in your kitchen, and I will guide you step-by-step to a culinary masterpiece! What are we cooking with today?"
    }
  ]);
  const [input, setInput] = useState('');
  const [creativity, setCreativity] = useState(50);
  const [detailLevel, setDetailLevel] = useState<'concise' | 'detailed'>('detailed');
  const [threadId] = useState(() => Date.now().toString());
  const [isLoading, setIsLoading] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg: Message = { id: Date.now().toString(), type: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      // Append settings context to the message since backend schema only accepts message and thread_id
      const prompt = `${input}\n[System Note: Answer with a ${detailLevel} level of detail. Assume creativity level is ${creativity}/100]`;

      const response = await fetch('http://localhost:8000/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: prompt,
          thread_id: threadId
        })
      });

      if (!response.ok) throw new Error('Network response was not ok');
      
      const data = await response.json();
      
      const isFinal = data.is_final_step ? '✅ ' : '';
      const botResponse = `${isFinal}**Step ${data.step_number}**\n${data.instruction}\n\n*Chef says: ${data.chef_comment}*`;
      
      const botMsg: Message = { 
        id: Date.now().toString(), 
        type: 'bot', 
        content: botResponse
      };
      
      setMessages(prev => [...prev, botMsg]);
    } catch (error) {
      console.error('Error communicating with backend:', error);
      const errorMsg: Message = { 
        id: Date.now().toString(), 
        type: 'bot', 
        content: "Oops! My stove is acting up. I couldn't process that. Make sure the backend server is running."
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar for Settings */}
      <aside className="sidebar">
        <div className="header">
          <ChefHat className="header-icon" />
          <h1>AI Chef</h1>
        </div>

        <div className="settings-group">
          <label className="settings-label">
            <SlidersHorizontal size={16} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'text-bottom' }} />
            Creativity Level
          </label>
          <div className="slider-container">
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Strict</span>
            <input 
              type="range" 
              min="0" 
              max="100" 
              value={creativity} 
              onChange={(e) => setCreativity(Number(e.target.value))}
              className="slider" 
            />
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Wild</span>
          </div>
          <div style={{ textAlign: 'center', marginTop: '8px', fontSize: '12px', color: 'var(--primary-color)' }}>
            {creativity < 30 ? "Follows recipes perfectly" : creativity > 70 ? "Culinary experimenter" : "Balanced chef"}
          </div>
        </div>

        <div className="settings-group">
          <label className="settings-label">
            <Sparkles size={16} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'text-bottom' }} />
            Response Detail
          </label>
          <div className="toggle-container">
            <button 
              className={`toggle-btn ${detailLevel === 'concise' ? 'active' : ''}`}
              onClick={() => setDetailLevel('concise')}
            >
              <AlignLeft size={14} style={{ display: 'inline', marginRight: '4px' }} />
              Concise
            </button>
            <button 
              className={`toggle-btn ${detailLevel === 'detailed' ? 'active' : ''}`}
              onClick={() => setDetailLevel('detailed')}
            >
              <AlignJustify size={14} style={{ display: 'inline', marginRight: '4px' }} />
              Detailed
            </button>
          </div>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="main-content">
        <div className="chat-container">
          {messages.map((msg) => (
            <div key={msg.id} className={`message ${msg.type} animate-fade-in`}>
              <div className="avatar">
                {msg.type === 'user' ? <User size={20} /> : <Bot size={20} />}
              </div>
              <div className="message-content">
                {msg.content}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="input-area">
          <form onSubmit={handleSend} className="input-box">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. I have chicken, rice, and some old carrots..."
              className="ingredient-input"
            />
            <button type="submit" disabled={!input.trim() || isLoading} className="send-btn">
              <Send size={18} />
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}

export default App;
