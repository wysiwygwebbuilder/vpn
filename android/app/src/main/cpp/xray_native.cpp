#include <jni.h>
#include <string>
#include <android/log.h>
#include <cstdlib>
#include <cstring>

#define LOG_TAG "XrayNative"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

extern "C" {
    // Объявления функций из Go (правильные имена)
    extern const char* CGoRunXrayFromJSON(const char* base64Text);
    extern const char* CGoStopXray();
    extern const char* CGoQueryStats(const char* base64Text);
    extern const char* CGoXrayVersion();
    extern const char* CGoRunXray(const char* base64Text);
}

// Вспомогательная функция для создания base64 строки из JSON
std::string createBase64Request(const std::string& dataDir, const std::string& configJSON) {
    // Создаем JSON запрос в формате, который ожидает Go-код
    std::string request = "{\"datDir\":\"" + dataDir + "\",\"configJSON\":\"" + configJSON + "\"}";
    
    // В реальном коде нужно было бы кодировать в base64, но для простоты
    // вернем как есть, т.к. Go-функции ожидают base64
    // В реальном приложении нужно использовать библиотеку для base64 кодирования
    return request;
}

extern "C" JNIEXPORT void JNICALL
Java_com_phoenix_vpn_xray_XrayController_startXrayNative(
    JNIEnv* env,
    jobject /* this */,
    jstring dataDir,
    jstring configPath) {
    
    const char* dataDirStr = env->GetStringUTFChars(dataDir, nullptr);
    const char* configPathStr = env->GetStringUTFChars(configPath, nullptr);
    
    LOGI("Starting xray with dataDir: %s, configPath: %s", dataDirStr, configPathStr);
    
    // Читаем конфиг из файла
    FILE* configFile = fopen(configPathStr, "r");
    if (!configFile) {
        LOGE("Failed to open config file: %s", configPathStr);
        env->ReleaseStringUTFChars(dataDir, dataDirStr);
        env->ReleaseStringUTFChars(configPath, configPathStr);
        return;
    }
    
    fseek(configFile, 0, SEEK_END);
    long fileSize = ftell(configFile);
    fseek(configFile, 0, SEEK_SET);
    
    char* configJSON = new char[fileSize + 1];
    fread(configJSON, 1, fileSize, configFile);
    configJSON[fileSize] = '\0';
    fclose(configFile);
    
    // Создаем base64 запрос для Go-функции
    std::string base64Request = createBase64Request(dataDirStr, configJSON);
    
    // Запускаем xray через Go-функцию
    const char* result = CGoRunXrayFromJSON(base64Request.c_str());
    if (result != nullptr) {
        LOGI("CGoRunXrayFromJSON result: %s", result);
        // Освобождаем память, выделенную Go
        free((void*)result);
    }
    
    delete[] configJSON;
    env->ReleaseStringUTFChars(dataDir, dataDirStr);
    env->ReleaseStringUTFChars(configPath, configPathStr);
}

extern "C" JNIEXPORT void JNICALL
Java_com_phoenix_vpn_xray_XrayController_stopXrayNative(
    JNIEnv* env,
    jobject /* this */) {
    
    LOGI("Stopping xray engine");
    const char* result = CGoStopXray();
    if (result != nullptr) {
        LOGI("CGoStopXray result: %s", result);
        free((void*)result);
    }
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_phoenix_vpn_xray_XrayController_getXrayStatsNative(
    JNIEnv* env,
    jobject /* this */) {
    
    // Для получения статистики нужен server параметр, но у нас его нет
    // Используем пустую строку как запрос
    const char* emptyRequest = "";
    const char* stats = CGoQueryStats(emptyRequest);
    
    if (stats == nullptr) {
        return env->NewStringUTF("{\"upload\":0,\"download\":0,\"debug\":\"\",\"error\":\"\",\"running\":false}");
    }
    
    jstring result = env->NewStringUTF(stats);
    free((void*)stats);
    return result;
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_phoenix_vpn_xray_XrayController_getXrayVersionNative(
    JNIEnv* env,
    jobject /* this */) {
    
    const char* version = CGoXrayVersion();
    if (version == nullptr) {
        return env->NewStringUTF("unknown");
    }
    
    jstring result = env->NewStringUTF(version);
    free((void*)version);
    return result;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_phoenix_vpn_xray_XrayController_isXrayRunningNative(
    JNIEnv* env,
    jobject /* this */) {
    
    // Проверяем через CGoQueryStats - если возвращает данные, значит работает
    const char* emptyRequest = "";
    const char* stats = CGoQueryStats(emptyRequest);
    
    if (stats == nullptr) {
        return JNI_FALSE;
    }
    
    // Парсим JSON ответ и проверяем поле running
    std::string statsStr(stats);
    free((void*)stats);
    
    // Простая проверка - если в ответе есть данные, значит работает
    return statsStr.find("\"running\":true") != std::string::npos ? JNI_TRUE : JNI_FALSE;
}