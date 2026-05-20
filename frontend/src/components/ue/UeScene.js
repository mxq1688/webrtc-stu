import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate, Link, Navigate } from 'react-router-dom';
import UeEmbedPanel from './UeEmbedPanel';
import { useUeSceneSignal } from '../../hooks/useUeSceneSignal';
import { isValidEmbedUrl } from '../../utils/embedUrl';

function UeSceneLayout({ title, subtitle, backTo, shareLink, children }) {
  return (
    <div className="container ue-page">
      <div className="header">
        <h1>{title}</h1>
        <p>{subtitle}</p>
        <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link to={backTo} className="btn btn-ghost">
            ← 返回 UE 入口
          </Link>
        </div>
      </div>
      {children}
      {shareLink && (
        <p className="ue-share">
          分享链接：<code>{shareLink}</code>
        </p>
      )}
    </div>
  );
}

/** 本地预览 /ue/view?url= */
export function UeSceneSolo() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initial = searchParams.get('url') || '';
  const [draft, setDraft] = useState(initial);
  const [activeUrl, setActiveUrl] = useState(initial);
  const [error, setError] = useState('');

  useEffect(() => {
    const u = searchParams.get('url') || '';
    setDraft(u);
    setActiveUrl(u);
  }, [searchParams]);

  const loadScene = () => {
    const t = draft.trim();
    if (t !== '' && !isValidEmbedUrl(t)) {
      setError('播放器地址需为 http(s):// 开头的有效 URL');
      return;
    }
    setError('');
    setActiveUrl(t);
    navigate(t ? `/ue/view?url=${encodeURIComponent(t)}` : '/ue/view', { replace: true });
  };

  return (
    <UeSceneLayout title="UE 场景（本地）" subtitle="不连接信令，仅本机 iframe 预览" backTo="/ue">
      {error && <div className="error">{error}</div>}
      <UeEmbedPanel
        embedUrl={activeUrl}
        draft={draft}
        onDraftChange={setDraft}
        onLoad={loadScene}
        onClear={() => {
          setDraft('');
          setActiveUrl('');
          navigate('/ue/view', { replace: true });
        }}
        showSync={false}
      />
    </UeSceneLayout>
  );
}

/** 多人同步 /ue/scene/:sceneId */
export function UeSceneSync() {
  const { sceneId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const username = searchParams.get('username') || 'viewer';
  const initialUrl = searchParams.get('url') || '';

  const [draft, setDraft] = useState(initialUrl);
  const { embedUrl, connected, error, publishEmbed, clearEmbed } = useUeSceneSignal({
    sceneId,
    username,
    initialUrl,
  });

  useEffect(() => {
    setDraft(embedUrl || '');
  }, [embedUrl]);

  const loadScene = () => {
    if (!publishEmbed(draft)) return;
    const q = new URLSearchParams();
    q.set('username', username);
    const t = draft.trim();
    if (t) q.set('url', t);
    navigate(`/ue/scene/${sceneId}?${q.toString()}`, { replace: true });
  };

  const handleClear = () => {
    setDraft('');
    clearEmbed();
    navigate(`/ue/scene/${sceneId}?username=${encodeURIComponent(username)}`, { replace: true });
  };

  const shareLink = `${window.location.origin}/ue/scene/${sceneId}?username=${encodeURIComponent(username)}${
    embedUrl ? `&url=${encodeURIComponent(embedUrl)}` : ''
  }`;

  return (
    <UeSceneLayout
      title={`UE 场景 · ${sceneId}`}
      subtitle={`信令 /ws/ue（与会议 /ws 无关）· ${username}`}
      backTo="/ue"
      shareLink={shareLink}
    >
      {error && <div className="error">{error}</div>}
      <UeEmbedPanel
        embedUrl={embedUrl}
        draft={draft}
        onDraftChange={setDraft}
        onLoad={loadScene}
        onSync={() => publishEmbed(draft)}
        onClear={handleClear}
        showSync
        connected={connected}
      />
    </UeSceneLayout>
  );
}

/** 兼容旧路径 /ue/room/:roomId → /ue/scene/:sceneId */
export function UeSceneRoomLegacy() {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const q = searchParams.toString();
  return <Navigate to={`/ue/scene/${roomId}${q ? `?${q}` : ''}`} replace />;
}
