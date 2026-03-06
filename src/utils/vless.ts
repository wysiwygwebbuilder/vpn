export interface VlessConfig {
  id: string;
  uuid: string;
  host: string;
  port: number;
  name: string;
  ping: number;
  raw: string;
}

export const parseVlessLink = (link: string): VlessConfig | null => {
  try {
    const trimmed = link.trim();
    if (!trimmed.startsWith('vless://')) return null;

    const withoutScheme = trimmed.replace('vless://', '');
    const [userInfo, rest] = withoutScheme.split('@');
    const [hostPort, paramsTag] = rest.split('?');
    const [host, portStr] = hostPort.split(':');

    // Handle params and tag
    let params = '';
    let tag = '';

    if (paramsTag) {
        const parts = paramsTag.split('#');
        params = parts[0];
        tag = parts[1] || '';
    }

    // Decode tag
    let name = tag ? decodeURIComponent(tag) : `${host}:${portStr}`;
    // Clean up name if it has garbage
    name = name.replace(/\+/g, ' ');

    return {
      id: `${userInfo}-${host}-${portStr}-${Math.random().toString(36).substr(2, 9)}`,
      uuid: userInfo,
      host: host,
      port: parseInt(portStr),
      name: name,
      ping: -1,
      raw: trimmed
    };
  } catch (e) {
    // console.warn('Failed to parse link:', link);
    return null;
  }
};

export const extractVlessLinks = (text: string): string[] => {
    if (!text) return [];

    let processedText = text;

    // 0. Try Base64 decoding if it looks like base64 (no spaces, length % 4 == 0)
    const trimmed = text.trim();
    if (/^[A-Za-z0-9+/=]+$/.test(trimmed) && trimmed.length % 4 === 0 && !trimmed.includes('vless://')) {
        try {
            const decoded = atob(trimmed);
            if (decoded.includes('vless://')) {
                processedText = decoded;
            }
        } catch (e) {
            // Not base64
        }
    }

    // 1. Try splitting by newlines first (most common)
    let lines = processedText.split(/[\r\n]+/);
    let links = lines.filter(l => l.trim().startsWith('vless://'));

    // 2. If no links found by newline, maybe it's a blob? Try regex
    if (links.length === 0) {
        const regex = /vless:\/\/[^\s"']+/g;
        const matches = processedText.match(regex);
        if (matches) {
            links = Array.from(matches);
        }
    }

    // 3. Handle JSON array if present
    if (links.length === 0 && trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
            const json = JSON.parse(trimmed);
            if (Array.isArray(json)) {
                links = json.filter(item => typeof item === 'string' && item.startsWith('vless://'));
            }
        } catch (e) {
            // Not JSON
        }
    }

    return links.map(l => l.trim());
};

export const SUBSCRIPTION_URLS = [
    'https://raw.githubusercontent.com/barry-far/V2ray-config/main/Splitted-By-Protocol/vless.txt',
    'https://raw.githubusercontent.com/Epodonios/v2ray-configs/main/Splitted-By-Protocol/vless.txt',
    'https://raw.githubusercontent.com/MatinGhanbari/v2ray-configs/main/subscriptions/filtered/subs/vless.txt',
    'https://raw.githubusercontent.com/ebrasha/free-v2ray-public-list/main/vless_configs.txt'
];
