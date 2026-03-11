cmake_minimum_required(VERSION 3.18.1)
project("xray")

# Добавляем библиотеку xray
add_library(xray SHARED xray_native.cpp)

# Ищем библиотеку log
find_library(log-lib log)

# Связываем с библиотекой log
target_link_libraries(xray ${log-lib})

# Добавляем флаги для совместимости с Go
set_target_properties(xray PROPERTIES
    CXX_STANDARD 17
    CXX_STANDARD_REQUIRED ON
    CXX_EXTENSIONS OFF
)