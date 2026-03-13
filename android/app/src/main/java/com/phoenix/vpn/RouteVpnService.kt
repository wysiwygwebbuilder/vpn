package com.phoenix.vpn

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
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
        
        init {
            System.loadLibrary("gojni")
        }
    }

    private val binder = LocalBinder()
    private var parcelFileDescriptor: ParcelFileDescriptor? = null
    private var isRunning = false
    private var v2rayRunning = false

    inner class LocalBinder : Binder() {
        fun getService(): RouteVpnService = this@RouteVpnService
    }

    private external fun startV2Ray(configContent: String): Long
    private external fun stopV2Ray(): Long
    private external fun getV2RayVersion(): String
    private external fun checkV2RayRunning(): Boolean

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

    override fun onBind(intent: Intent?): IBinder = binder

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
            getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
        }
    }

    private fun createNotification(): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )

        return Notification.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setContentTitle("еникс VPN")
            .setContentText("VPN подключен")
            .setSmallIcon(R.drawable.ic_notification)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build()
    }

    private fun startVpn(v2rayConfig: String) {
        try {
            Log.d(TAG, "Starting VPN with v2ray...")

            val builder = Builder()
                .setSession("еникс VPN")
                .setMtu(1500)
                .addAddress("10.0.0.2", 30)
                .addRoute("0.0.0.0", 0)
                .addDnsServer("8.8.8.8")
                .addDnsServer("1.1.1.1")

            parcelFileDescriptor = builder.establish()
            if (parcelFileDescriptor == null) {
                Log.e(TAG, "Failed to establish VPN")
                return
            }

            val result = startV2Ray(v2rayConfig)
            if (result == 0L) {
                v2rayRunning = true
                startForeground(NOTIFICATION_ID, createNotification())
                isRunning = true
                Log.d(TAG, "VPN started with v2ray")
            } else {
                Log.e(TAG, "Failed to start v2ray: $result")
                parcelFileDescriptor?.close()
                parcelFileDescriptor = null
            }

        } catch (e: Exception) {
            Log.e(TAG, "Start VPN error: ${e.message}", e)
            stopVpn()
        }
    }

    private fun stopVpn() {
        try {
            Log.d(TAG, "Stopping VPN...")

            if (v2rayRunning) {
                stopV2Ray()
                v2rayRunning = false
            }
            
            parcelFileDescriptor?.close()
            parcelFileDescriptor = null

            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()

            isRunning = false
            Log.d(TAG, "VPN stopped")
        } catch (e: Exception) {
            Log.e(TAG, "Stop VPN error: ${e.message}", e)
        }
    }

    fun getStats(): JSONObject {
        return try {
            JSONObject().apply {
                put("upload", 0)
                put("download", 0)
                put("running", isRunning)
                put("v2rayRunning", v2rayRunning)
            }
        } catch (e: Exception) {
            JSONObject().apply {
                put("upload", 0)
                put("download", 0)
                put("running", isRunning)
                put("v2rayRunning", false)
            }
        }
    }

    fun isRunning(): Boolean = isRunning
}
