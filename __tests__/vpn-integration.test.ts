import { vpnService } from '../src/services/vpnService';
import { parseVlessLink } from '../src/utils/vless';

jest.mock('react-native', () => ({
  NativeModules: {
    VpnModule: {
      connect: jest.fn().mockResolvedValue(true),
      disconnect: jest.fn().mockResolvedValue(true),
      isConnected: jest.fn().mockResolvedValue(false),
      probeServer: jest.fn().mockResolvedValue(100),
      testServerConnection: jest.fn().mockResolvedValue({
        success: true,
        latency: 100,
        canConnect: true,
        server: 'test.server.com',
        protocol: 'vless',
        security: 'tls',
      }),
      getTrafficStats: jest.fn().mockResolvedValue({
        upload: 0,
        download: 0,
        debug: '',
        error: '',
        running: false,
        connected: false,
        engine: 'xray',
        diagnostic_status: 'disconnected',
        diagnostic_details: '',
        timestamp: Date.now(),
        endpoint: '',
      }),
    },
  },
  Platform: {
    OS: 'android',
  },
}));

describe('VPN Integration Tests', () => {
  const mockVlessConfig = parseVlessLink(
    'vless://test-uuid@test.server.com:443?encryption=none&security=tls&sni=test.server.com&type=ws&host=test.server.com&path=%2F#TestServer'
  );

  describe('Server Connection', () => {
    it('should test server connectivity', async () => {
      if (!mockVlessConfig) {
        throw new Error('Failed to parse mock VLESS config');
      }

      const result = await vpnService.testServerConnection(mockVlessConfig);
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.latency).toBeGreaterThanOrEqual(0);
    });

    it('should connect to server', async () => {
      if (!mockVlessConfig) {
        throw new Error('Failed to parse mock VLESS config');
      }

      const connected = await vpnService.connect(mockVlessConfig);
      expect(connected).toBe(true);
    });

    it('should disconnect from server', async () => {
      const disconnected = await vpnService.disconnect();
      expect(disconnected).toBe(true);
    });

    it('should check connection status', async () => {
      if (!mockVlessConfig) {
        throw new Error('Failed to parse mock VLESS config');
      }

      await vpnService.connect(mockVlessConfig);
      const isConnected = await vpnService.isConnected();
      expect(typeof isConnected).toBe('boolean');
    });
  });

  describe('Configuration Building', () => {
    it('should build xray config for WebSocket', () => {
      const wsConfig = parseVlessLink(
        'vless://test-uuid@test.server.com:443?encryption=none&security=tls&sni=test.server.com&type=ws&host=test.server.com&path=%2F#WS'
      );
      expect(wsConfig).toBeDefined();
      expect(wsConfig?.network).toBe('ws');
    });

    it('should build xray config for gRPC', () => {
      const grpcConfig = parseVlessLink(
        'vless://test-uuid@test.server.com:443?encryption=none&security=tls&sni=test.server.com&type=grpc&serviceName=test#gRPC'
      );
      expect(grpcConfig).toBeDefined();
      expect(grpcConfig?.network).toBe('grpc');
    });

    it('should build xray config for HTTP Upgrade', () => {
      const httpUpgradeConfig = parseVlessLink(
        'vless://test-uuid@test.server.com:443?encryption=none&security=tls&sni=test.server.com&type=httpupgrade&host=test.server.com&path=%2F#HTTPUpgrade'
      );
      expect(httpUpgradeConfig).toBeDefined();
      expect(httpUpgradeConfig?.network).toBe('httpupgrade');
    });

    it('should build xray config for SplitHTTP', () => {
      const splitHttpConfig = parseVlessLink(
        'vless://test-uuid@test.server.com:443?encryption=none&security=tls&sni=test.server.com&type=splithttp&host=test.server.com&path=%2F#SplitHTTP'
      );
      expect(splitHttpConfig).toBeDefined();
      expect(splitHttpConfig?.network).toBe('splithttp');
    });
  });

  describe('Traffic Stats', () => {
    it('should get traffic statistics', async () => {
      const stats = await vpnService.getTrafficStats();
      expect(stats).toBeDefined();
      expect(stats.upload).toBeGreaterThanOrEqual(0);
      expect(stats.download).toBeGreaterThanOrEqual(0);
      expect(stats.engine).toBeDefined();
    });

    it('should include diagnostic information', async () => {
      const stats = await vpnService.getTrafficStats();
      expect(stats.diagnostic_status).toBeDefined();
      expect(stats.diagnostic_details).toBeDefined();
      expect(stats.timestamp).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle connection failures gracefully', async () => {
      if (!mockVlessConfig) {
        throw new Error('Failed to parse mock VLESS config');
      }

      const { NativeModules } = require('react-native');
      NativeModules.VpnModule.connect.mockRejectedValueOnce(new Error('Connection failed'));

      const connected = await vpnService.connect(mockVlessConfig);
      expect(connected).toBe(false);
    });

    it('should handle disconnect failures gracefully', async () => {
      const { NativeModules } = require('react-native');
      NativeModules.VpnModule.disconnect.mockRejectedValueOnce(new Error('Disconnect failed'));

      const disconnected = await vpnService.disconnect();
      expect(disconnected).toBe(false);
    });

    it('should not crash on concurrent operations', async () => {
      if (!mockVlessConfig) {
        throw new Error('Failed to parse mock VLESS config');
      }

      const operations = [
        vpnService.getTrafficStats(),
        vpnService.checkConnectivity(mockVlessConfig),
        vpnService.isConnected(),
      ];

      await expect(Promise.all(operations)).resolves.toBeDefined();
    });
  });

  describe('Native Library Integration', () => {
    it('should have native VPN module available', () => {
      expect(vpnService.isNativeVpnAvailable()).toBe(true);
    });

    it('should handle native library errors gracefully', async () => {
      const { NativeModules } = require('react-native');
      NativeModules.VpnModule.getTrafficStats.mockRejectedValueOnce(new Error('Native error'));

      const stats = await vpnService.getTrafficStats();
      expect(stats.error).toBeDefined();
    });
  });
});
