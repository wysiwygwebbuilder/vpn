package com.phoenix.vpn

import android.app.Application
import android.content.res.Configuration
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.common.ReleaseLevel
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ExpoReactHostFactory
import io.nekohasekai.libbox.Libbox
import io.nekohasekai.libbox.SetupOptions
import java.io.File
import java.util.Locale

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    ExpoReactHostFactory.getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          add(VpnPackage())
        }
    )
  }

  override fun onCreate() {
    super.onCreate()
    DefaultNewArchitectureEntryPoint.releaseLevel = try {
      ReleaseLevel.valueOf(BuildConfig.REACT_NATIVE_RELEASE_LEVEL.uppercase())
    } catch (e: IllegalArgumentException) {
      ReleaseLevel.STABLE
    }
    loadReactNative(this)
    setupLibbox()
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }

  private fun setupLibbox() {
    val baseDir = filesDir.apply { mkdirs() }
    val workingDir = (getExternalFilesDir(null) ?: filesDir).apply { mkdirs() }
    val tempDir = cacheDir.apply { mkdirs() }

    Libbox.setLocale(Locale.getDefault().toLanguageTag().replace("-", "_"))
    Libbox.setup(SetupOptions().apply {
      setBasePath(baseDir.path)
      setWorkingPath(workingDir.path)
      setTempPath(tempDir.path)
      setFixAndroidStack(true)
      setLogMaxLines(1000)
      setDebug(BuildConfig.DEBUG)
    })
    Libbox.redirectStderr(File(workingDir, "stderr.log").path)
  }
}
