cmake_minimum_required(VERSION 3.22.1)
project(ggwave_jni)

set(CMAKE_CXX_STANDARD 17)

add_library(ggwave_jni SHARED
    ggwave-jni.cpp
    ggwave/src/ggwave.cpp
)

target_include_directories(ggwave_jni PRIVATE
    ggwave/include
    ggwave/src
)

target_compile_options(ggwave_jni PRIVATE -O3 -w)

# Android 15+ devices can use 16 KB memory pages.
target_link_options(ggwave_jni PRIVATE "-Wl,-z,max-page-size=16384")
