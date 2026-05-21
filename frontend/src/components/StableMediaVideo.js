import React, { memo, useEffect, useRef, forwardRef } from 'react';

/**
 * 稳定挂载的 <video>：避免父组件重渲染时 callback ref 反复赋值导致画面闪烁（尤其 iOS Safari）。
 */
const StableMediaVideo = forwardRef(function StableMediaVideo(
  { stream, muted = false, className = 'video' },
  forwardedRef
) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject === stream) return;
    el.srcObject = stream || null;
    if (stream) {
      el.play().catch(() => {});
    }
  }, [stream]);

  const setRef = (el) => {
    ref.current = el;
    if (typeof forwardedRef === 'function') {
      forwardedRef(el);
    } else if (forwardedRef) {
      forwardedRef.current = el;
    }
  };

  return (
    <video
      ref={setRef}
      className={className}
      autoPlay
      muted={muted}
      playsInline
    />
  );
});

export default memo(StableMediaVideo);
