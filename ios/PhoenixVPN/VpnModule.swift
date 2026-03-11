//
//  VpnModule.swift
//  PhoenixVPN
//
//  React Native Module for VPN management on iOS
//

import Foundation
import NetworkExtension
import React

@objc(VpnModule)
class VpnModule: NSObject {
    
    private var manager: NETunnelProviderManager?
    private var connectionObserver: NSObjectProtocol?
    
    @objc
    static func requiresMainQueueSetup() -> Bool {
        return false
    }
    
    override init() {
        super.init()
        setupVPNManager()
    }
    
    private func setupVPNManager() {
        NETunnelProviderManager.loadAllFromPreferences { managers, error in
            if let error = error {
                print("Error loading VPN managers: \(error)")
                return
            }
            
            if let managers = managers, !managers.isEmpty {
                self.manager = managers[0]
            } else {
                self.manager = NETunnelProviderManager()
                self.saveVPNManager()
            }
        }
    }
    
    private func saveVPNManager() {
        guard let manager = manager else { return }
        
        let protocolConfig = NETunnelProviderProtocol()
        protocolConfig.providerBundleIdentifier = "com.phoenix.vpn.PacketTunnelProvider"
        protocolConfig.serverAddress = "Feniks Route"
        
        manager.protocolConfiguration = protocolConfig
        manager.localizedDescription = "Feniks Route"
        manager.isEnabled = true
        
        manager.saveToPreferences { error in
            if let error = error {
                print("Error saving VPN manager: \(error)")
            } else {
                print("VPN manager saved successfully")
            }
        }
    }
    
    @objc
    func connect(_ configJson: String, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
        guard let manager = manager else {
            reject("NO_MANAGER", "VPN manager not initialized", nil)
            return
        }
        
        // Save config for tunnel provider
        if let configData = configJson.data(using: .utf8) {
            (manager.protocolConfiguration as? NETunnelProviderProtocol)?.providerConfiguration = [
                "config": configJson
            ]
        }
        
        // Start VPN connection
        do {
            try manager.connection.startVPNTunnel()
            resolve(true)
            print("VPN tunnel started")
        } catch let error {
            reject("START_ERROR", "Failed to start VPN tunnel", error)
            print("Failed to start VPN: \(error)")
        }
        
        // Observe connection status
        if connectionObserver == nil {
            connectionObserver = NotificationCenter.default.addObserver(
                forName: .NEVPNStatusDidChange,
                object: manager.connection,
                queue: OperationQueue.main
            ) { notification in
                self.handleStatusChange(notification)
            }
        }
    }
    
    @objc
    func disconnect(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
        guard let manager = manager else {
            reject("NO_MANAGER", "VPN manager not initialized", nil)
            return
        }
        
        manager.connection.stopVPNTunnel()
        resolve(true)
        print("VPN tunnel stopped")
    }
    
    @objc
    func isConnected(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
        guard let manager = manager else {
            resolve(false)
            return
        }
        
        resolve(manager.connection.status == .connected)
    }
    
    @objc
    func measurePing(_ host: String, port: Int, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
        let socket = CFStreamCreatePairWithSocketToHost(nil, host as CFString, UInt32(port))
        let outputStream = socket.value.1!.takeRetainedValue() as OutputStream
        
        let startTime = Date()
        outputStream.open()
        
        // Simple timeout-based ping
        DispatchQueue.global().asyncAfter(deadline: .now() + 5.0) {
            if outputStream.streamStatus == .open {
                let endTime = Date()
                let ping = Int(endTime.timeIntervalSince(startTime) * 1000)
                outputStream.close()
                resolve(ping)
            } else {
                resolve(-1)
            }
        }
    }
    
    @objc
    func getTrafficStats(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
        // Traffic stats would come from the tunnel provider
        // For now, return zeros
        resolve([
            "upload": 0,
            "download": 0
        ])
    }
    
    private func handleStatusChange(_ notification: Notification) {
        guard let connection = notification.object as? NEVPNConnection else { return }
        
        switch connection.status {
        case .connected:
            print("VPN Connected")
        case .disconnected:
            print("VPN Disconnected")
        case .connecting:
            print("VPN Connecting")
        case .disconnecting:
            print("VPN Disconnecting")
        case .reasserting:
            print("VPN Reasserting")
        case .invalid:
            print("VPN Invalid")
        @unknown default:
            break
        }
    }
    
    deinit {
        if let observer = connectionObserver {
            NotificationCenter.default.removeObserver(observer)
        }
    }
}
