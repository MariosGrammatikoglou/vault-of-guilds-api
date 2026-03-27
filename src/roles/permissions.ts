export const PERMS = {
  MANAGE_ROLES: 1 << 0,
  MANAGE_CHANNELS: 1 << 1,
  SEND_MESSAGES: 1 << 2,
  CONNECT_VOICE: 1 << 3,
  KICK_MEMBERS: 1 << 4,
} as const;

export type PermName = keyof typeof PERMS;

export function combine(...names: PermName[]) {
  return names.reduce((sum, n) => sum | PERMS[n], 0);
}

export const ALL_PERMS =
  PERMS.MANAGE_ROLES |
  PERMS.MANAGE_CHANNELS |
  PERMS.SEND_MESSAGES |
  PERMS.CONNECT_VOICE |
  PERMS.KICK_MEMBERS;
