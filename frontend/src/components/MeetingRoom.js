import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import useNetworkQuality from '../hooks/useNetworkQuality';
import useActiveSpeaker from '../hooks/useActiveSpeaker';
import useChat from '../hooks/useChat';
import useRecording from '../hooks/useRecording';
import ChatPanel from './panels/ChatPanel';
import StableMediaVideo from './StableMediaVideo';
import UserControlBar from './panels/UserControlBar';
import { getMeetingWebSocketURL } from '../utils/ws';

function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function MeetingRoom() {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const username = searchParams.get('username') || '';
  const uidStorageKey = `webrtc-uid-${roomId}-${username}`;
  const userId = useRef(
    (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(uidStorageKey)) || uuidv4()
  );
  const [localStream, setLocalStream] = useState(null);
  const [screenStream, setScreenStream] = useState(null);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState(new Map());
  const [users, setUsers] = useState([]);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState('');
  const [mediaHint, setMediaHint] = useState('');
  const [awaitingMediaGesture, setAwaitingMediaGesture] = useState(false);
  const [pinnedUserId, setPinnedUserId] = useState(null);
  const [rtcDebug, setRtcDebug] = useState('');

  const localVideoRef = useRef();
  const localStreamRef = useRef(null);
  const websocketRef = useRef();
  const peerConnectionsRef = useRef(new Map());
  const iceQueuesRef = useRef(new Map());
  const remoteVideoRefs = useRef(new Map());
  const remoteStreamCacheRef = useRef(new Map());

  const servers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
    ],
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
  };

  const sendMessage = useCallback((message) => {
    if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) {
      websocketRef.current.send(JSON.stringify(message));
    }
  }, []);

  const mobile = isMobileDevice();
  const { qualityLevel, qualityLabel, qualityIcon, qualityColor } = useNetworkQuality(
    peerConnectionsRef,
    mobile ? 5000 : 3000
  );
  const { activeSpeakerId, activeSpeakerName } = useActiveSpeaker(remoteStreams, users, {
    enabled: !mobile,
  });
  const chat = useChat(sendMessage, userId.current, username);
  const recording = useRecording(localStream, remoteStreams);

  const wsReconnectTimerRef = useRef(null);
  const intentionalCloseRef = useRef(false);

  /** userId 较小的一方负责发 offer，避免双方都不发或同时发 */
  const isOfferer = useCallback((remoteId) => userId.current.localeCompare(remoteId) < 0, []);

  useEffect(() => {
    sessionStorage.setItem(uidStorageKey, userId.current);
  }, [uidStorageKey]);

  const attachLocalTracks = (pc) => {
    const streamToSend = isScreenSharing && screenStream ? screenStream : localStreamRef.current;
    if (!streamToSend) return;
    const kinds = new Set(pc.getSenders().map((s) => s.track?.kind).filter(Boolean));
    streamToSend.getTracks().forEach((track) => {
      if (kinds.has(track.kind)) return;
      try {
        pc.addTrack(track, streamToSend);
      } catch (e) {
        console.error('Add track failed:', e);
      }
    });
  };

  useEffect(() => {
    if (!username) { navigate('/'); return; }
    let cancelled = false;
    intentionalCloseRef.current = false;

    const onPageHide = () => {
      intentionalCloseRef.current = true;
      if (websocketRef.current?.readyState === WebSocket.OPEN) {
        websocketRef.current.close(1000, 'pagehide');
      }
    };
    window.addEventListener('pagehide', onPageHide);

    (async () => {
      if (!window.isSecureContext && !/^localhost$|^127\./.test(window.location.hostname)) {
        setError('当前非安全连接，无法打开摄像头。请用 https://本机IP:3000 并信任证书。');
        if (!cancelled) connectWebSocket();
        return;
      }
      if (isMobileDevice()) {
        setAwaitingMediaGesture(true);
        setMediaHint('iOS/Android 需要您点击按钮后才会弹出摄像头授权。');
        if (!cancelled) connectWebSocket();
        return;
      }
      await initializeMedia();
      if (!cancelled) connectWebSocket();
    })();
    return () => {
      cancelled = true;
      window.removeEventListener('pagehide', onPageHide);
      intentionalCloseRef.current = true;
      if (wsReconnectTimerRef.current) clearTimeout(wsReconnectTimerRef.current);
      cleanup();
    };
  }, [roomId, username]);

  useEffect(() => {
    localStreamRef.current = localStream;
    if (!localStream) return;
    for (const [, pc] of peerConnectionsRef.current.entries()) {
      attachLocalTracks(pc);
    }
  }, [localStream, isScreenSharing, screenStream]);

  const localDisplayStream =
    isScreenSharing && screenStream ? screenStream : localStream;

  const flushIceQueue = async (remoteUserId) => {
    const pc = peerConnectionsRef.current.get(remoteUserId);
    const queue = iceQueuesRef.current.get(remoteUserId) || [];
    if (!pc || !pc.remoteDescription || queue.length === 0) return;
    iceQueuesRef.current.set(remoteUserId, []);
    for (const candidate of queue) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.error('Flush ICE failed:', e);
      }
    }
  };

  const enableLocalMedia = async () => {
    setAwaitingMediaGesture(false);
    setMediaHint('');
    await initializeMedia();
    for (const [, pc] of peerConnectionsRef.current.entries()) {
      attachLocalTracks(pc);
    }
  };

  const initializeMedia = async () => {
    try {
      if (!window.isSecureContext && !/^localhost$|^127\./.test(window.location.hostname)) {
        setError(
          '当前为 HTTP 访问，浏览器通常不允许摄像头/麦克风。您仍可收看他人的画面；要推流请配置 HTTPS。'
        );
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('您的浏览器不支持WebRTC，请使用Chrome/Firefox/Safari');
      }
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const constraints = {
        video: {
          width: isMobile ? { ideal: 640, max: 1280 } : { ideal: 1280 },
          height: isMobile ? { ideal: 480, max: 720 } : { ideal: 720 },
          frameRate: { ideal: 30, max: 30 },
          facingMode: isMobile ? 'user' : undefined,
        },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      setLocalStream(stream);
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      setError('');
      setMediaHint('');
      setAwaitingMediaGesture(false);
    } catch (err) {
      handleMediaError(err);
    }
  };

  const handleMediaError = (err) => {
    const messages = {
      NotAllowedError: '摄像头权限被拒绝，请在浏览器设置中允许访问。',
      NotFoundError: '未找到摄像头设备。',
      NotReadableError: '摄像头正被其他应用使用。',
      OverconstrainedError: '摄像头不支持请求的配置，尝试备用配置...',
      NotSupportedError: '浏览器不支持WebRTC。',
    };
    setError(messages[err.name] || `未知错误: ${err.message}`);
    if (err.name === 'OverconstrainedError') setTimeout(tryFallbackConstraints, 1000);
  };

  const tryFallbackConstraints = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      setLocalStream(stream);
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      setError('');
    } catch (e) {
      setError('所有配置都失败了，请检查设备权限。');
    }
  };

  const connectWebSocket = () => {
    if (wsReconnectTimerRef.current) {
      clearTimeout(wsReconnectTimerRef.current);
      wsReconnectTimerRef.current = null;
    }
    if (websocketRef.current) {
      intentionalCloseRef.current = true;
      websocketRef.current.close(1000, 'reconnect');
      websocketRef.current = null;
    }
    intentionalCloseRef.current = false;

    const wsUrl = `${getMeetingWebSocketURL()}?userId=${userId.current}&roomId=${roomId}&username=${encodeURIComponent(username)}`;
    console.log('[WS] connecting:', wsUrl);
    const ws = new WebSocket(wsUrl);
    websocketRef.current = ws;

    ws.onopen = () => {
      console.log('[WS] connected (resync P2P):', wsUrl);
      // 仅清 P2P，users 等 user-list / user-joined 消息回填
      Array.from(peerConnectionsRef.current.keys()).forEach((id) => closePeerConnection(id));
      setRemoteStreams(new Map());
      setRtcDebug('');
      setIsConnected(true);
      setError('');
    };
    ws.onmessage = async (event) => {
      try { await handleWebSocketMessage(JSON.parse(event.data)); } catch (e) { console.error('Message parse error:', e); }
    };
    ws.onclose = (event) => {
      setIsConnected(false);
      if (intentionalCloseRef.current || event.code === 1000) return;
      const hint = event.code === 1006
        ? '信令连接异常断开，请确认后端已启动且使用 https://localhost:3000 或 https://本机IP:3000'
        : `连接关闭 (${event.code})`;
      setError(hint);
      wsReconnectTimerRef.current = setTimeout(() => {
        if (!intentionalCloseRef.current) connectWebSocket();
      }, 3000);
    };
    ws.onerror = () => {
      setError(
        window.location.protocol === 'https:'
          ? '信令连接失败：请信任本地证书，或访问 https://本机IP:3000/debug.html 测试'
          : '信令连接失败：请用 https://localhost:3000 访问（HTTP 无法连 :8443）'
      );
    };
  };

  const handleWebSocketMessage = async (message) => {
    chat.handleIncoming(message);

    switch (message.type) {
      case 'user-list': {
        const others = (message.data || []).filter((u) => u.id !== userId.current);
        setUsers(others);
        console.log('[WS] user-list', others.map((u) => u.username).join(','));
        for (const user of others) {
          await connectPeer(user.id);
          ensureNegotiation(user.id);
        }
        break;
      }

      case 'user-joined':
        if (message.userId !== userId.current) {
          setUsers((prev) => {
            if (prev.some((u) => u.id === message.userId)) return prev;
            return [...prev, { id: message.userId, username: message.username }];
          });
          console.log('[WS] user-joined', message.username, message.userId);
          await connectPeer(message.userId);
          ensureNegotiation(message.userId);
        }
        break;

      case 'user-left':
        setUsers(prev => prev.filter(u => u.id !== message.userId));
        closePeerConnection(message.userId);
        break;

      case 'offer':
        await handleOffer(message);
        break;
      case 'answer':
        await handleAnswer(message);
        break;
      case 'ice-candidate':
        await handleIceCandidate(message);
        break;

      case 'screen-share-start':
        break;
      case 'screen-share-stop':
        break;
    }
  };

  const resetP2PState = useCallback(() => {
    Array.from(peerConnectionsRef.current.keys()).forEach((id) => closePeerConnection(id));
    setRemoteStreams(new Map());
    setUsers([]);
    setRtcDebug('');
  }, []);

  const connectPeer = async (remoteUserId) => {
    closePeerConnection(remoteUserId);
    await createPeerConnection(remoteUserId);
    if (isOfferer(remoteUserId) && localStreamRef.current) {
      await sendOffer(remoteUserId);
    }
  };

  const ensureNegotiation = useCallback((remoteUserId) => {
    setTimeout(async () => {
      const pc = peerConnectionsRef.current.get(remoteUserId);
      if (!pc || pc.remoteDescription || !localStreamRef.current) return;
      if (isOfferer(remoteUserId)) {
        console.log('[WebRTC] retry offer ->', remoteUserId);
        await sendOffer(remoteUserId);
      }
    }, 800);
  }, [isOfferer]);

  const createPeerConnection = async (remoteUserId) => {
    const pc = new RTCPeerConnection(servers);
    peerConnectionsRef.current.set(remoteUserId, pc);

    attachLocalTracks(pc);

    pc.ontrack = (event) => {
      console.log('[WebRTC] ontrack', remoteUserId, event.track?.kind, 'streams=', event.streams?.length ?? 0);
      let stream = event.streams && event.streams[0];
      if (!stream) {
        let cached = remoteStreamCacheRef.current.get(remoteUserId);
        if (!cached) {
          cached = new MediaStream();
          remoteStreamCacheRef.current.set(remoteUserId, cached);
        }
        if (event.track && !cached.getTracks().includes(event.track)) {
          cached.addTrack(event.track);
        }
        stream = cached;
      }
      event.track.onended = () => console.log(`[WebRTC] track ended [${event.track.kind}] ${remoteUserId}`);
      setRemoteStreams((prev) => {
        if (prev.get(remoteUserId) === stream) return prev;
        const m = new Map(prev);
        m.set(remoteUserId, stream);
        return m;
      });
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendMessage({
          type: 'ice-candidate',
          data: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate,
          targetUserId: remoteUserId,
        });
      }
    };

    const updateDebug = () => {
      const parts = [];
      for (const [id, p] of peerConnectionsRef.current.entries()) {
        parts.push(`${id.slice(0, 6)}:ice=${p.iceConnectionState},conn=${p.connectionState}`);
      }
      const next = parts.join(' | ') || '无 P2P 连接';
      setRtcDebug((prev) => (prev === next ? prev : next));
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE ${remoteUserId}:`, pc.iceConnectionState);
      updateDebug();
      if (pc.iceConnectionState === 'failed') pc.restartIce();
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] conn ${remoteUserId}:`, pc.connectionState);
      updateDebug();
      if (pc.connectionState === 'connected') {
        console.log(`[WebRTC] P2P connected with ${remoteUserId}`);
      }
      if (pc.connectionState === 'failed') {
        console.warn('[WebRTC] conn failed, retry', remoteUserId);
        setTimeout(() => connectPeer(remoteUserId), 1000);
      }
    };

    return pc;
  };

  const sendOffer = async (remoteUserId) => {
    const pc = peerConnectionsRef.current.get(remoteUserId);
    if (!pc || !localStreamRef.current) return;
    attachLocalTracks(pc);
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendMessage({ type: 'offer', data: offer, targetUserId: remoteUserId });
      console.log('[WebRTC] offer ->', remoteUserId);
    } catch (e) {
      console.error('Send offer failed:', remoteUserId, e);
    }
  };

  const handleOffer = async (message) => {
    const { userId: rId, data: offer } = message;
    if (!rId || !offer) return;
    let pc = peerConnectionsRef.current.get(rId);
    if (!pc) pc = await createPeerConnection(rId);
    attachLocalTracks(pc);
    const offerDesc = new RTCSessionDescription(offer);
    try {
      if (pc.signalingState === 'have-local-offer' && isOfferer(rId)) {
        console.log('[WebRTC] ignore glare offer from', rId);
        return;
      }
      await pc.setRemoteDescription(offerDesc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendMessage({ type: 'answer', data: answer, targetUserId: rId });
      await flushIceQueue(rId);
      console.log('[WebRTC] answer ->', rId);
    } catch (e) {
      console.error('Handle offer failed:', e);
      closePeerConnection(rId);
    }
  };

  const handleAnswer = async (message) => {
    const { userId: rId, data: answer } = message;
    const pc = peerConnectionsRef.current.get(rId);
    if (!pc) return;
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      await flushIceQueue(rId);
    } catch (e) {
      console.error('Handle answer failed:', e);
      setTimeout(() => connectPeer(rId), 1000);
    }
  };

  const handleIceCandidate = async (message) => {
    const { userId: rId, data: candidate } = message;
    const pc = peerConnectionsRef.current.get(rId);
    if (!pc) return;
    if (!pc.remoteDescription) {
      const q = iceQueuesRef.current.get(rId) || [];
      q.push(candidate);
      iceQueuesRef.current.set(rId, q);
      return;
    }
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.error('Add ICE failed:', e);
    }
  };

  const closePeerConnection = (rId) => {
    remoteStreamCacheRef.current.delete(rId);
    const pc = peerConnectionsRef.current.get(rId);
    if (pc) { pc.close(); peerConnectionsRef.current.delete(rId); }
    iceQueuesRef.current.delete(rId);
    setRemoteStreams(prev => { const m = new Map(prev); m.delete(rId); return m; });
  };

  const toggleAudio = async () => {
    if (!localStream) {
      await enableLocalMedia();
      return;
    }
    const t = localStream.getAudioTracks()[0];
    if (t) { t.enabled = !t.enabled; setIsAudioEnabled(t.enabled); }
  };

  const toggleVideo = async () => {
    if (!localStream) {
      await enableLocalMedia();
      return;
    }
    const t = localStream.getVideoTracks()[0];
    if (t) { t.enabled = !t.enabled; setIsVideoEnabled(t.enabled); }
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      if (screenStream) screenStream.getTracks().forEach(t => t.stop());
      setScreenStream(null);
      setIsScreenSharing(false);
      sendMessage({ type: 'screen-share-stop' });
      if (localStream && localVideoRef.current) localVideoRef.current.srcObject = localStream;
      replaceTrackInAllPCs(screenStream?.getVideoTracks()[0], localStream?.getVideoTracks()[0]);
    } else {
      try {
        const ss = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        setScreenStream(ss);
        setIsScreenSharing(true);
        if (localVideoRef.current) localVideoRef.current.srcObject = ss;
        sendMessage({ type: 'screen-share-start' });
        replaceTrackInAllPCs(localStream?.getVideoTracks()[0], ss.getVideoTracks()[0]);
        ss.getVideoTracks()[0].onended = () => toggleScreenShare();
      } catch (e) { console.error('Screen share failed:', e); }
    }
  };

  const replaceTrackInAllPCs = (oldTrack, newTrack) => {
    if (!newTrack) return;
    for (const [, pc] of peerConnectionsRef.current.entries()) {
      pc.getSenders().forEach(sender => {
        if (sender.track === oldTrack) {
          sender.replaceTrack(newTrack).catch(e => console.error('Replace track failed:', e));
        }
      });
    }
  };

  const togglePiP = async () => {
    try {
      const video = localVideoRef.current;
      if (!video) return;
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
      }
    } catch (e) { console.error('PiP failed:', e); }
  };

  const leaveRoom = () => { cleanup(); navigate('/'); };

  const cleanup = () => {
    intentionalCloseRef.current = true;
    if (wsReconnectTimerRef.current) clearTimeout(wsReconnectTimerRef.current);
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    if (screenStream) screenStream.getTracks().forEach(t => t.stop());
    peerConnectionsRef.current.forEach(pc => pc.close());
    peerConnectionsRef.current.clear();
    if (websocketRef.current) {
      websocketRef.current.close(1000, 'leave');
      websocketRef.current = null;
    }
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
  };

  const renderVideoGrid = () => {
    const remoteEntries = Array.from(remoteStreams.entries());
    // 会议室：默认固定网格，仅用户手动「固定」时才切换大画面（避免发言检测导致布局跳动）
    const mainUserId = pinnedUserId;
    const mainStream = mainUserId ? remoteStreams.get(mainUserId) : null;
    const mainUser = mainUserId ? users.find(u => u.id === mainUserId) : null;
    const otherEntries = remoteEntries.filter(([id]) => id !== mainUserId);

    if (mainStream && pinnedUserId) {
      return (
        <div className="trtc-layout">
          <div className="trtc-main">
            <div className="trtc-main-header">
              {mainUser?.username || 'Unknown'} 📌
              <button type="button" className="btn-icon unpin-btn" onClick={() => setPinnedUserId(null)}>取消固定</button>
            </div>
            <StableMediaVideo stream={mainStream} className="video" />
          </div>
          <div className="trtc-sidebar">
            <div className="video-container trtc-filmstrip">
              {renderLocalVideo()}
              {otherEntries.map(([rid, stream]) => renderRemoteVideo(rid, stream))}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="video-container meeting-grid">
        {renderLocalVideo()}
        {remoteEntries.map(([rid, stream]) => renderRemoteVideo(rid, stream))}
      </div>
    );
  };

  const renderLocalVideo = () => (
    <div className="video-wrapper local-video">
      <StableMediaVideo
        ref={localVideoRef}
        stream={localDisplayStream}
        className="video"
        muted
      />
      {!localStream && (
        <div className={`video-placeholder ${awaitingMediaGesture ? 'media-tap-overlay' : ''}`}>
          {awaitingMediaGesture ? (
            <button type="button" className="btn media-enable-btn" onClick={enableLocalMedia}>
              📷 开启摄像头和麦克风
            </button>
          ) : (
            window.isSecureContext ? '未开启摄像头' : 'HTTP 下无法开启本地摄像头'
          )}
        </div>
      )}
      <div className="video-overlay">
        {username} (我)
        {isScreenSharing && ' 🖥️'}
      </div>
    </div>
  );

  const renderRemoteVideo = (rid, stream) => {
    const user = users.find(u => u.id === rid);
    const isSpeaking = !mobile && rid === activeSpeakerId;
    return (
      <div key={rid} className={`video-wrapper ${isSpeaking ? 'speaking' : ''}`}>
        <StableMediaVideo stream={stream} className="video" />
        <div className="video-overlay">
          {user?.username || 'Unknown'}
          {isSpeaking && ' 🗣️'}
        </div>
        <button className="pin-btn" onClick={(e) => { e.stopPropagation(); setPinnedUserId(rid); }}>📌</button>
      </div>
    );
  };

  const [chatOpen, setChatOpen] = useState(false);

  return (
    <div className="meeting-room">
      <div className="room-header">
        <div className="room-info">
          <h1>会议室: {roomId}</h1>
          <span className="user-count">👥 {users.length + 1}</span>
          <span className={`connection-badge ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? '信令已连接' : '信令未连接'}
          </span>
        </div>
        <div className="room-actions">
          <button type="button" className="btn btn-sm" onClick={copyRoomId}>📋 复制ID</button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}
      {mediaHint && !error && <div className="media-hint">{mediaHint}</div>}

      <div className="meeting-body">
        <div className="meeting-main">
          {renderVideoGrid()}
        </div>

        {chatOpen && (
          <ChatPanel
            messages={chat.messages}
            unreadCount={chat.unreadCount}
            onSend={chat.sendChat}
            onOpenChange={chat.setOpen}
          />
        )}
      </div>

      <UserControlBar
        isAudioEnabled={isAudioEnabled}
        isVideoEnabled={isVideoEnabled}
        isRecording={recording.isRecording}
        formattedDuration={recording.formattedDuration}
        activeSpeakerName={activeSpeakerName}
        qualityLabel={qualityLabel}
        qualityIcon={qualityIcon}
        qualityColor={qualityColor}
        onToggleAudio={toggleAudio}
        onToggleVideo={toggleVideo}
        onToggleRecording={recording.toggleRecording}
        onToggleScreenShare={toggleScreenShare}
        onLeave={leaveRoom}
        onToggleChat={() => setChatOpen(prev => !prev)}
        onTogglePiP={togglePiP}
        isScreenSharing={isScreenSharing}
      />

      {recording.isRecording && recording.recordedBlobs.length > 0 && (
        <div className="recording-controls">
          <button className="btn btn-sm" onClick={recording.downloadRecording}>💾 下载录制</button>
        </div>
      )}

      <div className="user-list card">
        <h3>参会人员 ({users.length + 1})</h3>
        <div className="user-item">
          <div className="status-indicator"></div>
          {username} (我)
        </div>
        {users.map(u => (
          <div key={u.id} className="user-item">
            <div className="status-indicator"></div>
            {u.username}
          </div>
        ))}
      </div>

      <div className="connection-status" style={{ color: isConnected ? '#51cf66' : '#ff6b6b' }}>
        {isConnected ? '🟢 信令已连接' : '🔴 信令断开'}
        {isConnected && users.length === 0 && (
          <span style={{ marginLeft: 8, color: '#74c0fc', fontSize: 13 }}>
            · 等待其他人加入
          </span>
        )}
        {isConnected && users.length > 0 && (
          <span style={{ marginLeft: 8, color: '#adb5bd', fontSize: 12 }}>
            · 远端 {remoteStreams.size}/{users.length} · {rtcDebug}
          </span>
        )}
      </div>
    </div>
  );
}

export default MeetingRoom;
