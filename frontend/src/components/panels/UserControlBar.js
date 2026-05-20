import React from 'react';

export default function UserControlBar({
  isAudioEnabled,
  isVideoEnabled,
  isRecording,
  formattedDuration,
  isAnchor,
  role,
  activeSpeakerName,
  qualityLabel,
  qualityIcon,
  qualityColor,
  onToggleAudio,
  onToggleVideo,
  onToggleRecording,
  onToggleScreenShare,
  onChangeRole,
  onLeave,
  onToggleChat,
  onTogglePiP,
  isScreenSharing,
}) {
  return (
    <div className="control-bar">
      <div className="control-group control-group-left">
        <button
          className={`ctrl-btn ${isAudioEnabled ? 'ctrl-active' : 'ctrl-danger'}`}
          onClick={onToggleAudio}
          title="麦克风"
        >
          {isAudioEnabled ? '🎤' : '🔇'}
        </button>
        <button
          className={`ctrl-btn ${isVideoEnabled ? 'ctrl-active' : 'ctrl-danger'}`}
          onClick={onToggleVideo}
          title="摄像头"
        >
          {isVideoEnabled ? '📹' : '📵'}
        </button>
        <button
          className={`ctrl-btn ${isScreenSharing ? 'ctrl-active' : ''}`}
          onClick={onToggleScreenShare}
          title="屏幕共享"
        >
          🖥️
        </button>
      </div>

      <div className="control-group control-group-center">
        {activeSpeakerName && (
          <span className="active-speaker">🗣️ {activeSpeakerName}</span>
        )}
        <span className="quality-badge" style={{ color: qualityColor }} title="音视频 P2P 质量（与信令连接无关）">
          {qualityIcon} 媒体:{qualityLabel}
        </span>
        {isRecording && (
          <span className="recording-badge">🔴 REC {formattedDuration}</span>
        )}
      </div>

      <div className="control-group control-group-right">
        <button className="ctrl-btn" onClick={onToggleRecording} title="录制">
          {isRecording ? '⏹️' : '⏺️'}
        </button>
        <button className="ctrl-btn" onClick={onToggleChat} title="聊天">💬</button>
        <button className="ctrl-btn" onClick={onTogglePiP} title="画中画">🖼️</button>
        <select className="role-select" value={role} onChange={e => onChangeRole(e.target.value)} title="角色">
          <option value="anchor">主播</option>
          <option value="audience">观众</option>
        </select>
        <button className="ctrl-btn ctrl-danger" onClick={onLeave} title="离开">🚪</button>
      </div>
    </div>
  );
}
