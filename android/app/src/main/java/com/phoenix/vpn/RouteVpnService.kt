package com.phoenix.vpn

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.media.ToneGenerator
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.ProxyInfo
import android.net.VpnService
import android.os.Build
import android.os.IBinder
import android.os.ParcelFileDescriptor
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import io.nekohasekai.libbox.CommandServer
import io.nekohasekai.libbox.CommandServerHandler
import io.nekohasekai.libbox.ConnectionOwner
import io.nekohasekai.libbox.InterfaceUpdateListener
import io.nekohasekai.libbox.Libbox
import io.nekohasekai.libbox.LocalDNSTransport
import io.nekohasekai.libbox.NeighborUpdateListener
import io.nekohasekai.libbox.NetworkInterface
import io.nekohasekai.libbox.NetworkInterfaceIterator
import io.nekohasekai.libbox.Notification as LibboxNotification
import io.nekohasekai.libbox.OverrideOptions
import io.nekohasekai.libbox.PlatformInterface
import io.nekohasekai.libbox.StringIterator
import io.nekohasekai.libbox.SystemProxyStatus
import io.nekohasekai.libbox.TunOptions
import io.nekohasekai.libbox.WIFIState
import com.phoenix.vpn.xray.XrayController
import org.json.JSONObject
import org.json.JSONException
import android.util.Base64
import java.net.Inet6Address
import java.net.InterfaceAddress
import java.net.NetworkInterface as JNetworkInterface
import java.security.KeyStore
import java.security.cert.X509Certificate
import java.util.concurrent.atomic.AtomicBoolean

class RouteVpnService : VpnService(), PlatformInterface, CommandServerHandler {
  private var commandServer: CommandServer? = null
  private var tunDescriptor: ParcelFileDescriptor? = null
  private var systemProxyAvailable = false
  private var systemProxyEnabled = false
  private var currentEndpoint: String = ""
  private var wakeLock: PowerManager.WakeLock? = null
  private var systemCertificateCache: List<String>? = null
  private var currentEngine: String = ""
  private var singboxConfigJson: String? = null
  private var xrayConfigJson: String? = null
  private var xrayController: XrayController? = null
  private var connectionAttempts: Int = 0
  private val maxConnectionAttempts: Int = 3
  private var instanceDebugMessage: String = ""
  private var instanceError: String? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    currentInstance = this
    
    when (intent?.action) {
      ACTION_DISCONNECT -> {
        stopCurrentService(playDisconnectTone = true)
        return START_NOT_STICKY
      }
    }

    val configJson = intent?.getStringExtra(EXTRA_CONFIG_JSON)
    if (configJson.isNullOrBlank()) {
      stopSelf()
      return START_NOT_STICKY
    }

    try {
      val payload = JSONObject(configJson)
      currentEndpoint = payload.optString("endpointLabel", "").ifBlank { 
        payload.optString("xrayConfig")?.let { extractEndpointFromXray(it) } ?: 
        payload.optString("singBoxConfig")?.let { extractEndpointFromSingbox(it) } ?: "" 
      }
      
      val primaryEngine = payload.optString("primaryEngine", "xray") // Xray как основной движок по умолчанию
      xrayConfigJson = payload.optString("xrayConfig", "").takeIf { it.isNotBlank() }
      singboxConfigJson = payload.optString("singBoxConfig", "").takeIf { it.isNotBlank() }
      
      // Сохраняем какой движок использовать
      currentEngine = primaryEngine
      
      if (primaryEngine == "xray" && xrayConfigJson != null) {
        // Используем xray как основной движок
        instanceDebugMessage = "Using xray as primary engine"
        lastDebugMessage = instanceDebugMessage
      } else if (primaryEngine == "xray" && xrayConfigJson == null && singboxConfigJson != null) {
        // Если xray выбран, но конфига нет, а есть sing-box конфиг
        instanceDebugMessage = "xray config missing, using sing-box as fallback"
        lastDebugMessage = instanceDebugMessage
        currentEngine = "sing-box"
      }
    } catch (e: JSONException) {
      lastError = "Invalid payload JSON: ${e.message}"
      stopSelf()
      return START_NOT_STICKY
    }

    lastError = null
    lastDebugMessage = ""
    instanceError = null
    instanceDebugMessage = ""
    isRunning.set(true)
    isTunnelEstablished.set(false)

    val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
    wakeLock = powerManager.newWakeLock(
      PowerManager.PARTIAL_WAKE_LOCK,
      "RouteVpnService::WakeLock"
    ).apply {
      setReferenceCounted(false)
      acquire(10 * 60 * 60 * 1000L)
    }

    startForeground(
      NOTIFICATION_ID,
      buildNotification(
        stateLabel = "Connecting",
        content = if (currentEndpoint.isNotBlank()) {
          "Starting tunnel via $currentEndpoint"
        } else {
          "Starting secure tunnel"
        },
        isConnected = false,
      )
    )

    try {
      val started = when (currentEngine) {
        "xray" -> startXrayService()
        "sing-box" -> startSingboxService()
        else -> {
          lastError = "Unknown engine: $currentEngine"
          false
        }
      }
      
      if (started) {
        // Запускаем проверку подключения в фоновом потоке
        Thread {
          try {
            waitForTunnelEstablished()
            updateStatusNotification(
              stateLabel = "Connected",
              content = if (currentEndpoint.isNotBlank()) {
                "Phoenix VPN via $currentEndpoint ($currentEngine)"
              } else {
                "Phoenix VPN is protecting traffic"
              },
              isConnected = true,
            )
            playTone(ToneGenerator.TONE_PROP_ACK, 180)
          } catch (error: Exception) {
            instanceError = error.message
            lastError = instanceError
            instanceDebugMessage = "Connection failed: ${error.message}"
            lastDebugMessage = instanceDebugMessage
            updateStatusNotification(
              stateLabel = "Error",
              content = error.message ?: "Failed to establish connection",
              isConnected = false,
            )
            stopCurrentService(playDisconnectTone = false)
          }
        }.start()
      }
    } catch (error: Exception) {
      instanceError = error.message
      lastError = instanceError
      instanceDebugMessage = "Start failed: ${error.message}"
      lastDebugMessage = instanceDebugMessage
      updateStatusNotification(
        stateLabel = "Error",
        content = error.message ?: "Failed to start VPN",
        isConnected = false,
      )
      stopCurrentService(playDisconnectTone = false)
    }

    return START_STICKY
  }

  override fun onDestroy() {
    stopCurrentService(playDisconnectTone = false)
    currentInstance = null
    super.onDestroy()
  }

  private fun startXrayService(): Boolean {
    val xrayConfig = xrayConfigJson
    
    if (xrayConfig != null) {
      instanceDebugMessage = "Starting xray..."
      lastDebugMessage = instanceDebugMessage
      try {
        startXray(xrayConfig)
        currentEngine = "xray"
        instanceDebugMessage = "xray started successfully"
        lastDebugMessage = instanceDebugMessage
        
        // Проверяем, что xray действительно запустился
        Thread.sleep(1500) // Даем время на запуск
        if (xrayController?.isRunning() != true) {
          instanceError = "xray failed to start - controller reports not running"
          lastError = instanceError
          instanceDebugMessage = "xray failed to initialize"
          lastDebugMessage = instanceDebugMessage
          
          // Если xray не удался, пробуем sing-box как fallback
          if (singboxConfigJson != null) {
            instanceDebugMessage = "xray failed to initialize, trying sing-box fallback..."
            lastDebugMessage = instanceDebugMessage
            return startSingboxService()
          }
          throw Exception("xray failed to initialize")
        }
        
        return true
      } catch (e: Exception) {
        instanceError = "xray failed: ${e.message}"
        lastError = instanceError
        instanceDebugMessage = "xray error: ${e.message}"
        lastDebugMessage = instanceDebugMessage
        
        // Если xray не удался, пробуем sing-box как fallback
        if (singboxConfigJson != null) {
          instanceDebugMessage = "xray failed, trying sing-box fallback..."
          lastDebugMessage = instanceDebugMessage
          return startSingboxService()
        }
        throw e
      }
    }
    
    instanceError = "No xray config provided"
    lastError = instanceError
    instanceDebugMessage = "Missing xray configuration"
    lastDebugMessage = instanceDebugMessage
    throw Exception("No xray config provided")
  }

  private fun startSingboxService(): Boolean {
    val singboxConfig = singboxConfigJson
    
    if (singboxConfig != null) {
      instanceDebugMessage = "Starting sing-box..."
      lastDebugMessage = instanceDebugMessage
      try {
        startSingbox(singboxConfig)
        currentEngine = "sing-box"
        instanceDebugMessage = "sing-box started successfully"
        lastDebugMessage = instanceDebugMessage
        return true
      } catch (e: Exception) {
        instanceError = "sing-box failed: ${e.message}"
        lastError = instanceError
        instanceDebugMessage = "sing-box error: ${e.message}"
        lastDebugMessage = instanceDebugMessage
        throw e
      }
    }
    
    instanceError = "No sing-box config provided"
    lastError = instanceError
    instanceDebugMessage = "Missing sing-box configuration"
    lastDebugMessage = instanceDebugMessage
    throw Exception("No sing-box config provided")
  }

  private fun startXray(configJson: String) {
    instanceDebugMessage = "Initializing xray controller..."
    lastDebugMessage = instanceDebugMessage
    try {
      xrayController = XrayController(this)
      xrayController?.start(configJson)
      instanceDebugMessage = "xray controller started"
      lastDebugMessage = instanceDebugMessage
    } catch (e: Exception) {
      instanceError = "Failed to start xray: ${e.message}"
      lastError = instanceError
      instanceDebugMessage = "xray start error: ${e.message}"
      lastDebugMessage = instanceDebugMessage
      throw e
    }
  }

  private fun startSingbox(configJson: String) {
    if (commandServer == null) {
      commandServer = CommandServer(this, this).also { 
        it.start()
      }
      Thread.sleep(500)
    }
    commandServer?.startOrReloadService(configJson, OverrideOptions().apply { 
      autoRedirect = true
    })
  }

  private fun extractEndpointFromSingbox(configJson: String): String {
    return runCatching {
      val obj = JSONObject(configJson)
      val outbounds = obj.optJSONArray("outbounds") ?: return ""
      val first = outbounds.optJSONObject(0) ?: return ""
      val dialer = first.optJSONObject("dialer") ?: return ""
      val address = dialer.optString("address")
      val port = dialer.optInt("port")
      when {
        address.isBlank() -> ""
        port > 0 -> "$address:$port"
        else -> address
      }
    }.getOrDefault("")
  }

  private fun extractEndpointFromXray(configJson: String): String {
    return runCatching {
      val obj = JSONObject(configJson)
      val outbounds = obj.optJSONArray("outbounds") ?: return ""
      val first = outbounds.optJSONObject(0) ?: return ""
      val streamSettings = first.optJSONObject("streamSettings")
      val settings = first.optJSONObject("settings")
      val vnext = settings?.optJSONArray("vnext")?.optJSONObject(0)
      
      val address = vnext?.optString("address") ?: first.optString("server") ?: ""
      val port = vnext?.optInt("port") ?: first.optInt("server_port") ?: 443
      
      when {
        address.isBlank() -> ""
        port > 0 -> "$address:$port"
        else -> address
      }
    }.getOrDefault("")
  }

  override fun onRevoke() {
    stopCurrentService(playDisconnectTone = true)
    super.onRevoke()
  }

  override fun onBind(intent: Intent): IBinder? {
    return super.onBind(intent)
  }

  override fun autoDetectInterfaceControl(fd: Int) {
    protect(fd)
  }

  override fun clearDNSCache() = Unit

  override fun closeDefaultInterfaceMonitor(listener: InterfaceUpdateListener) = Unit

  override fun closeNeighborMonitor(listener: NeighborUpdateListener) = Unit

  override fun findConnectionOwner(ipProtocol: Int, sourceAddress: String, sourcePort: Int, destinationAddress: String, destinationPort: Int): ConnectionOwner {
    return ConnectionOwner().apply {
      userId = -1
      userName = ""
      androidPackageName = ""
    }
  }

  override fun getInterfaces(): NetworkInterfaceIterator {
    val connectivity = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    val allNetworks = connectivity.allNetworks
    val javaInterfaces = JNetworkInterface.getNetworkInterfaces().toList()
    val interfaces = mutableListOf<NetworkInterface>()

    for (network in allNetworks) {
      val linkProperties = connectivity.getLinkProperties(network) ?: continue
      val capabilities = connectivity.getNetworkCapabilities(network) ?: continue
      val name = linkProperties.interfaceName ?: continue
      val javaNetworkInterface = javaInterfaces.firstOrNull { it.name == name } ?: continue
      val item = NetworkInterface().apply {
        this.name = name
        index = javaNetworkInterface.index
        mtu = runCatching { javaNetworkInterface.mtu }.getOrDefault(1500)
        type = when {
          capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> Libbox.InterfaceTypeWIFI
          capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> Libbox.InterfaceTypeCellular
          capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> Libbox.InterfaceTypeEthernet
          else -> Libbox.InterfaceTypeOther
        }
        dnsServer = StringArray(linkProperties.dnsServers.mapNotNull { it.hostAddress }.iterator())
        addresses = StringArray(javaNetworkInterface.interfaceAddresses.map { it.toPrefix() }.iterator())
      }
      interfaces.add(item)
    }

    return object : NetworkInterfaceIterator {
      private val iterator = interfaces.iterator()
      override fun hasNext(): Boolean = iterator.hasNext()
      override fun next(): NetworkInterface = iterator.next()
    }
  }

  override fun includeAllNetworks(): Boolean = false

  override fun localDNSTransport(): LocalDNSTransport? = null

  override fun openTun(options: TunOptions): Int {
    val prepareIntent = VpnService.prepare(this)
    if (prepareIntent != null) {
      instanceError = "VPN permission is missing - user needs to grant VPN permission"
      lastError = instanceError
      instanceDebugMessage = "VPN permission not granted, cannot establish tunnel"
      lastDebugMessage = instanceDebugMessage
      throw IllegalStateException("VPN permission is missing")
    }

    tunDescriptor?.close()
    tunDescriptor = null
    isTunnelEstablished.set(false)

    val builder = Builder()
      .setSession("Phoenix Route")
      .setMtu(options.getMTU())

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      builder.setMetered(false)
    }

    val inet4Address = options.getInet4Address()
    while (inet4Address.hasNext()) {
      val address = inet4Address.next()
      builder.addAddress(address.address(), address.prefix())
    }

    val inet6Address = options.getInet6Address()
    while (inet6Address.hasNext()) {
      val address = inet6Address.next()
      builder.addAddress(address.address(), address.prefix())
    }

    // Always add DNS servers - critical for traffic routing
    try {
      val dnsServer = options.getDNSServerAddress().value
      if (dnsServer.isNotBlank()) {
        builder.addDnsServer(dnsServer)
      } else {
        // Fallback DNS servers if none provided
        builder.addDnsServer("8.8.8.8")
        builder.addDnsServer("8.8.4.4")
        builder.addDnsServer("1.1.1.1")
      }
    } catch (e: Exception) {
      // Fallback DNS servers
      builder.addDnsServer("8.8.8.8")
      builder.addDnsServer("8.8.4.4")
      builder.addDnsServer("1.1.1.1")
    }

    if (options.getAutoRoute()) {
      val ipv4Routes = options.getInet4RouteAddress()
      while (ipv4Routes.hasNext()) {
        val route = ipv4Routes.next()
        builder.addRoute(route.address(), route.prefix())
      }
      val ipv6Routes = options.getInet6RouteAddress()
      while (ipv6Routes.hasNext()) {
        val route = ipv6Routes.next()
        builder.addRoute(route.address(), route.prefix())
      }
      val ipv4LegacyRoutes = options.getInet4RouteRange()
      while (ipv4LegacyRoutes.hasNext()) {
        val route = ipv4LegacyRoutes.next()
        builder.addRoute(route.address(), route.prefix())
      }
      val ipv6LegacyRoutes = options.getInet6RouteRange()
      while (ipv6LegacyRoutes.hasNext()) {
        val route = ipv6LegacyRoutes.next()
        builder.addRoute(route.address(), route.prefix())
      }

      // Add default routes for all traffic
      builder.addRoute("0.0.0.0", 0)
      builder.addRoute("::", 0)

      val includePackages = options.getIncludePackage()
      while (includePackages.hasNext()) {
        runCatching { builder.addAllowedApplication(includePackages.next()) }
      }

      val excludePackages = options.getExcludePackage()
      while (excludePackages.hasNext()) {
        runCatching { builder.addDisallowedApplication(excludePackages.next()) }
      }
    } else {
      // Even if autoRoute is false, we need routes for VPN to work
      builder.addRoute("0.0.0.0", 0)
      builder.addRoute("::", 0)
    }

    if (options.isHTTPProxyEnabled() && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      systemProxyAvailable = true
      systemProxyEnabled = true
      builder.setHttpProxy(
        ProxyInfo.buildDirectProxy(
          options.getHTTPProxyServer(),
          options.getHTTPProxyServerPort(),
          options.getHTTPProxyBypassDomain().toList(),
        )
      )
    } else {
      systemProxyAvailable = false
      systemProxyEnabled = false
    }

    val established = builder.establish()
    if (established == null) {
      error("Failed to establish VPN interface - builder.establish() returned null")
    }
    
    tunDescriptor = established
    isTunnelEstablished.set(true)
    instanceDebugMessage = "VPN TUN established for $currentEndpoint"
    lastDebugMessage = instanceDebugMessage
    return established.fd
  }

  override fun readWIFIState(): WIFIState? = null

  override fun registerMyInterface(name: String) = Unit

  override fun sendNotification(notification: LibboxNotification) {
    val message = notification.title ?: notification.body ?: "VPN notification"
    instanceDebugMessage = message
    lastDebugMessage = instanceDebugMessage
    if (!isRunning()) {
      updateStatusNotification(
        stateLabel = "Running",
        content = message,
        isConnected = false,
      )
      return
    }

    updateStatusNotification(
      stateLabel = "Active",
      content = if (currentEndpoint.isNotBlank()) {
        "Phoenix VPN active via $currentEndpoint"
      } else {
        "Phoenix VPN is active"
      },
      isConnected = true,
    )
  }

  override fun startDefaultInterfaceMonitor(listener: InterfaceUpdateListener) = Unit

  override fun startNeighborMonitor(listener: NeighborUpdateListener) = Unit

  override fun systemCertificates(): StringIterator {
    val certificates = systemCertificateCache ?: loadSystemCertificates().also {
      systemCertificateCache = it
    }
    return StringArray(certificates)
  }

  override fun underNetworkExtension(): Boolean = false

  override fun usePlatformAutoDetectInterfaceControl(): Boolean = true

  override fun useProcFS(): Boolean = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q

  override fun getSystemProxyStatus(): SystemProxyStatus {
    return SystemProxyStatus().apply {
      setAvailable(systemProxyAvailable)
      setEnabled(systemProxyEnabled)
    }
  }

  override fun serviceReload() = Unit

  override fun serviceStop() {
    if (instanceError.isNullOrBlank()) {
      instanceError = if (instanceDebugMessage.isNotBlank()) {
        "sing-box stopped: $instanceDebugMessage"
      } else {
        "sing-box stopped the tunnel"
      }
      lastError = instanceError
    }
    stopCurrentService(playDisconnectTone = true)
  }

  override fun setSystemProxyEnabled(enabled: Boolean) {
    systemProxyEnabled = enabled
  }

  override fun writeDebugMessage(message: String) {
    // Сохраняем полное сообщение для отладки
    val fullMessage = "[${System.currentTimeMillis()}] $message"
    instanceDebugMessage = fullMessage
    lastDebugMessage = fullMessage // Для обратной совместимости
    
    // Проверяем критические ошибки sing-box
    val lowerMessage = message.lowercase()
    if (lowerMessage.contains("error") || 
        lowerMessage.contains("failed") || 
        lowerMessage.contains("direct dns") ||
        lowerMessage.contains("connection refused") ||
        lowerMessage.contains("timeout") ||
        lowerMessage.contains("network unreachable") ||
        lowerMessage.contains("no route to host") ||
        lowerMessage.contains("connection reset") ||
        lowerMessage.contains("host unreachable")) {
      
      instanceError = "sing-box error: $message"
      lastError = instanceError // Для обратной совместимости
      
      // Логируем в системный лог для отладки
      Log.e("RouteVpnService", "sing-box error detected: $message")
    }
    
    // Логируем все сообщения от sing-box для отладки
    if (message.contains("dial", ignoreCase = true) || 
        message.contains("connect", ignoreCase = true) ||
        message.contains("proxy", ignoreCase = true) ||
        message.contains("dns", ignoreCase = true)) {
      Log.d("RouteVpnService", "sing-box debug: $message")
    }
  }

  private fun stopCurrentService(playDisconnectTone: Boolean) {
    val wasRunning = isRunning.get()
    
    wakeLock?.let {
      if (it.isHeld) {
        it.release()
      }
    }
    wakeLock = null
    
    runCatching { commandServer?.closeService() }
    runCatching { commandServer?.close() }
    runCatching { xrayController?.stop() }
    commandServer = null
    runCatching { tunDescriptor?.close() }
    tunDescriptor = null
    isTunnelEstablished.set(false)
    systemProxyAvailable = false
    systemProxyEnabled = false
    systemCertificateCache = null
    currentEndpoint = ""
    currentEngine = ""
    singboxConfigJson = null
    xrayConfigJson = null
    xrayController = null
    instanceDebugMessage = ""
    instanceError = null
    isRunning.set(false)
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
    
    // Сбрасываем currentInstance при остановке сервиса
    if (this == currentInstance) {
      currentInstance = null
    }

    if (playDisconnectTone && wasRunning) {
      playTone(ToneGenerator.TONE_PROP_NACK, 180)
    }
  }

  private fun updateStatusNotification(stateLabel: String, content: String, isConnected: Boolean) {
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.notify(NOTIFICATION_ID, buildNotification(stateLabel, content, isConnected))
  }

  private fun waitForTunnelEstablished() {
    val deadlineAt = System.currentTimeMillis() + TUNNEL_ESTABLISH_TIMEOUT_MS
    var connectionAttempts = 0
    val maxConnectionAttempts = 3
    
    while (System.currentTimeMillis() < deadlineAt) {
      if (isConnected()) {
        // Проверяем реальное подключение - ждем немного чтобы движок успел установить соединение
        Thread.sleep(1000)
        
        // Проверяем есть ли ошибки от движка
        val hasError = lastDebugMessage.contains("error", ignoreCase = true) || 
            lastDebugMessage.contains("failed", ignoreCase = true) ||
            lastDebugMessage.contains("direct dns", ignoreCase = true) ||
            lastDebugMessage.contains("connection refused", ignoreCase = true) ||
            lastDebugMessage.contains("timeout", ignoreCase = true) ||
            lastDebugMessage.contains("network unreachable", ignoreCase = true) ||
            lastDebugMessage.contains("no route to host", ignoreCase = true) ||
            lastDebugMessage.contains("connection reset", ignoreCase = true) ||
            lastDebugMessage.contains("host unreachable", ignoreCase = true)
        
        if (hasError) {
          connectionAttempts++
          instanceDebugMessage = "Connection attempt $connectionAttempts failed: $instanceDebugMessage"
          lastDebugMessage = instanceDebugMessage
          
          if (connectionAttempts >= maxConnectionAttempts) {
            instanceError = "Failed to establish connection after $maxConnectionAttempts attempts"
            lastError = instanceError
            throw IllegalStateException(instanceError)
          }
          
          // Перезапускаем движок
          instanceDebugMessage = "Restarting $currentEngine (attempt ${connectionAttempts + 1}/$maxConnectionAttempts)..."
          lastDebugMessage = instanceDebugMessage
          try {
            when (currentEngine) {
              "xray" -> {
                xrayController?.stop()
                Thread.sleep(500)
                xrayController?.start(xrayConfigJson ?: "")
              }
              "sing-box" -> {
                commandServer?.closeService()
                Thread.sleep(500)
                commandServer?.startOrReloadService(singboxConfigJson ?: "", OverrideOptions().apply {
                  autoRedirect = true
                })
              }
            }
            Thread.sleep(1000)
          } catch (e: Exception) {
            instanceError = "Failed to restart $currentEngine: ${e.message}"
            lastError = instanceError
            throw e
          }
          continue
        }
        
        // Если нет ошибок и подключение установлено
        return
      }
      Thread.sleep(TUNNEL_ESTABLISH_POLL_MS)
    }
    
    if (connectionAttempts >= maxConnectionAttempts) {
      lastError = "Failed to establish VPN connection after $maxConnectionAttempts attempts"
    } else {
      lastError = lastError ?: "TUN interface was not established in time"
    }
    throw IllegalStateException(lastError)
  }

  private fun buildNotification(stateLabel: String, content: String, isConnected: Boolean): Notification {
    ensureNotificationChannel()

    val launchIntent = packageManager.getLaunchIntentForPackage(packageName) ?: Intent(this, MainActivity::class.java)
    val openIntent = PendingIntent.getActivity(
      this,
      0,
      launchIntent,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    val disconnectIntent = PendingIntent.getService(
      this,
      1,
      Intent(this, RouteVpnService::class.java).apply { action = ACTION_DISCONNECT },
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_vpn_notification)
      .setContentTitle("Phoenix VPN")
      .setContentText(content)
      .setSubText(stateLabel)
      .setStyle(NotificationCompat.BigTextStyle().bigText(content))
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setColor(if (isConnected) 0xFFEA580C.toInt() else 0xFFF59E0B.toInt())
      .setContentIntent(openIntent)
      .addAction(0, "Disconnect", disconnectIntent)
      .build()
  }

  private fun ensureNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val channel = NotificationChannel(CHANNEL_ID, "Phoenix VPN", NotificationManager.IMPORTANCE_LOW).apply {
      description = "Shows Phoenix VPN tunnel status"
      setShowBadge(false)
      setSound(null, null)
    }
    manager.createNotificationChannel(channel)
  }

  private fun extractEndpointLabel(configJson: String): String {
    return runCatching {
      val outbounds = JSONObject(configJson).optJSONArray("outbounds") ?: return ""
      val first = outbounds.optJSONObject(0) ?: return ""
      val server = first.optString("server")
      val port = first.optInt("server_port")
      when {
        server.isBlank() -> ""
        port > 0 -> "$server:$port"
        else -> server
      }
    }.getOrDefault("")
  }

  private fun playTone(tone: Int, durationMs: Int) {
    runCatching {
      val generator = ToneGenerator(AudioManager.STREAM_NOTIFICATION, 90)
      generator.startTone(tone, durationMs)
      generator.release()
    }
  }

  private fun InterfaceAddress.toPrefix(): String {
    val host = if (address is Inet6Address) Inet6Address.getByAddress(address.address).hostAddress else address.hostAddress
    return "$host/$networkPrefixLength"
  }

  private fun loadSystemCertificates(): List<String> {
    return runCatching {
      val keyStore = KeyStore.getInstance("AndroidCAStore").apply {
        load(null, null)
      }

      keyStore.aliases().toList().mapNotNull { alias ->
        (keyStore.getCertificate(alias) as? X509Certificate)?.toPem()
      }
    }.onFailure {
      instanceDebugMessage = "Failed to load Android system certificates: ${it.message.orEmpty()}"
      lastDebugMessage = instanceDebugMessage
    }.getOrDefault(emptyList())
  }

  private fun X509Certificate.toPem(): String {
    val base64Body = Base64.encodeToString(encoded, Base64.NO_WRAP)
      .chunked(64)
      .joinToString("\n")
    return buildString {
      append("-----BEGIN CERTIFICATE-----\n")
      append(base64Body)
      append("\n-----END CERTIFICATE-----")
    }
  }

  private fun StringIterator.toList(): List<String> {
    val values = mutableListOf<String>()
    while (hasNext()) values.add(next())
    return values
  }

  class StringArray(values: List<String>) : StringIterator {
    private val items = values
    private var index = 0

    constructor(iterator: Iterator<String>) : this(iterator.asSequence().toList())

    override fun hasNext(): Boolean = index < items.size
    override fun len(): Int = items.size
    override fun next(): String = items[index++]
  }

  companion object {
    private const val EXTRA_CONFIG_JSON = "extra_config_json"
    private const val EXTRA_ENDPOINT_LABEL = "extra_endpoint_label"
    private const val ACTION_DISCONNECT = "com.phoenix.vpn.action.DISCONNECT"
    private const val CHANNEL_ID = "route_service"
    private const val NOTIFICATION_ID = 1042
    private val isRunning = AtomicBoolean(false)
    private val isTunnelEstablished = AtomicBoolean(false)
    @Volatile private var lastDebugMessage: String = ""
    @Volatile private var lastError: String? = null
    @Volatile private var currentInstance: RouteVpnService? = null
    private const val TUNNEL_ESTABLISH_TIMEOUT_MS = 10_000L
    private const val TUNNEL_ESTABLISH_POLL_MS = 200L

    fun startService(context: Context, configJson: String, endpointLabel: String = "") {
      if (isRunning.get()) {
        stopService(context)
        Thread.sleep(500)
      }
      val intent = Intent(context, RouteVpnService::class.java).apply {
        putExtra(EXTRA_CONFIG_JSON, configJson)
        putExtra(EXTRA_ENDPOINT_LABEL, endpointLabel)
      }
      ContextCompat.startForegroundService(context, intent)
    }

    fun stopService(context: Context) {
      if (isRunning.get()) {
        context.startService(Intent(context, RouteVpnService::class.java).apply { action = ACTION_DISCONNECT })
        isRunning.set(false)
        isTunnelEstablished.set(false)
      }
    }

    fun isRunning(): Boolean = isRunning.get()
    fun isConnected(): Boolean = isRunning.get() && isTunnelEstablished.get()

    fun getTrafficStats(): Map<String, Any> {
      val currentTime = System.currentTimeMillis()
      val isCurrentlyRunning = isRunning.get()
      val isCurrentlyConnected = isConnected()
      
      // Получаем статистику от текущего движка
      var upload = 0L
      var download = 0L
      
      // Используем instance-данные если доступны
      val instance = currentInstance
      val debugMessage = instance?.instanceDebugMessage ?: lastDebugMessage
      val errorMessage = instance?.instanceError ?: lastError ?: ""
      val currentEngine = instance?.currentEngine ?: if (isCurrentlyRunning) "xray" else "none"
      val currentEndpoint = instance?.currentEndpoint ?: ""
      
      var diagnosticStatus = "unknown"
      var diagnosticDetails = ""
      
      when {
        !isCurrentlyRunning -> {
          diagnosticStatus = "not_running"
          diagnosticDetails = "VPN service is not running"
        }
        !isCurrentlyConnected -> {
          diagnosticStatus = "tunnel_not_established"
          diagnosticDetails = "TUN interface not established"
        }
        errorMessage.isNotBlank() -> {
          diagnosticStatus = "error"
          diagnosticDetails = errorMessage
        }
        debugMessage.contains("direct dns", ignoreCase = true) -> {
          diagnosticStatus = "dns_error"
          diagnosticDetails = "$currentEngine using direct DNS instead of proxy"
        }
        debugMessage.contains("dial", ignoreCase = true) && debugMessage.contains("failed", ignoreCase = true) -> {
          diagnosticStatus = "connection_failed"
          diagnosticDetails = "Failed to connect to server"
        }
        debugMessage.contains("connected", ignoreCase = true) && debugMessage.contains("success", ignoreCase = true) -> {
          diagnosticStatus = "connected"
          diagnosticDetails = "Successfully connected to server"
        }
        else -> {
          diagnosticStatus = "running"
          diagnosticDetails = "VPN service is running"
        }
      }
      
      return mapOf(
        "upload" to upload,
        "download" to download,
        "debug" to debugMessage,
        "error" to errorMessage,
        "running" to isCurrentlyRunning,
        "connected" to isCurrentlyConnected,
        "engine" to currentEngine,
        "diagnostic_status" to diagnosticStatus,
        "diagnostic_details" to diagnosticDetails,
        "timestamp" to currentTime,
        "endpoint" to currentEndpoint
      )
    }
  }
}


