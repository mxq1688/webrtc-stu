import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';

function buildRoomQuery(username) {
  const q = new URLSearchParams();
  q.set('username', username.trim());
  return q.toString();
}

function Home() {
  const [username, setUsername] = useState('');
  const [roomId, setRoomId] = useState('');
  const navigate = useNavigate();

  const handleCreateRoom = () => {
    if (!username.trim()) { alert('请输入用户名'); return; }
    const id = roomId.trim() || uuidv4().substring(0, 8);
    navigate(`/room/${encodeURIComponent(id)}?${buildRoomQuery(username)}`);
  };

  const handleJoinRoom = () => {
    if (!username.trim()) { alert('请输入用户名'); return; }
    if (!roomId.trim()) { alert('请输入房间ID'); return; }
    navigate(`/room/${encodeURIComponent(roomId.trim())}?${buildRoomQuery(username)}`);
  };

  return (
    <div className="container">
      <div className="header">
        <h1>WebRTC 视频会议室</h1>
        <p>多人实时音视频通话（与 UE 远程渲染无关）</p>
        {!window.isSecureContext && !/^localhost$|^127\./.test(window.location.hostname) && (
          <p style={{ color: '#fcc419', fontSize: 14, marginTop: 8 }}>
            当前为 HTTP：浏览器可能无法打开摄像头，建议配置 HTTPS 后再用。
          </p>
        )}
      </div>

      <div className="card">
        <h2 style={{ textAlign: 'center', marginBottom: '30px', color: '#333' }}>加入会议</h2>

        <div style={{ maxWidth: '400px', margin: '0 auto' }}>
          <input
            type="text" className="input"
            placeholder="请输入您的用户名"
            value={username}
            onChange={e => setUsername(e.target.value)}
            onKeyPress={e => { if (e.key === 'Enter') { roomId.trim() ? handleJoinRoom() : handleCreateRoom(); } }}
          />

          <input
            type="text" className="input"
            placeholder="房间ID（创建时填写则使用自定义，留空则随机生成）"
            value={roomId}
            onChange={e => setRoomId(e.target.value)}
            onKeyPress={e => { if (e.key === 'Enter' && roomId.trim()) handleJoinRoom(); }}
          />

          <div style={{ display: 'flex', gap: '15px', marginTop: '20px' }}>
            <button className="btn" onClick={handleCreateRoom} style={{ flex: 1 }}>
              {roomId.trim() ? '创建房间' : '创建新房间'}
            </button>
            <button className="btn" onClick={handleJoinRoom} disabled={!roomId.trim()} style={{ flex: 1 }}>加入房间</button>
          </div>
        </div>

        <div style={{ marginTop: '30px', padding: '20px', background: '#f8f9fa', borderRadius: '10px' }}>
          <h3 style={{ color: '#333', marginBottom: '15px' }}>功能说明：</h3>
          <ul style={{ color: '#666', lineHeight: '1.6' }}>
            <li><strong>多人音视频</strong>：每位参会者均可开关摄像头、麦克风</li>
            <li><strong>屏幕共享</strong>：任意参会者可共享屏幕</li>
            <li><strong>发言者检测</strong>：自动高亮正在发言的用户，大画面展示</li>
            <li><strong>网络质量</strong>：实时监测 RTT、丢包、码率，5级质量显示</li>
            <li><strong>会议录制</strong>：支持本地录制会议内容并下载 WebM</li>
            <li><strong>文字聊天</strong>：房间内即时文字消息，未读提醒</li>
            <li><strong>画中画</strong>：支持浏览器 PiP 模式</li>
          </ul>
          <p style={{ marginTop: 20, textAlign: 'center', color: '#888', fontSize: 14 }}>
            UE Pixel Streaming 是另一个独立应用：
            <Link to="/ue" style={{ marginLeft: 6, color: '#667eea' }}>/ue</Link>
          </p>

          {window.location.protocol === 'https:' && (
            <div style={{ marginTop: '20px', padding: '15px', background: '#e3f2fd', borderRadius: '8px' }}>
              <h4 style={{ color: '#1976d2', marginTop: 0 }}>📱 移动端访问说明（须与电脑同一 WiFi）</h4>
              <p style={{ color: '#666', margin: '10px 0' }}>
                手机请用电脑同一局域网 IP 访问，并<strong>先信任信令证书</strong>，否则会显示「信令连接失败」：
              </p>
              <ol style={{ color: '#666', paddingLeft: '20px' }}>
                <li>
                  先打开并继续访问:{' '}
                  <a href={`https://${window.location.hostname}:8443/health`} target="_blank" rel="noopener noreferrer">
                    {`https://${window.location.hostname}:8443/health`}
                  </a>
                </li>
                <li>
                  再打开会议页:{' '}
                  <a href={`https://${window.location.hostname}:3000`} target="_blank" rel="noopener noreferrer">
                    {`https://${window.location.hostname}:3000`}
                  </a>
                </li>
                <li>输入与电脑<strong>完全相同</strong>的房间号与用户名（区分大小写）</li>
                <li>进入房间后点击 <strong>「开启摄像头和麦克风」</strong>（手机不会自动弹权限）</li>
              </ol>
              <p style={{ color: '#666', marginTop: '10px' }}>
                <a href="/cert-guide.html" target="_blank" style={{ color: '#1976d2' }}>证书安装指南</a> | 
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
