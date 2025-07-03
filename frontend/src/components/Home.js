import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';

function Home() {
  const [username, setUsername] = useState('');
  const [roomId, setRoomId] = useState('');
  const navigate = useNavigate();

  const handleCreateRoom = () => {
    if (!username.trim()) {
      alert('请输入用户名');
      return;
    }
    const newRoomId = uuidv4().substring(0, 8);
    navigate(`/room/${newRoomId}?username=${encodeURIComponent(username)}`);
  };

  const handleJoinRoom = () => {
    if (!username.trim()) {
      alert('请输入用户名');
      return;
    }
    if (!roomId.trim()) {
      alert('请输入房间ID');
      return;
    }
    navigate(`/room/${roomId}?username=${encodeURIComponent(username)}`);
  };

  return (
    <div className="container">
      <div className="header">
        <h1>WebRTC 视频会议室</h1>
        <p>基于WebRTC技术的实时视频通话应用</p>
      </div>
      
      <div className="card">
        <h2 style={{ textAlign: 'center', marginBottom: '30px', color: '#333' }}>
          加入会议
        </h2>
        
        <div style={{ maxWidth: '400px', margin: '0 auto' }}>
          <input
            type="text"
            className="input"
            placeholder="请输入您的用户名"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                if (roomId.trim()) {
                  handleJoinRoom();
                } else {
                  handleCreateRoom();
                }
              }
            }}
          />
          
          <input
            type="text"
            className="input"
            placeholder="请输入房间ID (可选)"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && roomId.trim()) {
                handleJoinRoom();
              }
            }}
          />
          
          <div style={{ display: 'flex', gap: '15px', marginTop: '20px' }}>
            <button
              className="btn"
              onClick={handleCreateRoom}
              style={{ flex: 1 }}
            >
              创建新房间
            </button>
            
            <button
              className="btn"
              onClick={handleJoinRoom}
              disabled={!roomId.trim()}
              style={{ flex: 1 }}
            >
              加入房间
            </button>
          </div>
        </div>
        
        <div style={{ marginTop: '30px', padding: '20px', background: '#f8f9fa', borderRadius: '10px' }}>
          <h3 style={{ color: '#333', marginBottom: '15px' }}>使用说明：</h3>
          <ul style={{ color: '#666', lineHeight: '1.6' }}>
            <li>输入用户名后可以创建新房间或加入现有房间</li>
            <li>创建房间后会自动生成房间ID，分享给其他人即可加入</li>
            <li>支持多人视频通话，音视频同步传输</li>
            <li>确保浏览器允许摄像头和麦克风权限</li>
          </ul>
          
          {/* 移动端访问提示 */}
          {window.location.protocol === 'https:' && (
            <div style={{ marginTop: '20px', padding: '15px', background: '#e3f2fd', borderRadius: '8px' }}>
              <h4 style={{ color: '#1976d2', marginTop: 0 }}>📱 移动端访问说明</h4>
              <p style={{ color: '#666', margin: '10px 0' }}>
                移动端需要信任SSL证书才能正常使用：
              </p>
              <ol style={{ color: '#666', paddingLeft: '20px' }}>
                <li>先访问并信任: <a href="https://192.168.5.27:8443/health" target="_blank" rel="noopener noreferrer">https://192.168.5.27:8443/health</a></li>
                <li>然后访问: <a href="https://192.168.5.27:3002" target="_blank" rel="noopener noreferrer">https://192.168.5.27:3002</a></li>
              </ol>
              <p style={{ color: '#666', marginTop: '10px' }}>
                <a href="/cert-guide.html" target="_blank" style={{ color: '#1976d2' }}>查看详细证书安装指南</a> | 
                <a href="/rootCA.pem" download style={{ color: '#1976d2', marginLeft: '10px' }}>下载根证书</a>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Home; 