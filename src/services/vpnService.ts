import { NativeModules, Platform } from 'react-native';
import { normalizeNativeNetwork, VlessConfig } from '../utils/vless';

const getVpnModule = () => {
    if (Platform.OS === 'web') {
        return null;
    }
    return NativeModules?.VpnModule ?? null;
};

const readBooleanParam = (value: string | null): boolean => {
    if (!value) {
        return false;
    }

    return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
};

const readCsvParam = (value: string | null): string[] => {
    if (!value) {
        return [];
    }

    return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
};

export interface IVpnService {
    connect(config: VlessConfig): Promise<boolean>;
    disconnect(): Promise<boolean>;
    checkConnectivity(config: VlessConfig, mode?: 'quick' | 'deep'): Promise<number>;
    testServerConnection(config: VlessConfig): Promise<{
        success: boolean;
        latency: number;
        canConnect: boolean;
        server: string;
        protocol: string;
        security: string;
    }>;
    isConnected(): Promise<boolean>;
    getTrafficStats(): Promise<{ 
        upload: number; 
        download: number; 
        debug?: string; 
        error?: string;
        running?: boolean;
        connected?: boolean;
        engine?: string;
        diagnostic_status?: string;
        diagnostic_details?: string;
        timestamp?: number;
        endpoint?: string;
    }>;
    isNativeVpnAvailable(): boolean;
}

type NativeEngine = 'xray' | 'sing-box';

interface NativeConnectPayload {
    primaryEngine: NativeEngine;
    fallbackEngine: NativeEngine | 'none';
    endpointLabel: string;
    xrayConfig: any;
    singBoxConfig: any | null;
}

class VpnService implements IVpnService {
    private _isConnected = false;
    private _connectedConfig: VlessConfig | null = null;
    private _isConnecting = false;
    private _isDisconnecting = false;

    isNativeVpnAvailable(): boolean {
        return Boolean(getVpnModule());
    }

    async connect(config: VlessConfig): Promise<boolean> {
        if (this._isConnecting) {
            console.warn('Already connecting, skipping');
            return false;
        }
        
        const vpnModule = getVpnModule();
        if (!this.isNativeVpnAvailable()) {
            console.warn('Native routing module is not available on this platform/build');
            return false;
        }

        this._isConnecting = true;
        try {
            const payload = this.buildNativeConnectPayload(config);
            await vpnModule.connect(JSON.stringify(payload));
            await new Promise(resolve => setTimeout(resolve, 300));
            this._isConnected = true;
            this._connectedConfig = config;
            return true;
        } catch (error: any) {
            console.error('Failed to connect route service', error);
            this._isConnected = false;
            this._connectedConfig = null;
            return false;
        } finally {
            this._isConnecting = false;
        }
    }

    async disconnect(): Promise<boolean> {
        if (this._isDisconnecting) {
            console.warn('Already disconnecting, skipping');
            return false;
        }
        
        const vpnModule = getVpnModule();
        if (!this.isNativeVpnAvailable()) {
            this._isConnected = false;
            this._connectedConfig = null;
            return false;
        }

        this._isDisconnecting = true;
        try {
            await vpnModule.disconnect();
            await new Promise(resolve => setTimeout(resolve, 300));
            this._isConnected = false;
            this._connectedConfig = null;
            return true;
        } catch (error: any) {
            console.error('Failed to disconnect route service', error);
            return false;
        } finally {
            this._isDisconnecting = false;
        }
    }

    async isConnected(): Promise<boolean> {
        const vpnModule = getVpnModule();
        if (!this.isNativeVpnAvailable()) return this._isConnected;
        try {
            const connected = await vpnModule.isConnected();
            this._isConnected = connected;
            return connected;
        } catch {
            return this._isConnected;
        }
    }

    async checkConnectivity(config: VlessConfig, mode: 'quick' | 'deep' = 'quick'): Promise<number> {
        const vpnModule = getVpnModule();
        if (!this.isNativeVpnAvailable()) {
            return -1;
        }

        try {
            const result = await vpnModule.probeServer(config.raw);
            return result;
        } catch (error) {
            console.error('Connectivity check failed:', error);
            return -1;
        }
    }

    async testServerConnection(config: VlessConfig): Promise<{
        success: boolean;
        latency: number;
        canConnect: boolean;
        server: string;
        protocol: string;
        security: string;
    }> {
        const vpnModule = getVpnModule();
        if (!this.isNativeVpnAvailable()) {
            throw new Error('Native VPN not available');
        }

        try {
            const rawConfig = config.raw;
            const result = await vpnModule.testServerConnection(rawConfig);
            return {
                success: result.success,
                latency: result.latency,
                canConnect: result.canConnect,
                server: result.server,
                protocol: result.protocol,
                security: result.security
            };
        } catch (error: any) {
            console.error('Failed to test server connection:', error);
            throw new Error(`Server connection test failed: ${error.message}`);
        }
    }

    async getTrafficStats(): Promise<{ 
        upload: number; 
        download: number; 
        debug?: string; 
        error?: string;
        running?: boolean;
        connected?: boolean;
        engine?: string;
        diagnostic_status?: string;
        diagnostic_details?: string;
        timestamp?: number;
        endpoint?: string;
    }> {
        const vpnModule = getVpnModule();
        if (!this.isNativeVpnAvailable()) return { 
            upload: 0, 
            download: 0, 
            debug: '', 
            error: '',
            running: false,
            connected: false,
            engine: 'none',
            diagnostic_status: 'not_available',
            diagnostic_details: 'Native VPN module not available',
            timestamp: Date.now(),
            endpoint: ''
        };
        
        try {
            const stats = await vpnModule.getTrafficStats();
            return {
                upload: stats.upload || 0,
                download: stats.download || 0,
                debug: stats.debug || '',
                error: stats.error || '',
                running: stats.running || false,
                connected: stats.connected || false,
                engine: stats.engine || 'none',
                diagnostic_status: stats.diagnostic_status || 'unknown',
                diagnostic_details: stats.diagnostic_details || '',
                timestamp: stats.timestamp || Date.now(),
                endpoint: stats.endpoint || ''
            };
        } catch (error) {
            console.error('Failed to get traffic stats', error);
            return { 
                upload: 0, 
                download: 0, 
                debug: '', 
                error: 'Failed to get traffic stats',
                running: false,
                connected: false,
                engine: 'none',
                diagnostic_status: 'error',
                diagnostic_details: 'Failed to retrieve diagnostics',
                timestamp: Date.now(),
                endpoint: ''
            };
        }
    }

    getConnectedConfig(): VlessConfig | null {
        return this._connectedConfig;
    }

    private buildNativeConnectPayload(config: VlessConfig): NativeConnectPayload {
        const xrayConfig = this.buildXrayConfig(config);
        const network = this.readConnectionParams(config).network;
        const singBoxConfig = ['tcp', 'ws', 'grpc', 'httpupgrade'].includes(network)
            ? this.buildSingBoxConfig(config)
            : null;

        return {
            primaryEngine: 'xray',
            fallbackEngine: singBoxConfig ? 'sing-box' : 'none',
            endpointLabel: config.name || `${config.host}:${config.port}`,
            xrayConfig,
            singBoxConfig,
        };
    }

    private buildProbeConfig(config: VlessConfig): any {
        const { network } = this.readConnectionParams(config);
        if (network === 'splithttp') {
            return this.buildXrayConfig(config);
        }

        return this.buildSingBoxConfig(config);
    }

    private readConnectionParams(config: VlessConfig) {
        const url = new URL(config.raw.replace('vless://', 'http://'));
        const params = url.searchParams;
        const security = (params.get('security') || 'none').toLowerCase();
        const network = normalizeNativeNetwork(params.get('type'));
        const serverName = params.get('sni') || params.get('host') || config.host;
        const allowInsecure = readBooleanParam(params.get('allowInsecure')) || readBooleanParam(params.get('insecure'));
        const alpn = readCsvParam(params.get('alpn'));

        return {
            url,
            params,
            security,
            network,
            serverName,
            allowInsecure,
            alpn,
        };
    }

    private buildXrayConfig(config: VlessConfig): any {
        const { params, security, network, serverName, allowInsecure, alpn } = this.readConnectionParams(config);

        if (!['tcp', 'ws', 'grpc', 'httpupgrade', 'splithttp'].includes(network)) {
            throw new Error(`Unsupported Xray transport: ${network}`);
        }

        const user: any = {
            id: config.uuid,
            encryption: 'none',
        };

        const flow = params.get('flow');
        if (flow) {
            user.flow = flow;
        }

        const outbound: any = {
            tag: 'proxy',
            protocol: 'vless',
            settings: {
                vnext: [
                    {
                        address: config.host,
                        port: config.port,
                        users: [user],
                    },
                ],
            },
        };

        const streamSettings: any = {
            network,
        };

        if (security === 'tls') {
            streamSettings.security = 'tls';
            streamSettings.tlsSettings = {
                serverName,
                allowInsecure,
            };

            const fingerprint = params.get('fp');
            if (fingerprint) {
                streamSettings.tlsSettings.fingerprint = fingerprint;
            }
            if (alpn.length > 0) {
                streamSettings.tlsSettings.alpn = alpn;
            }
        } else if (security === 'reality') {
            const publicKey = params.get('pbk') || '';
            if (!publicKey) {
                throw new Error('REALITY public key is missing');
            }

            streamSettings.security = 'reality';
            streamSettings.realitySettings = {
                fingerprint: params.get('fp') || 'chrome',
                serverName,
                publicKey,
                shortId: params.get('sid') || '',
                spiderX: params.get('spx') || '/',
            };
        }

        if (network === 'ws') {
            const host = params.get('host') || params.get('sni') || config.host;
            const path = this.buildXrayWsPath(params.get('path') || '/', params.get('ed'));
            streamSettings.wsSettings = {
                host,
                path,
            };
        } else if (network === 'grpc') {
            streamSettings.grpcSettings = {
                serviceName: params.get('serviceName') || params.get('service_name') || '',
            };
            const authority = params.get('authority') || params.get('host');
            if (authority) {
                streamSettings.grpcSettings.authority = authority;
            }
        } else if (network === 'httpupgrade') {
            streamSettings.httpupgradeSettings = {
                host: params.get('host') || serverName,
                path: params.get('path') || '/',
            };
        } else if (network === 'splithttp') {
            streamSettings.splithttpSettings = {
                host: params.get('host') || serverName,
                path: params.get('path') || '/',
            };
        }

        outbound.streamSettings = streamSettings;

        return {
            log: {
                loglevel: 'warning',
            },
            stats: {},
            policy: {
                levels: {
                    '0': {
                        statsUserUplink: true,
                        statsUserDownlink: true,
                    },
                },
                system: {
                    statsInboundUplink: true,
                    statsInboundDownlink: true,
                    statsOutboundUplink: true,
                    statsOutboundDownlink: true,
                },
            },
            dns: {
                servers: ['1.1.1.1', '8.8.8.8', '8.8.4.4'],
            },
            inbounds: [
                {
                    tag: 'tun-in',
                    protocol: 'tun',
                    port: 0,
                    settings: {
                        name: 'xray0',
                        MTU: 1500,
                    },
                    sniffing: {
                        enabled: true,
                        destOverride: ['http', 'tls', 'quic'],
                    },
                },
            ],
            outbounds: [
                outbound,
                {
                    tag: 'direct',
                    protocol: 'freedom',
                    settings: {},
                },
                {
                    tag: 'block',
                    protocol: 'blackhole',
                    settings: {},
                },
            ],
            routing: {
                domainStrategy: 'IPIfNonMatch',
                rules: [
                    {
                        type: 'field',
                        inboundTag: ['tun-in'],
                        outboundTag: 'proxy',
                    },
                ],
            },
        };
    }

    private buildXrayWsPath(basePath: string, earlyDataValue: string | null): string {
        const earlyData = Number(earlyDataValue);
        if (!Number.isFinite(earlyData) || earlyData <= 0) {
            return basePath;
        }

        const [pathOnly, queryString = ''] = basePath.split('?', 2);
        const query = new URLSearchParams(queryString);
        query.set('ed', String(earlyData));
        const serialized = query.toString();
        return serialized ? `${pathOnly}?${serialized}` : pathOnly;
    }

    private buildSingBoxConfig(config: VlessConfig): any {
        const { params, security, network, serverName, allowInsecure, alpn } = this.readConnectionParams(config);

        if (!['tcp', 'ws', 'grpc', 'httpupgrade'].includes(network)) {
            throw new Error(`Unsupported native transport: ${network}`);
        }

        const outbound: any = {
            type: 'vless',
            tag: 'proxy',
            server: config.host,
            server_port: config.port,
            uuid: config.uuid,
        };

        if (network === 'tcp') {
            outbound.network = 'tcp';
        }

        const flow = params.get('flow');
        if (flow) {
            outbound.flow = flow;
        }

        if (security === 'tls' || security === 'reality') {
            outbound.tls = {
                enabled: true,
                server_name: serverName,
                insecure: allowInsecure,
            };

            const fingerprint = params.get('fp') || (security === 'reality' ? 'chrome' : '');
            if (fingerprint) {
                outbound.tls.utls = {
                    enabled: true,
                    fingerprint,
                };
            }

            const resolvedAlpn = alpn.length > 0 ? alpn : network === 'grpc' ? ['h2'] : [];
            if (resolvedAlpn.length > 0) {
                outbound.tls.alpn = resolvedAlpn;
            }

            if (security === 'reality') {
                const publicKey = params.get('pbk') || '';
                if (!publicKey) {
                    throw new Error('REALITY public key is missing');
                }

                outbound.tls.reality = {
                    enabled: true,
                    public_key: publicKey,
                    short_id: params.get('sid') || '',
                };
            }
        }

        if (network === 'ws') {
            const hostHeader = params.get('host') || params.get('sni') || config.host;
            outbound.transport = {
                type: 'ws',
                path: params.get('path') || '/',
                headers: hostHeader ? { Host: hostHeader } : undefined,
            };

            const earlyDataHeaderName = params.get('eh') || params.get('edh');
            const maxEarlyData = Number(params.get('ed'));
            if (Number.isFinite(maxEarlyData) && maxEarlyData > 0) {
                outbound.transport.max_early_data = maxEarlyData;
                outbound.transport.early_data_header_name = earlyDataHeaderName || 'Sec-WebSocket-Protocol';
            }
        } else if (network === 'grpc') {
            outbound.transport = {
                type: 'grpc',
                service_name: params.get('serviceName') || params.get('service_name') || '',
            };

            const authority = params.get('authority') || params.get('host');
            if (authority) {
                outbound.transport.authority = authority;
            }
        } else if (network === 'httpupgrade') {
            outbound.transport = {
                type: 'httpupgrade',
                host: params.get('host') || serverName,
                path: params.get('path') || '/',
            };
        }

        return {
            log: {
                level: 'info',
            },
            dns: {
                servers: [
                    {
                        type: 'https',
                        tag: 'dns-remote',
                        server: '1.1.1.1',
                        server_port: 443,
                        path: '/dns-query',
                        tls: {
                            enabled: true,
                            server_name: 'cloudflare-dns.com',
                        },
                        detour: 'proxy',
                    },
                    {
                        type: 'https',
                        tag: 'dns-direct',
                        server: '8.8.8.8',
                        server_port: 443,
                        path: '/dns-query',
                        tls: {
                            enabled: true,
                            server_name: 'dns.google',
                        },
                        detour: 'direct',
                    },
                ],
                strategy: 'prefer_ipv4',
                final: 'dns-remote',
            },
            inbounds: [
                {
                    type: 'tun',
                    tag: 'tun-in',
                    mtu: 1500,
                    address: ['172.19.0.1/30'],
                    auto_route: true,
                    strict_route: false,
                    stack: 'system',
                },
            ],
            outbounds: [
                outbound,
                {
                    type: 'direct',
                    tag: 'direct',
                },
                {
                    type: 'block',
                    tag: 'block',
                },
            ],
            route: {
                final: 'proxy',
                rules: [
                    {
                        action: 'sniff',
                    },
                    {
                        protocol: 'dns',
                        action: 'hijack-dns',
                    },
                ],
            },
        };
    }
}

export const vpnService = new VpnService();



