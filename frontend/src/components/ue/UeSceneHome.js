import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { isValidEmbedUrl } from '../../utils/embedUrl';

function UeSceneHome() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [sceneId, setSceneId] = useState('');
  const [playerUrl, setPlayerUrl] = useState('');
  const [error, setError] = useState('');

  const goSolo = () => {
    const url = playerUrl.trim();
    if (url && !isValidEmbedUrl(url)) {
      setError('播放器地址需为 http(s):// 开头的有效 URL');
      return;
    }
    setError('');
    const q = url ? `?url=${encodeURIComponent(url)}` : '';
    navigate(`/ue/view${q}`);
  };

  const goScene = () => {
    const name = username.trim() || 'viewer';
    const id = sceneId.trim();
    if (!id) {
      setError('请填写场景 ID');
      return;
    }
    const url = playerUrl.trim();
    if (url && !isValidEmbedUrl(url)) {
      setError('播放器地址需为 http(s):// 开头的有效 URL');
      return;
    }
    setError('');
    const q = new URLSearchParams();
    q.set('username', name);
    if (url) q.set('url', url);
    navigate(`/ue/scene/${id}?${q.toString()}`);
  };

  const createScene = () => {
    const name = username.trim() || 'viewer';
    const id = uuidv4().substring(0, 8);
    setSceneId(id);
    const url = playerUrl.trim();
    const q = new URLSearchParams();
    q.set('username', name);
    if (url && isValidEmbedUrl(url)) q.set('url', url);
    navigate(`/ue/scene/${id}?${q.toString()}`);
  };

  return (
    <div className="container">
      <div className="header">
        <h1>UE 远程场景</h1>
        <p>仅加载 Unreal Pixel Streaming 画面，与 /room 视频会议无任何关联</p>
        <Link to="/" className="btn btn-ghost" style={{ marginTop: 12 }}>
          ← 返回首页
        </Link>
      </div>

      <div className="card" style={{ maxWidth: 520, margin: '0 auto' }}>
        <h2 style={{ textAlign: 'center', marginBottom: 24, color: '#333' }}>打开 UE 画面</h2>

        {error && <div className="error">{error}</div>}

        <input
          type="url"
          className="input"
          placeholder="Pixel Streaming 播放器地址 https://主机:端口/player.html"
          value={playerUrl}
          onChange={(e) => setPlayerUrl(e.target.value)}
        />

        <hr className="ue-divider" />

        <h3 className="ue-section-title">本地预览</h3>
        <p className="ue-hint">仅本机 iframe 加载，不占用信令房间同步。</p>
        <button type="button" className="btn" style={{ width: '100%' }} onClick={goSolo}>
          本地加载 UE
        </button>

        <hr className="ue-divider" />

        <h3 className="ue-section-title">场景同步（可选）</h3>
        <p className="ue-hint">多人通过独立信令 /ws/ue 共享播放器地址，与会议 /ws 无关。</p>
        <input
          type="text"
          className="input"
          placeholder="昵称（可选，默认 viewer）"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          type="text"
          className="input"
          placeholder="场景 ID（自定，勿与会议房间混淆）"
          value={sceneId}
          onChange={(e) => setSceneId(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <button type="button" className="btn" style={{ flex: 1 }} onClick={goScene} disabled={!sceneId.trim()}>
            进入场景
          </button>
          <button type="button" className="btn" style={{ flex: 1 }} onClick={createScene}>
            新建场景 ID
          </button>
        </div>
      </div>

      <div style={{ marginTop: 24, padding: 20, background: 'rgba(255,255,255,0.9)', borderRadius: 10, maxWidth: 520, marginLeft: 'auto', marginRight: 'auto' }}>
        <h3 style={{ color: '#333', marginTop: 0 }}>说明</h3>
        <ul style={{ color: '#666', lineHeight: 1.6, paddingLeft: 20 }}>
          <li>画面来自 UE Pixel Streaming 的 player 网页（iframe）</li>
          <li>视频会议在首页 /room，本页路径为 /ue，两套系统</li>
        </ul>
      </div>
    </div>
  );
}

export default UeSceneHome;
