import React, { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';

// 动态生成WebSocket URL
const getWebSocketURL = (useHTTP = false) => {
  const host = window.location.hostname;
  
  if (useHTTP || window.location.protocol === 'http:') {
    // HTTP页面或强制使用HTTP WebSocket
    console.log('🔧 使用HTTP WebSocket连接:', `ws://${host}:8080/ws`);
    return `ws://${host}:8080/ws`;
  } else {
    // HTTPS页面使用WSS（使用mkcert生成的可信证书）
    console.log('🔒 使用HTTPS WebSocket连接:', `wss://${host}:8443/ws`);
    return `wss://${host}:8443/ws`;
  }
};

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
      console.log('🎥 开始初始化媒体设备...');
      
      // 检测是否为移动设备
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      console.log('📱 设备类型:', isMobile ? '移动设备' : '桌面设备');
      
      // 针对移动设备优化的媒体约束
      const constraints = {
        video: {
          width: isMobile ? { ideal: 640, max: 1280 } : { ideal: 1280 },
          height: isMobile ? { ideal: 480, max: 720 } : { ideal: 720 },
          frameRate: { ideal: 30, max: 30 },
          facingMode: isMobile ? 'user' : undefined  // 前置摄像头
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      };

      console.log('🎬 请求媒体权限，约束:', constraints);

      // 检查浏览器是否支持getUserMedia
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('您的浏览器不支持WebRTC功能，请升级浏览器或使用Chrome/Firefox/Safari');
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('✅ 媒体流获取成功:', stream.getTracks().map(track => `${track.kind}: ${track.label}`));
      
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      
      // 清除错误信息
      setError('');
      
    } catch (err) {
      console.error('❌ 获取媒体设备失败:', err);
      
      let errorMessage = '';
      
      // 根据错误类型提供具体的解决方案
      switch (err.name) {
        case 'NotAllowedError':
        case 'PermissionDeniedError':
          errorMessage = '📱 摄像头权限被拒绝。请在浏览器设置中允许访问摄像头和麦克风权限，然后刷新页面重试。';
          break;
        case 'NotFoundError':
        case 'DevicesNotFoundError':
          errorMessage = '📷 未找到摄像头设备。请确保设备连接正常，或尝试连接外部摄像头。';
          break;
        case 'NotReadableError':
        case 'TrackStartError':
          errorMessage = '🔧 摄像头正被其他应用使用。请关闭其他视频应用后重试。';
          break;
        case 'OverconstrainedError':
        case 'ConstraintNotSatisfiedError':
          errorMessage = '⚙️ 摄像头不支持请求的配置。正在尝试备用配置...';
          // 尝试更基础的配置
          setTimeout(() => tryFallbackConstraints(), 1000);
          break;
        case 'NotSupportedError':
          errorMessage = '🌐 您的浏览器不支持WebRTC。请使用Chrome、Firefox、Safari或Edge浏览器。';
          break;
        case 'AbortError':
          errorMessage = '⏱️ 设备访问请求超时。请重试或检查设备连接。';
          break;
        default:
          if (err.message.includes('Only secure origins are allowed')) {
            errorMessage = '🔒 安全限制：移动设备需要HTTPS访问。请使用安全连接或尝试桌面浏览器。';
          } else {
            errorMessage = `❌ 未知错误: ${err.message}。请刷新页面重试或联系技术支持。`;
          }
      }
      
      setError(errorMessage);
      
      // 如果是权限问题，显示权限指导
      if (err.name === 'NotAllowedError') {
        setTimeout(() => {
          setError(prev => prev + '\n\n💡 权限设置指南:\n1. 点击地址栏左侧的锁定图标\n2. 选择"允许"摄像头和麦克风\n3. 刷新页面重新加入会议');
        }, 2000);
      }
    }
  };

  // 备用配置尝试
  const tryFallbackConstraints = async () => {
    try {
      console.log('🔄 尝试备用媒体配置...');
      
      const fallbackConstraints = {
        video: true,  // 最简配置
        audio: true
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
      console.log('✅ 备用配置成功:', stream.getTracks().map(track => `${track.kind}: ${track.label}`));
      
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      setError('✅ 已使用备用配置成功连接摄像头');
      
      // 3秒后清除成功消息
      setTimeout(() => setError(''), 3000);
      
    } catch (fallbackErr) {
      console.error('❌ 备用配置也失败:', fallbackErr);
      setError('❌ 所有配置都失败了。请检查设备权限设置或尝试重新插拔摄像头。');
    }
  };

  const connectWebSocket = (useHTTPFallback = false) => {
    const baseWsUrl = getWebSocketURL(useHTTPFallback);
    const wsUrl = `${baseWsUrl}?userId=${userId.current}&roomId=${roomId}&username=${encodeURIComponent(username)}`;
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
      
      // HTTPS页面必须使用WSS，不能降级到WS
      if (window.location.protocol === 'https:') {
        setError('🔒 证书连接失败。请确保访问地址正确，或尝试刷新页面。如果问题持续，请联系管理员。');
      } else {
        setError('服务器连接失败，请检查网络连接');
      }
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

  const retryMediaAccess = () => {
    setError('🔄 正在重新尝试获取摄像头权限...');
    initializeMedia();
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

      {error && (
        <div className="error">
          {error}
          {(error.includes('权限') || error.includes('失败') || error.includes('错误')) && (
            <button 
              className="btn" 
              onClick={retryMediaAccess}
              style={{ marginTop: '10px', fontSize: '14px' }}
            >
              🔄 重新尝试
            </button>
          )}
        </div>
      )}

      <div className="video-container">
        {/* 本地视频 */}
        <div className="video-wrapper">
          <video
            ref={localVideoRef}
            className="video"
            autoPlay
            muted
            playsInline
            webkit-playsinline="true"
            x5-playsinline="true"
            x5-video-player-type="h5"
            x5-video-player-fullscreen="false"
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
                webkit-playsinline="true"
                x5-playsinline="true"
                x5-video-player-type="h5"
                x5-video-player-fullscreen="false"
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