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
import libv2ray.Libv2ray
import libv2ray.V2RayPoint
import libv2ray.V2RayVPNServiceSupportsSet
import org.json.JSONObject

class RouteVpnService : VpnService(), V2RayVPNServiceSupportsSet {

    companion object {
        private const val TAG = "RouteVpnService"
        private const val NOTIFICATION_CHANNEL_ID = "vpn_service_channel"
        private const val NOTIFICATION_ID = 1
    }

    private val binder = LocalBinder()
    private var parcelFileDescriptor: ParcelFileDescriptor? = null
    private var v2rayPoint: V2RayPoint? = null
    private var isRunning = false

    inner class LocalBinder : Binder() {
        fun getService(): RouteVpnService = this@RouteVpnService
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        v2rayPoint = Libv2ray.newV2RayPoint(this, false)
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
            .setContentTitle("Феникс VPN")
            .setContentText("VPN подключен")
            .setSmallIcon(R.drawable.ic_notification)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build()
    }

    private fun startVpn(xrayConfig: String) {
        try {
            Log.d(TAG, "Starting VPN with xray...")

            v2rayPoint?.configureFileContent = xrayConfig
            v2rayPoint?.domainName = ""

            val builder = Builder()
                .setSession("Феникс VPN")
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

            v2rayPoint?.vpnSupportSet = this
            v2rayPoint?.startCore()

            startForeground(NOTIFICATION_ID, createNotification())
            isRunning = true
            Log.d(TAG, "VPN started with xray")

        } catch (e: Exception) {
            Log.e(TAG, "Start VPN error: ${e.message}", e)
            stopVpn()
        }
    }

    private fun stopVpn() {
        try {
            Log.d(TAG, "Stopping VPN...")

            v2rayPoint?.stopCore()
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
            val upload = v2rayPoint?.queryStats("", "uplink") ?: 0L
            val download = v2rayPoint?.queryStats("", "downlink") ?: 0L
            JSONObject().apply {
                put("upload", upload)
                put("download", download)
                put("running", isRunning)
            }
        } catch (e: Exception) {
            JSONObject().apply {
                put("upload", 0)
                put("download", 0)
                put("running", isRunning)
            }
        }
    }

    fun isRunning(): Boolean = isRunning

    override fun onEmitStatus(p0: String?) {
        Log.d(TAG, "xray status: $p0")
    }

    override fun protect(fd: Long): Boolean {
        return protect(fd.toInt())
    }

    override fun getService(): VpnService = this

    override fun startService() {}

    override fun stopService() {}
}
