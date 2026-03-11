package com.phoenix.vpn.xray

import android.content.Context
import android.util.Log
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream

class XrayController(private val context: Context) {
    private var isRunning = false
    private var configJson: String? = null
    
    companion object {
        private const val TAG = "XrayController"
        private const val XRAY_ASSETS_DIR = "xray"
        private const val XRAY_CONFIG_FILE = "xray_config.json"
        private const val XRAY_GEOIP_FILE = "geoip.dat"
        private const val XRAY_GEOSITE_FILE = "geosite.dat"
    }
    
    fun start(configJson: String) {
        if (isRunning) {
            stop()
        }
        
        this.configJson = configJson
        isRunning = true
        
        try {
            // Создаем директорию для xray
            val xrayDir = File(context.filesDir, XRAY_ASSETS_DIR)
            if (!xrayDir.exists()) {
                xrayDir.mkdirs()
            }
            
            // Копируем гео-данные если их нет
            copyGeoAssets(xrayDir)
            
            // Сохраняем конфиг
            val configFile = File(xrayDir, XRAY_CONFIG_FILE)
            configFile.writeText(configJson)
            
            // Запускаем xray через JNI
            startXrayNative(
                xrayDir.absolutePath,
                configFile.absolutePath
            )
            
            // Проверяем, что xray запустился
            Thread.sleep(1000) // Даем время на запуск
            if (!isXrayRunningNative()) {
                throw IllegalStateException("Xray failed to start")
            }
            
            Log.d(TAG, "Xray started successfully")
        } catch (e: Exception) {
            isRunning = false
            Log.e(TAG, "Failed to start xray: ${e.message}", e)
            throw e
        }
    }
    
    fun stop() {
        if (!isRunning) return
        
        try {
            stopXrayNative()
            isRunning = false
            configJson = null
            Log.d(TAG, "Xray stopped successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to stop xray: ${e.message}", e)
        }
    }
    
    fun isRunning(): Boolean = isRunning && isXrayRunningNative()
    
    fun getStats(): Map<String, Any> {
        try {
            val statsJson = getXrayStatsNative()
            val obj = JSONObject(statsJson)
            return mapOf(
                "upload" to obj.optLong("upload", 0),
                "download" to obj.optLong("download", 0),
                "debug" to obj.optString("debug", ""),
                "error" to obj.optString("error", ""),
                "running" to obj.optBoolean("running", false)
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get xray stats: ${e.message}")
            return mapOf(
                "upload" to 0L,
                "download" to 0L,
                "debug" to "",
                "error" to e.message ?: "Failed to get stats",
                "running" to false
            )
        }
    }
    
    private fun copyGeoAssets(targetDir: File) {
        val geoipFile = File(targetDir, XRAY_GEOIP_FILE)
        val geositeFile = File(targetDir, XRAY_GEOSITE_FILE)
        
        if (!geoipFile.exists()) {
            copyAssetToFile("geoip.dat", geoipFile)
        }
        
        if (!geositeFile.exists()) {
            copyAssetToFile("geosite.dat", geositeFile)
        }
    }
    
    private fun copyAssetToFile(assetName: String, targetFile: File) {
        try {
            context.assets.open(assetName).use { input ->
                FileOutputStream(targetFile).use { output ->
                    input.copyTo(output)
                }
            }
            Log.d(TAG, "Copied $assetName to ${targetFile.absolutePath}")
        } catch (e: Exception) {
            Log.w(TAG, "Failed to copy asset $assetName: ${e.message}")
            // Создаем пустой файл если ассет не найден
            targetFile.writeText("")
        }
    }
    
    private external fun startXrayNative(dataDir: String, configPath: String)
    private external fun stopXrayNative()
    private external fun getXrayStatsNative(): String
    private external fun getXrayVersionNative(): String
    private external fun isXrayRunningNative(): Boolean
    
    init {
        try {
            System.loadLibrary("gojni")
        } catch (e: UnsatisfiedLinkError) {
            // Пробуем загрузить xray как fallback
            try {
                System.loadLibrary("xray")
            } catch (e2: UnsatisfiedLinkError) {
                Log.e(TAG, "Failed to load native library: neither libgojni.so nor libxray.so found")
                throw e2
            }
        }
    }
}