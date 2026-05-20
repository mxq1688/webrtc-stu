import { useState, useEffect, useRef, useCallback } from 'react';

const QUALITY_LEVELS = ['excellent', 'good', 'fair', 'poor', 'very-poor', 'disconnected'];

function getQualityLevel(stats) {
  if (!stats) return 'disconnected';
  const { rtt, packetsLost, packetsSent, bitrate } = stats;
  if (rtt < 100 && packetsLost < 5 && bitrate > 500) return 'excellent';
  if (rtt < 200 && packetsLost < 20 && bitrate > 200) return 'good';
  if (rtt < 400 && packetsLost < 50) return 'fair';
  if (rtt < 800 && packetsLost < 100) return 'poor';
  return 'very-poor';
}

function getQualityLabel(level) {
  const labels = {
    'excellent': '极好',
    'good': '良好',
    'fair': '一般',
    'poor': '较差',
    'very-poor': '极差',
    waiting: '等待对方',
    disconnected: '媒体未通',
  };
  return labels[level] || '未知';
}

function getQualityIcon(level) {
  const icons = {
    'excellent': '📶',
    'good': '📶',
    'fair': '📉',
    'poor': '📉',
    'very-poor': '❌',
    waiting: '⏳',
    disconnected: '📵',
  };
  return icons[level] || '❓';
}

function getQualityColor(level) {
  const colors = {
    'excellent': '#51cf66',
    'good': '#94d82d',
    'fair': '#fcc419',
    'poor': '#ff922b',
    'very-poor': '#ff6b6b',
    waiting: '#74c0fc',
    disconnected: '#868e96',
  };
  return colors[level] || '#868e96';
}

export default function useNetworkQuality(peerConnectionsRef, intervalMs = 3000) {
  const [networkStats, setNetworkStats] = useState({});
  const [qualityLevel, setQualityLevel] = useState('waiting');
  const timerRef = useRef(null);

  const measure = useCallback(async () => {
    const stats = {};
    let totalRtt = 0;
    let totalLost = 0;
    let totalSent = 0;
    let totalBitrate = 0;
    let count = 0;

    for (const [userId, pc] of peerConnectionsRef.current.entries()) {
      try {
        if (!pc || pc.connectionState !== 'connected') continue;
        const rawStats = await pc.getStats();
        let rtt = 0, packetsLost = 0, packetsSent = 0, bytesSent = 0, bytesReceived = 0;
        rawStats.forEach(report => {
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            rtt = report.currentRoundTripTime ? report.currentRoundTripTime * 1000 : 0;
          }
          if (report.type === 'outbound-rtp' && report.kind === 'video') {
            bytesSent = report.bytesSent || 0;
            packetsSent = report.packetsSent || 0;
          }
          if (report.type === 'inbound-rtp' && report.kind === 'video') {
            bytesReceived = report.bytesReceived || 0;
            packetsLost = report.packetsLost || 0;
          }
        });
        stats[userId] = { rtt, packetsLost, packetsSent, bytesSent, bytesReceived };
        totalRtt += rtt;
        totalLost += packetsLost;
        totalSent += packetsSent;
        count++;
      } catch (e) {
        // skip
      }
    }

    if (count > 0) {
      const avgRtt = totalRtt / count;
      const avgLost = totalLost / count;
      const avgSent = totalSent / count;
      let bitrate = 0;
      if (count > 0) {
        const totalBytes = Object.values(stats).reduce((s, v) => s + (v.bytesSent || 0), 0);
        bitrate = totalBytes * 8 / (intervalMs / 1000) / 1000;
      }
      const level = getQualityLevel({ rtt: avgRtt, packetsLost: avgLost, packetsSent: avgSent, bitrate });
      setQualityLevel(level);
      setNetworkStats({ ...stats, _avg: { rtt: avgRtt, packetsLost: avgLost, bitrate, level } });
    } else if (peerConnectionsRef.current.size > 0) {
      setQualityLevel('disconnected');
    } else {
      setQualityLevel('waiting');
    }
  }, [peerConnectionsRef, intervalMs]);

  useEffect(() => {
    timerRef.current = setInterval(measure, intervalMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [measure, intervalMs]);

  return {
    networkStats,
    qualityLevel,
    qualityLabel: getQualityLabel(qualityLevel),
    qualityIcon: getQualityIcon(qualityLevel),
    qualityColor: getQualityColor(qualityLevel),
    measure,
  };
}

export { getQualityLabel, getQualityIcon, getQualityColor };
