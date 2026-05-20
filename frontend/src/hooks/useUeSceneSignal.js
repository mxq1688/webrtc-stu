import { useEffect, useRef, useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { getUeWebSocketURL } from '../utils/ws';
import { isValidEmbedUrl, parseSceneEmbedFromMessage } from '../utils/embedUrl';

/**
 * UE 专用信令 /ws/ue，仅同步 Pixel Streaming 播放器地址。
 */
export function useUeSceneSignal({ sceneId, username, initialUrl }) {
  const userId = useRef(uuidv4());
  const wsRef = useRef(null);
  const publishedRef = useRef(false);
  const [embedUrl, setEmbedUrl] = useState(initialUrl || '');
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');

  const sendMessage = useCallback((message) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  useEffect(() => {
    setEmbedUrl(initialUrl || '');
  }, [initialUrl]);

  useEffect(() => {
    if (!sceneId || !username) return undefined;

    publishedRef.current = false;
    const wsUrl = `${getUeWebSocketURL()}?userId=${userId.current}&sceneId=${encodeURIComponent(sceneId)}&username=${encodeURIComponent(username)}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setError('');
      const url = initialUrl?.trim();
      if (url && isValidEmbedUrl(url) && !publishedRef.current) {
        publishedRef.current = true;
        sendMessage({ type: 'set-scene-embed', data: { embedUrl: url } });
      }
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'scene-embed') {
          const url = parseSceneEmbedFromMessage(message.data);
          if (url !== null) {
            setEmbedUrl(url);
          }
        }
      } catch (e) {
        console.warn('UE 信令解析失败', e);
      }
    };

    ws.onclose = () => setConnected(false);
    ws.onerror = () => setError('UE 信令连接失败');

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [sceneId, username, initialUrl, sendMessage]);

  const publishEmbed = useCallback(
    (url) => {
      const t = (url ?? '').trim();
      if (t !== '' && !isValidEmbedUrl(t)) {
        setError('播放器地址需为 http(s):// 开头的有效 URL');
        return false;
      }
      setError('');
      setEmbedUrl(t);
      sendMessage({ type: 'set-scene-embed', data: { embedUrl: t } });
      return true;
    },
    [sendMessage]
  );

  const clearEmbed = useCallback(() => publishEmbed(''), [publishEmbed]);

  return {
    embedUrl,
    connected,
    error,
    setError,
    publishEmbed,
    clearEmbed,
    userId: userId.current,
  };
}
