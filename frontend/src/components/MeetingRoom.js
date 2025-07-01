import React, { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';

const WEBSOCKET_URL = 'ws://localhost:8080/ws';

function MeetingRoom() {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const username = searchParams.get('username');
  const userId = useRef(uuidv4());
  
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState(new Map());
  const [users, setUsers] = useState([]);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState('');

  const localVideoRef = useRef();
  const websocketRef = useRef();
  const peerConnectionsRef = useRef(new Map());
  const remoteVideoRefs = useRef(new Map());

  const servers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };

  useEffect(() => {
    if (!username) {
      navigate('/');
      return;
    }
    
    initializeMedia();
    connectWebSocket();
    
    return () => {
      cleanup();
    };
  }, [roomId, username]);

  const initializeMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('获取媒体设备失败:', err);
      setError('无法访问摄像头或麦克风，请检查设备权限');
    }
  };

  const connectWebSocket = () => {
    const wsUrl = `${WEBSOCKET_URL}?userId=${userId.current}&roomId=${roomId}&username=${encodeURIComponent(username)}`;
    console.log('🔗 尝试连接WebSocket:', wsUrl);
    console.log('🔗 连接参数:', { userId: userId.current, roomId, username });
    
    websocketRef.current = new WebSocket(wsUrl);

    websocketRef.current.onopen = () => {
      console.log('✅ WebSocket连接已建立');
      setIsConnected(true);
      setError(''); // 清除之前的错误
    };

    websocketRef.current.onmessage = async (event) => {
      console.log('📩 收到WebSocket消息:', event.data);
      try {
        const message = JSON.parse(event.data);
        await handleWebSocketMessage(message);
      } catch (err) {
        console.error('❌ 解析消息失败:', err, event.data);
      }
    };

    websocketRef.current.onclose = (event) => {
      console.log('❌ WebSocket连接已关闭', { code: event.code, reason: event.reason });
      setIsConnected(false);
      
      // 根据关闭代码显示不同的错误信息
      if (event.code === 1006) {
        setError('连接异常关闭，请检查网络或刷新页面重试');
      } else if (event.code === 1000) {
        setError('连接正常关闭');
      } else {
        setError(`连接关闭 (代码: ${event.code}, 原因: ${event.reason || '未知'})`);
      }
    };

    websocketRef.current.onerror = (error) => {
      console.error('❌ WebSocket错误:', error);
      setError('服务器连接失败，请检查网络连接');
    };
  };

  const handleWebSocketMessage = async (message) => {
    console.log('收到消息:', message);

    switch (message.type) {
      case 'user-list':
        setUsers(message.data || []);
        break;
        
      case 'user-joined':
        if (message.userId !== userId.current) {
          setUsers(prev => [...prev, { id: message.userId, username: message.username }]);
          await createPeerConnection(message.userId);
          await createOffer(message.userId);
        }
        break;
        
      case 'user-left':
        setUsers(prev => prev.filter(user => user.id !== message.userId));
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
    }
  };

  const createPeerConnection = async (remoteUserId) => {
    const peerConnection = new RTCPeerConnection(servers);
    peerConnectionsRef.current.set(remoteUserId, peerConnection);

    // 添加本地流
    if (localStream) {
      localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
      });
    }

    // 处理远程流
    peerConnection.ontrack = (event) => {
      console.log('收到远程流:', event);
      const [remoteStream] = event.streams;
      setRemoteStreams(prev => new Map(prev.set(remoteUserId, remoteStream)));
    };

    // 处理ICE候选者
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        sendMessage({
          type: 'ice-candidate',
          data: event.candidate,
          targetUserId: remoteUserId
        });
      }
    };

    return peerConnection;
  };

  const createOffer = async (remoteUserId) => {
    const peerConnection = peerConnectionsRef.current.get(remoteUserId);
    if (!peerConnection) return;

    try {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      
      sendMessage({
        type: 'offer',
        data: offer,
        targetUserId: remoteUserId
      });
    } catch (error) {
      console.error('创建offer失败:', error);
    }
  };

  const handleOffer = async (message) => {
    const { userId: remoteUserId, data: offer } = message;
    
    let peerConnection = peerConnectionsRef.current.get(remoteUserId);
    if (!peerConnection) {
      peerConnection = await createPeerConnection(remoteUserId);
    }

    try {
      await peerConnection.setRemoteDescription(offer);
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      
      sendMessage({
        type: 'answer',
        data: answer,
        targetUserId: remoteUserId
      });
    } catch (error) {
      console.error('处理offer失败:', error);
    }
  };

  const handleAnswer = async (message) => {
    const { userId: remoteUserId, data: answer } = message;
    const peerConnection = peerConnectionsRef.current.get(remoteUserId);
    
    if (peerConnection) {
      try {
        await peerConnection.setRemoteDescription(answer);
      } catch (error) {
        console.error('处理answer失败:', error);
      }
    }
  };

  const handleIceCandidate = async (message) => {
    const { userId: remoteUserId, data: candidate } = message;
    const peerConnection = peerConnectionsRef.current.get(remoteUserId);
    
    if (peerConnection) {
      try {
        await peerConnection.addIceCandidate(candidate);
      } catch (error) {
        console.error('添加ICE候选者失败:', error);
      }
    }
  };

  const sendMessage = (message) => {
    if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) {
      websocketRef.current.send(JSON.stringify(message));
    }
  };

  const closePeerConnection = (remoteUserId) => {
    const peerConnection = peerConnectionsRef.current.get(remoteUserId);
    if (peerConnection) {
      peerConnection.close();
      peerConnectionsRef.current.delete(remoteUserId);
    }
    setRemoteStreams(prev => {
      const newMap = new Map(prev);
      newMap.delete(remoteUserId);
      return newMap;
    });
  };

  const toggleAudio = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
      }
    }
  };

  const leaveRoom = () => {
    cleanup();
    navigate('/');
  };

  const cleanup = () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    
    peerConnectionsRef.current.forEach(pc => pc.close());
    peerConnectionsRef.current.clear();
    
    if (websocketRef.current) {
      websocketRef.current.close();
    }
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    alert('房间ID已复制到剪贴板');
  };

  return (
    <div className="container">
      <div className="header">
        <h1>会议室: {roomId}</h1>
        <p>用户: {username} | 在线人数: {users.length + 1}</p>
        <button className="btn" onClick={copyRoomId} style={{ marginTop: '10px' }}>
          复制房间ID
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="video-container">
        {/* 本地视频 */}
        <div className="video-wrapper">
          <video
            ref={localVideoRef}
            className="video"
            autoPlay
            muted
            playsInline
          />
          <div className="video-overlay">
            {username} (我)
          </div>
        </div>

        {/* 远程视频 */}
        {Array.from(remoteStreams.entries()).map(([userId, stream]) => {
          const user = users.find(u => u.id === userId);
          return (
            <div key={userId} className="video-wrapper">
              <video
                className="video"
                autoPlay
                playsInline
                ref={(el) => {
                  if (el && stream) {
                    el.srcObject = stream;
                  }
                }}
              />
              <div className="video-overlay">
                {user?.username || 'Unknown User'}
              </div>
            </div>
          );
        })}
      </div>

      <div className="controls">
        <button
          className={`btn ${isAudioEnabled ? 'btn-success' : 'btn-danger'}`}
          onClick={toggleAudio}
        >
          {isAudioEnabled ? '🎤 麦克风开启' : '🎤 麦克风关闭'}
        </button>
        
        <button
          className={`btn ${isVideoEnabled ? 'btn-success' : 'btn-danger'}`}
          onClick={toggleVideo}
        >
          {isVideoEnabled ? '📹 摄像头开启' : '📹 摄像头关闭'}
        </button>
        
        <button className="btn btn-danger" onClick={leaveRoom}>
          离开会议
        </button>
      </div>

      <div className="user-list">
        <h3>参会人员 ({users.length + 1})</h3>
        <div className="user-item">
          <div className="status-indicator"></div>
          {username} (我)
        </div>
        {users.map(user => (
          <div key={user.id} className="user-item">
            <div className="status-indicator"></div>
            {user.username}
          </div>
        ))}
      </div>

      <div style={{ textAlign: 'center', marginTop: '20px', color: isConnected ? '#51cf66' : '#ff6b6b' }}>
        {isConnected ? '🟢 已连接到服务器' : '🔴 服务器连接断开'}
      </div>
    </div>
  );
}

export default MeetingRoom; 