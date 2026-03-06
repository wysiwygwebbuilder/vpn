import { NativeModules, Platform } from 'react-native';
import { VlessConfig } from '../utils/vless';

const { VpnModule } = NativeModules;

// Interface for the VPN Service
export interface IVpnService {
    connect(config: VlessConfig): Promise<boolean>;
    disconnect(): Promise<boolean>;
    checkConnectivity(host: string, port: number): Promise<number>;
    isConnected(): Promise<boolean>;
    getTrafficStats(): Promise<{ upload: number; download: number }>;
}

class VpnService implements IVpnService {
    private _isConnected = false;
    private _connectedConfig: VlessConfig | null = null;

    async connect(config: VlessConfig): Promise<boolean> {
        try {
            console.log('Starting VPN connection to', config.host);
            
            // Convert VLESS config to Xray/V2Ray format
            const xrayConfig = this.buildXrayConfig(config);
            
            if (Platform.OS === 'android') {
                await VpnModule.connect(JSON.stringify(xrayConfig));
            } else if (Platform.OS === 'ios') {
                await VpnModule.connect(JSON.stringify(xrayConfig));
            }
            
            this._isConnected = true;
            this._connectedConfig = config;
            return true;
        } catch (error: any) {
            console.error('Failed to connect VPN', error);
            return false;
        }
    }

    async disconnect(): Promise<boolean> {
        try {
            console.log('Stopping VPN service');
            
            if (Platform.OS === 'android') {
                await VpnModule.disconnect();
            } else if (Platform.OS === 'ios') {
                await VpnModule.disconnect();
            }
            
            this._isConnected = false;
            this._connectedConfig = null;
            return true;
        } catch (error: any) {
            console.error('Failed to disconnect VPN', error);
            return false;
        }
    }

    async isConnected(): Promise<boolean> {
        try {
            return await VpnModule.isConnected();
        } catch (error) {
            return this._isConnected;
        }
    }

    async checkConnectivity(host: string, port: number): Promise<number> {
        try {
            // Use native module for actual TCP ping
            const ping = await VpnModule.measurePing(host, port);
            return ping;
        } catch (error) {
            console.error('Failed to check connectivity', error);
            return -1;
        }
    }

    async getTrafficStats(): Promise<{ upload: number; download: number }> {
        try {
            const stats = await VpnModule.getTrafficStats();
            return {
                upload: stats.upload || 0,
                download: stats.download || 0
            };
        } catch (error) {
            console.error('Failed to get traffic stats', error);
            return { upload: 0, download: 0 };
        }
    }

    getConnectedConfig(): VlessConfig | null {
        return this._connectedConfig;
    }

    /**
     * Build Xray/V2Ray configuration from VLESS config
     */
    private buildXrayConfig(config: VlessConfig): any {
        // Parse VLESS link to build full Xray config
        const raw = config.raw;
        const url = new URL(raw.replace('vless://', 'http://'));
        const params = url.searchParams;
        
        const security = params.get('security') || 'none';
        const type = params.get('type') || 'tcp';
        
        // Build outbound configuration
        const outbound: any = {
            protocol: 'vless',
            settings: {
                vnext: [
                    {
                        address: config.host,
                        port: config.port,
                        users: [
                            {
                                id: config.uuid,
                                flow: params.get('flow') || '',
                            }
                        ]
                    }
                ]
            },
            streamSettings: {
                network: type,
                security: security,
            }
        };

        // Configure security settings
        if (security === 'tls' || security === 'reality') {
            outbound.streamSettings.tlsSettings = {
                serverName: params.get('sni') || params.get('host') || config.host,
                fingerprint: params.get('fp') || 'chrome',
                alpn: ['h2', 'http/1.1'],
            };
            
            if (security === 'reality') {
                outbound.streamSettings.realitySettings = {
                    fingerprint: params.get('fp') || 'chrome',
                    serverName: params.get('sni') || config.host,
                    publicKey: params.get('pbk') || '',
                    shortId: params.get('sid') || '',
                    spiderX: params.get('spx') || '/',
                };
            }
        }

        // Configure transport settings
        if (type === 'ws') {
            outbound.streamSettings.wsSettings = {
                path: params.get('path') || '/',
                headers: {
                    Host: params.get('host') || '',
                }
            };
        } else if (type === 'grpc') {
            outbound.streamSettings.grpcSettings = {
                serviceName: params.get('serviceName') || '',
                multiMode: params.get('mode') === 'multi',
            };
        } else if (type === 'tcp' && security === 'none') {
            outbound.streamSettings.tcpSettings = {
                header: {
                    type: 'none'
                }
            };
        }

        // Build full config
        const xrayConfig = {
            log: {
                loglevel: 'warning',
            },
            inbounds: [
                {
                    port: 10808,
                    protocol: 'socks',
                    settings: {
                        auth: 'noauth',
                        udp: true,
                    },
                    sniffing: {
                        enabled: true,
                        destOverride: ['http', 'tls'],
                    },
                },
                {
                    port: 10809,
                    protocol: 'http',
                    settings: {
                        udp: true,
                    },
                }
            ],
            outbounds: [outbound],
            routing: {
                domainStrategy: 'AsIs',
                rules: [
                    {
                        type: 'field',
                        ip: ['geoip:private'],
                        outboundTag: 'direct',
                    }
                ]
            }
        };

        return xrayConfig;
    }
}

export const vpnService = new VpnService();
