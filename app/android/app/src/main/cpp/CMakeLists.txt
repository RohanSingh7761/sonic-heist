cmake_minimum_required(VERSION 3.22.1)
project(ggwave_jni)

set(CMAKE_CXX_STANDARD 17)

add_library(ggwave_jni SHARED
    ggwave-jni.cpp
)

find_library(log-lib log)
find_library(android-lib android)

target_link_libraries(ggwave_jni
    ${log-lib}
    ${android-lib}
)
