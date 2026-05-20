import { useState, useCallback, useRef } from 'react';

export default function useRecording(localStream, remoteStreams) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordedBlobs, setRecordedBlobs] = useState([]);
  const mediaRecorderRef = useRef(null);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);

  const startRecording = useCallback(() => {
    try {
      const tracks = [];
      if (localStream) {
        localStream.getTracks().forEach(t => tracks.push(t));
      }
      for (const [, stream] of remoteStreams.entries()) {
        stream.getTracks().forEach(t => tracks.push(t));
      }
      if (tracks.length === 0) return;

      const combined = new MediaStream(tracks);
      const recorder = new MediaRecorder(combined, {
        mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
          ? 'video/webm;codecs=vp9'
          : 'video/webm',
      });

      const blobs = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) blobs.push(e.data);
      };
      recorder.onstop = () => {
        setRecordedBlobs(blobs.slice());
      };

      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      startTimeRef.current = Date.now();
      setRecordingDuration(0);

      timerRef.current = setInterval(() => {
        setRecordingDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    } catch (e) {
      console.error('Recording start failed:', e);
    }
  }, [localStream, remoteStreams]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const downloadRecording = useCallback(() => {
    if (recordedBlobs.length === 0) return;
    const blob = new Blob(recordedBlobs, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meeting-recording-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.webm`;
    a.click();
    URL.revokeObjectURL(url);
  }, [recordedBlobs]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  const formatDuration = useCallback((seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }, []);

  return {
    isRecording,
    recordingDuration,
    recordedBlobs,
    toggleRecording,
    downloadRecording,
    formattedDuration: formatDuration(recordingDuration),
  };
}
