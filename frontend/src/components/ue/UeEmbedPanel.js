import React from 'react';
import usePixelStreaming from '../../hooks/usePixelStreaming';

/**
 * UE Pixel Streaming 专用面板：地址输入、iframe 画面、画质与统计。
 */
export default function UeEmbedPanel({
  embedUrl,
  draft,
  onDraftChange,
  onLoad,
  onSync,
  onClear,
  showSync,
  connected,
}) {
  const iframeRef = React.useRef(null);
  const ps = usePixelStreaming(iframeRef);

  return (
    <>
      <div className="card ue-toolbar">
        <h3 style={{ marginTop: 0, color: '#333' }}>Pixel Streaming</h3>
        <p className="ue-hint">
          填写 UE 官方播放器页地址（如 player.html）。若 iframe 空白，请在 UE / 网关允许本站点嵌入。
        </p>
        <input
          type="url"
          className="input"
          placeholder="https://你的主机:端口/player.html"
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onLoad()}
        />
        <div className="ue-toolbar-actions">
          <button type="button" className="btn" onClick={onLoad}>
            加载画面
          </button>
          {showSync && onSync && (
            <button type="button" className="btn" onClick={onSync}>
              同步到房间
            </button>
          )}
          <button type="button" className="btn btn-danger" onClick={onClear}>
            清除
          </button>
        </div>
        {showSync && (
          <p className="ue-status">信令：{connected ? '🟢 已连接' : '🔴 未连接'}</p>
        )}
        {embedUrl && ps.psReady && (
          <div className="ps-controls">
            <span className="ps-status">🎮 PS 已连接</span>
            <select
              className="quality-select"
              value={ps.psQuality}
              onChange={(e) => ps.setQuality(e.target.value)}
            >
              <option value="low">低画质</option>
              <option value="standard">标准画质</option>
              <option value="high">高画质</option>
              <option value="ultra">超高画质</option>
            </select>
            {ps.psStats && (
              <span className="ps-stats">
                {ps.psStats.fps && `FPS: ${ps.psStats.fps}`}
                {ps.psStats.bitrate && ` | ${Math.round(ps.psStats.bitrate / 1000)}kbps`}
              </span>
            )}
          </div>
        )}
      </div>

      {embedUrl ? (
        <div className="ue-player">
          <div className="ue-player-header">
            远程渲染画面{ps.psReady ? ' ●' : ''}
          </div>
          <iframe
            ref={iframeRef}
            className="ue-player-frame"
            src={embedUrl}
            title="UE Pixel Streaming"
            allowFullScreen
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; display-capture; microphone; camera"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      ) : (
        <div className="ue-player ue-player--empty">
          <p>请填写播放器地址后点击「加载画面」</p>
          <p className="ue-player-hint">示例：https://你的主机:端口/player.html</p>
        </div>
      )}
    </>
  );
}
