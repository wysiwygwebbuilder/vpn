//
//  PacketTunnelProvider.swift
//  PhoenixVPN
//
//  iOS Packet Tunnel Provider for VPN
//

import NetworkExtension
import os

class PacketTunnelProvider: NEPacketTunnelProvider {
    
    private var xrayProxy: XrayProxy?
    private var networkSettings: NEPacketTunnelNetworkSettings?
    private let logger = OSLog(subsystem: "com.phoenix.vpn", category: "PacketTunnel")
    
    override func startTunnel(options: [String: NSObject]?, completionHandler: @escaping (Error?) -> Void) {
        os_log("Starting packet tunnel", log: logger, type: .info)
        
        // Get configuration from provider
        guard let protocolConfig = self.protocolConfiguration as? NETunnelProviderProtocol,
              let configString = protocolConfig.providerConfiguration?["config"] as? String else {
            os_log("No configuration found", log: logger, type: .error)
            completionHandler(NSError(domain: "PacketTunnel", code: 1, userInfo: [NSLocalizedDescriptionKey: "No configuration"]))
            return
        }
        
        // Setup network settings
        setupNetworkSettings()
        
        // Start Xray proxy
        startProxy(config: configString) { error in
            if let error = error {
                os_log("Failed to start proxy: %{public}@", log: self.logger, type: .error, error.localizedDescription)
                completionHandler(error)
            } else {
                os_log("Packet tunnel started successfully", log: self.logger, type: .info)
                completionHandler(nil)
            }
        }
    }
    
    override func stopTunnel(with reason: NEProviderStopReason, completionHandler: @escaping () -> Void) {
        os_log("Stopping packet tunnel, reason: %{public}d", log: logger, type: .info, reason.rawValue)
        
        // Stop Xray proxy
        xrayProxy?.stop()
        xrayProxy = nil
        
        completionHandler()
    }
    
    override func handleAppMessage(_ messageData: Data, completionHandler: ((Data?) -> Void)?) {
        // Handle messages from the app
        if let handler = completionHandler {
            handler(messageData)
        }
    }
    
    override func sleep(completionHandler: @escaping () -> Void) {
        os_log("Sleeping", log: logger, type: .info)
        completionHandler()
    }
    
    private func setupNetworkSettings() {
        let tunnelNetworkSettings = NEPacketTunnelNetworkSettings(tunnelRemoteAddress: "10.0.0.1")
        
        // DNS settings
        tunnelNetworkSettings.dnsSettings = NEDNSSettings(servers: ["8.8.8.8", "8.8.4.4"])
        
        // MTU
        tunnelNetworkSettings.mtu = 1500
        
        // Routing - route all traffic through VPN
        let ipv4DefaultRoute = NEIPv4Route.default()
        ipv4DefaultRoute.gatewayAddress = "10.0.0.1"
        tunnelNetworkSettings.ipv4Settings = NEIPv4Settings(
            addresses: ["10.0.0.2"],
            subnetMasks: ["255.255.255.0"]
        )
        tunnelNetworkSettings.ipv4Settings?.includedRoutes = [ipv4DefaultRoute]
        
        networkSettings = tunnelNetworkSettings
    }
    
    private func startProxy(config: String, completion: @escaping (Error?) -> Void) {
        // Initialize Xray proxy with configuration
        // In production, this would use actual Xray-core library
        
        do {
            // Set network settings
            if let settings = networkSettings {
                self.setTunnelNetworkSettings(settings) { error in
                    if let error = error {
                        os_log("Failed to set network settings: %{public}@", log: self.logger, type: .error, error.localizedDescription)
                        completion(error)
                        return
                    }
                    
                    // Start packet flow
                    self.startPacketFlow()
                    os_log("Packet flow started", log: self.logger, type: .info)
                    completion(nil)
                }
            } else {
                completion(NSError(domain: "PacketTunnel", code: 2, userInfo: [NSLocalizedDescriptionKey: "No network settings"]))
            }
        } catch {
            completion(error)
        }
    }
    
    private func startPacketFlow() {
        // Start reading and writing packets
        if let flow = self.packetFlow {
            let readWriteLock = NSLock()
            readWriteLock.lock()
            
            // Read packets from tunnel
            flow.readPacketObjects { packets, error in
                readWriteLock.unlock()
                
                if let error = error {
                    os_log("Read error: %{public}@", log: self.logger, type: .error, error.localizedDescription)
                    return
                }
                
                // Process packets here
                // In production, send to Xray-core for processing
                
                // Write packets back
                flow.writePacketObjects(packets) { error in
                    if let error = error {
                        os_log("Write error: %{public}@", log: self.logger, type: .error, error.localizedDescription)
                    }
                }
            }
        }
    }
}

// MARK: - Xray Proxy Helper

class XrayProxy {
    private var isRunning = false
    
    func start(config: String) throws {
        // Initialize Xray-core with configuration
        // This is a placeholder - in production, use actual Xray-core library
        isRunning = true
    }
    
    func stop() {
        isRunning = false
    }
    
    func getTrafficStats() -> (upload: UInt64, download: UInt64) {
        // Return actual traffic stats from Xray-core
        return (0, 0)
    }
}
