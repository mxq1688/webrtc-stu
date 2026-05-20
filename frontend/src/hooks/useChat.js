import { useState, useCallback, useRef } from 'react';

export default function useChat(sendMessage, userId, username) {
  const [messages, setMessages] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const isOpenRef = useRef(false);

  const addMessage = useCallback((msg) => {
    setMessages(prev => [...prev, {
      id: Date.now() + Math.random(),
      userId: msg.userId,
      username: msg.username || msg.userId,
      text: msg.data?.text || msg.data || '',
      timestamp: msg.data?.timestamp || Date.now(),
      isSelf: msg.userId === userId,
    }]);
    if (!isOpenRef.current) {
      setUnreadCount(prev => prev + 1);
    }
  }, [userId]);

  const sendChat = useCallback((text) => {
    if (!text.trim()) return;
    sendMessage({
      type: 'chat',
      data: { text: text.trim(), timestamp: Date.now() },
    });
    setMessages(prev => [...prev, {
      id: Date.now() + Math.random(),
      userId,
      username,
      text: text.trim(),
      timestamp: Date.now(),
      isSelf: true,
    }]);
  }, [sendMessage, userId, username]);

  const setOpen = useCallback((open) => {
    isOpenRef.current = open;
    if (open) setUnreadCount(0);
  }, []);

  const handleIncoming = useCallback((message) => {
    if (message.type === 'chat') {
      addMessage(message);
    }
  }, [addMessage]);

  return { messages, unreadCount, sendChat, setOpen, handleIncoming };
}
