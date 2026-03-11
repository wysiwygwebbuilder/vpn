export interface VlessConfig {
  id: string;
  uuid: string;
  host: string;
  port: number;
  name: string;
  ping: number;
  raw: string;
  security?: string;
  network?: string;
  fingerprint?: string;
}

const SUPPORTED_NATIVE_NETWORKS = new Set(['tcp', 'ws', 'grpc', 'httpupgrade', 'splithttp']);

export const PRIORITY_SUBSCRIPTION_URLS = [
  'https://raw.githubusercontent.com/zieng2/wl/main/vless_universal.txt',
  'https://raw.githubusercontent.com/igareck/vpn-configs-for-russia/main/WHITE-CIDR-RU-checked.txt',
] as const;

export const SECONDARY_SUBSCRIPTION_URLS = [
  'https://raw.githubusercontent.com/barry-far/V2ray-config/main/Splitted-By-Protocol/vless.txt',
  'https://raw.githubusercontent.com/Epodonios/v2ray-configs/main/Splitted-By-Protocol/vless.txt',
  'https://raw.githubusercontent.com/MatinGhanbari/v2ray-configs/main/subscriptions/filtered/subs/vless.txt',
  'https://raw.githubusercontent.com/ebrasha/free-v2ray-public-list/main/vless_configs.txt',
] as const;

export const SUBSCRIPTION_URLS = [
  ...PRIORITY_SUBSCRIPTION_URLS,
  ...SECONDARY_SUBSCRIPTION_URLS,
] as const;

const VLESS_PROTOCOL = 'vless://';

export const normalizeNativeNetwork = (value?: string | null): string => {
  const normalized = (value ?? 'tcp').trim().toLowerCase();

  switch (normalized) {
    case '':
    case 'raw':
    case 'tcp':
      return 'tcp';
    case 'websocket':
      return 'ws';
    case 'http-upgrade':
      return 'httpupgrade';
    case 'xhttp':
    case 'split-http':
    case 'splithttp':
      return 'splithttp';
    default:
      return normalized;
  }
};

const decodeBase64IfNeeded = (input: string): string => {
  const trimmed = input.trim();
  if (!trimmed || trimmed.includes(VLESS_PROTOCOL)) {
    return input;
  }

  if (!/^[A-Za-z0-9+/=\r\n]+$/.test(trimmed)) {
    return input;
  }

  try {
    const normalized = trimmed.replace(/\s+/g, '');
    const decoded = Buffer.from(normalized, 'base64').toString('utf-8');
    return decoded.includes(VLESS_PROTOCOL) ? decoded : input;
  } catch {
    return input;
  }
};

export const parseVlessLink = (link: string): VlessConfig | null => {
  try {
    const trimmed = link.trim();
    if (!trimmed.startsWith(VLESS_PROTOCOL)) {
      return null;
    }

    const url = new URL(trimmed.replace(VLESS_PROTOCOL, 'http://'));
    const port = Number(url.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return null;
    }

    const name = url.hash ? decodeURIComponent(url.hash.slice(1)).replace(/\+/g, ' ') : `${url.hostname}:${url.port}`;
    const security = (url.searchParams.get('security') ?? 'none').toLowerCase();
    const network = normalizeNativeNetwork(url.searchParams.get('type'));
    const fingerprint = url.searchParams.get('fp') ?? '';
    const uuid = decodeURIComponent(url.username);
    if (!uuid || !url.hostname) {
      return null;
    }

    return {
      id: `${url.hostname}:${port}:${uuid}`,
      uuid,
      host: url.hostname,
      port,
      name,
      ping: 0,
      raw: trimmed,
      security,
      network,
      fingerprint,
    };
  } catch {
    return null;
  }
};

export const extractVlessLinks = (text: string): string[] => {
  if (!text?.trim()) {
    return [];
  }

  const processedText = decodeBase64IfNeeded(text);
  const regex = /vless:\/\/[^\s"']+/g;
  const matches = processedText.match(regex) ?? [];

  return matches
    .map((item) => item.trim())
    .filter((item, index, all) => all.indexOf(item) === index);
};

export const supportsNativeTunnel = (server: VlessConfig): boolean => {
  return SUPPORTED_NATIVE_NETWORKS.has(normalizeNativeNetwork(server.network));
};

export const supportsWhitelistBypass = (server: VlessConfig): boolean => {
  if (server.security === 'reality') {
    return true;
  }

  if (server.security === 'tls' && Boolean(server.fingerprint)) {
    return true;
  }

  const network = normalizeNativeNetwork(server.network);
  return network === 'grpc' || network === 'ws' || network === 'splithttp';
};

export const dedupeServers = (servers: VlessConfig[]): VlessConfig[] => {
  const seen = new Set<string>();

  return servers.filter((server) => {
    const key = `${server.host}:${server.port}:${server.uuid}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

export const sortServers = (servers: VlessConfig[]): VlessConfig[] => {
  return [...servers].sort((left, right) => {
    const leftRank = left.ping > 0 ? 0 : left.ping === 0 ? 1 : 2;
    const rightRank = right.ping > 0 ? 0 : right.ping === 0 ? 1 : 2;

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    if (leftRank === 0) {
      return left.ping - right.ping;
    }

    return left.name.localeCompare(right.name);
  });
};
