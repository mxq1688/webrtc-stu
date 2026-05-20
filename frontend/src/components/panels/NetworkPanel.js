import React from 'react';

export default function NetworkPanel({ qualityLevel, qualityLabel, qualityIcon, qualityColor, networkStats }) {
  const avg = networkStats._avg;

  return (
    <div className="network-panel">
      <div className="network-quality" style={{ color: qualityColor }}>
        {qualityIcon} {qualityLabel}
      </div>
      {avg && (
        <div className="network-details">
          <span>RTT: {Math.round(avg.rtt)}ms</span>
          <span>丢包: {Math.round(avg.packetsLost)}</span>
          <span>码率: {Math.round(avg.bitrate)}kbps</span>
        </div>
      )}
    </div>
  );
}
