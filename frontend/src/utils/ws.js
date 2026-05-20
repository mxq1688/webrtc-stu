function wsBase() {
  if (process.env.REACT_APP_WS_URL) {
    return process.env.REACT_APP_WS_URL.replace(/\/ws\/?$/, '');
  }
  const { protocol, host, hostname, port } = window.location;
  const wsProto = protocol === 'https:' ? 'wss:' : 'ws:';
  if (!port || port === '80' || port === '443') {
    return `${wsProto}//${host}`;
  }
  if (protocol === 'https:') {
    return `wss://${hostname}:8443`;
  }
  return `${wsProto}//${host}`;
}

/** 视频会议信令 /ws */
export function getMeetingWebSocketURL() {
  if (process.env.REACT_APP_MEETING_WS_URL) {
    return process.env.REACT_APP_MEETING_WS_URL;
  }
  return `${wsBase()}/ws`;
}

/** UE 场景信令 /ws/ue（与会议无关） */
export function getUeWebSocketURL() {
  if (process.env.REACT_APP_UE_WS_URL) {
    return process.env.REACT_APP_UE_WS_URL;
  }
  return `${wsBase()}/ws/ue`;
}

/** @deprecated 使用 getMeetingWebSocketURL */
export function getWebSocketURL() {
  return getMeetingWebSocketURL();
}
