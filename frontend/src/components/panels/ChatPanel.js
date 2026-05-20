import React, { useState } from 'react';

export default function ChatPanel({ messages, unreadCount, onSend, onOpenChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');

  const toggleOpen = () => {
    const next = !isOpen;
    setIsOpen(next);
    onOpenChange(next);
  };

  const handleSend = () => {
    if (!input.trim()) return;
    onSend(input.trim());
    setInput('');
  };

  return (
    <>
      <button className="btn btn-chat-toggle" onClick={toggleOpen}>
        💬 聊天{unreadCount > 0 && <span className="chat-badge">{unreadCount}</span>}
      </button>
      {isOpen && (
        <div className="chat-panel">
          <div className="chat-header">
            <span>聊天消息</span>
            <button className="btn-icon" onClick={toggleOpen}>✕</button>
          </div>
          <div className="chat-messages">
            {messages.length === 0 && <div className="chat-empty">暂无消息</div>}
            {messages.map(msg => (
              <div key={msg.id} className={`chat-msg ${msg.isSelf ? 'chat-msg-self' : ''}`}>
                <div className="chat-msg-header">
                  <span className="chat-msg-user">{msg.isSelf ? '我' : msg.username}</span>
                  <span className="chat-msg-time">{new Date(msg.timestamp).toLocaleTimeString()}</span>
                </div>
                <div className="chat-msg-text">{msg.text}</div>
              </div>
            ))}
          </div>
          <div className="chat-input-area">
            <input
              className="chat-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && handleSend()}
              placeholder="输入消息..."
            />
            <button className="btn btn-send" onClick={handleSend}>发送</button>
          </div>
        </div>
      )}
    </>
  );
}
