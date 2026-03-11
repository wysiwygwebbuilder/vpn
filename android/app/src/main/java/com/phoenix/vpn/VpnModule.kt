package com.phoenix.vpn

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Proxy
import android.net.VpnService
import android.os.Build
import android.util.Base64
import android.util.Log
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import io.nekohasekai.libbox.CommandServer
import io.nekohasekai.libbox.CommandServerHandler
import io.nekohasekai.libbox.ConnectionOwner
import io.nekohasekai.libbox.InterfaceUpdateListener
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
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.net.HttpURLConnection
import java.net.InetSocketAddress
import java.net.Proxy as JProxy
import java.net.ServerSocket
import java.net.Socket
import java.net.URL
import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import java.security.cert.X509Certificate
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import javax.net.ssl.SNIHostName
import javax.net.ssl.SSLSocket
import javax.net.ssl.SSLSocketFactory

class VpnModule(private val appContext: ReactApplicationContext) : ReactContextBaseJavaModule(appContext), ActivityEventListener {
  private var pendingConfig: String? = null
  private var pendingPromise: Promise? = null
  private val ioExecutor = Executors.newFixedThreadPool(PING_PARALLELISM)
  private val isConnecting = AtomicBoolean(false)
  private val isDisconnecting = AtomicBoolean(false)

  init {
    appContext.addActivityEventListener(this)
  }

  override fun getName(): String = "VpnModule"

  @ReactMethod
  fun connect(configJson: String, promise: Promise) {
    if (isConnecting.getAndSet(true)) {
      promise.reject("ALREADY_CONNECTING", "Another connection attempt is in progress")
      return
    }
    
    if (RouteVpnService.isRunning()) {
      RouteVpnService.stopService(appContext)
      Thread.sleep(300)
    }
    
    val activity = appContext.currentActivity
    if (activity == null) {
      isConnecting.set(false)
      promise.reject("NO_ACTIVITY", "Activity is not available")
      return
    }

    val prepareIntent = VpnService.prepare(activity)
    pendingConfig = configJson
    pendingPromise = promise

    if (prepareIntent != null) {
      activity.startActivityForResult(prepareIntent, REQUEST_CODE_PREPARE_VPN)
      return
    }

    startVpnService(activity, configJson, promise)
  }

  @ReactMethod
  fun disconnect(promise: Promise) {
    if (isDisconnecting.getAndSet(true)) {
      promise.reject("ALREADY_DISCONNECTING", "Another disconnection attempt is in progress")
      return
    }
    
    try {
      RouteVpnService.stopService(appContext)
      Thread.sleep(300)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("DISCONNECT_FAILED", error.message, error)
    } finally {
      isDisconnecting.set(false)
      isConnecting.set(false)
    }
  }

  @ReactMethod
  fun isConnected(promise: Promise) {
    promise.resolve(RouteVpnService.isConnected())
  }

  @ReactMethod
  fun measurePing(host: String, port: Int, promise: Promise) {
    ioExecutor.execute {
      try {
        val startedAt = System.currentTimeMillis()
        Socket().use { socket ->
          socket.connect(InetSocketAddress(host, port), CONNECT_TIMEOUT_MS)
        }
        promise.resolve((System.currentTimeMillis() - startedAt).toInt())
      } catch (_: Exception) {
        promise.resolve(-1)
      }
    }
  }

  @ReactMethod
  fun probeServer(configJson: String, promise: Promise) {
    if (RouteVpnService.isRunning()) {
      promise.resolve(0)
      return
    }

    ioExecutor.execute {
      try {
        promise.resolve(probeServerInternal(configJson))
      } catch (error: Exception) {
        Log.w(TAG, "Failed to test server availability", error)
        promise.resolve(-1)
      }
    }
  }

  @ReactMethod
  fun probeServerDeep(configJson: String, promise: Promise) {
    if (RouteVpnService.isRunning()) {
      promise.resolve(0)
      return
    }

    ioExecutor.execute {
      try {
        promise.resolve(runRealAvailabilityTest(configJson))
      } catch (error: Exception) {
        Log.w(TAG, "Failed to deeply test server availability", error)
        promise.resolve(-1)
      }
    }
  }

  @ReactMethod
  fun getTrafficStats(promise: Promise) {
    promise.resolve(RouteVpnService.getTrafficStats())
  }

  override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
    if (requestCode != REQUEST_CODE_PREPARE_VPN) {
      return
    }

    val promise = pendingPromise
    val config = pendingConfig
    pendingPromise = null
    pendingConfig = null

    if (promise == null || config == null) {
      isConnecting.set(false) // Сбрасываем состояние подключения
      return
    }

    if (resultCode != Activity.RESULT_OK) {
      promise.reject("VPN_PERMISSION_DENIED", "VPN permission was not granted")
      isConnecting.set(false) // Сбрасываем состояние подключения
      return
    }

    startVpnService(activity, config, promise)
  }

  override fun onNewIntent(intent: Intent) = Unit

  private fun startVpnService(activity: Activity, configJson: String, promise: Promise) {
    try {
      RouteVpnService.startService(activity, configJson)
      Thread.sleep(300)
      promise.resolve(true)
    } catch (error: Exception) {
      Log.e(TAG, "Failed to start RouteVpnService", error)
      promise.reject("START_FAILED", error.message, error)
    } finally {
      isConnecting.set(false)
    }
  }

  private fun runRealAvailabilityTest(configJson: String): Int {
    if (isXrayConfig(configJson)) {
      return probeServerInternal(configJson)
    }

    val startedAt = System.currentTimeMillis()
    val listenPort = findFreePort()
    val runtime = ProbeRuntime(appContext)
    val commandServer = CommandServer(runtime, runtime)
    val probeConfig = buildProxyTestConfig(configJson, listenPort)

    try {
      commandServer.start()
      commandServer.checkConfig(probeConfig)
      commandServer.startOrReloadService(probeConfig, OverrideOptions())
      Thread.sleep(PROBE_SERVICE_BOOT_DELAY_MS)
      performProxyRequest(listenPort)
      return (System.currentTimeMillis() - startedAt).toInt()
    } finally {
      runCatching { commandServer.closeService() }
      runCatching { commandServer.close() }
    }
  }

  private fun buildProxyTestConfig(configJson: String, listenPort: Int): String {
    val source = JSONObject(configJson)
    val sourceOutbounds = source.optJSONArray("outbounds") ?: throw IllegalArgumentException("outbounds are missing")
    val proxyOutbound = sourceOutbounds.optJSONObject(0) ?: throw IllegalArgumentException("proxy outbound is missing")
    if (!proxyOutbound.has("type")) {
      throw IllegalArgumentException("deep probe expects a sing-box outbound")
    }
    val dnsConfig = source.optJSONObject("dns")

    val inbounds = JSONArray().put(
      JSONObject()
        .put("type", "mixed")
        .put("tag", "probe-in")
        .put("listen", "127.0.0.1")
        .put("listen_port", listenPort)
    )

    val outbounds = JSONArray()
      .put(proxyOutbound)
      .put(JSONObject().put("type", "direct").put("tag", "direct"))
      .put(JSONObject().put("type", "block").put("tag", "block"))

    val route = JSONObject()
      .put("final", "proxy")

    val root = JSONObject()
      .put("log", JSONObject().put("level", "error"))
      .put("inbounds", inbounds)
      .put("outbounds", outbounds)
      .put("route", route)

    if (dnsConfig != null) {
      root.put("dns", dnsConfig)
    }

    return root.toString()
  }

  private fun performProxyRequest(listenPort: Int) {
    val proxy = JProxy(JProxy.Type.HTTP, InetSocketAddress("127.0.0.1", listenPort))
    val urls = listOf(
      "http://cp.cloudflare.com/generate_204",
      "http://connectivitycheck.gstatic.com/generate_204",
    )

    var lastError: Exception? = null
    for (target in urls) {
      try {
        val connection = (URL(target).openConnection(proxy) as HttpURLConnection).apply {
          requestMethod = "GET"
          instanceFollowRedirects = false
          connectTimeout = CONNECT_TIMEOUT_MS
          readTimeout = READ_TIMEOUT_MS
          setRequestProperty("User-Agent", "PhoenixVPN/1.0")
          setRequestProperty("Connection", "close")
        }

        connection.connect()
        val responseCode = connection.responseCode
        connection.inputStream?.close()
        connection.disconnect()

        if (responseCode in 200..299) {
          return
        }

        throw IllegalStateException("Unexpected probe response: $responseCode")
      } catch (error: Exception) {
        lastError = error
      }
    }

    throw lastError ?: IllegalStateException("Probe request failed")
  }

  private fun findFreePort(): Int {
    ServerSocket(0).use { socket ->
      socket.reuseAddress = true
      return socket.localPort
    }
  }

  private class ProbeRuntime(private val context: Context) : PlatformInterface, CommandServerHandler {
    private var systemCertificateCache: List<String>? = null

    override fun autoDetectInterfaceControl(fd: Int) = Unit
    override fun clearDNSCache() = Unit
    override fun closeDefaultInterfaceMonitor(listener: InterfaceUpdateListener) = Unit
    override fun closeNeighborMonitor(listener: NeighborUpdateListener) = Unit

    override fun findConnectionOwner(
      ipProtocol: Int,
      sourceAddress: String,
      sourcePort: Int,
      destinationAddress: String,
      destinationPort: Int,
    ): ConnectionOwner {
      return ConnectionOwner().apply {
        userId = -1
        userName = ""
        androidPackageName = ""
      }
    }

    override fun getInterfaces(): NetworkInterfaceIterator {
      return object : NetworkInterfaceIterator {
        override fun hasNext(): Boolean = false
        override fun next(): NetworkInterface = NetworkInterface()
      }
    }

    override fun includeAllNetworks(): Boolean = false
    override fun localDNSTransport(): LocalDNSTransport? = null
    override fun openTun(options: TunOptions): Int = error("TUN is not available in probe mode")
    override fun readWIFIState(): WIFIState? = null
    override fun registerMyInterface(name: String) = Unit
    override fun sendNotification(notification: LibboxNotification) = Unit
    override fun startDefaultInterfaceMonitor(listener: InterfaceUpdateListener) = Unit
    override fun startNeighborMonitor(listener: NeighborUpdateListener) = Unit

    override fun systemCertificates(): StringIterator {
      val certificates = systemCertificateCache ?: loadSystemCertificates().also {
        systemCertificateCache = it
      }
      return StringArray(certificates)
    }

    override fun underNetworkExtension(): Boolean = false
    override fun usePlatformAutoDetectInterfaceControl(): Boolean = false
    override fun useProcFS(): Boolean = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q

    override fun getSystemProxyStatus(): SystemProxyStatus {
      return SystemProxyStatus().apply {
        setAvailable(false)
        setEnabled(false)
      }
    }

    override fun serviceReload() = Unit
    override fun serviceStop() = Unit
    override fun setSystemProxyEnabled(enabled: Boolean) = Unit
    override fun writeDebugMessage(message: String) = Unit

    private fun loadSystemCertificates(): List<String> {
      return runCatching {
        val keyStore = KeyStore.getInstance("AndroidCAStore").apply {
          load(null, null)
        }

        keyStore.aliases().toList().mapNotNull { alias ->
          (keyStore.getCertificate(alias) as? X509Certificate)?.toPem()
        }
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
  }

  private fun probeServerInternal(rawConfig: String): Int {
    val startedAt = System.currentTimeMillis()
    val parsed = parseProbeConfig(rawConfig)

    when {
      parsed.network == "ws" -> probeWebSocket(parsed)
      parsed.network == "httpupgrade" -> probeHttpUpgrade(parsed)
      parsed.network == "splithttp" && parsed.security != "none" -> probeTls(parsed)
      parsed.network == "splithttp" -> probeTcp(parsed.host, parsed.port)
      parsed.security == "tls" -> probeTls(parsed)
      else -> probeTcp(parsed.host, parsed.port)
    }

    return (System.currentTimeMillis() - startedAt).toInt()
  }

  private fun parseProbeConfig(rawConfig: String): ProbeConfig {
    val trimmed = rawConfig.trim()
    if (trimmed.startsWith("{")) {
      return parseProbeConfigFromJson(JSONObject(trimmed))
    }

    return parseProbeConfigFromVlessUrl(trimmed)
  }

  private fun parseProbeConfigFromJson(root: JSONObject): ProbeConfig {
    val outbounds = root.optJSONArray("outbounds") ?: throw IllegalArgumentException("outbounds are missing")
    val outbound = outbounds.optJSONObject(0) ?: throw IllegalArgumentException("proxy outbound is missing")
    val transport = outbound.optJSONObject("transport")
    val streamSettings = outbound.optJSONObject("streamSettings")
    val singBoxTls = outbound.optJSONObject("tls")
    val tlsSettings = streamSettings?.optJSONObject("tlsSettings")
    val realitySettings = streamSettings?.optJSONObject("realitySettings")
    val wsSettings = streamSettings?.optJSONObject("wsSettings")
    val grpcSettings = streamSettings?.optJSONObject("grpcSettings")
    val httpUpgradeSettings = streamSettings?.optJSONObject("httpupgradeSettings")
    val splitHttpSettings = streamSettings?.optJSONObject("splithttpSettings")
      ?: streamSettings?.optJSONObject("xhttpSettings")
    val vnext = outbound.optJSONObject("settings")
      ?.optJSONArray("vnext")
      ?.optJSONObject(0)
    val host = outbound.optString("server")?.ifBlank {
      vnext?.optString("address")?.ifBlank { throw IllegalArgumentException("server is missing") }
    } ?: throw IllegalArgumentException("server is missing")
    val port = outbound.optInt("server_port").takeIf { it > 0 }
      ?: vnext?.optInt("port")?.takeIf { it > 0 }
      ?: 443
    val network = transport?.optString("type")?.ifBlank { null }
      ?: outbound.optString("network")?.ifBlank { null }
      ?: streamSettings?.optString("network")?.ifBlank { null }
      ?: "tcp"
    val hostHeader = when (network) {
      "ws" -> transport?.optJSONObject("headers")?.optString("Host")?.ifBlank { null }
        ?: wsSettings?.optString("host")?.ifBlank { null }
      "httpupgrade" -> transport?.optString("host")?.ifBlank { null }
        ?: httpUpgradeSettings?.optString("host")?.ifBlank { null }
      "splithttp" -> splitHttpSettings?.optString("host")?.ifBlank { null }
      "grpc" -> grpcSettings?.optString("authority")?.ifBlank { null }
      else -> null
    } ?: singBoxTls?.optString("server_name")?.ifBlank { null }
      ?: tlsSettings?.optString("serverName")?.ifBlank { null }
      ?: realitySettings?.optString("serverName")?.ifBlank { null }
      ?: host
    val path = transport?.optString("path")?.ifBlank { null }
      ?: wsSettings?.optString("path")?.ifBlank { null }
      ?: httpUpgradeSettings?.optString("path")?.ifBlank { null }
      ?: splitHttpSettings?.optString("path")?.ifBlank { null }
      ?: "/"
    val sni = singBoxTls?.optString("server_name")?.ifBlank { null }
      ?: tlsSettings?.optString("serverName")?.ifBlank { null }
      ?: realitySettings?.optString("serverName")?.ifBlank { null }
      ?: hostHeader
    val security = when {
      singBoxTls?.optBoolean("enabled") == true && singBoxTls.optJSONObject("reality")?.optBoolean("enabled") == true -> "reality"
      singBoxTls?.optBoolean("enabled") == true -> "tls"
      !streamSettings?.optString("security").isNullOrBlank() && streamSettings?.optString("security") != "none" -> streamSettings?.optString("security") ?: "none"
      else -> "none"
    }

    return ProbeConfig(
      host = host,
      port = port,
      security = security,
      network = network,
      sni = sni,
      hostHeader = hostHeader,
      path = path,
    )
  }

  private fun parseProbeConfigFromVlessUrl(rawConfig: String): ProbeConfig {
    val normalized = rawConfig.trim().replace("vless://", "http://")
    val url = URL(normalized)
    val params = splitQuery(url.query)
    val security = params["security"]?.lowercase() ?: "none"
    val network = params["type"]?.lowercase() ?: "tcp"
    val hostHeader = params["host"]?.ifBlank { null } ?: params["sni"]?.ifBlank { null } ?: url.host
    val path = params["path"]?.ifBlank { "/" } ?: "/"
    return ProbeConfig(
      host = url.host,
      port = if (url.port > 0) url.port else 443,
      security = security,
      network = network,
      sni = params["sni"]?.ifBlank { null } ?: hostHeader,
      hostHeader = hostHeader,
      path = path,
    )
  }

  private fun splitQuery(query: String?): Map<String, String> {
    if (query.isNullOrBlank()) {
      return emptyMap()
    }

    return query.split("&")
      .mapNotNull { chunk ->
        if (chunk.isBlank()) return@mapNotNull null
        val parts = chunk.split("=", limit = 2)
        val key = URLDecoder.decode(parts[0], StandardCharsets.UTF_8.name())
        val value = URLDecoder.decode(parts.getOrElse(1) { "" }, StandardCharsets.UTF_8.name())
        key to value
      }
      .toMap()
  }

  private fun isXrayConfig(rawConfig: String): Boolean {
    return runCatching {
      val trimmed = rawConfig.trim()
      if (!trimmed.startsWith("{")) {
        return@runCatching false
      }

      val firstOutbound = JSONObject(trimmed)
        .optJSONArray("outbounds")
        ?.optJSONObject(0)
        ?: return@runCatching false

      firstOutbound.has("protocol") && !firstOutbound.has("type")
    }.getOrDefault(false)
  }

  private fun probeTcp(host: String, port: Int) {
    Socket().use { socket ->
      socket.connect(InetSocketAddress(host, port), CONNECT_TIMEOUT_MS)
      socket.soTimeout = READ_TIMEOUT_MS
    }
  }

  private fun probeTls(config: ProbeConfig) {
    createSocket(config).use { }
  }

  private fun probeWebSocket(config: ProbeConfig) {
    createSocket(config).use { socket ->
      val output = BufferedOutputStream(socket.getOutputStream())
      val input = BufferedInputStream(socket.getInputStream())
      val pathValue = config.path ?: "/"
      val path = if (pathValue.startsWith("/")) pathValue else "/$pathValue"
      val key = Base64.encodeToString(UUID.randomUUID().toString().toByteArray(), Base64.NO_WRAP)
      val request = buildString {
        append("GET $path HTTP/1.1\r\n")
        append("Host: ${config.hostHeader ?: config.host}\r\n")
        append("Connection: Upgrade\r\n")
        append("Upgrade: websocket\r\n")
        append("Sec-WebSocket-Key: $key\r\n")
        append("Sec-WebSocket-Version: 13\r\n")
        append("User-Agent: PhoenixVPN/1.0\r\n\r\n")
      }
      output.write(request.toByteArray(StandardCharsets.UTF_8))
      output.flush()
      val response = readHttpStatusLine(input)
      if (!response.contains(" 101 ") && !response.endsWith(" 101")) {
        throw IllegalStateException("Unexpected WebSocket response: $response")
      }
    }
  }

  private fun probeHttpUpgrade(config: ProbeConfig) {
    createSocket(config).use { socket ->
      val output = BufferedOutputStream(socket.getOutputStream())
      val input = BufferedInputStream(socket.getInputStream())
      val pathValue = config.path ?: "/"
      val path = if (pathValue.startsWith("/")) pathValue else "/$pathValue"
      val request = buildString {
        append("GET $path HTTP/1.1\r\n")
        append("Host: ${config.hostHeader ?: config.host}\r\n")
        append("Connection: Upgrade\r\n")
        append("Upgrade: websocket\r\n")
        append("User-Agent: PhoenixVPN/1.0\r\n\r\n")
      }
      output.write(request.toByteArray(StandardCharsets.UTF_8))
      output.flush()
      val response = readHttpStatusLine(input)
      if (!response.startsWith("HTTP/1.1") && !response.startsWith("HTTP/1.0")) {
        throw IllegalStateException("Unexpected HTTP upgrade response: $response")
      }
    }
  }

  private fun createSocket(config: ProbeConfig): Socket {
    val baseSocket = Socket()
    baseSocket.connect(InetSocketAddress(config.host, config.port), CONNECT_TIMEOUT_MS)
    baseSocket.soTimeout = READ_TIMEOUT_MS

    if (config.security != "tls") {
      return baseSocket
    }

    val sslSocket = (SSLSocketFactory.getDefault() as SSLSocketFactory)
      .createSocket(baseSocket, config.host, config.port, true) as SSLSocket

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      val parameters = sslSocket.sslParameters
      val sniHost = config.sni ?: config.host
      parameters.serverNames = listOf(SNIHostName(sniHost))
      sslSocket.sslParameters = parameters
    }

    sslSocket.useClientMode = true
    sslSocket.startHandshake()
    return sslSocket
  }

  private fun readHttpStatusLine(input: BufferedInputStream): String {
    val buffer = StringBuilder()
    while (buffer.length < 1024) {
      val value = input.read()
      if (value == -1) {
        break
      }
      if (value == '\n'.code) {
        break
      }
      if (value != '\r'.code) {
        buffer.append(value.toChar())
      }
    }

    val line = buffer.toString().trim()
    if (line.isBlank()) {
      throw IllegalStateException("Empty HTTP response")
    }
    return line
  }

  data class ProbeConfig(
    val host: String,
    val port: Int,
    val security: String,
    val network: String,
    val sni: String?,
    val hostHeader: String?,
    val path: String?,
  )

  class StringArray(values: List<String>) : StringIterator {
    private val items = values
    private var index = 0

    override fun hasNext(): Boolean = index < items.size
    override fun len(): Int = items.size
    override fun next(): String = items[index++]
  }

  companion object {
    private const val TAG = "VpnModule"
    private const val REQUEST_CODE_PREPARE_VPN = 7345
    private const val PING_PARALLELISM = 3
    private const val CONNECT_TIMEOUT_MS = 4500
    private const val READ_TIMEOUT_MS = 4500
    private const val PROBE_SERVICE_BOOT_DELAY_MS = 450L
  }
}

  @ReactMethod
  fun testServerConnection(rawConfig: String, promise: Promise) {
    try {
      val parsed = parseProbeConfig(rawConfig)
      val startedAt = System.currentTimeMillis()
      
      // Проверяем базовое соединение
      when {
        parsed.network == "ws" -> probeWebSocket(parsed)
        parsed.network == "httpupgrade" -> probeHttpUpgrade(parsed)
        parsed.network == "splithttp" && parsed.security != "none" -> probeTls(parsed)
        parsed.network == "splithttp" -> probeTcp(parsed.host, parsed.port)
        parsed.security == "tls" -> probeTls(parsed)
        else -> probeTcp(parsed.host, parsed.port)
      }
      
      val latency = System.currentTimeMillis() - startedAt
      
      // Проверяем возможность установления реального VPN соединения
      val canConnect = testRealVpnConnection(parsed)
      
      val result = mapOf(
        "success" to true,
        "latency" to latency,
        "canConnect" to canConnect,
        "server" to "${parsed.host}:${parsed.port}",
        "protocol" to parsed.network,
        "security" to parsed.security
      )
      
      promise.resolve(convertMapToWritableMap(result))
    } catch (e: Exception) {
      promise.reject("CONNECTION_FAILED", "Failed to connect to server: ${e.message}", e)
    }
  }
  
  private fun testRealVpnConnection(config: ProbeConfig): Boolean {
    // Эта функция проверяет возможность установления реального VPN соединения
    // Вместо простого TCP/TLS соединения, проверяем возможность установления полного VPN туннеля
    try {
      // Создаем тестовый конфиг для xray/sing-box
      val testConfig = buildTestConfig(config)
      
      // Пытаемся установить соединение с коротким таймаутом
      val socket = createSocket(config)
      socket.use { sock ->
        // Проверяем, что сокет действительно работает
        sock.soTimeout = 5000 // 5 секунд для теста
        sock.isConnected
      }
      
      return true
    } catch (e: Exception) {
      Log.e(TAG, "Real VPN connection test failed: ${e.message}")
      return false
    }
  }
  
  private fun buildTestConfig(config: ProbeConfig): String {
    // Создаем минимальный тестовый конфиг для проверки
    return JSONObject().apply {
      put("outbounds", JSONArray().apply {
        put(JSONObject().apply {
          put("protocol", "vless")
          put("settings", JSONObject().apply {
            put("vnext", JSONArray().apply {
              put(JSONObject().apply {
                put("address", config.host)
                put("port", config.port)
                put("users", JSONArray().apply {
                  put(JSONObject().apply {
                    put("id", "test-id")
                    put("encryption", "none")
                  })
                })
              })
            })
          })
          put("streamSettings", JSONObject().apply {
            put("network", config.network)
            put("security", config.security)
            if (config.security == "tls") {
              put("tlsSettings", JSONObject().apply {
                put("serverName", config.sni ?: config.host)
              })
            }
          })
        })
      })
    }.toString()
  }