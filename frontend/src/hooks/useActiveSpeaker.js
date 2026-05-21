import { useState, useEffect, useRef, useCallback } from 'react';

export default function useActiveSpeaker(remoteStreams, users, options = {}) {
  const { enabled = true, threshold = options.threshold ?? 0.08 } = options;
  const [activeSpeakerId, setActiveSpeakerId] = useState(null);
  const [activeSpeakerName, setActiveSpeakerName] = useState('');
  const analyzersRef = useRef(new Map());
  const timerRef = useRef(null);
  const currentIdRef = useRef(null);
  const lastSwitchRef = useRef(0);
  const silentSinceRef = useRef(0);

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

    const now = Date.now();
    const HOLD_MS = 1200;
    const CLEAR_MS = 1500;

    if (maxVolume > threshold && maxUserId) {
      silentSinceRef.current = 0;
      const same = currentIdRef.current === maxUserId;
      const canSwitch = same || now - lastSwitchRef.current >= HOLD_MS;
      if (canSwitch) {
        currentIdRef.current = maxUserId;
        lastSwitchRef.current = now;
        setActiveSpeakerId(maxUserId);
        const user = users.find(u => u.id === maxUserId);
        setActiveSpeakerName(user?.username || '');
      }
    } else {
      if (!silentSinceRef.current) silentSinceRef.current = now;
      if (now - silentSinceRef.current >= CLEAR_MS && currentIdRef.current) {
        currentIdRef.current = null;
        setActiveSpeakerId(null);
        setActiveSpeakerName('');
      }
    }
  }, [users, threshold]);

  useEffect(() => {
    if (!enabled) return;
    updateAnalyzers();
  }, [enabled, updateAnalyzers]);

  useEffect(() => {
    if (!enabled || remoteStreams.size === 0) {
      setActiveSpeakerId(null);
      setActiveSpeakerName('');
      return undefined;
    }
    timerRef.current = setInterval(measure, 500);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [enabled, measure, remoteStreams.size]);

  return { activeSpeakerId, activeSpeakerName };
}
