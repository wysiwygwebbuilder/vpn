package com.phoenix.vpn

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.VpnService
import android.os.Binder
import android.os.Build
import android.os.IBinder
import android.os.ParcelFileDescriptor
import android.util.Log
import org.json.JSONObject

class RouteVpnService : VpnService() {

    companion object {
        private const val TAG = "RouteVpnService"
        private const val NOTIFICATION_CHANNEL_ID = "vpn_service_channel"
        private const val NOTIFICATION_ID = 1
    }

    private val binder = LocalBinder()
    private var parcelFileDescriptor: ParcelFileDescriptor? = null
    private var isRunning = false
    private var network: Network? = null

    inner class LocalBinder : Binder() {
        fun getService(): RouteVpnService = this@RouteVpnService
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            "START" -> {
                val config = intent.getStringExtra("config") ?: ""
                startVpn(config)
            }
            "STOP" -> stopVpn()
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder {
        return binder
    }

    override fun onDestroy() {
        super.onDestroy()
        stopVpn()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "VPN Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "VPN connection status"
                setShowBadge(false)
            }

            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun createNotification(): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )

        return Notification.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setContentTitle("Феникс VPN")
            .setContentText("VPN подключен")
            .setSmallIcon(R.drawable.ic_notification)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build()
    }

    private fun startVpn(singBoxConfig: String) {
        try {
            Log.d(TAG, "Starting VPN...")

            // Setup VPN builder
            val builder = Builder()
                .addAddress("10.0.0.2", 30)
                .addRoute("0.0.0.0", 0)
                .addDnsServer("8.8.8.8")
                .addDnsServer("1.1.1.1")
                .setSession("Феникс VPN")
                .setMtu(1500)

            // Establish VPN connection
            parcelFileDescriptor = builder.establish()
            if (parcelFileDescriptor == null) {
                Log.e(TAG, "Failed to establish VPN connection")
                stopVpn()
                return
            }

            Log.d(TAG, "VPN established")

            // TODO: Implement sing-box integration when libbox.aar is available
            // For now, VPN tunnel is established but no proxy is running

            // Setup network callback
            setupNetworkCallback()

            // Start foreground service
            startForeground(NOTIFICATION_ID, createNotification())

            isRunning = true
            Log.d(TAG, "VPN started successfully")

        } catch (e: Exception) {
            Log.e(TAG, "Start VPN error: ${e.message}", e)
            stopVpn()
        }
    }

    private fun stopVpn() {
        try {
            Log.d(TAG, "Stopping VPN...")

            // Close VPN fd
            parcelFileDescriptor?.close()
            parcelFileDescriptor = null

            // Remove network callback
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                val connectivityManager = getSystemService(ConnectivityManager::class.java)
                network?.let { connectivityManager.unbindNetworkFromProcess(it) }
            }

            // Stop foreground service
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()

            isRunning = false
            Log.d(TAG, "VPN stopped")

        } catch (e: Exception) {
            Log.e(TAG, "Stop VPN error: ${e.message}", e)
        }
    }

    private fun setupNetworkCallback() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            val connectivityManager = getSystemService(ConnectivityManager::class.java)
            val networkRequest = NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build()

            connectivityManager.requestNetwork(networkRequest, object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) {
                    this@RouteVpnService.network = network
                    connectivityManager.bindNetworkToProcess(network)
                    Log.d(TAG, "Network bound to VPN")
                }
            })
        }
    }

    fun getStats(): JSONObject {
        return JSONObject().apply {
            put("upload", 0)
            put("download", 0)
            put("debug", "VPN service running")
            put("error", "")
            put("running", isRunning)
        }
    }

    fun isRunning(): Boolean = isRunning
}
