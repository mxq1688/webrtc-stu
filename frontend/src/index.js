import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
// WebRTC 会议室在 StrictMode 下会重复挂载并立刻断开 WebSocket（1006）
root.render(<App />); 