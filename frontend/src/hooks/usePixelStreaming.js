import { useRef, useCallback, useState, useEffect } from 'react';

export default function usePixelStreaming(iframeRef) {
  const psRef = useRef(null);
  const [psReady, setPsReady] = useState(false);
  const [psQuality, setPsQuality] = useState('standard');
  const [psStats, setPsStats] = useState(null);

  useEffect(() => {
    const initPS = () => {
      if (!iframeRef.current) return;
      try {
        const iframe = iframeRef.current;
        const ps = {
          iframe,
          emitCommand: (command) => {
            iframe.contentWindow?.postMessage({ type: 'command', ...command }, '*');
          },
          emitUIInteraction: (data) => {
            iframe.contentWindow?.postMessage({ type: 'uiInteraction', data }, '*');
          },
          emitResponse: (data) => {
            iframe.contentWindow?.postMessage({ type: 'response', data }, '*');
          },
          setQuality: (quality) => {
            setPsQuality(quality);
            iframe.contentWindow?.postMessage({ type: 'command', command: 'SetQuality', quality }, '*');
          },
          requestKeyframe: () => {
            iframe.contentWindow?.postMessage({ type: 'command', command: 'RequestKeyframe' }, '*');
          },
          sendInput: (inputData) => {
            iframe.contentWindow?.postMessage({ type: 'command', command: 'SendInput', inputData }, '*');
          },
          resize: () => {
            iframe.contentWindow?.postMessage({
              type: 'command',
              command: 'Resize',
              width: iframe.clientWidth,
              height: iframe.clientHeight,
            }, '*');
          },
        };
        psRef.current = ps;
        setPsReady(true);
      } catch (e) {
        console.error('PixelStreaming init failed:', e);
      }
    };

    const timer = setTimeout(initPS, 2000);
    return () => clearTimeout(timer);
  }, [iframeRef]);

  useEffect(() => {
    const handler = (event) => {
      if (!event.data?.type) return;
      switch (event.data.type) {
        case 'stat':
          setPsStats(event.data.data);
          break;
        case 'quality':
          setPsQuality(event.data.quality || 'standard');
          break;
        case 'playerReady':
          setPsReady(true);
          if (psRef.current) {
            psRef.current.resize();
          }
          break;
        default:
          break;
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const emitCommand = useCallback((command) => {
    psRef.current?.emitCommand(command);
  }, []);

  const emitUIInteraction = useCallback((data) => {
    psRef.current?.emitUIInteraction(data);
  }, []);

  const setQuality = useCallback((quality) => {
    psRef.current?.setQuality(quality);
    setPsQuality(quality);
  }, []);

  const requestKeyframe = useCallback(() => {
    psRef.current?.requestKeyframe();
  }, []);

  const sendInput = useCallback((inputData) => {
    psRef.current?.sendInput(inputData);
  }, []);

  const resizePlayer = useCallback(() => {
    psRef.current?.resize();
  }, []);

  return {
    psReady,
    psQuality,
    psStats,
    emitCommand,
    emitUIInteraction,
    setQuality,
    requestKeyframe,
    sendInput,
    resizePlayer,
  };
}
