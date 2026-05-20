import { useState, useCallback } from 'react';

const ROLES = {
  ANCHOR: 'anchor',
  AUDIENCE: 'audience',
};

export default function useRoleManager(initialRole, sendMessage, userId) {
  const [role, setRole] = useState(initialRole || ROLES.ANCHOR);
  const [userRoles, setUserRoles] = useState({});

  const changeRole = useCallback((newRole) => {
    if (newRole !== ROLES.ANCHOR && newRole !== ROLES.AUDIENCE) return;
    setRole(newRole);
    sendMessage({ type: 'change-role', data: { role: newRole } });
  }, [sendMessage]);

  const handleRoleMessage = useCallback((message) => {
    if (message.type === 'role-changed') {
      const newRole = message.data?.role || message.data;
      const changedUserId = message.userId;
      setUserRoles(prev => ({ ...prev, [changedUserId]: newRole }));
      if (changedUserId === userId) {
        setRole(newRole);
      }
    }
    if (message.type === 'user-joined') {
      const joinRole = message.data?.role || ROLES.ANCHOR;
      setUserRoles(prev => ({ ...prev, [message.userId]: joinRole }));
    }
    if (message.type === 'user-list') {
      const roles = {};
      for (const u of message.data || []) {
        roles[u.id] = u.role || ROLES.ANCHOR;
      }
      setUserRoles(prev => ({ ...prev, ...roles }));
    }
  }, [userId]);

  const isAnchor = role === ROLES.ANCHOR;
  const isAudience = role === ROLES.AUDIENCE;

  return {
    role,
    userRoles,
    isAnchor,
    isAudience,
    changeRole,
    handleRoleMessage,
    ROLES,
  };
}
