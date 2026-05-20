import { useState, useEffect, useRef, useCallback } from 'react';

export default function useActiveSpeaker(remoteStreams, users, threshold = 0.05) {
  const [activeSpeakerId, setActiveSpeakerId] = useState(null);
  const [activeSpeakerName, setActiveSpeakerName] = useState('');
  const analyzersRef = useRef(new Map());
  const timerRef = useRef(null);

  const updateAnalyzers = useCallback(() => {
    const currentKeys = new Set(analyzersRef.current.keys());
    const streamKeys = new Set();

    for (const [userId, stream] of remoteStreams.entries()) {
      streamKeys.add(userId);
      if (!currentKeys.has(userId)) {
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length > 0) {
          try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const source = ctx.createMediaStreamSource(stream);
            const analyzer = ctx.createAnalyser();
            analyzer.fftSize = 256;
            source.connect(analyzer);
            analyzersRef.current.set(userId, { ctx, analyzer });
          } catch (e) {
            // audio context not available
          }
        }
      }
    }

    for (const userId of currentKeys) {
      if (!streamKeys.has(userId)) {
        const entry = analyzersRef.current.get(userId);
        if (entry) {
          try { entry.ctx.close(); } catch (e) {}
          analyzersRef.current.delete(userId);
        }
      }
    }
  }, [remoteStreams]);

  const measure = useCallback(() => {
    let maxVolume = 0;
    let maxUserId = null;

    for (const [userId, { analyzer }] of analyzersRef.current.entries()) {
      try {
        const data = new Uint8Array(analyzer.frequencyBinCount);
        analyzer.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const avg = sum / data.length / 255;
        if (avg > maxVolume) {
          maxVolume = avg;
          maxUserId = userId;
        }
      } catch (e) {
        // skip
      }
    }

    if (maxVolume > threshold && maxUserId) {
      setActiveSpeakerId(maxUserId);
      const user = users.find(u => u.id === maxUserId);
      setActiveSpeakerName(user?.username || '');
    } else {
      setActiveSpeakerId(null);
      setActiveSpeakerName('');
    }
  }, [users, threshold]);

  useEffect(() => {
    updateAnalyzers();
  }, [updateAnalyzers]);

  useEffect(() => {
    timerRef.current = setInterval(measure, 200);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      for (const [, entry] of analyzersRef.current.entries()) {
        try { entry.ctx.close(); } catch (e) {}
      }
      analyzersRef.current.clear();
    };
  }, [measure]);

  return { activeSpeakerId, activeSpeakerName };
}
